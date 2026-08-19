const path = require("path");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const Issue = require("../models/Issue");
const Project = require("../models/Project");
const IssueAttachment = require("../models/IssueAttachment");
const { reconcileTenantStorage } = require("../services/storageUsageService");

dotenv.config({ path: path.join(__dirname, "..", ".env") });
const execute = process.argv.includes("--execute");

const run = async () => {
  await connectDB();
  const records = await IssueAttachment.find({ $or: [{ tenantId: "" }, { tenantId: { $exists: false } }] }).select("_id issueId tenantId sizeBytes").lean();
  const updates = [];
  for (const record of records) {
    const issue = await Issue.findById(record.issueId).select("projectId").lean();
    const project = issue ? await Project.findById(issue.projectId).select("tenantId").lean() : null;
    if (project?.tenantId) updates.push({ id: record._id, tenantId: project.tenantId });
  }
  console.log(JSON.stringify({ dryRun: !execute, candidateIssueAttachments: updates.length }, null, 2));
  if (execute) {
    for (const update of updates) await IssueAttachment.updateOne({ _id: update.id, $or: [{ tenantId: "" }, { tenantId: { $exists: false } }] }, { $set: { tenantId: update.tenantId } });
    console.log("Backfill completed for safely attributable issue attachments. StorageUsage initialization remains reconciliation-driven.");
  }
};

run().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => { if (mongoose.connection.readyState) await mongoose.disconnect(); });
