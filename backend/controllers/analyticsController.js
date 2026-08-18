const mongoose = require("mongoose");
const Issue = require("../models/Issue");
const IssueHistory = require("../models/IssueHistory");
const Project = require("../models/Project");
const ProjectTeam = require("../models/ProjectTeam");
const Sprint = require("../models/Sprint");
const Team = require("../models/Team");
const TeamMember = require("../models/TeamMember");
const asyncHandler = require("../utils/asyncHandler");
const { BUG_TERMINAL_STATUS_VALUES } = require("../utils/bugLifecycle");
const {
  ISSUE_STATUS,
  ISSUE_STATUS_VALUES,
  getCanonicalIssueStatus,
  isClosedIssueStatus,
  normalizeIssueStatus,
} = require("../utils/issueStatus");
const {
  ISSUE_TYPES,
  ISSUE_TYPE_VALUES,
  getCanonicalIssueType,
  isValidIssueType,
} = require("../utils/issueTypes");
const {
  getProjectIdsForUserThroughTenantTeams,
  mergeProjectTeamIds,
} = require("../utils/projectRelations");
const {
  formatDate,
  formatMonthYear,
  getIndianDateKey,
} = require("../utils/dateTime");
const {
  ROLE_ADMIN,
  ROLE_DEVELOPER,
  ROLE_MANAGER,
  ROLE_TEAM_LEAD,
  hasTaskStoryLeadAccess,
  hasTesterAccess,
} = require("../utils/roles");
const { applyActiveSprintVisibilityToIssueQuery } = require("../utils/sprintVisibility");
const { withTenantFilter } = require("../utils/tenant");
const { normalizeWorkspaceId } = require("../utils/workspace");

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const CLOSED_STATUSES = Array.from(
  new Set([
    ISSUE_STATUS.DONE,
    ISSUE_STATUS.FIXED,
    ...BUG_TERMINAL_STATUS_VALUES,
  ])
);
const OPEN_DASHBOARD_STATUSES = ISSUE_STATUS_VALUES.filter(
  (status) => !CLOSED_STATUSES.includes(status)
);
const PRIORITY_ORDER = ["Critical", "High", "Medium", "Low"];
const HIGH_PRIORITY_VALUES = ["Critical", "High"];
const CRITICAL_SEVERITIES = ["Blocker", "Critical"];
const STATUS_LABELS = {
  [ISSUE_STATUS.TODO]: "To Do",
  [ISSUE_STATUS.IN_PROGRESS]: "In Progress",
  [ISSUE_STATUS.BLOCKED]: "Blocked",
  [ISSUE_STATUS.REVIEW]: "Review",
  [ISSUE_STATUS.QA]: "QA",
  [ISSUE_STATUS.DONE]: "Done",
  [ISSUE_STATUS.NEW]: "New",
  [ISSUE_STATUS.OPEN]: "Open",
  [ISSUE_STATUS.ASSIGNED]: "Assigned",
  [ISSUE_STATUS.FIXED]: "Fixed",
  [ISSUE_STATUS.CLOSED]: "Closed",
  [ISSUE_STATUS.REOPEN]: "Reopen",
  [ISSUE_STATUS.REJECTED]: "Rejected",
  [ISSUE_STATUS.DEFERRED]: "Deferred",
};
const STATUS_ORDER = [
  ISSUE_STATUS.TODO,
  ISSUE_STATUS.IN_PROGRESS,
  ISSUE_STATUS.BLOCKED,
  ISSUE_STATUS.REVIEW,
  ISSUE_STATUS.QA,
  ISSUE_STATUS.DONE,
  ISSUE_STATUS.NEW,
  ISSUE_STATUS.OPEN,
  ISSUE_STATUS.ASSIGNED,
  ISSUE_STATUS.FIXED,
  ISSUE_STATUS.CLOSED,
  ISSUE_STATUS.REOPEN,
  ISSUE_STATUS.REJECTED,
  ISSUE_STATUS.DEFERRED,
];

const escapeRegExp = (value = "") =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const startOfDay = (value) => {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
};

const endOfDay = (value) => {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
};

const parseDateInput = (value, label, { end = false } = {}) => {
  if (value === null || value === "" || typeof value === "undefined" || value === "all") {
    return {
      value: null,
    };
  }

  const parsedValue = new Date(value);

  if (Number.isNaN(parsedValue.getTime())) {
    return {
      error: {
        status: 400,
        message: `Invalid ${label}`,
      },
    };
  }

  const hasExplicitTime = typeof value === "string" && value.includes("T");

  return {
    value: hasExplicitTime
      ? parsedValue
      : end
        ? endOfDay(parsedValue)
        : startOfDay(parsedValue),
  };
};

const resolveObjectId = (value) => {
  if (!value) {
    return null;
  }

  if (value._id) {
    return value._id;
  }

  return value;
};

const uniqueObjectIds = (values = []) => {
  const unique = new Map();

  values.filter(Boolean).forEach((value) => {
    unique.set(String(value), value);
  });

  return Array.from(unique.values());
};

const isOrganizationAnalyticsUser = (user) => user?.role === ROLE_ADMIN;

const addAndCondition = (match, condition) => {
  if (!condition || !Object.keys(condition).length) {
    return match;
  }

  match.$and = [...(match.$and || []), condition];
  return match;
};

const buildHighPriorityCondition = () => ({
  $or: [
    {
      priority: {
        $in: HIGH_PRIORITY_VALUES,
      },
    },
    {
      "bugDetails.severity": {
        $in: CRITICAL_SEVERITIES,
      },
    },
  ],
});

const buildHighPriorityExpression = () => ({
  $or: [
    {
      $in: ["$priority", HIGH_PRIORITY_VALUES],
    },
    {
      $in: ["$bugDetails.severity", CRITICAL_SEVERITIES],
    },
  ],
});

const isHighPriorityIssue = (issue = {}) =>
  HIGH_PRIORITY_VALUES.includes(issue.priority) ||
  CRITICAL_SEVERITIES.includes(issue.bugDetails?.severity);

const cloneWithoutCreatedAt = (match = {}) => {
  const { createdAt: _createdAt, ...rest } = match;

  return rest;
};

const getAccessibleProjectIds = async (user) => {
  const workspaceId = normalizeWorkspaceId(user.workspaceId);

  if (isOrganizationAnalyticsUser(user)) {
    return Project.find(withTenantFilter({
      workspaceId,
    }, user)).distinct("_id");
  }

  const userId = user.id || user._id;
  const teamProjectIds = await getProjectIdsForUserThroughTenantTeams(user);
  const projectAccessQuery = {
    workspaceId,
    $or: [
      { createdBy: userId },
      { manager: userId },
      { teamLead: userId },
      ...(teamProjectIds.length
        ? [
            {
              _id: {
                $in: teamProjectIds,
              },
            },
          ]
        : []),
    ],
  };
  const [memberProjectIds, directlyAssignedProjectIds] = await Promise.all([
    Project.find(withTenantFilter(projectAccessQuery, user)).distinct("_id"),
    Issue.find({
      $or: [
        { assignee: user._id },
        { reporter: user._id },
        { "bugDetails.testerOwner": user._id },
        { "bugDetails.developerLead": user._id },
      ],
    }).distinct("projectId"),
  ]);

  const assignedProjectIds = directlyAssignedProjectIds.length
    ? await Project.find(withTenantFilter({
        _id: {
          $in: directlyAssignedProjectIds,
        },
        workspaceId,
      }, user)).distinct("_id")
    : [];

  return uniqueObjectIds([...memberProjectIds, ...assignedProjectIds]);
};

