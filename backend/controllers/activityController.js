const mongoose = require("mongoose");
const Issue = require("../models/Issue");
const IssueHistory = require("../models/IssueHistory");
const Project = require("../models/Project");
const User = require("../models/User");
const UserActivity = require("../models/UserActivity");
const asyncHandler = require("../utils/asyncHandler");
const { buildProjectAccessQuery } = require("../utils/projectRelations");
const { hasAdminAccess, ROLE_ADMIN } = require("../utils/roles");
const { ISSUE_TYPES } = require("../utils/issueTypes");
const { withTenantFilter } = require("../utils/tenant");
const { normalizeWorkspaceId } = require("../utils/workspace");
const {
  getDayStart,
  getWorkspacePresence,
} = require("../services/presenceService");

const MS_PER_HOUR = 60 * 60 * 1000;

const requireAdmin = (req, res) => {
  if (req.user.role !== ROLE_ADMIN) {
    res.status(403);
    throw new Error("Only admins can view team activity");
  }
};

const parseDateRange = (query = {}) => {
  const now = new Date();
  const range = query.range || "today";
  let start = getDayStart(now);
  let end = new Date(now);

  if (range === "7d") {
    start = getDayStart(new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000));
  } else if (range === "30d") {
    start = getDayStart(new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000));
  } else if (range === "custom") {
    start = query.from ? getDayStart(new Date(query.from)) : start;
    end = query.to ? new Date(query.to) : end;
    end.setHours(23, 59, 59, 999);
  }

  return { start, end };
};

const hours = (minutes = 0) => Number((Number(minutes || 0) / 60).toFixed(2));
const pct = (active = 0, login = 0) =>
  Number(login > 0 ? ((active / login) * 100).toFixed(1) : 0);

const serializeActivityRecord = (record) => {
  const loginMinutes = record.totalLoginMinutes || 0;
  const activeMinutes = record.totalActiveMinutes || 0;
  const idleMinutes = record.totalIdleMinutes || 0;

  return {
    _id: record._id,
    user: record.userId,
    date: record.date,
    loginTime: record.loginTime,
    logoutTime: record.logoutTime,
    lastActiveTime: record.lastActiveTime,
    status: record.status || record.currentStatus,
    currentStatus: record.currentStatus || record.status,
    loginHours: hours(loginMinutes),
    activeHours: hours(activeMinutes),
    idleHours: hours(idleMinutes),
    totalActiveMinutes: activeMinutes,
    totalIdleMinutes: idleMinutes,
    totalLoginMinutes: loginMinutes,
    utilizationPercentage: pct(activeMinutes, loginMinutes),
  };
};

const getTenantUserIds = (user, workspaceId) =>
  User.find(withTenantFilter({ workspaceId }, user)).distinct("_id");

const getTeamActivity = asyncHandler(async (req, res) => {
  requireAdmin(req, res);

  const workspaceId = normalizeWorkspaceId(req.user.workspaceId);
  const { start, end } = parseDateRange(req.query);
  const tenantUserIds = await getTenantUserIds(req.user, workspaceId);
  const [presenceRows, activityRows] = await Promise.all([
    getWorkspacePresence(workspaceId, req.user),
    UserActivity.find({
      workspaceId,
      userId: { $in: tenantUserIds },
      date: {
        $gte: start,
        $lte: end,
      },
    })
      .populate("userId", "_id name email role workspaceId")
      .sort({ date: -1, updatedAt: -1 })
      .lean(),
  ]);
  const latestByUserId = new Map();

  activityRows.forEach((record) => {
    const userId = String(record.userId?._id || record.userId);

    if (!latestByUserId.has(userId)) {
      latestByUserId.set(userId, record);
    }
  });

  const users = presenceRows.map(({ user, presence }) => {
    const record = latestByUserId.get(String(user._id));

    return {
      user,
      status: presence.status,
      lastSeen: presence.lastSeen || record?.lastActiveTime || null,
      activeSessionMinutes: record?.totalLoginMinutes || 0,
      activeHours: hours(record?.totalActiveMinutes || 0),
      idleHours: hours(record?.totalIdleMinutes || 0),
      utilizationPercentage: pct(
        record?.totalActiveMinutes || 0,
        record?.totalLoginMinutes || 0
      ),
    };
  });
  const summary = users.reduce(
    (current, row) => ({
      ...current,
      [row.status]: (current[row.status] || 0) + 1,
    }),
    { active: 0, idle: 0, offline: 0 }
  );

  res.status(200).json({
    range: { start, end },
    summary,
    users,
  });
});

const getMyActivity = asyncHandler(async (req, res) => {
  const workspaceId = normalizeWorkspaceId(req.user.workspaceId);
  const presenceRows = await getWorkspacePresence(workspaceId, req.user);
  const currentPresence = presenceRows.find(
    ({ user }) => String(user._id) === String(req.user._id)
  )?.presence;
  const record = await UserActivity.findOne({
    userId: req.user._id,
    date: getDayStart(new Date()),
  })
    .populate("userId", "_id name email role workspaceId")
    .lean();

  res.status(200).json({
    user: record?.userId || {
      _id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
      workspaceId,
    },
    status: currentPresence?.status || record?.status || record?.currentStatus || "offline",
    lastSeen: currentPresence?.lastSeen || record?.lastActiveTime || null,
    activity: record ? serializeActivityRecord(record) : null,
  });
});

