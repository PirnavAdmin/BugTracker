const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert");
const AIUsage = require("../models/AIUsage");
const PlatformAuditLog = require("../models/PlatformAuditLog");
const PlatformCompany = require("../models/PlatformCompany");
const PlatformSubscription = require("../models/PlatformSubscription");
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
const originalPlatformCompanyCountDocuments = PlatformCompany.countDocuments;
const originalPlatformCompanyFind = PlatformCompany.find;
const originalPlatformSubscriptionAggregate = PlatformSubscription.aggregate;
const originalPlatformSubscriptionCountDocuments = PlatformSubscription.countDocuments;
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
  PlatformCompany.countDocuments = async () => 0;
  PlatformCompany.find = () => ({
    select: () => ({
      lean: async () => [],
    }),
  });
  PlatformSubscription.countDocuments = async () => 0;
  PlatformSubscription.aggregate = async () => [];
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
  PlatformCompany.countDocuments = originalPlatformCompanyCountDocuments;
  PlatformCompany.find = originalPlatformCompanyFind;
  PlatformSubscription.aggregate = originalPlatformSubscriptionAggregate;
  PlatformSubscription.countDocuments = originalPlatformSubscriptionCountDocuments;
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

test("platform AI cost by company resolves tenant metrics to company names", async () => {
  PlatformCompany.find = () => ({
    select: () => ({
      lean: async () => [
        { _id: "company-a", name: "Acme Software", tenantId: "TENANT_001" },
        { _id: "company-b", name: "Bright Labs", tenantId: "TENANT_002" },
      ],
    }),
  });
  AIUsage.aggregate = async () => [
    {
      _id: "TENANT_001",
      requests: 3,
      tokens: 900,
      estimatedCost: 0.09,
    },
  ];
  User.aggregate = async () => [
    { _id: "TENANT_001", users: 5 },
    { _id: "TENANT_002", users: 2 },
  ];
  Project.aggregate = async () => [
    { _id: "TENANT_001", projects: 1 },
    { _id: "TENANT_002", projects: 2 },
  ];

  const result = await getAICostByCompany({
    start: "2026-08-01",
    end: "2026-08-18",
  });

  assert.deepStrictEqual(result.companies, [
    {
      id: "company-a",
      companyName: "Acme Software",
      tenantId: "TENANT_001",
      users: 5,
      projects: 1,
      requests: 3,
      tokens: 900,
      estimatedCost: 0.09,
    },
    {
      id: "company-b",
      companyName: "Bright Labs",
      tenantId: "TENANT_002",
      users: 2,
      projects: 2,
      requests: 0,
      tokens: 0,
      estimatedCost: 0,
    },
  ]);
});

test("platform AI cost assigns pre-tenant legacy metrics to the legacy company name", async () => {
  PlatformCompany.find = () => ({
    select: () => ({
      lean: async () => [
        { _id: "legacy-company", name: "CureCode", tenantId: "TENANT_001" },
      ],
    }),
  });
  AIUsage.aggregate = async () => [
    { _id: "__legacy_company__", requests: 2, tokens: 100, estimatedCost: 0.01 },
  ];
  User.aggregate = async () => [{ _id: "TENANT_001", users: 4 }];
  Project.aggregate = async () => [{ _id: "__legacy_company__", projects: 3 }];

  const result = await getAICostByCompany();

  assert.deepStrictEqual(result.companies, [
    {
      id: "legacy-company",
      companyName: "CureCode",
      tenantId: "TENANT_001",
      users: 4,
      projects: 3,
      requests: 2,
      tokens: 100,
      estimatedCost: 0.01,
    },
  ]);
});

test("platform company AI usage can be explicitly scoped to a tenant", async () => {
  let usageMatch;
  AIUsage.aggregate = async (pipeline) => {
    usageMatch = pipeline[0].$match;
    return [];
  };
  User.aggregate = async () => [];
  Project.aggregate = async () => [];

  await getAICostByCompany({
    end: "2026-08-18",
    start: "2026-08-01",
    tenantId: "TENANT_001",
  });

  assert.strictEqual(usageMatch.tenantId, "TENANT_001");
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
