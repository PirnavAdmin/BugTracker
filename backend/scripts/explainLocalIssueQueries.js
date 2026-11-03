const mongoose = require("mongoose");
const Issue = require("../models/Issue");
const listProjection = require("../utils/issueListProjection");
require("../config/env");

const main = async () => {
  if (!process.argv.includes("--confirm-isolated-local")) {
    throw new Error("Confirm localhost is not a tunnel and the database is isolated with --confirm-isolated-local.");
  }
  const projectIdValue = process.argv.find((arg) => arg.startsWith("--project-id="))?.split("=").slice(1).join("=");
  if (!mongoose.isValidObjectId(projectIdValue)) throw new Error("Pass a valid --project-id value.");
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI is required.");
  let parsed;
  try { parsed = new URL(uri); } catch { throw new Error("MONGO_URI is invalid (value redacted)."); }
  const hostname = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!["localhost", "127.0.0.1", "::1"].includes(hostname)) throw new Error("Refusing connection: endpoint is not loopback.");
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, "").split("/")[0] || "");
  if (databaseName !== "bugtracker") throw new Error("Refusing connection: URI database must explicitly be bugtracker.");

  const projectId = new mongoose.Types.ObjectId(projectIdValue);
  const activeProjectIssues = { projectId, isDeleted: { $ne: true } };
  const cases = [
    {
      name: "story-list",
      query: Issue.find({ ...activeProjectIssues, type: "Story" })
        .select(listProjection)
        .sort({ updatedAt: -1, createdAt: -1 })
        .limit(50),
    },
    {
      name: "issue-list",
      query: Issue.find(activeProjectIssues)
        .select(listProjection)
        .sort({ createdAt: -1 })
        .limit(50),
    },
  ];

  try {
    await mongoose.connect(uri, { dbName: "bugtracker", autoIndex: false });
    for (const item of cases) {
      const plan = await item.query.explain("executionStats");
      const winningPlan = plan.queryPlanner?.winningPlan || {};
      const stages = [];
      const visit = (node) => {
        if (!node || typeof node !== "object") return;
        if (node.stage) stages.push({ stage: node.stage, indexName: node.indexName });
        for (const value of Object.values(node)) {
          if (Array.isArray(value)) value.forEach(visit);
          else if (value && typeof value === "object") visit(value);
        }
      };
      visit(winningPlan);
      console.log(JSON.stringify({
        query: item.name,
        nReturned: plan.executionStats?.nReturned,
        totalKeysExamined: plan.executionStats?.totalKeysExamined,
        totalDocsExamined: plan.executionStats?.totalDocsExamined,
        executionTimeMillis: plan.executionStats?.executionTimeMillis,
        stages,
      }));
    }
  } finally {
    await mongoose.disconnect();
  }
};

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
