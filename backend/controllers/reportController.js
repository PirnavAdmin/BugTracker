const mongoose = require("mongoose");
const Issue = require("../models/Issue");
const IssueHistory = require("../models/IssueHistory");
const Project = require("../models/Project");
const Sprint = require("../models/Sprint");
const asyncHandler = require("../utils/asyncHandler");
const { buildProjectAccessQuery } = require("../utils/projectRelations");
const { ROLE_DEVELOPER } = require("../utils/roles");
const { ISSUE_STATUS } = require("../utils/issueStatus");
const { ISSUE_TYPES } = require("../utils/issueTypes");
const { BUG_STATUS, BUG_TERMINAL_STATUS_VALUES } = require("../utils/bugLifecycle");

const CLOSED_STATUSES = [
  ISSUE_STATUS.DONE,
  BUG_STATUS.CLOSED,
  BUG_STATUS.DONE,
];

const DONE_STATUSES = [
  ISSUE_STATUS.DONE,
  BUG_STATUS.CLOSED,
  BUG_STATUS.DONE,
  BUG_STATUS.FIXED,
];

const OPEN_STATUSES = [
  ISSUE_STATUS.TODO,
  ISSUE_STATUS.IN_PROGRESS,
  ISSUE_STATUS.BLOCKED,
  ISSUE_STATUS.REVIEW,
  ISSUE_STATUS.QA,
  BUG_STATUS.NEW,
  BUG_STATUS.TRIAGED,
  BUG_STATUS.OPEN,
  BUG_STATUS.ASSIGNED,
  BUG_STATUS.IN_PROGRESS,
  BUG_STATUS.READY_FOR_QA,
  BUG_STATUS.TESTING,
  BUG_STATUS.REOPEN,
];

const getDisplayKey = (issue) => {
  if (!issue || typeof issue !== "object") {
    return "";
  }

  const displayBugId =
    typeof issue.displayBugId === "string" ? issue.displayBugId.trim() : "";
  if (displayBugId) {
    return displayBugId;
  }

  const explicitKey =
    typeof issue.issueKey === "string" ? issue.issueKey.trim() : "";
  if (explicitKey) {
    return explicitKey;
  }

  const projectName = issue.projectId?.name || issue.project?.name || "";
  const projectKey = projectName
    .trim()
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase() || "")
    .join("")
    .slice(0, 4) || "WORK";
  const suffix = String(issue._id || "").slice(-5).toUpperCase();

  return suffix ? `${projectKey}-${suffix}` : `${projectKey}-NEW`;
};

const TODO_STATUSES = [
  ISSUE_STATUS.TODO,
  BUG_STATUS.NEW,
  BUG_STATUS.TRIAGED,
  BUG_STATUS.OPEN,
  BUG_STATUS.ASSIGNED,
];

const IN_PROGRESS_STATUSES = [
  ISSUE_STATUS.IN_PROGRESS,
  ISSUE_STATUS.BLOCKED,
  BUG_STATUS.IN_PROGRESS,
];

const CRITICAL_VALUES = ["Critical", "Blocker"];