const addPersonalAccess = (match, user) => {
  const userObjectId = user._id || user.id;
  let personalAccessQuery;

  if (hasTesterAccess(user.role)) {
    personalAccessQuery = {
      $or: [
        { assignee: userObjectId },
        { reporter: userObjectId },
      ],
    };
  } else if (user.role === ROLE_DEVELOPER || hasTaskStoryLeadAccess(user.role)) {
    personalAccessQuery = {
      $or: [
        { assignee: userObjectId },
        { "bugDetails.developerLead": userObjectId },
      ],
    };
  } else {
    personalAccessQuery = {
      $or: [
        { assignee: userObjectId },
        { reporter: userObjectId },
        { "bugDetails.testerOwner": userObjectId },
        { "bugDetails.developerLead": userObjectId },
      ],
    };
  }

  if (!personalAccessQuery.$or.length) {
    return;
  }

  if (match.$or) {
    match.$and = [...(match.$and || []), { $or: match.$or }, personalAccessQuery];
    delete match.$or;
    return;
  }

  match.$or = personalAccessQuery.$or;
};

const buildAnalyticsMatch = async (req, res) => {
  const accessibleProjectIds = await getAccessibleProjectIds(req.user);
  const match = {
    isDeleted: {
      $ne: true,
    },
    projectId: {
      $in: accessibleProjectIds,
    },
  };

  if (req.query.projectId && req.query.projectId !== "all") {
    if (!mongoose.isValidObjectId(req.query.projectId)) {
      res.status(400);
      throw new Error("Invalid project id filter");
    }

    const hasProjectAccess = accessibleProjectIds.some(
      (projectId) => String(projectId) === String(req.query.projectId)
    );

    if (!hasProjectAccess) {
      res.status(403);
      throw new Error("You do not have access to that project");
    }

    match.projectId = new mongoose.Types.ObjectId(req.query.projectId);
  }

  if (req.query.teamId && req.query.teamId !== "all") {
    if (!mongoose.isValidObjectId(req.query.teamId)) {
      res.status(400);
      throw new Error("Invalid team id filter");
    }

    const workspaceId = normalizeWorkspaceId(req.user.workspaceId);
    const teamObjectId = new mongoose.Types.ObjectId(req.query.teamId);
    const [team, teamMemberUserIds, teamProjectIds] = await Promise.all([
      Team.findOne({
        _id: teamObjectId,
        workspaceId,
      })
        .select("_id")
        .lean(),
      TeamMember.find({
        teamId: teamObjectId,
      }).distinct("userId"),
      Promise.all([
        ProjectTeam.find({
          teamId: teamObjectId,
        }).distinct("projectId"),
        Project.find(withTenantFilter({
          workspaceId,
          $or: [
            {
              attachedTeams: teamObjectId,
            },
            {
              teamIds: teamObjectId,
            },
          ],
        }, req.user)).distinct("_id"),
      ]).then(([linkedProjectIds, inlineProjectIds]) =>
        uniqueObjectIds([...linkedProjectIds, ...inlineProjectIds])
      ),
    ]);

    if (!team) {
      res.status(404);
      throw new Error("Team not found");
    }

    addAndCondition(match, {
      $or: [
        {
          teamId: teamObjectId,
        },
        ...(teamMemberUserIds.length && teamProjectIds.length
          ? [
              {
                teamId: null,
                projectId: {
                  $in: teamProjectIds,
                },
                assignee: {
                  $in: teamMemberUserIds,
                },
              },
            ]
          : []),
      ],
    });
  }

  if (req.query.assigneeId && req.query.assigneeId !== "all") {
    if (!mongoose.isValidObjectId(req.query.assigneeId)) {
      res.status(400);
      throw new Error("Invalid assignee filter");
    }

    match.assignee = new mongoose.Types.ObjectId(req.query.assigneeId);
  }

  if (req.query.statusGroup && req.query.statusGroup !== "all") {
    const statusGroup = String(req.query.statusGroup).trim().toLowerCase();

    if (statusGroup === "open") {
      match.status = {
        $in: OPEN_DASHBOARD_STATUSES,
      };
    } else if (statusGroup === "closed") {
      match.status = {
        $in: CLOSED_STATUSES,
      };
    } else {
      res.status(400);
      throw new Error("Invalid status group filter");
    }
  }

  if (req.query.status && req.query.status !== "all") {
    const normalizedStatus = normalizeIssueStatus(req.query.status);

    if (Object.values(ISSUE_STATUS).includes(normalizedStatus)) {
      match.status = normalizedStatus;
    } else {
      res.status(400);
      throw new Error("Invalid status filter");
    }
  }

  if (req.query.priorityGroup && req.query.priorityGroup !== "all") {
    const priorityGroup = String(req.query.priorityGroup).trim().toLowerCase();

    if (priorityGroup !== "high") {
      res.status(400);
      throw new Error("Invalid priority group filter");
    }

    addAndCondition(match, buildHighPriorityCondition());
  }

  if (req.query.priority && req.query.priority !== "all") {
    if (!PRIORITY_ORDER.includes(req.query.priority)) {
      res.status(400);
      throw new Error("Invalid priority filter");
    }

    match.priority = req.query.priority;
  }

  if (req.query.type && req.query.type !== "all") {
    const normalizedType = getCanonicalIssueType(req.query.type, "");

    if (!isValidIssueType(normalizedType)) {
      res.status(400);
      throw new Error(`Type must be ${ISSUE_TYPE_VALUES.join(", ")}`);
    }

    match.type = normalizedType;
  }

  if (req.query.excludeType && req.query.excludeType !== "all") {
    const normalizedExcludedType = getCanonicalIssueType(req.query.excludeType, "");

    if (!isValidIssueType(normalizedExcludedType)) {
      res.status(400);
      throw new Error(`Excluded type must be ${ISSUE_TYPE_VALUES.join(", ")}`);
    }

    if (match.type) {
      if (match.type === normalizedExcludedType) {
        match._id = {
          $in: [],
        };
      }
    } else {
      match.type = {
        $ne: normalizedExcludedType,
      };
    }
  }

  if (req.query.sprintId && req.query.sprintId !== "all") {
    if (req.query.sprintId === "backlog") {
      match.sprintId = null;
    } else if (mongoose.isValidObjectId(req.query.sprintId)) {
      match.sprintId = new mongoose.Types.ObjectId(req.query.sprintId);
    } else {
      res.status(400);
      throw new Error("Invalid sprint filter");
    }
  }

  if (req.query.epicId && req.query.epicId !== "all") {
    if (req.query.epicId === "unassigned") {
      match.epicId = null;
    } else if (mongoose.isValidObjectId(req.query.epicId)) {
      match.epicId = new mongoose.Types.ObjectId(req.query.epicId);
    } else {
      res.status(400);
      throw new Error("Invalid epic filter");
    }
  }

  if (req.query.severity && req.query.severity !== "all") {
    match["bugDetails.severity"] = req.query.severity;
  }

  if (req.query.developerId && req.query.developerId !== "all") {
    if (!mongoose.isValidObjectId(req.query.developerId)) {
      res.status(400);
      throw new Error("Invalid developer filter");
    }

    const developerObjectId = new mongoose.Types.ObjectId(req.query.developerId);
    addAndCondition(match, {
      $or: [
        {
          assignee: developerObjectId,
        },
        {
          "bugDetails.developerLead": developerObjectId,
        },
      ],
    });
  }

  if (req.query.testerId && req.query.testerId !== "all") {
    if (!mongoose.isValidObjectId(req.query.testerId)) {
      res.status(400);
      throw new Error("Invalid tester filter");
    }

    const testerObjectId = new mongoose.Types.ObjectId(req.query.testerId);
    addAndCondition(match, {
      $or: [
        {
          reporter: testerObjectId,
        },
        {
          "bugDetails.testerOwner": testerObjectId,
        },
      ],
    });
  }

  if (req.query.search?.trim()) {
    const searchExpression = new RegExp(escapeRegExp(req.query.search.trim()), "i");
    addAndCondition(match, {
      $or: [
        { title: searchExpression },
        { description: searchExpression },
        { priority: searchExpression },
        { status: searchExpression },
        { type: searchExpression },
      ],
    });
  }

  if (req.query.dateFrom || req.query.dateTo) {
    const dateFromResult = parseDateInput(req.query.dateFrom, "start date");
    const dateToResult = parseDateInput(req.query.dateTo, "end date", {
      end: true,
    });

    if (dateFromResult.error) {
      res.status(dateFromResult.error.status);
      throw new Error(dateFromResult.error.message);
    }

    if (dateToResult.error) {
      res.status(dateToResult.error.status);
      throw new Error(dateToResult.error.message);
    }

    if (
      dateFromResult.value &&
      dateToResult.value &&
      dateFromResult.value > dateToResult.value
    ) {
      res.status(400);
      throw new Error("Start date must be before the end date");
    }

    match.createdAt = {};

    if (dateFromResult.value) {
      match.createdAt.$gte = dateFromResult.value;
    }

    if (dateToResult.value) {
      match.createdAt.$lte = dateToResult.value;
    }
  }

  if (!isOrganizationAnalyticsUser(req.user) && req.user.role !== ROLE_MANAGER) {
    addPersonalAccess(match, req.user);
  }

  if (req.user.role === ROLE_DEVELOPER || hasTaskStoryLeadAccess(req.user.role)) {
    await applyActiveSprintVisibilityToIssueQuery(match, Sprint);
  }

  return match;
};

