const crypto = require("crypto");
const mongoose = require("mongoose");
const AIUsage = require("../models/AIUsage");
const Notification = require("../models/Notification");
const User = require("../models/User");
const WorkspaceSetting = require("../models/WorkspaceSetting");
const { BEDROCK_MODEL_ID } = require("./aiService");
const { calculateAICost, normalizeTokenCount } = require("./aiCostService");
const {
  AI_ACCESS_ROLES,
  AI_FEATURE_LABELS,
  AI_FEATURES,
  AI_MANAGE_ROLES,
  DEFAULT_AI_ALERTS,
  DEFAULT_AI_FEATURE_SETTINGS,
  DEFAULT_AI_LIMITS,
} = require("../constants/aiFeatures");
const { normalizeWorkspaceId } = require("../utils/workspace");

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_LIMIT = 1_000_000;
const MAX_BUDGET = 100_000;

const startOfDay = (date = new Date()) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());
const startOfMonth = (date = new Date()) =>
  new Date(date.getFullYear(), date.getMonth(), 1);

const normalizeNumber = (value, fallback, max = MAX_LIMIT) => {
  const numeric = Number(value);

  if (!Number.isFinite(numeric) || numeric < 0) {
    return fallback;
  }

  return Math.min(numeric, max);
};

const normalizeRoles = (roles = []) =>
  Array.from(
    new Set((Array.isArray(roles) ? roles : []).filter((role) => AI_ACCESS_ROLES.includes(role)))
  );

const getDefaultAISettings = () => ({
  masterEnabled: true,
  features: Object.fromEntries(
    Object.entries(DEFAULT_AI_FEATURE_SETTINGS).map(([feature, settings]) => [
      feature,
      {
        enabled: settings.enabled,
        allowedRoles: [...settings.allowedRoles],
      },
    ])
  ),
  limits: { ...DEFAULT_AI_LIMITS },
  alerts: { thresholds: [...DEFAULT_AI_ALERTS.thresholds] },
  alertHistory: {},
});

const normalizeAISettings = (settings = {}) => {
  const defaults = getDefaultAISettings();
  const features = Object.fromEntries(
    Object.entries(DEFAULT_AI_FEATURE_SETTINGS).map(([feature, defaultFeature]) => {
      const submittedFeature = settings.features?.[feature] || {};
      const allowedRoles = normalizeRoles(submittedFeature.allowedRoles);

      return [
        feature,
        {
          enabled:
            typeof submittedFeature.enabled === "boolean"
              ? submittedFeature.enabled
              : defaultFeature.enabled,
          allowedRoles: allowedRoles.length ? allowedRoles : [...defaultFeature.allowedRoles],
        },
      ];
    })
  );
  const thresholds = (Array.isArray(settings.alerts?.thresholds)
    ? settings.alerts.thresholds
    : defaults.alerts.thresholds)
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0 && value <= 100)
    .sort((left, right) => left - right);

  return {
    masterEnabled:
      typeof settings.masterEnabled === "boolean"
        ? settings.masterEnabled
        : defaults.masterEnabled,
    features,
    limits: {
      dailyRequests: Math.floor(normalizeNumber(settings.limits?.dailyRequests, defaults.limits.dailyRequests)),
      monthlyRequests: Math.floor(normalizeNumber(settings.limits?.monthlyRequests, defaults.limits.monthlyRequests)),
      dailyBudget: normalizeNumber(settings.limits?.dailyBudget, defaults.limits.dailyBudget, MAX_BUDGET),
      monthlyBudget: normalizeNumber(settings.limits?.monthlyBudget, defaults.limits.monthlyBudget, MAX_BUDGET),
      perUserDailyRequests: Math.floor(normalizeNumber(settings.limits?.perUserDailyRequests, defaults.limits.perUserDailyRequests)),
      perUserMonthlyRequests: Math.floor(normalizeNumber(settings.limits?.perUserMonthlyRequests, defaults.limits.perUserMonthlyRequests)),
    },
    alerts: {
      thresholds: thresholds.length ? Array.from(new Set(thresholds)) : defaults.alerts.thresholds,
    },
    alertHistory: settings.alertHistory && typeof settings.alertHistory === "object" ? settings.alertHistory : {},
  };
};

