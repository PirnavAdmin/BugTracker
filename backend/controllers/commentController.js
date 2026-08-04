const mongoose = require("mongoose");
const Comment = require("../models/Comment");
const Issue = require("../models/Issue");
const IssueAttachment = require("../models/IssueAttachment");
const Project = require("../models/Project");
const { emitBugWorkflowEvent } = require("../socket");
const asyncHandler = require("../utils/asyncHandler");
const { recordIssueHistory } = require("../utils/issueHistory");
const {
  populateIssueDocument,
  serializeIssue,
} = require("../utils/issuePresentation");
const { ISSUE_TYPES, getCanonicalIssueType } = require("../utils/issueTypes");
const { buildProjectAccessQuery } = require("../utils/projectRelations");
const { hasAdminAccess } = require("../utils/roles");
const { normalizeWorkspaceId } = require("../utils/workspace");

const isAssignedToUser = (issue, userId) =>
  Boolean(issue?.assignee) && String(issue.assignee) === String(userId);

const hasDirectBugAccess = (issue, userId) =>
  [issue?.reporter, issue?.bugDetails?.testerOwner, issue?.bugDetails?.developerLead].some(
    (value) => value && String(value) === String(userId)
  );

const getAccessibleIssue = async (user, issueId) => {
  const issue = await Issue.findById(issueId);

  if (!issue) {
    return null;
  }

  const project = await Project.findOne({
    _id: issue.projectId,
    workspaceId: normalizeWorkspaceId(user.workspaceId),
  });

  if (!project) {
    return null;
  }

  if (
    !hasAdminAccess(user.role) &&
    (isAssignedToUser(issue, user._id) || hasDirectBugAccess(issue, user._id))
  ) {
    return issue;
  }

  const accessibleProject = await Project.findOne({
    _id: issue.projectId,
    ...(await buildProjectAccessQuery(user)),
  });

  if (!accessibleProject) {
    return null;
  }

  return issue;
};

const createComment = asyncHandler(async (req, res) => {
  const { issueId, text, attachmentIds = [] } = req.body;
  const normalizedText = typeof text === "string" ? text.trim() : "";
  const normalizedAttachmentIds = Array.isArray(attachmentIds)
    ? attachmentIds.map((id) => String(id || "").trim()).filter(Boolean)
    : [];

  if (!issueId || (!normalizedText && !normalizedAttachmentIds.length)) {
    res.status(400);
    throw new Error("Issue and comment text or attachment is required");
  }

  if (!mongoose.isValidObjectId(issueId)) {
    res.status(400);
    throw new Error("Invalid issue id");
  }

  const issue = await getAccessibleIssue(req.user, issueId);

  if (!issue) {
    res.status(404);
    throw new Error("Issue not found or inaccessible");
  }

  const invalidAttachmentId = normalizedAttachmentIds.find(
    (attachmentId) => !mongoose.isValidObjectId(attachmentId)
  );

  if (invalidAttachmentId) {
    res.status(400);
    throw new Error("Invalid attachment id");
  }

  const commentAttachments = normalizedAttachmentIds.length
    ? await IssueAttachment.find({
        _id: { $in: normalizedAttachmentIds },
        issueId: issue._id,
      })
    : [];

  if (commentAttachments.length !== normalizedAttachmentIds.length) {
    res.status(400);
    throw new Error("One or more attachments do not belong to this issue");
  }

  const comment = await Comment.create({
    issueId,
    userId: req.user._id,
    comment: normalizedText,
    attachments: normalizedAttachmentIds,
  });
  issue.updatedAt = new Date();
  issue.updatedBy = req.user._id;
  issue.comments = issue.comments || [];
  issue.activityLogs = issue.activityLogs || [];
  issue.comments.push({
    _id: comment._id,
    text: comment.comment,
    by: req.user.role || req.user.name || req.user.email || "",
    userId: req.user._id,
    time: comment.createdAt,
  });
  issue.activityLogs.push({
    action: "COMMENT_ADDED",
    from: null,
    to: comment.comment,
    by: req.user.role || req.user.name || req.user.email || "",
    userId: req.user._id,
    time: new Date(),
  });
  await Promise.all([
    issue.save(),
    recordIssueHistory({
      issueId: issue._id,
      projectId: issue.projectId,
      actorId: req.user._id,
      eventType: "COMMENT_CREATED",
      field: "comment",
      fromValue: null,
      toValue: comment.comment,
      meta: {
        title: issue.title,
      },
    }),
  ]);

  await comment.populate("userId", "name email role");
  await comment.populate("attachments");

  if (getCanonicalIssueType(issue.type, "") === ISSUE_TYPES.BUG) {
    await populateIssueDocument(issue);
    emitBugWorkflowEvent({
      workspaceId: normalizeWorkspaceId(req.user.workspaceId),
      eventName: "CommentAdded",
      bug: serializeIssue(issue),
      actor: req.user,
      action: "COMMENT_ADDED",
      meta: {
        commentId: comment._id,
      },
    });
  }

  res.status(201).json(comment);
});

const getComments = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.issueId)) {
    res.status(400);
    throw new Error("Invalid issue id");
  }

  const issue = await getAccessibleIssue(req.user, req.params.issueId);

  if (!issue) {
    res.status(404);
    throw new Error("Issue not found or inaccessible");
  }

  const comments = await Comment.find({
    issueId: req.params.issueId,
  })
    .populate("userId", "name email role")
    .populate("attachments")
    .sort({ createdAt: 1 });

  res.status(200).json(comments);
});

module.exports = {
  createComment,
  getComments,
};
