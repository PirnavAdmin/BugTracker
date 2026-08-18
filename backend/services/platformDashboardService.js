const AIUsage = require("../models/AIUsage");
const PlatformAuditLog = require("../models/PlatformAuditLog");
const PlatformCompany = require("../models/PlatformCompany");
const PlatformSubscription = require("../models/PlatformSubscription");
const Project = require("../models/Project");
const User = require("../models/User");
const { PLATFORM_PLANS } = require("../constants/platformPlans");
const { PLATFORM_SUBSCRIPTION_STATUSES } = require("../constants/platformSubscriptions");

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_RANGE_DAYS = 30;
const MAX_RANGE_DAYS = 365;

const clampRangeDays = (value) => {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return DEFAULT_RANGE_DAYS;
  }

  return Math.min(Math.max(Math.trunc(numeric), 7), MAX_RANGE_DAYS);
};

const getDateRange = (query = {}) => {
  const end = query.end ? new Date(query.end) : new Date();
  const safeEnd = Number.isNaN(end.getTime()) ? new Date() : end;
  const startFromQuery = query.start ? new Date(query.start) : null;
  const fallbackStart = new Date(safeEnd.getTime() - (clampRangeDays(query.rangeDays) - 1) * MS_PER_DAY);
  const start =
    startFromQuery && !Number.isNaN(startFromQuery.getTime()) ? startFromQuery : fallbackStart;

  start.setHours(0, 0, 0, 0);
  safeEnd.setHours(23, 59, 59, 999);

  return { start, end: safeEnd };
};

const buildEmptyTimeSeries = (start, end, keys = []) => {
  const rows = [];

  for (
    let cursor = new Date(start);
    cursor <= end;
    cursor = new Date(cursor.getTime() + MS_PER_DAY)
  ) {
    const row = {
      date: cursor.toISOString().slice(0, 10),
    };

    keys.forEach((key) => {
      row[key] = 0;
    });

    rows.push(row);
  }

  return rows;
};

const mergeSeries = (baseRows, aggregateRows, keys = []) => {
  const byDate = new Map(baseRows.map((row) => [row.date, { ...row }]));

  aggregateRows.forEach((row) => {
    const date = row._id;
    const target = byDate.get(date);

    if (!target) {
      return;
    }

    keys.forEach((key) => {
      target[key] = Number(row[key] || 0);
    });
  });

  return [...byDate.values()];
};

const getWorkspaceIds = async () => {
  const [userWorkspaces, projectWorkspaces, aiWorkspaces] = await Promise.all([
    User.distinct("workspaceId", { workspaceId: { $exists: true, $ne: "" } }),
    Project.distinct("workspaceId", { workspaceId: { $exists: true, $ne: "" } }),
    AIUsage.distinct("workspaceId", { workspaceId: { $exists: true, $ne: "" } }),
  ]);

  return [...new Set([...userWorkspaces, ...projectWorkspaces, ...aiWorkspaces].filter(Boolean))];
};

const getSummary = async () => {
  const [platformCompanies, workspaceIds, users, activeSubscriptions, aiTotals] = await Promise.all([
    PlatformCompany.countDocuments({}),
    getWorkspaceIds(),
    User.countDocuments({}),
    PlatformSubscription.countDocuments({ status: PLATFORM_SUBSCRIPTION_STATUSES.ACTIVE }),
    AIUsage.aggregate([
      { $match: { status: "SUCCESS" } },
      {
        $group: {
          _id: null,
          requests: { $sum: 1 },
          tokens: { $sum: { $ifNull: ["$totalTokens", 0] } },
          estimatedCost: { $sum: { $ifNull: ["$estimatedCost", 0] } },
        },
      },
    ]),
  ]);

  const ai = aiTotals[0] || {};

  return {
    companies: platformCompanies || workspaceIds.length,
    users,
    mrr: null,
    aiCost: Number(ai.estimatedCost || 0),
    storage: null,
    aiRequests: Number(ai.requests || 0),
    aiTokens: Number(ai.tokens || 0),
    currency: "USD",
    notes: {
      companies: platformCompanies
        ? "Platform company records."
        : "Inferred from existing workspace records until companies are added.",
      activeSubscriptions,
      mrr: "No subscription billing model is available yet.",
      storage: "No tenant storage metering model is available yet.",
    },
  };
};