const getDisplayKey = (issue) => {
  const displayBugId =
    typeof issue?.displayBugId === "string" ? issue.displayBugId.trim() : "";

  if (displayBugId) {
    return displayBugId;
  }

  const explicitKey = typeof issue?.issueKey === "string" ? issue.issueKey.trim() : "";

  if (explicitKey) {
    return explicitKey;
  }

  const projectName = issue?.projectId?.name || issue?.project?.name || "";
  const projectKey =
    projectName
      .trim()
      .split(/[^a-zA-Z0-9]+/)
      .filter(Boolean)
      .map((word) => word[0]?.toUpperCase() || "")
      .join("")
      .slice(0, 4) || "WORK";
  const suffix = String(issue?._id || "").slice(-5).toUpperCase();

  return suffix ? `${projectKey}-${suffix}` : `${projectKey}-NEW`;
};

const serializeIssueRef = (issue, extra = {}) => {
  const assignee =
    issue?.assignee && typeof issue.assignee === "object"
      ? {
          _id: issue.assignee._id,
          name: issue.assignee.name,
          email: issue.assignee.email,
          role: issue.assignee.role,
        }
      : null;
  const reporter =
    issue?.reporter && typeof issue.reporter === "object"
      ? {
          _id: issue.reporter._id,
          name: issue.reporter.name,
          email: issue.reporter.email,
          role: issue.reporter.role,
        }
      : null;
  const developerLead =
    issue?.bugDetails?.developerLead &&
    typeof issue.bugDetails.developerLead === "object"
      ? {
          _id: issue.bugDetails.developerLead._id,
          name: issue.bugDetails.developerLead.name,
          email: issue.bugDetails.developerLead.email,
          role: issue.bugDetails.developerLead.role,
        }
      : null;
  const testerOwner =
    issue?.bugDetails?.testerOwner && typeof issue.bugDetails.testerOwner === "object"
      ? {
          _id: issue.bugDetails.testerOwner._id,
          name: issue.bugDetails.testerOwner.name,
          email: issue.bugDetails.testerOwner.email,
          role: issue.bugDetails.testerOwner.role,
        }
      : null;

  return {
    _id: issue._id,
    issueId: getDisplayKey(issue),
    title: issue.title,
    description: issue.description || "",
    type: issue.type || ISSUE_TYPES.TASK,
    priority: issue.priority || "Medium",
    status: getCanonicalIssueStatus(issue.status, ISSUE_STATUS.TODO),
    project: issue.projectId
      ? {
          _id: resolveObjectId(issue.projectId),
          name: issue.projectId.name || "Unknown project",
        }
      : null,
    team: issue.teamId
      ? {
          _id: resolveObjectId(issue.teamId),
          name: issue.teamId.name || "Unassigned team",
        }
      : null,
    assignee,
    reporter,
    developerLead,
    testerOwner,
    epic: issue.epicId
      ? {
          _id: resolveObjectId(issue.epicId),
          name: issue.epicId.name || "Untitled epic",
        }
      : null,
    story: issue.parentStoryId
      ? {
          _id: resolveObjectId(issue.parentStoryId),
          title: issue.parentStoryId.title || "Untitled story",
          issueKey: issue.parentStoryId.issueKey || "",
          displayBugId: issue.parentStoryId.displayBugId || "",
          reporter:
            issue.parentStoryId.reporter &&
            typeof issue.parentStoryId.reporter === "object"
              ? {
                  _id: issue.parentStoryId.reporter._id,
                  name: issue.parentStoryId.reporter.name,
                  email: issue.parentStoryId.reporter.email,
                  role: issue.parentStoryId.reporter.role,
                }
              : null,
        }
      : null,
    sprint: issue.sprintId
      ? {
          _id: resolveObjectId(issue.sprintId),
          name: issue.sprintId.name || "Untitled sprint",
          state: issue.sprintId.state || "",
        }
      : null,
    createdAt: issue.createdAt,
    updatedAt: issue.updatedAt,
    dueAt: issue.dueAt || null,
    startedAt: issue.startedAt,
    storyPoints: Number(issue.storyPoints || 0),
    reopenedCount: Number(issue.reopenedCount || 0),
    severity: issue.bugDetails?.severity || null,
    targetRelease: issue.bugDetails?.targetRelease || "",
    tags: [
      issue.type || ISSUE_TYPES.TASK,
      issue.priority || "Medium",
      issue.bugDetails?.severity || null,
    ].filter(Boolean),
    ...extra,
  };
};

