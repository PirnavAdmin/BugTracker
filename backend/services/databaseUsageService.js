const User = require("../models/User");
const Project = require("../models/Project");
const Team = require("../models/Team");
const TeamMember = require("../models/TeamMember");
const Issue = require("../models/Issue");
const Sprint = require("../models/Sprint");
const Epic = require("../models/Epic");
const IssueAttachment = require("../models/IssueAttachment");
const { normalizeTenantId } = require("../utils/tenant");

const TENANT_MODELS = [User, Project, Team, TeamMember, Sprint, Epic, IssueAttachment];

const estimateModel = async (Model, tenantId) => {
  const filter = { tenantId };
  const [count, size] = await Promise.all([
    Model.countDocuments(filter),
    Model.aggregate([
      { $match: filter },
      { $project: { bytes: { $bsonSize: "$$ROOT" } } },
      { $group: { _id: null, bytes: { $sum: "$bytes" } } },
    ]).then((rows) => rows[0]?.bytes || 0).catch(() => 0),
  ]);
  return { count, bytes: size };
};

const getTenantDatabaseUsage = async (tenantId) => {
  const normalized = normalizeTenantId(tenantId);
  if (!normalized) throw new Error("Tenant context is required");
  const rows = await Promise.all(TENANT_MODELS.map((Model) => estimateModel(Model, normalized)));
  const recordCount = rows.reduce((total, row) => total + row.count, 0);
  const estimatedDataBytes = rows.reduce((total, row) => total + row.bytes, 0);
  return {
    estimatedDataBytes,
    estimatedDataMB: estimatedDataBytes / 1024 ** 2,
    estimatedDataGB: estimatedDataBytes / 1024 ** 3,
    recordCount,
    label: "Database Utilization",
    note: "Database usage is separate from your subscription storage quota.",
  };
};

module.exports = { getTenantDatabaseUsage };