const getRevenueOverview = async (query = {}) => {
  const { start, end } = getDateRange(query);

  return {
    currency: "USD",
    totals: {
      revenue: null,
      mrr: null,
    },
    trend: buildEmptyTimeSeries(start, end, ["revenue", "mrr"]),
    emptyState: "No revenue data available yet",
  };
};

const getSubscriptionOverview = async () => {
  const [statusRows, planRows] = await Promise.all([
    PlatformSubscription.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    PlatformSubscription.aggregate([{ $group: { _id: "$planId", count: { $sum: 1 } } }]),
  ]);
  const byStatus = new Map(statusRows.map((row) => [row._id, row.count]));
  const byPlan = new Map(planRows.map((row) => [row._id, row.count]));

  return {
    totals: {
      activeSubscriptions: Number(byStatus.get(PLATFORM_SUBSCRIPTION_STATUSES.ACTIVE) || 0),
      trialSubscriptions: Number(byStatus.get(PLATFORM_SUBSCRIPTION_STATUSES.TRIAL) || 0),
      canceledSubscriptions: Number(byStatus.get(PLATFORM_SUBSCRIPTION_STATUSES.CANCELLED) || 0),
    },
    plans: PLATFORM_PLANS.map((plan) => ({
      ...plan,
      activeSubscriptions: Number(byPlan.get(plan.id) || 0),
    })),
    emptyState: "No subscription data available yet",
  };
};