const loadScopedIssueIds = async (match) => Issue.find(match).distinct("_id");

const loadClosureMetrics = async (issues = []) => {
  const issueIds = issues.map((issue) => issue._id);

  if (!issueIds.length) {
    return {
      averageResolutionMs: null,
      closureByIssueId: new Map(),
    };
  }

  const closureEvents = await IssueHistory.aggregate([
    {
      $match: {
        issueId: {
          $in: issueIds,
        },
        field: "status",
        toValue: {
          $in: CLOSED_STATUSES,
        },
      },
    },
    {
      $sort: {
        createdAt: 1,
      },
    },
    {
      $group: {
        _id: "$issueId",
        closedAt: {
          $first: "$createdAt",
        },
      },
    },
  ]);
  const createdAtByIssueId = new Map(
    issues.map((issue) => [String(issue._id), issue.createdAt])
  );
  const closureByIssueId = new Map();
  const resolutionDurations = [];

  closureEvents.forEach((event) => {
    const issueId = String(event._id);
    const createdAt = createdAtByIssueId.get(issueId);
    const closedAt = event.closedAt;

    closureByIssueId.set(issueId, closedAt);

    if (createdAt && closedAt && closedAt >= createdAt) {
      resolutionDurations.push(closedAt.getTime() - createdAt.getTime());
    }
  });

  issues.forEach((issue) => {
    const issueId = String(issue._id);

    if (closureByIssueId.has(issueId) || !CLOSED_STATUSES.includes(issue.status)) {
      return;
    }

    const closedAt = issue.updatedAt || issue.createdAt;
    const createdAt = issue.createdAt;

    if (!closedAt) {
      return;
    }

    closureByIssueId.set(issueId, closedAt);

    if (createdAt && closedAt >= createdAt) {
      resolutionDurations.push(closedAt.getTime() - createdAt.getTime());
    }
  });

  return {
    averageResolutionMs: resolutionDurations.length
      ? Math.round(
          resolutionDurations.reduce((sum, value) => sum + value, 0) /
            resolutionDurations.length
        )
      : null,
    closureByIssueId,
  };
};

const buildWeekTrend = async (baseMatch) => {
  const today = endOfDay(new Date());
  const currentStart = startOfDay(today.getTime() - 6 * DAY_IN_MS);
  const previousStart = startOfDay(currentStart.getTime() - 7 * DAY_IN_MS);
  const previousEnd = new Date(currentStart.getTime() - 1);
  const buildRangeMatch = (start, end) => ({
    ...baseMatch,
    createdAt: {
      ...(baseMatch.createdAt || {}),
      $gte: start,
      $lte: end,
    },
  });
  const [currentSummary] = await Issue.aggregate([
    {
      $match: buildRangeMatch(currentStart, today),
    },
    {
      $group: {
        _id: null,
        totalIssues: {
          $sum: 1,
        },
        openIssues: {
          $sum: {
            $cond: [{ $in: ["$status", OPEN_DASHBOARD_STATUSES] }, 1, 0],
          },
        },
        closedIssues: {
          $sum: {
            $cond: [{ $in: ["$status", CLOSED_STATUSES] }, 1, 0],
          },
        },
        highPriorityIssues: {
          $sum: {
            $cond: [
              buildHighPriorityExpression(),
              1,
              0,
            ],
          },
        },
      },
    },
  ]);
  const [previousSummary] = await Issue.aggregate([
    {
      $match: buildRangeMatch(previousStart, previousEnd),
    },
    {
      $group: {
        _id: null,
        totalIssues: {
          $sum: 1,
        },
        openIssues: {
          $sum: {
            $cond: [{ $in: ["$status", OPEN_DASHBOARD_STATUSES] }, 1, 0],
          },
        },
        closedIssues: {
          $sum: {
            $cond: [{ $in: ["$status", CLOSED_STATUSES] }, 1, 0],
          },
        },
        highPriorityIssues: {
          $sum: {
            $cond: [
              buildHighPriorityExpression(),
              1,
              0,
            ],
          },
        },
      },
    },
  ]);

  return {
    current: currentSummary || {},
    previous: previousSummary || {},
  };
};

const buildTrendMeta = (current = 0, previous = 0) => {
  const difference = Number(current || 0) - Number(previous || 0);
  const percent = previous ? Math.round((difference / previous) * 100) : current ? 100 : 0;

  return {
    current: Number(current || 0),
    previous: Number(previous || 0),
    difference,
    percent,
    direction: difference > 0 ? "up" : difference < 0 ? "down" : "flat",
    label:
      difference === 0
        ? "0 vs last week"
        : `${difference > 0 ? "+" : ""}${difference} vs last week`,
  };
};

