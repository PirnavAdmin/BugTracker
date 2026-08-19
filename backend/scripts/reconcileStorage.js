const path = require("path");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const Issue = require("../models/Issue");
const Project = require("../models/Project");
const IssueAttachment = require("../models/IssueAttachment");
const Message = require("../models/Message.model");
const User = require("../models/User");
const { listS3Objects } = require("../utils/s3");
const { normalizeTenantId } = require("../utils/tenant");

dotenv.config({ path: path.join(__dirname, "..", ".env") });
const emptyCount = () => ({ objects: 0, bytes: 0 });
const add = (target, bytes = 0) => { target.objects += 1; target.bytes += Number(bytes) || 0; };
const keyOf = (value = "") => { const raw = String(value || "").trim(); try { return decodeURIComponent(new URL(raw).pathname.replace(/^\/+/, "")); } catch (_) { return raw.replace(/^\/+/, ""); } };
const typeFor = (key = "") => key.startsWith("issue-attachments/") ? "issue" : key.startsWith("chat-attachments/") ? "chat" : key.startsWith("avatars/") ? "avatar" : "";
const isBackup = (key = "") => /(^|\/)(backup|backups|mongodb)(\/|[-_])/i.test(key);
const tenant = (value) => normalizeTenantId(value);
const resolveIssueAttachmentTenant = (attachment, issues, projects) => tenant(attachment.tenantId) || tenant(projects.get(String(issues.get(String(attachment.issueId || ""))?.projectId || ""))?.tenantId);
const resolveChatAttachmentTenant = (attachment, message, users) => tenant(attachment.tenantId) || tenant(users.get(String(message.senderId || ""))?.tenantId);
const tenantRow = () => ({ issueObjects: 0, issueBytes: 0, chatObjects: 0, chatBytes: 0, avatarObjects: 0, avatarBytes: 0, totalObjects: 0, totalBytes: 0 });