const getAIUsage = async (query = {}) => {
  const { start, end } = getDateRange(query);
  const baseRows = buildEmptyTimeSeries(start, end, ["requests", "tokens", "estimatedCost"]);
  const [summaryRows, trendRows] = await Promise.all([
    AIUsage.aggregate([
      { $match: { createdAt: { $gte: start, $lte: end }, status: "SUCCESS" } },
      {
        $group: {
          _id: null,
          requests: { $sum: 1 },
          inputTokens: { $sum: { $ifNull: ["$inputTokens", 0] } },
          outputTokens: { $sum: { $ifNull: ["$outputTokens", 0] } },
          totalTokens: { $sum: { $ifNull: ["$totalTokens", 0] } },
          estimatedCost: { $sum: { $ifNull: ["$estimatedCost", 0] } },
        },
      },
    ]),
    AIUsage.aggregate([
      { $match: { createdAt: { $gte: start, $lte: end }, status: "SUCCESS" } },
      {
        $group: {
          _id: { $dateToString: { date: "$createdAt", format: "%Y-%m-%d" } },
          requests: { $sum: 1 },
          tokens: { $sum: { $ifNull: ["$totalTokens", 0] } },
          estimatedCost: { $sum: { $ifNull: ["$estimatedCost", 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]),
  ]);

  return {
    currency: "USD",
    summary: {
      requests: Number(summaryRows[0]?.requests || 0),
      inputTokens: Number(summaryRows[0]?.inputTokens || 0),
      outputTokens: Number(summaryRows[0]?.outputTokens || 0),
      totalTokens: Number(summaryRows[0]?.totalTokens || 0),
      estimatedCost: Number(summaryRows[0]?.estimatedCost || 0),
    },
    trend: mergeSeries(baseRows, trendRows, ["requests", "tokens", "estimatedCost"]),
    emptyState: "No AI usage data available yet",
  };
};

const getAICostByCompany = async (query = {}) => {
  const { start, end } = getDateRange(query);
  const [workspaceIds, usageRows, userRows, projectRows] = await Promise.all([
    getWorkspaceIds(),
    AIUsage.aggregate([
      { $match: { createdAt: { $gte: start, $lte: end }, status: "SUCCESS" } },
      {
        $group: {
          _id: "$workspaceId",
          requests: { $sum: 1 },
          tokens: { $sum: { $ifNull: ["$totalTokens", 0] } },
          estimatedCost: { $sum: { $ifNull: ["$estimatedCost", 0] } },
        },
      },
    ]),
    User.aggregate([{ $group: { _id: "$workspaceId", users: { $sum: 1 } } }]),
    Project.aggregate([{ $group: { _id: "$workspaceId", projects: { $sum: 1 } } }]),
  ]);

  const usageByWorkspace = new Map(usageRows.map((row) => [row._id, row]));
  const usersByWorkspace = new Map(userRows.map((row) => [row._id, row.users]));
  const projectsByWorkspace = new Map(projectRows.map((row) => [row._id, row.projects]));

  return {
    currency: "USD",
    companies: workspaceIds
      .map((workspaceId) => {
        const usage = usageByWorkspace.get(workspaceId) || {};

        return {
          id: workspaceId,
          companyName: workspaceId,
          workspaceId,
          users: Number(usersByWorkspace.get(workspaceId) || 0),
          projects: Number(projectsByWorkspace.get(workspaceId) || 0),
          requests: Number(usage.requests || 0),
          tokens: Number(usage.tokens || 0),
          estimatedCost: Number(usage.estimatedCost || 0),
        };
      })
      .sort((a, b) => b.estimatedCost - a.estimatedCost || a.companyName.localeCompare(b.companyName)),
    emptyState: "No AI cost data available yet",
  };
};

const getPayments = async () => ({
  currency: "USD",
  payments: [],
  emptyState: "No payment data available yet",
});

const getCompanyGrowth = async (query = {}) => {
  const { start, end } = getDateRange(query);
  const baseRows = buildEmptyTimeSeries(start, end, ["companies", "users"]);
  const [userRows, projectRows] = await Promise.all([
    User.aggregate([
      { $match: { createdAt: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: { $dateToString: { date: "$createdAt", format: "%Y-%m-%d" } },
          users: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Project.aggregate([
      { $match: { createdAt: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: { $dateToString: { date: "$createdAt", format: "%Y-%m-%d" } },
          companies: { $addToSet: "$workspaceId" },
        },
      },
      {
        $project: {
          companies: { $size: "$companies" },
        },
      },
      { $sort: { _id: 1 } },
    ]),
  ]);

  const rows = mergeSeries(mergeSeries(baseRows, userRows, ["users"]), projectRows, ["companies"]);

  return {
    trend: rows,
    emptyState: "No company or user growth data available yet",
  };
};

const getActivity = async () => {
  const activity = await PlatformAuditLog.find({})
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();

  return {
    activity: activity.map((row) => ({
      id: String(row._id),
      action: row.action,
      status: row.status,
      actorEmail: row.actorEmail,
      createdAt: row.createdAt,
      metadata: row.metadata || {},
    })),
    emptyState: "No platform activity available yet",
  };
};

const getAlerts = async () => ({
  alerts: [],
  emptyState: "No platform alerts require attention",
});

const getDashboard = async (query = {}) => {
  const [summary, revenue, subscriptions, aiUsage, aiCostByCompany, payments, growth, activity, alerts] =
    await Promise.all([
      getSummary(),
      getRevenueOverview(query),
      getSubscriptionOverview(query),
      getAIUsage(query),
      getAICostByCompany(query),
      getPayments(query),
      getCompanyGrowth(query),
      getActivity(query),
      getAlerts(query),
    ]);

  return {
    summary,
    revenue,
    subscriptions,
    aiUsage,
    aiCostByCompany,
    payments,
    growth,
    activity,
    alerts,
  };
};

module.exports = {
  getAICostByCompany,
  getAIUsage,
  getActivity,
  getAlerts,
  getCompanyGrowth,
  getDashboard,
  getDateRange,
  getPayments,
  getRevenueOverview,
  getSubscriptionOverview,
  getSummary,
};