const getWorkspaceAISettings = async (workspaceId) => {
  const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
  const settings = await WorkspaceSetting.findOneAndUpdate(
    { workspaceId: normalizedWorkspaceId },
    { $setOnInsert: { workspaceId: normalizedWorkspaceId } },
    { new: true, upsert: true }
  );
  const normalizedSettings = normalizeAISettings(settings.aiSettings || {});

  if (JSON.stringify(settings.aiSettings || {}) !== JSON.stringify(normalizedSettings)) {
    settings.aiSettings = normalizedSettings;
    settings.updatedAt = new Date();
    await settings.save();
  }

  return normalizedSettings;
};

const updateWorkspaceAISettings = async ({ settings, updatedBy, workspaceId }) => {
  const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
  const normalizedSettings = normalizeAISettings(settings);
  const workspaceSetting = await WorkspaceSetting.findOneAndUpdate(
    { workspaceId: normalizedWorkspaceId },
    {
      $set: {
        aiSettings: {
          ...normalizedSettings,
          updatedAt: new Date(),
          updatedBy,
        },
        updatedAt: new Date(),
      },
    },
    { new: true, upsert: true }
  );

  return normalizeAISettings(workspaceSetting.aiSettings || {});
};

const buildUsageMatch = ({ endDate = new Date(), feature, projectId, role, startDate, userId, workspaceId }) => {
  const match = {
    workspaceId: normalizeWorkspaceId(workspaceId),
    createdAt: {
      $gte: startDate || new Date(0),
      $lt: endDate,
    },
  };

  if (feature) match.feature = feature;
  if (projectId) {
    match.projectId = mongoose.isValidObjectId(projectId)
      ? new mongoose.Types.ObjectId(projectId)
      : projectId;
  }
  if (userId) {
    match.userId = mongoose.isValidObjectId(userId)
      ? new mongoose.Types.ObjectId(userId)
      : userId;
  }
  if (role) match.role = role;

  return match;
};

const getUsageTotals = async (match) => {
  const [summary = {}] = await AIUsage.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        requests: { $sum: 1 },
        inputTokens: { $sum: { $ifNull: ["$inputTokens", 0] } },
        outputTokens: { $sum: { $ifNull: ["$outputTokens", 0] } },
        totalTokens: { $sum: { $ifNull: ["$totalTokens", 0] } },
        estimatedCost: { $sum: "$estimatedCost" },
      },
    },
  ]);

  return {
    requests: summary.requests || 0,
    inputTokens: summary.inputTokens || 0,
    outputTokens: summary.outputTokens || 0,
    totalTokens: summary.totalTokens || 0,
    estimatedCost: summary.estimatedCost || 0,
  };
};