const getOverviewPayload = async (match, user) => {
  const [facetResult] = await Issue.aggregate([
    {
      $match: match,
    },
    {
      $facet: {
        summary: [
          {
            $group: {
              _id: null,
              totalIssues: {
                $sum: 1,
              },
              openIssues: {
                $sum: {
                  $cond: [{ $in: ["$status", OPEN_DASHBOARD_STATUSES] }, 1, 0],
                },
              },
              closedIssues: {
                $sum: {
                  $cond: [{ $in: ["$status", CLOSED_STATUSES] }, 1, 0],
                },
              },
              highPriorityIssues: {
                $sum: {
                  $cond: [
                    buildHighPriorityExpression(),
                    1,
                    0,
                  ],
                },
              },
              activeTeamIds: {
                $addToSet: "$teamId",
              },
            },
          },
          {
            $project: {
              _id: 0,
              totalIssues: 1,
              openIssues: 1,
              closedIssues: 1,
              highPriorityIssues: 1,
              activeTeams: {
                $size: {
                  $filter: {
                    input: "$activeTeamIds",
                    as: "teamId",
                    cond: {
                      $ne: ["$$teamId", null],
                    },
                  },
                },
              },
            },
          },
        ],
        statusDistribution: [
          {
            $group: {
              _id: "$status",
              count: {
                $sum: 1,
              },
            },
          },
        ],
        priorityDistribution: [
          {
            $group: {
              _id: "$priority",
              count: {
                $sum: 1,
              },
            },
          },
        ],
      },
    },
  ]);

  console.log("Analytics Overview Aggregation Result:", JSON.stringify(facetResult, null, 2));

  const issues = await Issue.find(match)
    .select("_id createdAt updatedAt status")
    .lean();
  const closureMetrics = await loadClosureMetrics(issues);
  const summary = facetResult?.summary?.[0] || {
    totalIssues: 0,
    openIssues: 0,
    closedIssues: 0,
    highPriorityIssues: 0,
    activeTeams: 0,
  };
  const resolutionRate = summary.totalIssues
    ? Math.round((summary.closedIssues / summary.totalIssues) * 100)
    : 0;
  const week = await buildWeekTrend(match);
  const statusCounts = new Map(
    (facetResult?.statusDistribution || []).map((row) => [
      getCanonicalIssueStatus(row._id, ISSUE_STATUS.TODO),
      row.count,
    ])
  );
  const priorityCounts = new Map(
    (facetResult?.priorityDistribution || []).map((row) => [row._id, row.count])
  );
  const statusDistribution = STATUS_ORDER.map((status) => ({
    key: status,
    label: STATUS_LABELS[status] || status,
    count: statusCounts.get(status) || 0,
    percentage: summary.totalIssues
      ? Math.round(((statusCounts.get(status) || 0) / summary.totalIssues) * 100)
      : 0,
  }));
  const priorityDistribution = PRIORITY_ORDER.map((priority) => ({
    key: priority,
    label: priority,
    count: priorityCounts.get(priority) || 0,
    percentage: summary.totalIssues
      ? Math.round(((priorityCounts.get(priority) || 0) / summary.totalIssues) * 100)
      : 0,
  }));
  const [mostActiveProject] = await buildProjectAnalytics(match, user, {
    limit: 1,
  });

  return {
    summary: {
      ...summary,
      avgResolutionTimeMs: closureMetrics.averageResolutionMs,
      resolutionRate,
      teamProductivity: resolutionRate,
    },
    trends: {
      totalIssues: buildTrendMeta(week.current.totalIssues, week.previous.totalIssues),
      openIssues: buildTrendMeta(week.current.openIssues, week.previous.openIssues),
      closedIssues: buildTrendMeta(week.current.closedIssues, week.previous.closedIssues),
      highPriorityIssues: buildTrendMeta(
        week.current.highPriorityIssues,
        week.previous.highPriorityIssues
      ),
    },
    statusDistribution,
    priorityDistribution,
    mostActiveProject: mostActiveProject || null,
  };
};

const buildProjectAnalytics = async (match, user, { limit = 0 } = {}) => {
  const rows = await Issue.aggregate([
    {
      $match: match,
    },
    {
      $group: {
        _id: "$projectId",
        totalIssues: {
          $sum: 1,
        },
        openIssues: {
          $sum: {
            $cond: [{ $in: ["$status", OPEN_DASHBOARD_STATUSES] }, 1, 0],
          },
        },
        closedIssues: {
          $sum: {
            $cond: [{ $in: ["$status", CLOSED_STATUSES] }, 1, 0],
          },
        },
        highPriorityIssues: {
          $sum: {
            $cond: [buildHighPriorityExpression(), 1, 0],
          },
        },
        teamIds: {
          $addToSet: "$teamId",
        },
      },
    },
    {
      $sort: {
        totalIssues: -1,
        openIssues: -1,
      },
    },
    ...(limit
      ? [
          {
            $limit: limit,
          },
        ]
      : []),
  ]);
  const projectIds = rows.map((row) => row._id).filter(Boolean);
  const projects = projectIds.length
    ? await Project.find(withTenantFilter({
        _id: {
          $in: projectIds,
        },
        workspaceId: normalizeWorkspaceId(user.workspaceId),
      }, user))
        .select("name isCompleted")
        .lean()
    : [];
  const projectTeams = projectIds.length
    ? await ProjectTeam.find({
        projectId: {
          $in: projectIds,
        },
      })
        .populate("teamId", "name")
        .lean()
    : [];
  const projectsById = new Map(projects.map((project) => [String(project._id), project]));
  const teamNamesByProjectId = new Map();

  projectTeams.forEach((projectTeam) => {
    const projectId = String(projectTeam.projectId);
    const teamName = projectTeam.teamId?.name;

    if (!teamName) {
      return;
    }

    teamNamesByProjectId.set(projectId, [
      ...(teamNamesByProjectId.get(projectId) || []),
      teamName,
    ]);
  });

  return rows.map((row) => {
    const project = projectsById.get(String(row._id));
    const completionRate = row.totalIssues
      ? Math.round((row.closedIssues / row.totalIssues) * 100)
      : 0;

    return {
      projectId: row._id,
      name: project?.name || "Unknown project",
      totalIssues: row.totalIssues,
      openIssues: row.openIssues,
      closedIssues: row.closedIssues,
      highPriorityIssues: row.highPriorityIssues,
      completionRate,
      isCompleted: Boolean(project?.isCompleted),
      teamCount: (teamNamesByProjectId.get(String(row._id)) || []).length,
      teams: teamNamesByProjectId.get(String(row._id)) || [],
    };
  });
};

