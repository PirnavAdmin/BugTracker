const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert");
const AIUsage = require("../models/AIUsage");
const PlatformAuditLog = require("../models/PlatformAuditLog");
const Project = require("../models/Project");
const User = require("../models/User");
const {
  getAICostByCompany,
  getActivity,
  getPayments,
  getSummary,
} = require("../services/platformDashboardService");

const originalAIUsageAggregate = AIUsage.aggregate;
const originalAIUsageDistinct = AIUsage.distinct;
const originalProjectAggregate = Project.aggregate;
const originalProjectDistinct = Project.distinct;
const originalUserAggregate = User.aggregate;
const originalUserCountDocuments = User.countDocuments;
const originalUserDistinct = User.distinct;
const originalPlatformAuditFind = PlatformAuditLog.find;

beforeEach(() => {
  User.distinct = async () => ["workspace-a", "workspace-b"];
  Project.distinct = async () => ["workspace-b"];
  AIUsage.distinct = async () => ["workspace-a"];
  User.countDocuments = async () => 7;
  AIUsage.aggregate = async () => [
    {
      requests: 4,
      tokens: 1200,
      estimatedCost: 0.12,
    },
  ];
});

afterEach(() => {
  AIUsage.aggregate = originalAIUsageAggregate;
  AIUsage.distinct = originalAIUsageDistinct;
  Project.aggregate = originalProjectAggregate;
  Project.distinct = originalProjectDistinct;
  User.aggregate = originalUserAggregate;
  User.countDocuments = originalUserCountDocuments;
  User.distinct = originalUserDistinct;
  PlatformAuditLog.find = originalPlatformAuditFind;
});

test("platform dashboard summary uses existing workspace, user, and AI usage data", async () => {
  const summary = await getSummary();

  assert.strictEqual(summary.companies, 2);
  assert.strictEqual(summary.users, 7);
  assert.strictEqual(summary.mrr, null);
  assert.strictEqual(summary.storage, null);
  assert.strictEqual(summary.aiRequests, 4);
  assert.strictEqual(summary.aiTokens, 1200);
  assert.strictEqual(summary.aiCost, 0.12);
});

test("platform AI cost by company returns real workspace rows without fake billing data", async () => {
  AIUsage.aggregate = async () => [
    {
      _id: "workspace-a",
      requests: 3,
      tokens: 900,
      estimatedCost: 0.09,
    },
  ];
  User.aggregate = async () => [
    { _id: "workspace-a", users: 5 },
    { _id: "workspace-b", users: 2 },
  ];
  Project.aggregate = async () => [
    { _id: "workspace-a", projects: 1 },
    { _id: "workspace-b", projects: 2 },
  ];

  const result = await getAICostByCompany({
    start: "2026-08-01",
    end: "2026-08-18",
  });

  assert.deepStrictEqual(result.companies, [
    {
      id: "workspace-a",
      companyName: "workspace-a",
      workspaceId: "workspace-a",
      users: 5,
      projects: 1,
      requests: 3,
      tokens: 900,
      estimatedCost: 0.09,
    },
    {
      id: "workspace-b",
      companyName: "workspace-b",
      workspaceId: "workspace-b",
      users: 2,
      projects: 2,
      requests: 0,
      tokens: 0,
      estimatedCost: 0,
    },
  ]);
});

test("platform payments remain an explicit empty state until billing models exist", async () => {
  const result = await getPayments();

  assert.deepStrictEqual(result.payments, []);
  assert.match(result.emptyState, /No payment data/);
});

test("platform activity maps audit logs for the dashboard timeline", async () => {
  PlatformAuditLog.find = () => ({
    sort: () => ({
      limit: () => ({
        lean: async () => [
          {
            _id: "audit-1",
            action: "platform.login",
            status: "SUCCESS",
            actorEmail: "owner@example.com",
            createdAt: new Date("2026-08-18T10:00:00.000Z"),
          },
        ],
      }),
    }),
  });

  const result = await getActivity();

  assert.deepStrictEqual(result.activity, [
    {
      id: "audit-1",
      action: "platform.login",
      status: "SUCCESS",
      actorEmail: "owner@example.com",
      createdAt: new Date("2026-08-18T10:00:00.000Z"),
      metadata: {},
    },
  ]);
});