const buildReport = ({ objects = [], issueAttachments = [], issues = [], projects = [], messages = [], users = [] }) => {
  const byKey = new Map(objects.map((object) => [String(object.Key || ""), object]));
  const issuesById = new Map(issues.map((issue) => [String(issue._id), issue]));
  const projectsById = new Map(projects.map((project) => [String(project._id), project]));
  const usersById = new Map(users.map((user) => [String(user._id), user]));
  const mappedKeys = new Set(), tenants = {};
  const mappedObjects = emptyCount(), missingS3Objects = emptyCount(), orphanS3Objects = emptyCount(), unmappedS3Objects = emptyCount(), unmappedDatabaseRecords = emptyCount();
  const mismatches = { count: 0, bytes: 0 };
  const addTenant = (id, type, bytes) => { const idSafe = tenant(id); if (!idSafe) return; const row = tenants[idSafe] || (tenants[idSafe] = tenantRow()); row[`${type}Objects`] += 1; row[`${type}Bytes`] += bytes; row.totalObjects += 1; row.totalBytes += bytes; };
  const inspect = ({ tenantId, key, type, bytes }) => {
    const object = byKey.get(key);
    if (!object) { add(missingS3Objects, bytes); if (!tenant(tenantId)) add(unmappedDatabaseRecords, bytes); return; }
    mappedKeys.add(key);
    const actual = Number(object.Size) || 0;
    if (!tenant(tenantId)) { add(unmappedDatabaseRecords, actual); add(unmappedS3Objects, actual); return; }
    add(mappedObjects, actual); addTenant(tenantId, type, actual);
    if (actual !== bytes) { mismatches.count += 1; mismatches.bytes += Math.abs(actual - bytes); }
  };
  issueAttachments.forEach((attachment) => inspect({ tenantId: resolveIssueAttachmentTenant(attachment, issuesById, projectsById), key: keyOf(attachment.storagePath), type: "issue", bytes: Number(attachment.sizeBytes) || 0 }));
  messages.forEach((message) => (message.attachments || []).forEach((attachment) => inspect({ tenantId: resolveChatAttachmentTenant(attachment, message, usersById), key: keyOf(attachment.fileUrl || attachment.url), type: "chat", bytes: Number(attachment.fileSizeBytes ?? attachment.size) || 0 })));
  users.forEach((user) => { const key = keyOf(user.avatarUrl); if (typeFor(key) === "avatar") inspect({ tenantId: user.tenantId, key, type: "avatar", bytes: Number(user.avatarSizeBytes) || 0 }); });
  const s3 = { issue: emptyCount(), chat: emptyCount(), avatars: emptyCount() }, systemObjects = emptyCount(), backupObjects = emptyCount(), otherPlatformObjects = emptyCount();
  objects.forEach((object) => { const key = String(object.Key || ""), bytes = Number(object.Size) || 0, type = typeFor(key); if (type === "issue") add(s3.issue, bytes); if (type === "chat") add(s3.chat, bytes); if (type === "avatar" && bytes > 0) add(s3.avatars, bytes); if (type && !mappedKeys.has(key) && !(type === "avatar" && bytes === 0)) { add(orphanS3Objects, bytes); add(unmappedS3Objects, bytes); } if (!type) { if (isBackup(key)) add(backupObjects, bytes); else if (!key || key.endsWith("/")) add(systemObjects, bytes); else add(otherPlatformObjects, bytes); } });
  return { s3, tenantBreakdown: tenants, mappedObjects, missingS3Objects, orphanS3Objects, unmappedS3Objects, unmappedDatabaseRecords, databaseS3SizeMismatches: mismatches, systemObjects, backupObjects, otherPlatformObjects, mappedCustomerStorage: { ...mappedObjects }, unmappedCustomerStorage: { ...unmappedS3Objects } };
};
const printReport = (report) => {
  console.log("===== STORAGE RECONCILIATION ====="); console.log(JSON.stringify({ S3: report.s3 }, null, 2));
  console.log("===== TENANT STORAGE BREAKDOWN ====="); console.log(JSON.stringify(report.tenantBreakdown, null, 2));
  console.log("===== DATABASE / S3 ====="); console.log(JSON.stringify({ mappedObjects: report.mappedObjects, missingS3Objects: report.missingS3Objects, orphanS3Objects: report.orphanS3Objects, unmappedS3Objects: report.unmappedS3Objects, unmappedDatabaseRecords: report.unmappedDatabaseRecords, sizeMismatches: report.databaseS3SizeMismatches }, null, 2));
  console.log("===== PLATFORM / SYSTEM ====="); console.log(JSON.stringify({ systemObjects: report.systemObjects, backupObjects: report.backupObjects, otherPlatformObjects: report.otherPlatformObjects }, null, 2));
  console.log("===== CUSTOMER STORAGE ====="); console.log(JSON.stringify({ mappedCustomerStorage: report.mappedCustomerStorage, unmappedCustomerStorage: report.unmappedCustomerStorage }, null, 2));
};
const run = async () => {
  await connectDB();
  const [objects, issueAttachments, messages, users] = await Promise.all([listS3Objects(), IssueAttachment.find({}).select("tenantId issueId storagePath sizeBytes").lean(), Message.find({ "attachments.0": { $exists: true } }).select("senderId attachments").lean(), User.find({}).select("tenantId avatarUrl avatarSizeBytes").lean()]);
  const issueIds = [...new Set(issueAttachments.map((item) => String(item.issueId || "")).filter(Boolean))];
  const issues = issueIds.length ? await Issue.find({ _id: { $in: issueIds } }).select("projectId").lean() : [];
  const projectIds = [...new Set(issues.map((item) => String(item.projectId || "")).filter(Boolean))];
  const projects = projectIds.length ? await Project.find({ _id: { $in: projectIds } }).select("tenantId").lean() : [];
  printReport(buildReport({ objects, issueAttachments, issues, projects, messages, users }));
};
if (require.main === module) run().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => { if (mongoose.connection.readyState) await mongoose.disconnect(); });
module.exports = { buildReport, keyOf, resolveIssueAttachmentTenant, resolveChatAttachmentTenant };