const buildTeamAnalytics = async (match, user, { limit = 0 } = {}) => {
  const issues = await Issue.find(match)
    .select("_id status priority bugDetails.severity teamId assignee projectId")
    .lean();
  const directTeamIds = issues.map((issue) => issue.teamId).filter(Boolean);
  const projectIds = uniqueObjectIds(issues.map((issue) => issue.projectId));
  const assigneeIds = uniqueObjectIds(issues.map((issue) => issue.assignee));
  const workspaceId = normalizeWorkspaceId(user.workspaceId);
  const [projects, projectTeams, assigneeTeamMemberships] = await Promise.all([
    projectIds.length
      ? Project.find(withTenantFilter({
          _id: {
            $in: projectIds,
          },
          workspaceId,
        }, user))
          .select("_id attachedTeams teamIds")
          .lean()
      : [],
    projectIds.length
      ? ProjectTeam.find({
          projectId: {
            $in: projectIds,
          },
        })
          .select("projectId teamId")
          .lean()
      : [],
    assigneeIds.length
      ? TeamMember.find({
          userId: {
            $in: assigneeIds,
          },
        })
          .select("teamId userId")
          .lean()
      : [],
  ]);
  const projectTeamLinksByProjectId = new Map();

  projectTeams.forEach((projectTeam) => {
    const projectId = String(projectTeam.projectId || "");

    projectTeamLinksByProjectId.set(projectId, [
      ...(projectTeamLinksByProjectId.get(projectId) || []),
      projectTeam,
    ]);
  });

  const teamIdsByProjectId = new Map(
    projects.map((project) => [
      String(project._id),
      mergeProjectTeamIds(
        project,
        projectTeamLinksByProjectId.get(String(project._id)) || []
      ).map(String),
    ])
  );
  const teamIdsByUserId = new Map();

  assigneeTeamMemberships.forEach((membership) => {
    const userId = String(membership.userId || "");
    const teamId = String(membership.teamId || "");

    if (!userId || !teamId) {
      return;
    }

    teamIdsByUserId.set(userId, [...(teamIdsByUserId.get(userId) || []), teamId]);
  });

  const resolveIssueTeamId = (issue) => {
    if (issue.teamId) {
      return String(issue.teamId);
    }

    const projectTeamIds = teamIdsByProjectId.get(String(issue.projectId || "")) || [];

    if (!projectTeamIds.length) {
      return "";
    }

    const assigneeTeamIds = teamIdsByUserId.get(String(issue.assignee || "")) || [];
    const matchingAssigneeTeamId = assigneeTeamIds.find((teamId) =>
      projectTeamIds.includes(teamId)
    );

    if (matchingAssigneeTeamId) {
      return matchingAssigneeTeamId;
    }

    return projectTeamIds.length === 1 ? projectTeamIds[0] : "";
  };
  const bucketsByTeamId = new Map();

  issues.forEach((issue) => {
    const teamId = resolveIssueTeamId(issue);

    if (!teamId) {
      return;
    }

    const status = getCanonicalIssueStatus(issue.status, ISSUE_STATUS.TODO);
    const isClosed = CLOSED_STATUSES.includes(status) || isClosedIssueStatus(status);
    const bucket =
      bucketsByTeamId.get(teamId) ||
      {
        _id: teamId,
        totalIssues: 0,
        openIssues: 0,
        closedIssues: 0,
        highPriorityIssues: 0,
        assignedIssues: 0,
      };

    bucket.totalIssues += 1;
    bucket.openIssues += isClosed ? 0 : 1;
    bucket.closedIssues += isClosed ? 1 : 0;
    bucket.highPriorityIssues += isHighPriorityIssue(issue) ? 1 : 0;
    bucket.assignedIssues += issue.assignee ? 1 : 0;
    bucketsByTeamId.set(teamId, bucket);
  });

  const rows = Array.from(bucketsByTeamId.values()).sort(
    (left, right) =>
      right.totalIssues - left.totalIssues ||
      right.closedIssues - left.closedIssues
  );
  const limitedRows = limit ? rows.slice(0, limit) : rows;
  const teamIds = uniqueObjectIds([
    ...limitedRows.map((row) => row._id).filter(Boolean),
    ...directTeamIds,
  ]);
  const teamObjectIds = teamIds
    .filter((teamId) => mongoose.isValidObjectId(teamId))
    .map((teamId) => new mongoose.Types.ObjectId(teamId));
  const [teams, memberCounts] = await Promise.all([
    teamObjectIds.length
      ? Team.find({
          _id: {
            $in: teamObjectIds,
          },
          workspaceId,
        })
          .select("name")
          .lean()
      : [],
    teamObjectIds.length
      ? TeamMember.aggregate([
          {
            $match: {
              teamId: {
                $in: teamObjectIds,
              },
            },
          },
          {
            $group: {
              _id: "$teamId",
              count: {
                $sum: 1,
              },
            },
          },
        ])
      : [],
  ]);
  const teamsById = new Map(teams.map((team) => [String(team._id), team]));
  const memberCountByTeamId = new Map(
    memberCounts.map((row) => [String(row._id), row.count])
  );

  return limitedRows
    .filter((row) => row._id)
    .map((row) => {
      const team = teamsById.get(String(row._id));
      const completionRate = row.totalIssues
        ? Math.round((row.closedIssues / row.totalIssues) * 100)
        : 0;

      return {
        teamId: row._id,
        name: team?.name || "Unassigned team",
        totalIssues: row.totalIssues,
        assignedIssues: row.assignedIssues,
        openIssues: row.openIssues,
        closedIssues: row.closedIssues,
        resolvedIssues: row.closedIssues,
        highPriorityIssues: row.highPriorityIssues,
        completedIssues: row.closedIssues,
        pendingWorkload: Math.max(row.totalIssues - row.closedIssues, 0),
        pendingIssues: Math.max(row.totalIssues - row.closedIssues, 0),
        completionRate,
        efficiency: row.assignedIssues
          ? Math.round((row.closedIssues / row.assignedIssues) * 100)
          : completionRate,
        productivity: completionRate,
        memberCount: memberCountByTeamId.get(String(row._id)) || 0,
      };
    });
};

const getTrendRange = async (query, match) => {
  let defaultEnd = endOfDay(new Date());

  if (!query.dateFrom && !query.dateTo) {
    const issueIds = await loadScopedIssueIds(match);
    const [[issueBounds], [historyBounds]] = await Promise.all([
      Issue.aggregate([
        {
          $match: match,
        },
        {
          $group: {
            _id: null,
            latestCreatedAt: {
              $max: "$createdAt",
            },
            latestUpdatedAt: {
              $max: "$updatedAt",
            },
          },
        },
      ]),
      issueIds.length
        ? IssueHistory.aggregate([
            {
              $match: {
                issueId: {
                  $in: issueIds,
                },
                field: "status",
              },
            },
            {
              $group: {
                _id: null,
                latestStatusChangedAt: {
                  $max: "$createdAt",
                },
              },
            },
          ])
        : Promise.resolve([]),
    ]);
    const latestActivityAt = [
      issueBounds?.latestCreatedAt,
      issueBounds?.latestUpdatedAt,
      historyBounds?.latestStatusChangedAt,
    ]
      .filter(Boolean)
      .sort((left, right) => new Date(right) - new Date(left))[0];

    if (latestActivityAt) {
      defaultEnd = endOfDay(latestActivityAt);
    }
  }

  const end = query.dateTo
    ? String(query.dateTo).includes("T")
      ? new Date(query.dateTo)
      : endOfDay(query.dateTo)
    : defaultEnd;
  const start = query.dateFrom
    ? String(query.dateFrom).includes("T")
      ? new Date(query.dateFrom)
      : startOfDay(query.dateFrom)
    : startOfDay(end.getTime() - 29 * DAY_IN_MS);

  return {
    start,
    end,
  };
};

const getDateKey = (value) => getIndianDateKey(value);

const getMonthKey = (value) =>
  formatMonthYear(value, { month: "2-digit" }).replace(" ", "-");

const formatShortDateLabel = (value) => formatDate(value);

const formatShortMonthLabel = (value) => formatMonthYear(value);