const getDeveloperDashboardAnalytics = asyncHandler(async (req, res) => {
  const userId = new mongoose.Types.ObjectId(req.user._id);
  const accessibleProjectIds = await Project.find(
    await buildProjectAccessQuery(req.user)
  ).distinct("_id");

  // Filters
  const { projectId, sprintId, dateFrom, dateTo, priority, severity } = req.query;
  const match = {
    isDeleted: { $ne: true },
    projectId: { $in: accessibleProjectIds },
    $or: [
      { assignee: userId },
      { developerId: userId },
      { assignedTo: userId },
      { ownerId: userId },
      { "bugDetails.developerLead": userId }
    ]
  };

  if (projectId && projectId !== "all") {
    if (!accessibleProjectIds.some((item) => String(item) === String(projectId))) {
      res.status(403);
      throw new Error("You do not have access to that project");
    }

    match.projectId = new mongoose.Types.ObjectId(projectId);
  }
  if (sprintId && sprintId !== "all") {
    match.sprintId = sprintId === "backlog" ? null : new mongoose.Types.ObjectId(sprintId);
  }
  if (priority && priority !== "all") {
    match.priority = priority;
  }
  if (severity && severity !== "all") {
    match["bugDetails.severity"] = severity;
  }
  if (dateFrom || dateTo) {
    match.createdAt = {};
    if (dateFrom) match.createdAt.$gte = new Date(dateFrom);
    if (dateTo) {
      const dTo = new Date(dateTo);
      dTo.setHours(23, 59, 59, 999);
      match.createdAt.$lte = dTo;
    }
  }

  // Optimized data fetching using aggregation with $facet
  const [analyticsResult] = await Issue.aggregate([
    { $match: match },
    {
      $facet: {
        summary: [
          {
            $group: {
              _id: null,
              assignedWork: { $sum: 1 },
              openWork: { $sum: { $cond: [{ $in: ["$status", OPEN_STATUSES] }, 1, 0] } },
              completed: { $sum: { $cond: [{ $in: ["$status", CLOSED_STATUSES] }, 1, 0] } },
              readyForQa: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $eq: ["$type", ISSUE_TYPES.BUG] },
                        { $in: ["$status", [BUG_STATUS.READY_FOR_QA, BUG_STATUS.FIXED]] }
                      ]
                    },
                    1, 0
                  ]
                }
              },
              criticalBugs: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $eq: ["$type", ISSUE_TYPES.BUG] },
                        {
                          $or: [
                            { $in: ["$bugDetails.severity", CRITICAL_VALUES] },
                            { $in: ["$priority", CRITICAL_VALUES] }
                          ]
                        }
                      ]
                    },
                    1, 0
                  ]
                }
              }
            }
          }
        ],
        taskMetrics: [
          { $match: { type: { $ne: ISSUE_TYPES.BUG } } },
          {
            $group: {
              _id: null,
              assigned: { $sum: 1 },
              open: { $sum: { $cond: [{ $in: ["$status", [...TODO_STATUSES, ...IN_PROGRESS_STATUSES]] }, 1, 0] } },
              completed: { $sum: { $cond: [{ $eq: ["$status", ISSUE_STATUS.DONE] }, 1, 0] } },
              overdue: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $ne: ["$dueAt", null] },
                        { $lt: ["$dueAt", new Date()] },
                        { $ne: ["$status", ISSUE_STATUS.DONE] }
                      ]
                    },
                    1, 0
                  ]
                }
              },
              storyPointsCompleted: { $sum: { $cond: [{ $eq: ["$status", ISSUE_STATUS.DONE] }, { $ifNull: ["$storyPoints", 0] }, 0] } },
              sprintIds: { $addToSet: "$sprintId" }
            }
          }
        ],
        bugMetrics: [
          { $match: { type: ISSUE_TYPES.BUG } },
          {
            $group: {
              _id: null,
              assigned: { $sum: 1 },
              inProgress: { $sum: { $cond: [{ $eq: ["$status", BUG_STATUS.IN_PROGRESS] }, 1, 0] } },
              readyForQa: { $sum: { $cond: [{ $in: ["$status", [BUG_STATUS.READY_FOR_QA, BUG_STATUS.FIXED]] }, 1, 0] } },
              reopened: { $sum: { $cond: [{ $eq: ["$status", BUG_STATUS.REOPEN] }, 1, 0] } },
              closed: { $sum: { $cond: [{ $in: ["$status", [BUG_STATUS.CLOSED, BUG_STATUS.DONE]] }, 1, 0] } },
              critical: { $sum: { $cond: [{ $in: ["$bugDetails.severity", CRITICAL_VALUES] }, 1, 0] } },
              totalReopenedCount: { $sum: { $cond: [{ $gt: ["$reopenedCount", 0] }, 1, 0] } },
              totalClosedEver: { $sum: { $cond: [{ $ne: ["$closedAt", null] }, 1, 0] } },
              closedWithoutReopen: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $in: ["$status", [BUG_STATUS.CLOSED, BUG_STATUS.DONE]] },
                        { $eq: [{ $ifNull: ["$reopenedCount", 0] }, 0] }
                      ]
                    },
                    1, 0
                  ]
                }
              }
            }
          }
        ],
        severityBreakdown: [
          { $match: { type: ISSUE_TYPES.BUG } },
          {
            $group: {
              _id: "$bugDetails.severity",
              value: { $sum: 1 }
            }
          },
          { $project: { name: "$_id", value: 1, _id: 0 } }
        ],
        workDistribution: [
          {
            $group: {
              _id: { $cond: [{ $eq: ["$type", ISSUE_TYPES.BUG] }, "Bugs", "Tasks"] },
              value: { $sum: 1 }
            }
          },
          { $project: { name: "$_id", value: 1, _id: 0 } }
        ],
        moduleStats: [
          {
            $group: {
              _id: { $ifNull: ["$bugDetails.moduleName", "General"] },
              tasks: { $sum: { $cond: [{ $ne: ["$type", ISSUE_TYPES.BUG] }, 1, 0] } },
              bugs: { $sum: { $cond: [{ $eq: ["$type", ISSUE_TYPES.BUG] }, 1, 0] } },
              completed: {
                $sum: {
                  $cond: [
                    {
                      $or: [
                        { $and: [{ $ne: ["$type", ISSUE_TYPES.BUG] }, { $eq: ["$status", ISSUE_STATUS.DONE] }] },
                        { $and: [{ $eq: ["$type", ISSUE_TYPES.BUG] }, { $in: ["$status", CLOSED_STATUSES] }] }
                      ]
                    },
                    1, 0
                  ]
                }
              }
            }
          }
        ],
        rawIssues: [
          {
            $project: {
              _id: 1,
              title: 1,
              type: 1,
              status: 1,
              priority: 1,
              dueAt: 1,
              updatedAt: 1,
              createdAt: 1,
              startedAt: 1,
              closedAt: 1,
              reopenedCount: 1,
              displayBugId: 1,
              issueKey: 1,
              storyPoints: 1,
              "bugDetails.severity": 1,
              "bugDetails.moduleName": 1,
            },
          },
        ]
      }
    }
  ]);

  console.log("Developer Dashboard Aggregation Result:", JSON.stringify(analyticsResult, null, 2));

  const summary = {
    assignedWork: Number(analyticsResult.summary[0]?.assignedWork || 0),
    openWork: Number(analyticsResult.summary[0]?.openWork || 0),
    completed: Number(analyticsResult.summary[0]?.completed || 0),
    readyForQa: Number(analyticsResult.summary[0]?.readyForQa || 0),
    criticalBugs: Number(analyticsResult.summary[0]?.criticalBugs || 0),
    productivity: 0
  };
  summary.productivity = summary.assignedWork ? Math.round((summary.completed / summary.assignedWork) * 100) : 0;

  const taskMetricsRaw = analyticsResult.taskMetrics[0] || {};
  const taskMetrics = {
    assigned: Number(taskMetricsRaw.assigned || 0),
    open: Number(taskMetricsRaw.open || 0),
    completed: Number(taskMetricsRaw.completed || 0),
    overdue: Number(taskMetricsRaw.overdue || 0),
    storyPointsCompleted: Number(taskMetricsRaw.storyPointsCompleted || 0),
    completionRate: 0,
    sprintParticipation: Array.isArray(taskMetricsRaw.sprintIds) ? taskMetricsRaw.sprintIds.filter(Boolean).length : 0
  };
  taskMetrics.completionRate = taskMetrics.assigned ? Math.round((taskMetrics.completed / taskMetrics.assigned) * 100) : 0;

  const bugMetricsRaw = analyticsResult.bugMetrics[0] || {};
  const bugMetrics = {
    assigned: Number(bugMetricsRaw.assigned || 0),
    inProgress: Number(bugMetricsRaw.inProgress || 0),
    readyForQa: Number(bugMetricsRaw.readyForQa || 0),
    reopened: Number(bugMetricsRaw.reopened || 0),
    closed: Number(bugMetricsRaw.closed || 0),
    critical: Number(bugMetricsRaw.critical || 0),
    reopenRate: 0,
    fixSuccessRate: 0
  };

  const totalReopenedCount = Number(bugMetricsRaw.totalReopenedCount || 0);
  const totalClosedEver = Number(bugMetricsRaw.totalClosedEver || 0);
  const closedWithoutReopen = Number(bugMetricsRaw.closedWithoutReopen || 0);

  bugMetrics.reopenRate = totalClosedEver || bugMetrics.closed ? Math.round((totalReopenedCount / (totalClosedEver || bugMetrics.closed)) * 100) : 0;
  bugMetrics.fixSuccessRate = bugMetrics.closed ? Math.round((closedWithoutReopen / bugMetrics.closed) * 100) : 0;

  // Lead and Cycle Time Calculations
  const calculateAvgTime = (issues, useStartedAt = false) => {
    const durations = issues
      .filter(i => i.closedAt && (useStartedAt ? i.startedAt : i.createdAt))
      .map(i => new Date(i.closedAt) - new Date(useStartedAt ? i.startedAt : i.createdAt))
      .filter(d => d >= 0);
    return durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;
  };

  const rawTasks = (analyticsResult.rawIssues || []).filter(i => i.type !== ISSUE_TYPES.BUG);
  const rawBugs = (analyticsResult.rawIssues || []).filter(i => i.type === ISSUE_TYPES.BUG);

  taskMetrics.avgLeadTime = calculateAvgTime(rawTasks);
  taskMetrics.avgCycleTime = calculateAvgTime(rawTasks, true);
  bugMetrics.avgLeadTime = calculateAvgTime(rawBugs);
  bugMetrics.avgCycleTime = calculateAvgTime(rawBugs, true);
  bugMetrics.avgResolutionTime = bugMetrics.avgLeadTime;

  // Severity Breakdown
  const severityMap = { "Critical": 0, "Major": 0, "Minor": 0, "Low": 0 };
  (analyticsResult.severityBreakdown || []).forEach(item => {
    if (item.name === "Blocker" || item.name === "Critical") severityMap["Critical"] += Number(item.value);
    else if (item.name in severityMap) severityMap[item.name] += Number(item.value);
  });
  const severityDistribution = Object.entries(severityMap).map(([name, value]) => ({ name, value: Number(value) }));

  // Velocity - last 6 sprints
  const sprints = await Sprint.find({
    workspaceId: req.user.workspaceId,
    projectId: { $in: accessibleProjectIds },
    state: "COMPLETED"
  }).sort({ endDate: -1 }).limit(6).lean();

  const sprintIds = sprints.map(s => s._id);

  const sprintData = await Issue.aggregate([
    {
      $match: {
        projectId: { $in: accessibleProjectIds },
        sprintId: { $in: sprintIds },
        $or: [
          { assignee: userId },
          { developerId: userId },
          { assignedTo: userId },
          { ownerId: userId },
          { "bugDetails.developerLead": userId }
        ],
        status: { $in: CLOSED_STATUSES },
        isDeleted: { $ne: true }
      }
    },
    {
      $group: {
        _id: { sprintId: "$sprintId", type: "$type" },
        count: { $sum: 1 }
      }
    }
  ]);

  const sprintTrend = sprints.map(s => {
    const tasks = Number(sprintData.find(d => d._id.sprintId.equals(s._id) && d._id.type !== ISSUE_TYPES.BUG)?.count || 0);
    const bugs = Number(sprintData.find(d => d._id.sprintId.equals(s._id) && d._id.type === ISSUE_TYPES.BUG)?.count || 0);
    return {
      sprint: s.name,
      name: s.name,
      tasks,
      bugs,
      completed: Number(tasks + bugs)
    };
  }).reverse();

  const charts = {
    workDistribution: (analyticsResult.workDistribution || []).map(d => ({ name: d.name, value: Number(d.value) })),
    severityDistribution,
    sprintTrend,
  };

  const recentHistory = await IssueHistory.find({
    actorId: userId,
    projectId: { $in: accessibleProjectIds },
  })
    .sort({ createdAt: -1 })
    .limit(15)
    .populate("issueId", "title type displayBugId issueKey")
    .lean();

  const recentActivity = recentHistory.map((h) => ({
    id: h._id,
    action:
      h.eventType === "BUG_STATUS_CHANGED" || h.field === "status"
        ? `Moved to ${h.toValue}`
        : h.eventType,
    issueTitle: h.issueId?.title,
    issueId: getDisplayKey(h.issueId),
    type: h.issueId?.type,
    createdAt: h.createdAt,
  }));

  const moduleStats = analyticsResult.moduleStats.map(m => ({
    name: m._id,
    tasks: Number(m.tasks),
    bugs: Number(m.bugs),
    completed: Number(m.completed)
  }));

  const sourceIssues = (analyticsResult.rawIssues || []).map((issue) => ({
    _id: issue._id,
    issueId: getDisplayKey(issue),
    title: issue.title || "Untitled work item",
    type: issue.type || ISSUE_TYPES.TASK,
    status: issue.status || ISSUE_STATUS.TODO,
    priority: issue.priority || "Medium",
    severity: issue?.bugDetails?.severity || "",
    moduleName: issue?.bugDetails?.moduleName || "General",
    dueAt: issue.dueAt || null,
    updatedAt: issue.updatedAt || issue.closedAt || issue.createdAt || null,
    createdAt: issue.createdAt || null,
    startedAt: issue.startedAt || null,
    closedAt: issue.closedAt || null,
    reopenedCount: Number(issue.reopenedCount || 0),
    storyPoints: Number(issue.storyPoints || 0),
  }));

  const now = new Date();
  const lastSprintStart = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const prevSprintStart = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);

  const [lastSprintCount, prevSprintCount] = await Promise.all([
    Issue.countDocuments({
      ...match,
      status: { $in: CLOSED_STATUSES },
      updatedAt: { $gte: lastSprintStart }
    }),
    Issue.countDocuments({
      ...match,
      status: { $in: CLOSED_STATUSES },
      updatedAt: { $gte: prevSprintStart, $lt: lastSprintStart }
    })
  ]);

  let trend = 0;
  if (prevSprintCount > 0) {
    trend = Math.round(((lastSprintCount - prevSprintCount) / prevSprintCount) * 100);
  } else if (lastSprintCount > 0) {
    trend = 100;
  }

  const productivityScore = {
    current: Number(summary.productivity),
    trend: Number(trend),
    velocity: Number(summary.completed),
  };

  const analytics = {
    summary: {
      assignedWork: Number(summary.assignedWork),
      openWork: Number(summary.openWork),
      completed: Number(summary.completed),
      readyForQa: Number(summary.readyForQa),
      criticalBugs: Number(summary.criticalBugs),
      productivity: Number(summary.productivity)
    },
    taskMetrics: {
      ...taskMetrics,
      assigned: Number(taskMetrics.assigned),
      open: Number(taskMetrics.open),
      completed: Number(taskMetrics.completed),
      overdue: Number(taskMetrics.overdue),
      storyPointsCompleted: Number(taskMetrics.storyPointsCompleted),
      completionRate: Number(taskMetrics.completionRate),
      sprintParticipation: Number(taskMetrics.sprintParticipation)
    },
    bugMetrics: {
      ...bugMetrics,
      assigned: Number(bugMetrics.assigned),
      inProgress: Number(bugMetrics.inProgress),
      readyForQa: Number(bugMetrics.readyForQa),
      reopened: Number(bugMetrics.reopened),
      closed: Number(bugMetrics.closed),
      critical: Number(bugMetrics.critical),
      reopenRate: Number(bugMetrics.reopenRate),
      fixSuccessRate: Number(bugMetrics.fixSuccessRate)
    },
    productivityScore,
    charts,
    recentActivity,
    moduleStats,
    sourceIssues,
  };

  console.log("Analytics Response", JSON.stringify(analytics, null, 2));

  res.status(200).json(analytics);
});

module.exports = {
  getDeveloperDashboardAnalytics,
};
