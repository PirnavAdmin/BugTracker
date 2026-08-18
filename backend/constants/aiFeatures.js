const {
  ROLE_ADMIN,
  ROLE_MANAGER,
  ROLE_TEAM_LEAD,
  ROLE_QA_LEAD,
  ROLE_DEVELOPER,
  ROLE_TESTER,
} = require("../utils/roles");

const AI_FEATURES = Object.freeze({
  DESCRIPTION: "ai.description",
  CODE_REVIEW: "ai.code-review",
  QA_INSIGHTS: "ai.qa-insights",
  TEST_GENERATION: "ai.test-generation",
  BUG_TRIAGE: "ai.bug-triage",
  DUPLICATE_DETECTION: "ai.duplicate-detection",
  PROJECT_INSIGHTS: "ai.project-insights",
});

const AI_FEATURE_LABELS = Object.freeze({
  [AI_FEATURES.DESCRIPTION]: "AI Description Generation",
  [AI_FEATURES.CODE_REVIEW]: "AI Code Review",
  [AI_FEATURES.QA_INSIGHTS]: "AI QA Insights",
  [AI_FEATURES.TEST_GENERATION]: "AI Test Generation",
  [AI_FEATURES.BUG_TRIAGE]: "AI Bug Triage",
  [AI_FEATURES.DUPLICATE_DETECTION]: "AI Duplicate Detection",
  [AI_FEATURES.PROJECT_INSIGHTS]: "AI Project Insights",
});

const AI_MANAGE_ROLES = Object.freeze([ROLE_ADMIN, ROLE_MANAGER]);
const AI_ACCESS_ROLES = Object.freeze([
  ROLE_ADMIN,
  ROLE_MANAGER,
  ROLE_TEAM_LEAD,
  ROLE_QA_LEAD,
  ROLE_DEVELOPER,
  ROLE_TESTER,
]);

const DEFAULT_AI_FEATURE_SETTINGS = Object.freeze({
  [AI_FEATURES.DESCRIPTION]: {
    enabled: true,
    allowedRoles: AI_ACCESS_ROLES,
  },
  [AI_FEATURES.CODE_REVIEW]: {
    enabled: true,
    allowedRoles: AI_ACCESS_ROLES,
  },
  [AI_FEATURES.QA_INSIGHTS]: {
    enabled: true,
    allowedRoles: [ROLE_ADMIN, ROLE_MANAGER, ROLE_TESTER],
  },
  [AI_FEATURES.TEST_GENERATION]: {
    enabled: false,
    allowedRoles: AI_ACCESS_ROLES,
  },
  [AI_FEATURES.BUG_TRIAGE]: {
    enabled: false,
    allowedRoles: AI_ACCESS_ROLES,
  },
  [AI_FEATURES.DUPLICATE_DETECTION]: {
    enabled: false,
    allowedRoles: AI_ACCESS_ROLES,
  },
  [AI_FEATURES.PROJECT_INSIGHTS]: {
    enabled: false,
    allowedRoles: [ROLE_ADMIN, ROLE_MANAGER],
  },
});

const DEFAULT_AI_LIMITS = Object.freeze({
  dailyRequests: 500,
  monthlyRequests: 5000,
  dailyBudget: 2,
  monthlyBudget: 25,
  perUserDailyRequests: 50,
  perUserMonthlyRequests: 500,
});

const DEFAULT_AI_ALERTS = Object.freeze({
  thresholds: [50, 75, 90, 100],
});

module.exports = {
  AI_ACCESS_ROLES,
  AI_FEATURE_LABELS,
  AI_FEATURES,
  AI_MANAGE_ROLES,
  DEFAULT_AI_ALERTS,
  DEFAULT_AI_FEATURE_SETTINGS,
  DEFAULT_AI_LIMITS,
};