const buildTrendRows = async (match, req) => {
  const eventScopeMatch = cloneWithoutCreatedAt(match);
  const { start, end } = await getTrendRange(req.query, eventScopeMatch);
  const requestedDayCount = Math.max(
    Math.round((end.getTime() - start.getTime()) / DAY_IN_MS) + 1,
    1
  );
  const dayCount = Math.min(requestedDayCount, 90);
  const dailyStart =
    requestedDayCount > dayCount
      ? startOfDay(end.getTime() - (dayCount - 1) * DAY_IN_MS)
      : start;
  const rangeMatch = {
    ...match,
    createdAt: {
      ...(match.createdAt || {}),
      $gte: dailyStart,
      $lte: end,
    },
  };
  const issueIds = await loadScopedIssueIds(eventScopeMatch);
  const [createdRows, closureHistoryIssueIds, resolvedRows, reopenedRows] =
    await Promise.all([
      Issue.aggregate([
        {
          $match: rangeMatch,
        },
        {
          $group: {
            _id: {
              $dateToString: {
                date: "$createdAt",
                format: "%Y-%m-%d",
              },
            },
            created: {
              $sum: 1,
            },
          },
        },
      ]),
      issueIds.length
        ? IssueHistory.distinct("issueId", {
            issueId: {
              $in: issueIds,
            },
            field: "status",
            toValue: {
              $in: CLOSED_STATUSES,
            },
          })
        : Promise.resolve([]),
      issueIds.length
        ? IssueHistory.aggregate([
            {
              $match: {
                issueId: {
                  $in: issueIds,
                },
                field: "status",
                toValue: {
                  $in: CLOSED_STATUSES,
                },
                createdAt: {
                  $gte: dailyStart,
                  $lte: end,
                },
              },
            },
            {
              $group: {
                _id: {
                  date: {
                    $dateToString: {
                      date: "$createdAt",
                      format: "%Y-%m-%d",
                    },
                  },
                  issueId: "$issueId",
                },
              },
            },
            {
              $group: {
                _id: "$_id.date",
                resolved: {
                  $sum: 1,
                },
              },
            },
          ])
        : Promise.resolve([]),
      issueIds.length
        ? IssueHistory.aggregate([
            {
              $match: {
                issueId: {
                  $in: issueIds,
                },
                field: "status",
                toValue: ISSUE_STATUS.REOPEN,
                createdAt: {
                  $gte: dailyStart,
                  $lte: end,
                },
              },
            },
            {
              $group: {
                _id: {
                  date: {
                    $dateToString: {
                      date: "$createdAt",
                      format: "%Y-%m-%d",
                    },
                  },
                  issueId: "$issueId",
                },
              },
            },
            {
              $group: {
                _id: "$_id.date",
                reopened: {
                  $sum: 1,
                },
              },
            },
          ])
        : Promise.resolve([]),
    ]);
  const fallbackClosedRows = await Issue.aggregate([
    {
      $match: {
        ...eventScopeMatch,
        _id: {
          $in: issueIds,
          $nin: closureHistoryIssueIds,
        },
        status: {
          $in: CLOSED_STATUSES,
        },
        updatedAt: {
          $gte: dailyStart,
          $lte: end,
        },
      },
    },
    {
      $group: {
        _id: {
          $dateToString: {
            date: "$updatedAt",
            format: "%Y-%m-%d",
          },
        },
        resolved: {
          $sum: 1,
        },
      },
    },
  ]);
  const createdByDate = new Map(createdRows.map((row) => [row._id, row.created]));
  const resolvedByDate = new Map(
    resolvedRows.map((row) => [row._id, row.resolved])
  );
  const reopenedByDate = new Map(
    reopenedRows.map((row) => [row._id, row.reopened])
  );

  fallbackClosedRows.forEach((row) => {
    resolvedByDate.set(row._id, (resolvedByDate.get(row._id) || 0) + row.resolved);
  });
  let runningPending = 0;
  const issueTrend = Array.from({ length: dayCount }, (_, index) => {
    const date = startOfDay(dailyStart.getTime() + index * DAY_IN_MS);
    const key = getDateKey(date);
    const created = createdByDate.get(key) || 0;
    const resolved = resolvedByDate.get(key) || 0;
    const reopened = reopenedByDate.get(key) || 0;

    runningPending = Math.max(runningPending + created + reopened - resolved, 0);

    return {
      key,
      label: formatShortDateLabel(date),
      created,
      resolved,
      closed: resolved,
      reopened,
      pending: runningPending,
    };
  });
  const weekEnd = endOfDay(end);
  const weeklyResolution = Array.from({ length: 7 }, (_, index) => {
    const weekStart = startOfDay(weekEnd.getTime() - (6 - index) * 7 * DAY_IN_MS);
    const weekFinish = endOfDay(weekStart.getTime() + 6 * DAY_IN_MS);
    const row = {
      key: getDateKey(weekStart),
      label: formatShortDateLabel(weekStart),
      opened: 0,
      resolved: 0,
      resolutionRate: 0,
    };

    issueTrend.forEach((trendRow) => {
      const trendDate = new Date(trendRow.key);

      if (trendDate >= weekStart && trendDate <= weekFinish) {
        row.opened += trendRow.created;
        row.resolved += trendRow.resolved || trendRow.closed || 0;
      }
    });

    row.resolutionRate = row.opened ? Math.round((row.resolved / row.opened) * 100) : 0;
    return row;
  });
  const monthEnd = end;
  const monthStart = startOfDay(new Date(monthEnd.getFullYear(), monthEnd.getMonth() - 5, 1));
  const monthlyCreatedAt = {
    ...(match.createdAt || {}),
  };
  const monthEndDate = endOfDay(monthEnd);

  monthlyCreatedAt.$gte =
    monthlyCreatedAt.$gte && monthlyCreatedAt.$gte > monthStart
      ? monthlyCreatedAt.$gte
      : monthStart;
  monthlyCreatedAt.$lte =
    monthlyCreatedAt.$lte && monthlyCreatedAt.$lte < monthEndDate
      ? monthlyCreatedAt.$lte
      : monthEndDate;
  const monthlyRows = await Issue.aggregate([
    {
      $match: {
        ...match,
        createdAt: monthlyCreatedAt,
      },
    },
    {
      $group: {
        _id: {
          $dateToString: {
            date: "$createdAt",
            format: "%Y-%m",
          },
        },
        issues: {
          $sum: 1,
        },
      },
    },
  ]);
  const issuesByMonth = new Map(monthlyRows.map((row) => [row._id, row.issues]));
  const monthlyGrowth = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(monthEnd.getFullYear(), monthEnd.getMonth() - (5 - index), 1);
    const key = getMonthKey(date);
    const issues = issuesByMonth.get(key) || 0;
    const previousDate = new Date(date.getFullYear(), date.getMonth() - 1, 1);
    const previousIssues = issuesByMonth.get(getMonthKey(previousDate)) || 0;
    const difference = issues - previousIssues;

    return {
      key,
      label: formatShortMonthLabel(date),
      issues,
      previousIssues,
      difference,
      percentChange: previousIssues
        ? Math.round((difference / previousIssues) * 100)
        : issues
          ? 100
          : 0,
    };
  });
  const latestMonth = monthlyGrowth[monthlyGrowth.length - 1] || {
    issues: 0,
    previousIssues: 0,
    difference: 0,
    percentChange: 0,
  };
  const pendingMatch = {
    ...match,
  };

  addAndCondition(pendingMatch, {
    status: {
      $nin: CLOSED_STATUSES,
    },
  });
  const pending = await Issue.countDocuments(pendingMatch);
  const trendTotals = issueTrend.reduce(
    (totals, row) => ({
      created: totals.created + row.created,
      resolved: totals.resolved + row.resolved,
      closed: totals.closed + row.resolved,
      reopened: totals.reopened + row.reopened,
      pending,
    }),
    {
      created: 0,
      resolved: 0,
      closed: 0,
      reopened: 0,
      pending,
    }
  );

  return {
    issueTrend,
    weeklyResolution,
    monthlyGrowth,
    monthlyGrowthSummary: {
      currentMonth: latestMonth.issues,
      previousMonth: latestMonth.previousIssues,
      difference: latestMonth.difference,
      percentChange: latestMonth.percentChange,
      direction:
        latestMonth.difference > 0
          ? "up"
          : latestMonth.difference < 0
            ? "down"
            : "flat",
    },
    trendTotals,
  };
};

