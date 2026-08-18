const { test } = require("node:test");
const assert = require("node:assert");
const AIUsage = require("../models/AIUsage");
const WorkspaceSetting = require("../models/WorkspaceSetting");
const { AI_FEATURES } = require("../constants/aiFeatures");
const {
  checkAIAccess,
  getDefaultAISettings,
  normalizeAISettings,
  recordAIUsage,
} = require("../services/aiPolicyService");
const {
  ROLE_ADMIN,
  ROLE_DEVELOPER,
  ROLE_TEAM_LEAD,
  ROLE_TESTER,
} = require("../utils/roles");

const originalAggregate = AIUsage.aggregate;
const originalCreate = AIUsage.create;
const originalFindOneAndUpdate = WorkspaceSetting.findOneAndUpdate;

let currentSettings = getDefaultAISettings();
let usageTotals = { requests: 0, estimatedCost: 0 };

const stubWorkspaceSettings = () => {
  WorkspaceSetting.findOneAndUpdate = async () => ({
    aiSettings: currentSettings,
    save: async function save() {
      currentSettings = this.aiSettings;
    },
  });
};

test.beforeEach(() => {
  currentSettings = getDefaultAISettings();
  usageTotals = { requests: 0, estimatedCost: 0 };
  stubWorkspaceSettings();
  AIUsage.aggregate = async () => [
    {
      requests: usageTotals.requests,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      estimatedCost: usageTotals.estimatedCost,
    },
  ];
  AIUsage.create = async (payload) => payload;
});

test.afterEach(() => {
  AIUsage.aggregate = originalAggregate;
  AIUsage.create = originalCreate;
  WorkspaceSetting.findOneAndUpdate = originalFindOneAndUpdate;
});

test("normalizes AI settings with existing AI features enabled and future features disabled", () => {
  const settings = normalizeAISettings({});

  assert.strictEqual(settings.masterEnabled, true);
  assert.strictEqual(settings.features[AI_FEATURES.DESCRIPTION].enabled, true);
  assert.strictEqual(settings.features[AI_FEATURES.CODE_REVIEW].enabled, true);
  assert.strictEqual(settings.features[AI_FEATURES.TEST_GENERATION].enabled, false);
});

test("blocks AI access when the workspace master switch is disabled", async () => {
  currentSettings = {
    ...getDefaultAISettings(),
    masterEnabled: false,
  };

  const access = await checkAIAccess({
    feature: AI_FEATURES.DESCRIPTION,
    role: ROLE_ADMIN,
    userId: "user-1",
    workspaceId: "workspace-1",
  });

  assert.strictEqual(access.allowed, false);
  assert.strictEqual(access.code, "AI_DISABLED");
});

test("blocks AI access when a role is not allowed for the feature", async () => {
  currentSettings = getDefaultAISettings();
  currentSettings.features[AI_FEATURES.CODE_REVIEW].allowedRoles = [ROLE_ADMIN];

  const access = await checkAIAccess({
    feature: AI_FEATURES.CODE_REVIEW,
    role: ROLE_TESTER,
    userId: "user-1",
    workspaceId: "workspace-1",
  });

  assert.strictEqual(access.allowed, false);
  assert.strictEqual(access.code, "AI_ROLE_NOT_ALLOWED");
});

test("preserves team lead access in AI code review settings", async () => {
  const settings = normalizeAISettings({
    features: {
      [AI_FEATURES.CODE_REVIEW]: {
        enabled: true,
        allowedRoles: [ROLE_ADMIN, ROLE_TEAM_LEAD],
      },
    },
  });

  assert.deepStrictEqual(settings.features[AI_FEATURES.CODE_REVIEW].allowedRoles, [
    ROLE_ADMIN,
    ROLE_TEAM_LEAD,
  ]);
});

test("allows team leads to use AI code review when configured", async () => {
  currentSettings = getDefaultAISettings();
  currentSettings.features[AI_FEATURES.CODE_REVIEW].allowedRoles = [ROLE_TEAM_LEAD];

  const access = await checkAIAccess({
    feature: AI_FEATURES.CODE_REVIEW,
    role: ROLE_TEAM_LEAD,
    userId: "user-1",
    workspaceId: "workspace-1",
  });

  assert.strictEqual(access.allowed, true);
});

test("blocks AI access when request limits are reached", async () => {
  currentSettings = getDefaultAISettings();
  currentSettings.limits.dailyRequests = 2;
  usageTotals = { requests: 2, estimatedCost: 0 };

  const access = await checkAIAccess({
    feature: AI_FEATURES.DESCRIPTION,
    role: ROLE_DEVELOPER,
    userId: "user-1",
    workspaceId: "workspace-1",
  });

  assert.strictEqual(access.allowed, false);
  assert.strictEqual(access.code, "AI_DAILY_REQUEST_LIMIT_REACHED");
});

test("records successful AI usage with token cost details", async () => {
  const usage = await recordAIUsage({
    feature: AI_FEATURES.CODE_REVIEW,
    inputTokens: 1_000_000,
    outputTokens: 1_000_000,
    role: ROLE_ADMIN,
    userId: "user-1",
    workspaceId: "workspace-1",
  });

  assert.strictEqual(usage.totalTokens, 2_000_000);
  assert.strictEqual(usage.estimatedCost, 0.3);
  assert.strictEqual(usage.status, "SUCCESS");
  assert.ok(usage.requestId);
});
