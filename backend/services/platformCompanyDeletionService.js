const PlatformCompany = require("../models/PlatformCompany");
const PlatformSubscription = require("../models/PlatformSubscription");
const ProviderSubscription = require("../models/Subscription");
const Payment = require("../models/Payment");
const Invoice = require("../models/Invoice");
const BillingWebhookEvent = require("../models/BillingWebhookEvent");
const User = require("../models/User");
const Project = require("../models/Project");
const ProjectMember = require("../models/ProjectMember");
const ProjectTeam = require("../models/ProjectTeam");
const ProjectMeeting = require("../models/ProjectMeeting");
const ProjectAIInsight = require("../models/ProjectAIInsight");
const Team = require("../models/Team");
const TeamMember = require("../models/TeamMember");
const Issue = require("../models/Issue");
const IssueAttachment = require("../models/IssueAttachment");
const IssueHistory = require("../models/IssueHistory");
const IssueWorklog = require("../models/IssueWorklog");
const Comment = require("../models/Comment");
const Epic = require("../models/Epic");
const Sprint = require("../models/Sprint");
const SprintNotification = require("../models/SprintNotification");
const Notification = require("../models/Notification");
const Conversation = require("../models/Conversation.model");
const Message = require("../models/Message.model");
const ChatMeeting = require("../models/ChatMeeting");
const CallLog = require("../models/CallLog.model");
const CallParticipant = require("../models/CallParticipant.model");
const QuickChatHandled = require("../models/QuickChatHandled.model");
const UserActivity = require("../models/UserActivity");
const UserEmailConfig = require("../models/UserEmailConfig");
const StorageUsage = require("../models/StorageUsage");
const AIUsage = require("../models/AIUsage");
const { deleteS3Object } = require("../utils/s3");
const { normalizeTenantId } = require("../utils/tenant");

const terminalProviderStatuses = new Set(["CANCELLED", "EXPIRED", "FAILED"]);

const requireExactConfirmation = (company, confirmationName, res) => {
  if (String(confirmationName || "") !== company.name) {
    res.status(400);
    throw new Error("Enter the exact company name to confirm permanent deletion");
  }
};

const ids = (documents) => documents.map((document) => document._id);
const attachmentPaths = (messages) => messages.flatMap((message) =>
  (message.attachments || []).map((attachment) => attachment.fileUrl || attachment.url).filter(Boolean)
);

const cancelProviderSubscriptions = async (subscriptions) => {
  const cashfreeSubscriptions = subscriptions.filter((subscription) =>
    subscription.provider === "cashfree" &&
    subscription.providerSubscriptionId &&
    !terminalProviderStatuses.has(String(subscription.status || "").toUpperCase())
  );
  if (!cashfreeSubscriptions.length) return;

  // Billing configuration is required only when an active provider resource
  // actually needs cancellation.
  const cashfreeService = require("./payment/cashfreeService");
  for (const subscription of cashfreeSubscriptions) {
    await cashfreeService.cancelSubscription(subscription.providerSubscriptionId);
  }
};