const buildRecentActivity = async (match) => {
  const issueIds = await loadScopedIssueIds(match);
  const [createdIssues, assignedIssues, criticalIssues, closureEvents] = await Promise.all([
    Issue.find(match)
      .sort({ createdAt: -1 })
      .limit(8)
      .populate("projectId", "name")
      .populate("teamId", "name")
      .populate("assignee", "name email role")
      .lean(),
    Issue.find({
      ...match,
      assignee: {
        $ne: null,
      },
    })
      .sort({ startedAt: -1, createdAt: -1 })
      .limit(8)
      .populate("projectId", "name")
      .populate("teamId", "name")
      .populate("assignee", "name email role")
      .lean(),
    Issue.find({
      $and: [
        match,
        {
          status: {
            $nin: CLOSED_STATUSES,
          },
        },
        {
          $or: [
            {
              priority: {
                $in: HIGH_PRIORITY_VALUES,
              },
            },
            {
              "bugDetails.severity": {
                $in: CRITICAL_SEVERITIES,
              },
            },
          ],
        },
      ],
    })
      .sort({ createdAt: -1 })
      .limit(8)
      .populate("projectId", "name")
      .populate("teamId", "name")
      .populate("assignee", "name email role")
      .lean(),
    issueIds.length
      ? IssueHistory.find({
          issueId: {
            $in: issueIds,
          },
          field: "status",
          toValue: {
            $in: CLOSED_STATUSES,
          },
        })
          .sort({ createdAt: -1 })
          .limit(8)
          .lean()
      : Promise.resolve([]),
  ]);
  const closedIssueIds = uniqueObjectIds(closureEvents.map((event) => event.issueId));
  const closedIssues = closedIssueIds.length
    ? await Issue.find({
        _id: {
          $in: closedIssueIds,
        },
      })
        .populate("projectId", "name")
        .populate("teamId", "name")
        .populate("assignee", "name email role")
        .lean()
    : [];
  const closedIssueById = new Map(
    closedIssues.map((issue) => [String(issue._id), issue])
  );
  const closedActivities = closureEvents
    .map((event) => {
      const issue = closedIssueById.get(String(event.issueId));

      if (!issue) {
        return null;
      }

      return serializeIssueRef(issue, {
        activityType: "closed",
        activityLabel: "Recently resolved",
        activityAt: event.createdAt,
      });
    })
    .filter(Boolean);
  const activities = [
    ...createdIssues.map((issue) =>
      serializeIssueRef(issue, {
        activityType: "created",
        activityLabel: "Recently created",
        activityAt: issue.createdAt,
      })
    ),
    ...assignedIssues.map((issue) =>
      serializeIssueRef(issue, {
        activityType: "assigned",
        activityLabel: "Assigned ticket",
        activityAt: issue.startedAt || issue.createdAt,
      })
    ),
    ...criticalIssues.map((issue) =>
      serializeIssueRef(issue, {
        activityType: "critical",
        activityLabel: "Critical issue alert",
        activityAt: issue.createdAt,
      })
    ),
    ...closedActivities,
  ];
  const uniqueActivities = new Map();

  activities.forEach((activity) => {
    uniqueActivities.set(`${activity.activityType}-${activity._id}`, activity);
  });

  return Array.from(uniqueActivities.values())
    .sort((left, right) => new Date(right.activityAt) - new Date(left.activityAt))
    .slice(0, 12);
};

const getOverview = asyncHandler(async (req, res) => {
  const match = await buildAnalyticsMatch(req, res);
  const payload = await getOverviewPayload(match, req.user);
  console.log("Analytics Overview Response:", JSON.stringify(payload, null, 2));
  res.status(200).json(payload);
});

const getTrends = asyncHandler(async (req, res) => {
  const match = await buildAnalyticsMatch(req, res);
  const payload = await buildTrendRows(match, req);
  console.log("Analytics Trends Response:", JSON.stringify(payload, null, 2));
  res.status(200).json(payload);
});

const getPriorities = asyncHandler(async (req, res) => {
  const match = await buildAnalyticsMatch(req, res);
  const rows = await Issue.aggregate([
    {
      $match: match,
    },
    {
      $group: {
        _id: "$priority",
        count: {
          $sum: 1,
        },
      },
    },
  ]);
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  const counts = new Map(rows.map((row) => [row._id, row.count]));

  res.status(200).json({
    priorities: PRIORITY_ORDER.map((priority) => ({
      key: priority,
      label: priority,
      count: counts.get(priority) || 0,
      percentage: total ? Math.round(((counts.get(priority) || 0) / total) * 100) : 0,
    })),
  });
});

const getProjects = asyncHandler(async (req, res) => {
  const match = await buildAnalyticsMatch(req, res);

  res.status(200).json({
    projects: await buildProjectAnalytics(match, req.user),
  });
});

const getTeams = asyncHandler(async (req, res) => {
  const match = await buildAnalyticsMatch(req, res);

  res.status(200).json({
    teams: await buildTeamAnalytics(match, req.user),
  });
});

const getRecentActivity = asyncHandler(async (req, res) => {
  const match = await buildAnalyticsMatch(req, res);

  res.status(200).json({
    activity: await buildRecentActivity(match),
  });
});

const getIssueAnalyticsRows = asyncHandler(async (req, res) => {
  const match = await buildAnalyticsMatch(req, res);
  const issues = await Issue.find(match)
    .sort({
      createdAt: -1,
    })
    .populate("projectId", "name")
    .populate("teamId", "name")
    .populate("assignee", "name email role")
    .populate("reporter", "name email role")
    .populate("bugDetails.developerLead", "name email role")
    .populate("bugDetails.testerOwner", "name email role")
    .populate({
      path: "parentStoryId",
      select: "title reporter issueKey displayBugId",
      populate: { path: "reporter", select: "name email role" },
    })
    .populate("epicId", "name")
    .populate("sprintId", "name state")
    .lean();
  const { closureByIssueId } = await loadClosureMetrics(issues);

  res.status(200).json({
    issues: issues.map((issue) => {
      const closedAt = closureByIssueId.get(String(issue._id)) || null;
      const resolutionTimeMs =
        closedAt && issue.createdAt && closedAt >= issue.createdAt
          ? closedAt.getTime() - issue.createdAt.getTime()
          : null;

      return serializeIssueRef(issue, {
        closedAt,
        resolutionTimeMs,
      });
    }),
  });
});

module.exports = {
  getIssueAnalyticsRows,
  getOverview,
  getTrends,
  getPriorities,
  getProjects,
  getTeams,
  getRecentActivity,
};