const getProductivityReport = asyncHandler(async (req, res) => {
  const workspaceId = normalizeWorkspaceId(req.user.workspaceId);
  const { start, end } = parseDateRange(req.query);
  const tenantUserIds = await getTenantUserIds(req.user, workspaceId);
  const query = {
    workspaceId,
    userId: { $in: tenantUserIds },
    date: {
      $gte: start,
      $lte: end,
    },
  };

  if (!hasAdminAccess(req.user.role)) {
    query.userId = req.user._id;
  } else if (req.query.userId && mongoose.isValidObjectId(req.query.userId)) {
    if (!tenantUserIds.some((userId) => String(userId) === String(req.query.userId))) {
      res.status(403);
      throw new Error("You do not have access to that user");
    }

    query.userId = req.query.userId;
  }

  const records = await UserActivity.find(query)
    .populate("userId", "_id name email role workspaceId")
    .sort({ date: 1 })
    .lean();
  const rows = records.map(serializeActivityRecord);
  const totals = rows.reduce(
    (current, row) => ({
      loginHours: current.loginHours + row.loginHours,
      activeHours: current.activeHours + row.activeHours,
      idleHours: current.idleHours + row.idleHours,
      totalLoginMinutes: current.totalLoginMinutes + row.totalLoginMinutes,
      totalActiveMinutes: current.totalActiveMinutes + row.totalActiveMinutes,
    }),
    {
      loginHours: 0,
      activeHours: 0,
      idleHours: 0,
      totalLoginMinutes: 0,
      totalActiveMinutes: 0,
    }
  );

  res.status(200).json({
    range: { start, end },
    rows,
    totals: {
      ...totals,
      loginHours: Number(totals.loginHours.toFixed(2)),
      activeHours: Number(totals.activeHours.toFixed(2)),
      idleHours: Number(totals.idleHours.toFixed(2)),
      utilizationPercentage: pct(totals.totalActiveMinutes, totals.totalLoginMinutes),
    },
  });
});

const getBugEffortAnalytics = asyncHandler(async (req, res) => {
  requireAdmin(req, res);

  const { start, end } = parseDateRange(req.query);
  const accessibleProjectIds = await Project.find(
    await buildProjectAccessQuery(req.user)
  ).distinct("_id");
  const bugs = await Issue.find({
    type: ISSUE_TYPES.BUG,
    isDeleted: { $ne: true },
    projectId: { $in: accessibleProjectIds },
    updatedAt: { $gte: start, $lte: end },
  })
    .populate("projectId", "_id name workspaceId")
    .populate("assignee", "_id name email role")
    .select("_id title displayBugId projectId assignee createdAt updatedAt closedAt status")
    .lean();
  const histories = await IssueHistory.find({
    issueId: { $in: bugs.map((bug) => bug._id) },
    eventType: { $in: ["BUG_STATUS_CHANGED", "ISSUE_STATUS_CHANGED"] },
  })
    .sort({ issueId: 1, createdAt: 1 })
    .lean();
  const historiesByIssue = new Map();

  histories.forEach((history) => {
    const issueId = String(history.issueId);
    historiesByIssue.set(issueId, [...(historiesByIssue.get(issueId) || []), history]);
  });

  const rows = bugs.map((bug) => {
    const statusHistory = historiesByIssue.get(String(bug._id)) || [];
    const firstOpened = statusHistory[0]?.createdAt || bug.createdAt;
    const durations = {
      inProgressHours: 0,
      inReviewHours: 0,
      inQaHours: 0,
    };

    statusHistory.forEach((entry, index) => {
      const nextEntry = statusHistory[index + 1];
      const endTime = nextEntry?.createdAt || bug.closedAt || new Date();
      const durationHours = Math.max(0, (new Date(endTime) - new Date(entry.createdAt)) / MS_PER_HOUR);
      const status = String(entry.toValue || "").toLowerCase();

      if (status.includes("progress")) durations.inProgressHours += durationHours;
      if (status.includes("review")) durations.inReviewHours += durationHours;
      if (status.includes("qa") || status.includes("testing") || status.includes("fixed")) {
        durations.inQaHours += durationHours;
      }
    });

    return {
      issueId: bug._id,
      bugId: bug.displayBugId || bug._id,
      title: bug.title,
      project: bug.projectId,
      assignee: bug.assignee,
      assignedTime: bug.createdAt,
      firstOpenedTime: firstOpened,
      timeInProgressHours: Number(durations.inProgressHours.toFixed(2)),
      timeInReviewHours: Number(durations.inReviewHours.toFixed(2)),
      timeInQaHours: Number(durations.inQaHours.toFixed(2)),
      closedTime: bug.closedAt,
      currentStatus: bug.status,
    };
  });

  res.status(200).json({
    range: { start, end },
    rows,
  });
});

module.exports = {
  getBugEffortAnalytics,
  getMyActivity,
  getProductivityReport,
  getTeamActivity,
};