const checkAIAccess = async ({ feature, projectId, role, userId, workspaceId }) => {
  const settings = await getWorkspaceAISettings(workspaceId);
  const featureSettings = settings.features[feature];

  if (!settings.masterEnabled) {
    return { allowed: false, code: "AI_DISABLED", message: "AI is disabled for this workspace." };
  }

  if (!featureSettings?.enabled) {
    return { allowed: false, code: "AI_FEATURE_DISABLED", message: "This AI feature is disabled." };
  }

  if (!featureSettings.allowedRoles.includes(role)) {
    return { allowed: false, code: "AI_ROLE_NOT_ALLOWED", message: "Your role cannot use this AI feature." };
  }

  const now = new Date();
  const dayStart = startOfDay(now);
  const monthStart = startOfMonth(now);
  const orgDaily = await getUsageTotals(buildUsageMatch({ startDate: dayStart, workspaceId }));
  const orgMonthly = await getUsageTotals(buildUsageMatch({ startDate: monthStart, workspaceId }));
  const userDaily = await getUsageTotals(buildUsageMatch({ startDate: dayStart, userId, workspaceId }));
  const userMonthly = await getUsageTotals(buildUsageMatch({ startDate: monthStart, userId, workspaceId }));
  const { limits } = settings;

  if (limits.perUserDailyRequests && userDaily.requests >= limits.perUserDailyRequests) {
    return { allowed: false, code: "AI_USER_DAILY_LIMIT_REACHED", message: "Your daily AI request limit has been reached." };
  }

  if (limits.perUserMonthlyRequests && userMonthly.requests >= limits.perUserMonthlyRequests) {
    return { allowed: false, code: "AI_USER_MONTHLY_LIMIT_REACHED", message: "Your monthly AI request limit has been reached." };
  }

  if (limits.dailyRequests && orgDaily.requests >= limits.dailyRequests) {
    return { allowed: false, code: "AI_DAILY_REQUEST_LIMIT_REACHED", message: "The organization's daily AI request limit has been reached." };
  }

  if (limits.monthlyRequests && orgMonthly.requests >= limits.monthlyRequests) {
    return { allowed: false, code: "AI_MONTHLY_REQUEST_LIMIT_REACHED", message: "The organization's monthly AI request limit has been reached." };
  }

  if (limits.dailyBudget && orgDaily.estimatedCost >= limits.dailyBudget) {
    return { allowed: false, code: "AI_DAILY_BUDGET_EXCEEDED", message: "The organization's daily AI budget has been reached." };
  }

  if (limits.monthlyBudget && orgMonthly.estimatedCost >= limits.monthlyBudget) {
    return { allowed: false, code: "AI_MONTHLY_BUDGET_EXCEEDED", message: "The organization's monthly AI budget has been reached." };
  }

  return {
    allowed: true,
    feature,
    projectId,
    settings,
  };
};

const recordAIUsage = async ({
  commitSha = "",
  durationMs = null,
  feature,
  inputTokens,
  modelId = BEDROCK_MODEL_ID,
  outputTokens,
  projectId = null,
  repository = "",
  role = "",
  status = "SUCCESS",
  userId,
  workspaceId,
} = {}) => {
  const normalizedInputTokens = normalizeTokenCount(inputTokens);
  const normalizedOutputTokens = normalizeTokenCount(outputTokens);
  const totalTokens =
    normalizedInputTokens === null && normalizedOutputTokens === null
      ? null
      : (normalizedInputTokens || 0) + (normalizedOutputTokens || 0);
  const cost = calculateAICost({
    inputTokens: normalizedInputTokens,
    modelId,
    outputTokens: normalizedOutputTokens,
  });

  const usage = await AIUsage.create({
    workspaceId: normalizeWorkspaceId(workspaceId),
    userId,
    projectId,
    feature,
    modelId,
    requestId: crypto.randomUUID(),
    inputTokens: normalizedInputTokens,
    outputTokens: normalizedOutputTokens,
    totalTokens,
    estimatedCost: cost.totalEstimatedCost,
    status,
    durationMs,
    role,
    repository,
    commitSha,
  });

  try {
    const settings = await getWorkspaceAISettings(workspaceId);
    await maybeCreateAIUsageAlerts({ settings, workspaceId });
  } catch (error) {
    console.warn("[ai-policy] usage alert evaluation failed", {
      workspaceId: normalizeWorkspaceId(workspaceId),
      message: error.message,
    });
  }

  return usage;
};

const countCodeReviewRunsForPush = async ({ commitSha = "", projectId, workspaceId } = {}) => {
  if (!commitSha || !projectId || !workspaceId) {
    return 0;
  }

  return AIUsage.countDocuments({
    workspaceId: normalizeWorkspaceId(workspaceId),
    projectId,
    commitSha,
    feature: AI_FEATURES.CODE_REVIEW,
    status: "SUCCESS",
  });
};