const deleteStoredObjects = async (paths) => {
  const bucketHost = process.env.AWS_S3_BUCKET && process.env.AWS_REGION
    ? `${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com`
    : "";
  const ownedPaths = paths.filter((path) => {
    if (!path) return false;
    if (!/^https?:\/\//i.test(path)) return true;
    try {
      return Boolean(bucketHost) && new URL(path).hostname === bucketHost;
    } catch {
      return false;
    }
  });

  for (const path of new Set(ownedPaths)) {
    await deleteS3Object(path);
  }
};

const deleteCompanyPermanently = async (company, confirmationName, res) => {
  requireExactConfirmation(company, confirmationName, res);
  const tenantId = normalizeTenantId(company.tenantId);
  if (!tenantId) {
    res.status(409);
    throw new Error("Company has no tenant identity and cannot be safely deleted");
  }

  const [users, projects, teams, issues, issueAttachments, providerSubscriptions] = await Promise.all([
    User.find({ tenantId }).select("_id avatarUrl").lean(),
    Project.find({ tenantId }).select("_id").lean(),
    Team.find({ tenantId }).select("_id").lean(),
    Issue.find({ tenantId }).select("_id").lean(),
    IssueAttachment.find({ tenantId }).select("_id storagePath").lean(),
    ProviderSubscription.find({ companyId: company._id }).lean(),
  ]);

  const userIds = ids(users);
  const projectIds = ids(projects);
  const teamIds = ids(teams);
  const issueIds = ids(issues);
  const providerSubscriptionIds = ids(providerSubscriptions);
  const conversations = await Conversation.find({
    $or: [
      { projectId: { $in: projectIds } },
      { teamId: { $in: teamIds } },
      { participants: { $in: userIds } },
    ],
  }).select("_id").lean();
  const conversationIds = ids(conversations);
  const messages = await Message.find({ conversationId: { $in: conversationIds } })
    .select("attachments")
    .lean();
  const callLogs = await CallLog.find({
    $or: [
      { conversationId: { $in: conversationIds } },
      { participants: { $in: userIds } },
      { callerId: { $in: userIds } },
      { receiverId: { $in: userIds } },
    ],
  }).select("_id").lean();
  const callIds = ids(callLogs);

  // Stop recurring provider billing before removing the local subscription.
  await cancelProviderSubscriptions(providerSubscriptions);
  await deleteStoredObjects([
    ...users.map((user) => user.avatarUrl),
    ...issueAttachments.map((attachment) => attachment.storagePath),
    ...attachmentPaths(messages),
  ]);

  // Children are removed before parents. Keeping the company until last makes
  // an interrupted cascade discoverable and safely retryable.
  const operations = [
    [CallParticipant, { $or: [{ callId: { $in: callIds } }, { userId: { $in: userIds } }] }],
    [CallLog, { _id: { $in: callIds } }],
    [QuickChatHandled, { $or: [{ conversationId: { $in: conversationIds } }, { userId: { $in: userIds } }] }],
    [ChatMeeting, { conversationId: { $in: conversationIds } }],
    [Message, { conversationId: { $in: conversationIds } }],
    [Conversation, { _id: { $in: conversationIds } }],
    [SprintNotification, { $or: [{ projectId: { $in: projectIds } }, { issueId: { $in: issueIds } }, { recipientUserId: { $in: userIds } }] }],
    [Notification, { recipientId: { $in: userIds } }],
    [Comment, { issueId: { $in: issueIds } }],
    [IssueWorklog, { issueId: { $in: issueIds } }],
    [IssueHistory, { issueId: { $in: issueIds } }],
    [IssueAttachment, { tenantId }],
    [Issue, { tenantId }],
    [Epic, { tenantId }],
    [Sprint, { tenantId }],
    [ProjectMeeting, { projectId: { $in: projectIds } }],
    [ProjectMember, { $or: [{ projectId: { $in: projectIds } }, { userId: { $in: userIds } }] }],
    [ProjectTeam, { $or: [{ projectId: { $in: projectIds } }, { teamId: { $in: teamIds } }] }],
    [ProjectAIInsight, { tenantId }],
    [Project, { tenantId }],
    [TeamMember, { tenantId }],
    [Team, { tenantId }],
    [UserActivity, { userId: { $in: userIds } }],
    [UserEmailConfig, { userId: { $in: userIds } }],
    [AIUsage, { tenantId }],
    [StorageUsage, { tenantId }],
    [Invoice, { $or: [{ tenantId }, { subscriptionId: { $in: providerSubscriptionIds } }] }],
    [Payment, { $or: [{ tenantId }, { subscriptionId: { $in: providerSubscriptionIds } }] }],
    [BillingWebhookEvent, { tenantId }],
    [ProviderSubscription, { companyId: company._id }],
    [PlatformSubscription, { companyId: company._id }],
    [User, { tenantId }],
  ];

  let deletedRecords = 0;
  for (const [Model, filter] of operations) {
    const result = await Model.deleteMany(filter);
    deletedRecords += Number(result.deletedCount || 0);
  }
  const companyResult = await PlatformCompany.deleteOne({ _id: company._id });

  return {
    companyId: String(company._id),
    companyName: company.name,
    tenantId,
    deletedRecords: deletedRecords + Number(companyResult.deletedCount || 0),
  };
};

module.exports = { deleteCompanyPermanently, requireExactConfirmation };
