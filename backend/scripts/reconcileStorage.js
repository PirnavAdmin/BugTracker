const path = require("path");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const IssueAttachment = require("../models/IssueAttachment");
const Message = require("../models/Message.model");
const User = require("../models/User");
const { listS3Objects } = require("../utils/s3");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const run = async () => {
  await connectDB();
  const objects = await listS3Objects();
  const categories = { issue: objects.filter((o) => o.Key?.startsWith("issue-attachments/")), chat: objects.filter((o) => o.Key?.startsWith("chat-attachments/")), avatar: objects.filter((o) => o.Key?.startsWith("avatars/")) };
  const tenantBreakdown = new Map();
  const addTenant = (tenantId, bytes) => {
    if (!tenantId) return;
    const current = tenantBreakdown.get(tenantId) || { objects: 0, bytes: 0 };
    current.objects += 1;
    current.bytes += bytes;
    tenantBreakdown.set(tenantId, current);
  };
  const keyOf = (value = "") => { try { return new URL(value).pathname.replace(/^\/+/, ""); } catch (_) { return String(value).replace(/^\/+/, ""); } };
  const objectByKey = new Map(objects.map((object) => [object.Key, object]));
  const issueRecords = await IssueAttachment.find({ tenantId: { $ne: "" } }).select("tenantId storagePath sizeBytes").lean();
  const users = await User.find({ avatarSizeBytes: { $gt: 0 }, tenantId: { $ne: "" } }).select("tenantId avatarUrl avatarSizeBytes").lean();
  const chatMessages = await Message.find({ "attachments.tenantId": { $ne: "" } }).select("attachments").lean();
  const records = [
    ...issueRecords.map((record) => ({ tenantId: record.tenantId, key: keyOf(record.storagePath), bytes: Number(record.sizeBytes) || 0 })),
    ...users.map((user) => ({ tenantId: user.tenantId, key: keyOf(user.avatarUrl), bytes: Number(user.avatarSizeBytes) || 0 })),
    ...chatMessages.flatMap((message) => (message.attachments || []).map((attachment) => ({ tenantId: attachment.tenantId, key: keyOf(attachment.fileUrl || attachment.url), bytes: Number(attachment.fileSizeBytes || attachment.size) || 0 }))),
  ];
  const referencedKeys = new Set();
  let missingObjects = 0;
  let missingBytes = 0;
  let mismatches = 0;
  let mismatchBytes = 0;
  records.forEach((record) => {
    if (!record.key) return;
    referencedKeys.add(record.key);
    const object = objectByKey.get(record.key);
    if (!object) { missingObjects += 1; missingBytes += record.bytes; return; }
    const actualBytes = Number(object.Size) || 0;
    addTenant(record.tenantId, actualBytes);
    if (actualBytes !== record.bytes) { mismatches += 1; mismatchBytes += Math.abs(actualBytes - record.bytes); }
  });
  const customerObjects = [...categories.issue, ...categories.chat, ...categories.avatar];
  const unmapped = customerObjects.filter((object) => !referencedKeys.has(object.Key));
  const unknown = objects.filter((object) => !/^(issue-attachments|chat-attachments|avatars)\//.test(object.Key || ""));
  const report = {
    issueAttachments: { objects: categories.issue.length, bytes: categories.issue.reduce((n, o) => n + (o.Size || 0), 0) },
    chatAttachments: { objects: categories.chat.length, bytes: categories.chat.reduce((n, o) => n + (o.Size || 0), 0) },
    avatars: { objects: categories.avatar.length, bytes: categories.avatar.reduce((n, o) => n + (o.Size || 0), 0) },
    tenantBreakdown: Object.fromEntries(tenantBreakdown),
    unmappedObjects: { objects: unmapped.length, bytes: unmapped.reduce((total, object) => total + (Number(object.Size) || 0), 0) },
    missingS3Objects: { objects: missingObjects, bytes: missingBytes },
    databaseS3SizeMismatches: { count: mismatches, bytes: mismatchBytes },
    unknownSystemObjects: { objects: unknown.length, bytes: unknown.reduce((total, object) => total + (Number(object.Size) || 0), 0) },
  };
  console.log("===== STORAGE RECONCILIATION =====");
  console.log(JSON.stringify(report, null, 2));
};

run().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => { if (mongoose.connection.readyState) await mongoose.disconnect(); });