const buildDateRange = (range = "30d") => {
  const now = new Date();

  if (range === "today") return { startDate: startOfDay(now), endDate: now };
  if (range === "7d") return { startDate: new Date(now.getTime() - 7 * DAY_MS), endDate: now };
  if (range === "this_month") return { startDate: startOfMonth(now), endDate: now };
  if (range === "previous_month") {
    const startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endDate = new Date(now.getFullYear(), now.getMonth(), 1);
    return { startDate, endDate };
  }

  return { startDate: new Date(now.getTime() - 30 * DAY_MS), endDate: now };
};

const getBudgetProgress = (spent = 0, budget = 0, thresholds = []) => {
  const percent = budget > 0 ? (spent / budget) * 100 : 0;

  return {
    budget,
    spent,
    remaining: Math.max(0, budget - spent),
    percent,
    warningThresholds: thresholds.filter((threshold) => percent >= threshold),
    hardLimitReached: budget > 0 && spent >= budget,
  };
};

const getUsagePeriodKey = (type, date = new Date()) => {
  if (type === "dailyBudget") {
    return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  }

  return `${date.getFullYear()}-${date.getMonth() + 1}`;
};

const createAIUsageAlertNotifications = async ({ message, workspaceId }) => {
  const recipients = await User.find({
    workspaceId: normalizeWorkspaceId(workspaceId),
    role: { $in: AI_MANAGE_ROLES },
  })
    .select("_id")
    .lean();

  if (!recipients.length) {
    return;
  }

  await Notification.create(
    recipients.map((user) => ({
      recipientId: user._id,
      text: message,
      type: "other",
      onModel: "Project",
      link: "/settings/users?panel=ai",
    }))
  );
};

const maybeCreateAIUsageAlerts = async ({ settings, workspaceId }) => {
  const thresholds = settings.alerts?.thresholds || [];

  if (!thresholds.length) {
    return;
  }

  const now = new Date();
  const [today, thisMonth] = await Promise.all([
    getUsageTotals(buildUsageMatch({ startDate: startOfDay(now), workspaceId })),
    getUsageTotals(buildUsageMatch({ startDate: startOfMonth(now), workspaceId })),
  ]);
  const budgetChecks = [
    {
      type: "dailyBudget",
      label: "daily",
      total: today.estimatedCost,
      budget: settings.limits?.dailyBudget || 0,
    },
    {
      type: "monthlyBudget",
      label: "monthly",
      total: thisMonth.estimatedCost,
      budget: settings.limits?.monthlyBudget || 0,
    },
  ];

  for (const check of budgetChecks) {
    if (!check.budget) {
      continue;
    }

    const percent = (check.total / check.budget) * 100;
    const crossedThresholds = thresholds.filter((threshold) => percent >= threshold);

    for (const threshold of crossedThresholds) {
      const historyKey = `${check.type}:${getUsagePeriodKey(check.type, now)}:${threshold}`;

      if (settings.alertHistory?.[historyKey]) {
        continue;
      }

      await WorkspaceSetting.findOneAndUpdate(
        { workspaceId: normalizeWorkspaceId(workspaceId) },
        {
          $set: {
            [`aiSettings.alertHistory.${historyKey}`]: now,
            updatedAt: now,
          },
        }
      );
      await createAIUsageAlertNotifications({
        workspaceId,
        message: `AI usage has reached ${threshold}% of the ${check.label} budget.`,
      });
      settings.alertHistory = {
        ...(settings.alertHistory || {}),
        [historyKey]: now,
      };
    }
  }
};

const getAIUsageAnalytics = async ({ filters = {}, workspaceId }) => {
  const customStartDate = filters.startDate ? new Date(filters.startDate) : null;
  const customEndDate = filters.endDate ? new Date(filters.endDate) : null;
  const { startDate, endDate } =
    Number.isFinite(customStartDate?.getTime()) || Number.isFinite(customEndDate?.getTime())
      ? {
          startDate: Number.isFinite(customStartDate?.getTime()) ? customStartDate : new Date(0),
          endDate: Number.isFinite(customEndDate?.getTime()) ? customEndDate : new Date(),
        }
      : buildDateRange(filters.range);
  const match = buildUsageMatch({
    endDate,
    feature: filters.feature,
    projectId: filters.projectId,
    role: filters.role,
    startDate,
    userId: filters.userId,
    workspaceId,
  });
  const [summary, byFeature, byProject, byUser] = await Promise.all([
    getUsageTotals(match),
    AIUsage.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$feature",
          requests: { $sum: 1 },
          totalTokens: { $sum: { $ifNull: ["$totalTokens", 0] } },
          estimatedCost: { $sum: "$estimatedCost" },
        },
      },
      { $sort: { estimatedCost: -1 } },
      {
        $lookup: {
          from: "projects",
          localField: "_id",
          foreignField: "_id",
          as: "project",
        },
      },
      {
        $addFields: {
          name: { $ifNull: [{ $arrayElemAt: ["$project.name", 0] }, "No project"] },
        },
      },
      { $project: { project: 0 } },
    ]),
    AIUsage.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$projectId",
          requests: { $sum: 1 },
          totalTokens: { $sum: { $ifNull: ["$totalTokens", 0] } },
          estimatedCost: { $sum: "$estimatedCost" },
        },
      },
      { $sort: { estimatedCost: -1 } },
    ]),
    AIUsage.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$userId",
          role: { $first: "$role" },
          requests: { $sum: 1 },
          totalTokens: { $sum: { $ifNull: ["$totalTokens", 0] } },
          estimatedCost: { $sum: "$estimatedCost" },
        },
      },
      { $sort: { estimatedCost: -1 } },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "user",
        },
      },
      {
        $addFields: {
          name: { $ifNull: [{ $arrayElemAt: ["$user.name", 0] }, "Unknown user"] },
          email: { $ifNull: [{ $arrayElemAt: ["$user.email", 0] }, ""] },
        },
      },
      { $project: { user: 0 } },
    ]),
  ]);
  const thisMonth = await getUsageTotals(
    buildUsageMatch({ startDate: startOfMonth(new Date()), workspaceId })
  );
  const today = await getUsageTotals(
    buildUsageMatch({ startDate: startOfDay(new Date()), workspaceId })
  );

  const settings = await getWorkspaceAISettings(workspaceId);
  const codeReviewUsage = byFeature.find((row) => row._id === AI_FEATURES.CODE_REVIEW);

  return {
    summary,
    today,
    thisMonth,
    budgetProgress: {
      daily: getBudgetProgress(
        today.estimatedCost,
        settings.limits?.dailyBudget || 0,
        settings.alerts?.thresholds || []
      ),
      monthly: getBudgetProgress(
        thisMonth.estimatedCost,
        settings.limits?.monthlyBudget || 0,
        settings.alerts?.thresholds || []
      ),
    },
    codeReviewAnalytics: {
      totalReviews: codeReviewUsage?.requests || 0,
      estimatedCost: codeReviewUsage?.estimatedCost || 0,
      averageCostPerReview: codeReviewUsage?.requests
        ? (codeReviewUsage.estimatedCost || 0) / codeReviewUsage.requests
        : 0,
      averageScore: null,
      criticalFindings: null,
      highFindings: null,
      mediumFindings: null,
      lowFindings: null,
    },
    byFeature: byFeature.map((row) => ({
      feature: row._id,
      label: AI_FEATURE_LABELS[row._id] || row._id,
      requests: row.requests || 0,
      totalTokens: row.totalTokens || 0,
      estimatedCost: row.estimatedCost || 0,
      percentageOfCost: summary.estimatedCost
        ? ((row.estimatedCost || 0) / summary.estimatedCost) * 100
        : 0,
    })),
    byProject,
    byUser,
  };
};

module.exports = {
  AI_MANAGE_ROLES,
  buildDateRange,
  checkAIAccess,
  countCodeReviewRunsForPush,
  getAIUsageAnalytics,
  getDefaultAISettings,
  getUsageTotals,
  getWorkspaceAISettings,
  maybeCreateAIUsageAlerts,
  normalizeAISettings,
  recordAIUsage,
  updateWorkspaceAISettings,
};
