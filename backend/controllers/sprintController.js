const mongoose = require("mongoose");
const Epic = require("../models/Epic");
const Issue = require("../models/Issue");
const ProjectTeam = require("../models/ProjectTeam");
const Sprint = require("../models/Sprint");
const Team = require("../models/Team");
const { handleSprintStarted } = require("../services/sprintNotificationService");
const { notifySprintEvent } = require("../services/notificationService");
const asyncHandler = require("../utils/asyncHandler");
const {
  canManageProjectPlanning,
  loadReadableProject,
} = require("../utils/backlogAccess");
const { recordIssueHistory } = require("../utils/issueHistory");
const {
  PLANNING_ORDER_INCREMENT,
  getNextPlanningOrder,
} = require("../utils/planningOrder");
const { populateIssueQuery, serializeIssues } = require("../utils/issuePresentation");
const { ISSUE_STATUS } = require("../utils/issueStatus");
const { normalizeWorkspaceId } = require("../utils/workspace");
const {
  ACTIVE_SPRINT_STATE,
  buildSprintLifecycleMeta,
  getSprintLifecycleState,
  hasSprintPastEndDate,
  isSprintExpired,
  isSprintLocked,
} = require("../utils/sprintLifecycle");
const { ROLE_ADMIN } = require("../utils/roles");

const parseOptionalDate = (value, label) => {
  if (!value) {
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

  return {
    value: parsedValue,
  };
};

const ensureSprintTeamForProject = async ({ projectId, teamId, workspaceId }) => {
  if (!teamId) {
    return {
      team: null,
    };
  }

  if (!mongoose.isValidObjectId(teamId)) {
    return {
      error: {
        status: 400,
        message: "Invalid team id",
      },
    };
  }

  const [team, projectTeamLink] = await Promise.all([
    Team.findOne({
      _id: teamId,
      workspaceId: normalizeWorkspaceId(workspaceId),
    })
      .select("_id name workspaceId")
      .lean(),
    ProjectTeam.findOne({
      projectId,
      teamId,
    })
      .select("_id")
      .lean(),
  ]);

  if (!team) {
    return {
      error: {
        status: 404,
        message: "Selected team could not be found in this workspace",
      },
    };
  }

  if (!projectTeamLink) {
    return {
      error: {
        status: 400,
        message: "Selected team is not attached to this project",
      },
    };
  }

  return {
    team,
  };
};

const serializeSprint = (sprint, issues = []) => ({
  _id: sprint._id,
  projectId: sprint.projectId,
  teamId: sprint.teamId,
  workspaceId: sprint.workspaceId,
  name: sprint.name,
  goal: sprint.goal || "",
  state: sprint.state,
  status: sprint.state,
  startDate: sprint.startDate,
  endDate: sprint.endDate,
  startedAt: sprint.startedAt,
  completedAt: sprint.completedAt,
  expiredAt: sprint.expiredAt || null,
  lockOverride: sprint.lockOverride || {
    enabled: false,
    reopenedAt: null,
    reopenedBy: null,
  },
  snapshot: sprint.snapshot || null,
  createdBy: sprint.createdBy,
  completedBy: sprint.completedBy,
  createdAt: sprint.createdAt,
  updatedAt: sprint.updatedAt,
  issueCount: issues.length,
  completedCount: issues.filter((issue) => issue.status === "DONE").length,
  ...buildSprintLifecycleMeta(sprint),
});

const expireSprintIfNeeded = async (sprint) => {
  if (!sprint || typeof sprint.save !== "function" || !isSprintExpired(sprint)) {
    return sprint;
  }

  if (!sprint.expiredAt) {
    sprint.expiredAt = new Date();
    await sprint.save();
  }

  return sprint;
};

const createHttpError = (status, message, code = "", details = null) => {
  const error = new Error(message);
  error.statusCode = status;

  if (code) {
    error.code = code;
  }

  if (details) {
    error.details = details;
  }

  return error;
};

const throwHttpError = (res, status, message, code = "", details = null) => {
  res.status(status);
  throw createHttpError(status, message, code, details);
};

const isTransactionUnsupportedError = (error) => {
  const message = String(error?.message || "");

  return (
    message.includes("Transaction numbers are only allowed on a replica set member or mongos") ||
    message.includes("This MongoDB deployment does not support retryable writes")
  );
};

const withOptionalSession = (query, session) => (session ? query.session(session) : query);

const saveWithOptionalSession = (document, session) =>
  document.save(session ? { session } : undefined);

const getSprintScopeLabel = (sprint) => {
  const teamName = sprint?.teamId?.name || sprint?.teamName || "";
  return teamName ? `team ${teamName}` : "project-wide scope";
};

const buildSprintConflictDetails = (sprint, conflictingSprint = null) => ({
  sprintId: String(sprint?._id || ""),
  sprintName: sprint?.name || "",
  sprintState: sprint?.state || "",
  sprintScope: getSprintScopeLabel(sprint),
  conflictingSprintId: String(conflictingSprint?._id || ""),
  conflictingSprintName: conflictingSprint?.name || "",
  conflictingSprintState: conflictingSprint?.state || "",
  conflictingSprintScope: conflictingSprint ? getSprintScopeLabel(conflictingSprint) : "",
});

const logSprintStartAttempt = (req, sprint) => {
  console.info("[sprints] start attempt", {
    sprintId: String(sprint?._id || req.params?.id || ""),
    sprintName: sprint?.name || "",
    sprintState: sprint?.state || "",
    projectId: String(sprint?.projectId || ""),
    teamId: String(sprint?.teamId || ""),
    actorUserId: String(req.user?._id || req.user?.id || ""),
  });
};

const logSprintStartConflict = ({ sprint, reason, conflictingSprint = null }) => {
  console.warn("[sprints] start conflict", {
    reason,
    ...buildSprintConflictDetails(sprint, conflictingSprint),
  });
};

const ensureSprintManagementAccess = async (user, sprint) => {
  const project = await loadReadableProject(user, sprint.projectId);

  if (!project) {
    return {
      error: {
        status: 404,
        message: "Project not found or inaccessible",
      },
    };
  }

  if (!canManageProjectPlanning(user, project)) {
    return {
      error: {
        status: 403,
        message: "You do not have permission to manage sprints for this project",
      },
    };
  }

  return {
    project,
  };
};

const isCompletedSprintIssue = (issue) =>
  [ISSUE_STATUS.DONE, ISSUE_STATUS.CLOSED].includes(issue?.status);

const isAutoClosableSprintIssue = (issue) => issue?.status === ISSUE_STATUS.DONE;

const isIncompleteSprintIssue = (issue) => !isCompletedSprintIssue(issue);

const syncEpicCompletionStatuses = async ({ projectId, epicIds = [], session }) => {
  const uniqueEpicIds = [...new Set(epicIds.filter(Boolean).map(String))];

  if (!projectId || !uniqueEpicIds.length) {
    return;
  }

  const epics = await Epic.find({
    _id: { $in: uniqueEpicIds },
    projectId,
  }).session(session);

  if (!epics.length) {
    return;
  }

  const stories = await Issue.find({
    projectId,
    epicId: { $in: epics.map((epic) => epic._id) },
    type: "Story",
  })
    .select("_id epicId status")
    .session(session)
    .lean();

  const storiesByEpic = new Map();

  stories.forEach((story) => {
    const key = String(story.epicId || "");
    storiesByEpic.set(key, [...(storiesByEpic.get(key) || []), story]);
  });

  for (const epic of epics) {
    const epicStories = storiesByEpic.get(String(epic._id)) || [];

    if (!epicStories.length) {
      continue;
    }

    const nextStatus = epicStories.every((story) => story.status === ISSUE_STATUS.CLOSED)
      ? "DONE"
      : "ACTIVE";

    if (epic.status !== nextStatus) {
      epic.status = nextStatus;
      await epic.save({ session });
    }
  }
};

const validateActiveSprintOverlap = async (sprint) => {
  const baseQuery = {
    _id: {
      $ne: sprint._id,
    },
    projectId: sprint.projectId,
    state: "ACTIVE",
  };

  if (sprint.teamId) {
    const conflictingSprint = await Sprint.findOne({
      ...baseQuery,
      $or: [{ teamId: null }, { teamId: sprint.teamId }],
    })
      .select("_id name state teamId startDate endDate")
      .populate("teamId", "name")
      .lean();

    if (conflictingSprint) {
      const isProjectWideConflict = !conflictingSprint.teamId;
      const conflictMessage = isProjectWideConflict
        ? `Cannot start "${sprint.name}" because "${conflictingSprint.name}" is already active for the project-wide scope.`
        : `Cannot start "${sprint.name}" because "${conflictingSprint.name}" is already active for ${getSprintScopeLabel(
            conflictingSprint
          )}.`;

      return {
        conflictingSprint,
        error: {
          status: 409,
          code: "ACTIVE_SPRINT_SCOPE_CONFLICT",
          message: conflictMessage,
          details: buildSprintConflictDetails(sprint, conflictingSprint),
        },
      };
    }
  } else {
    const conflictingSprint = await Sprint.findOne(baseQuery)
      .select("_id name state teamId startDate endDate")
      .populate("teamId", "name")
      .lean();

    if (conflictingSprint) {
      return {
        conflictingSprint,
        error: {
          status: 409,
          code: "ACTIVE_SPRINT_EXISTS",
          message: `Cannot start "${sprint.name}" because "${conflictingSprint.name}" is already active in this project.`,
          details: buildSprintConflictDetails(sprint, conflictingSprint),
        },
      };
    }
  }

  return {
    value: true,
  };
};

const getSprints = asyncHandler(async (req, res) => {
  const { projectId, teamId, state } = req.query;

  if (!projectId || !mongoose.isValidObjectId(projectId)) {
    res.status(400);
    throw new Error("A valid project id is required");
  }

  const project = await loadReadableProject(req.user, projectId);

  if (!project) {
    res.status(404);
    throw new Error("Project not found or inaccessible");
  }

  const query = {
    projectId,
    workspaceId: normalizeWorkspaceId(req.user.workspaceId),
  };

  if (teamId && teamId !== "all") {
    if (!mongoose.isValidObjectId(teamId)) {
      res.status(400);
      throw new Error("Invalid team id filter");
    }

    query.teamId = teamId;
  }

  if (state && state !== "all") {
    query.state = state;
  }

  const sprints = await Sprint.find(query)
    .populate("teamId", "name description workspaceId")
    .sort({
      startDate: 1,
      createdAt: 1,
    });

  await Promise.all(sprints.map((sprint) => expireSprintIfNeeded(sprint)));

  res.status(200).json(sprints.map((sprint) => serializeSprint(sprint.toObject())));
});

const getSprintIssues = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400);
    throw new Error("Invalid sprint id");
  }

  const sprint = await Sprint.findById(req.params.id).populate(
    "teamId",
    "name description workspaceId"
  );

  if (!sprint) {
    res.status(404);
    throw new Error("Sprint not found");
  }

  await expireSprintIfNeeded(sprint);

  const accessResult = await ensureSprintManagementAccess(req.user, sprint);

  if (accessResult.error) {
    res.status(accessResult.error.status);
    throw new Error(accessResult.error.message);
  }

  const issues = await populateIssueQuery(
    Issue.find({
      sprintId: sprint._id,
    }).sort({
      planningOrder: 1,
      createdAt: 1,
    })
  );

  res.status(200).json({
    sprint: serializeSprint(sprint.toObject(), serializeIssues(issues)),
    issues: serializeIssues(issues),
  });
});

const createSprint = asyncHandler(async (req, res) => {
  const {
    projectId,
    teamId = null,
    name,
    goal = "",
    startDate = null,
    endDate = null,
  } = req.body;

  if (!projectId || !mongoose.isValidObjectId(projectId)) {
    res.status(400);
    throw new Error("A valid project id is required");
  }

  if (!name || !String(name).trim()) {
    res.status(400);
    throw new Error("Sprint name is required");
  }

  const project = await loadReadableProject(req.user, projectId);

  if (!project) {
    res.status(404);
    throw new Error("Project not found or inaccessible");
  }

  if (!canManageProjectPlanning(req.user, project)) {
    res.status(403);
    throw new Error("You do not have permission to create sprints for this project");
  }

  const workspaceId = normalizeWorkspaceId(req.user.workspaceId);
  const teamResult = await ensureSprintTeamForProject({
    projectId,
    teamId,
    workspaceId,
  });

  if (teamResult.error) {
    res.status(teamResult.error.status);
    throw new Error(teamResult.error.message);
  }

  const startDateResult = parseOptionalDate(startDate, "start date");
  const endDateResult = parseOptionalDate(endDate, "end date");

  if (startDateResult.error) {
    res.status(startDateResult.error.status);
    throw new Error(startDateResult.error.message);
  }

  if (endDateResult.error) {
    res.status(endDateResult.error.status);
    throw new Error(endDateResult.error.message);
  }

  if (
    startDateResult.value &&
    endDateResult.value &&
    startDateResult.value > endDateResult.value
  ) {
    res.status(400);
    throw new Error("Sprint start date must be before the end date");
  }

  const sprint = await Sprint.create({
    projectId,
    teamId: teamResult.team?._id || null,
    workspaceId,
    name: String(name).trim(),
    goal: typeof goal === "string" ? goal.trim() : "",
    state: "PLANNED",
    startDate: startDateResult.value,
    endDate: endDateResult.value,
    createdBy: req.user._id,
  });

  await sprint.populate("teamId", "name description workspaceId");

  res.status(201).json(serializeSprint(sprint.toObject()));
});

const updateSprint = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400);
    throw new Error("Invalid sprint id");
  }

  const sprint = await Sprint.findById(req.params.id);

  if (!sprint) {
    res.status(404);
    throw new Error("Sprint not found");
  }

  const accessResult = await ensureSprintManagementAccess(req.user, sprint);

  if (accessResult.error) {
    res.status(accessResult.error.status);
    throw new Error(accessResult.error.message);
  }

  if (sprint.state === "COMPLETED") {
    res.status(400);
    throw new Error("Completed sprints cannot be edited");
  }

  if (isSprintExpired(sprint)) {
    res.status(400);
    throw new Error("Expired sprints cannot be edited until an admin reopens them");
  }

  const workspaceId = normalizeWorkspaceId(req.user.workspaceId);

  if (Object.prototype.hasOwnProperty.call(req.body, "teamId")) {
    if (sprint.state !== "PLANNED") {
      res.status(400);
      throw new Error("Sprint team scope can only be changed while the sprint is planned");
    }

    const teamResult = await ensureSprintTeamForProject({
      projectId: sprint.projectId,
      teamId: req.body.teamId || null,
      workspaceId,
    });

    if (teamResult.error) {
      res.status(teamResult.error.status);
      throw new Error(teamResult.error.message);
    }

    sprint.teamId = teamResult.team?._id || null;
  }

  const startDateResult = parseOptionalDate(req.body.startDate, "start date");
  const endDateResult = parseOptionalDate(req.body.endDate, "end date");

  if (startDateResult.error) {
    res.status(startDateResult.error.status);
    throw new Error(startDateResult.error.message);
  }

  if (endDateResult.error) {
    res.status(endDateResult.error.status);
    throw new Error(endDateResult.error.message);
  }

  if (
    startDateResult.value &&
    endDateResult.value &&
    startDateResult.value > endDateResult.value
  ) {
    res.status(400);
    throw new Error("Sprint start date must be before the end date");
  }

  ["name", "goal"].forEach((field) => {
    if (typeof req.body[field] !== "undefined") {
      sprint[field] = typeof req.body[field] === "string" ? req.body[field].trim() : req.body[field];
    }
  });

  if (typeof req.body.startDate !== "undefined") {
    sprint.startDate = startDateResult.value;
  }

  if (typeof req.body.endDate !== "undefined") {
    sprint.endDate = endDateResult.value;
  }

  if (!hasSprintPastEndDate(sprint)) {
    sprint.expiredAt = null;
    sprint.lockOverride = {
      enabled: false,
      reopenedAt: null,
      reopenedBy: null,
    };
  }

  await sprint.save();
  await sprint.populate("teamId", "name description workspaceId");

  if (req.body.goal && sprint.teamId) {
    await notifySprintEvent({
      sprint,
      eventType: "goal_updated",
      actorId: req.user._id,
    });
  }

  res.status(200).json(serializeSprint(sprint.toObject()));
});

const deleteSprint = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400);
    throw new Error("Invalid sprint id");
  }

  const sprint = await Sprint.findById(req.params.id);

  if (!sprint) {
    res.status(404);
    throw new Error("Sprint not found");
  }

  const accessResult = await ensureSprintManagementAccess(req.user, sprint);

  if (accessResult.error) {
    res.status(accessResult.error.status);
    throw new Error(accessResult.error.message);
  }

  if (sprint.state !== "PLANNED") {
    res.status(400);
    throw new Error("Only planned sprints can be deleted");
  }

  const issueCount = await Issue.countDocuments({
    sprintId: sprint._id,
  });

  if (issueCount > 0) {
    res.status(409);
    throw new Error("Move all issues out of the sprint before deleting it");
  }

  await Sprint.deleteOne({
    _id: sprint._id,
  });

  res.status(200).json({
    message: "Sprint deleted successfully",
  });
});

const startSprint = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400);
    throw new Error("Invalid sprint id");
  }

  const sprint = await Sprint.findById(req.params.id);

  if (!sprint) {
    res.status(404);
    throw new Error("Sprint not found");
  }

  logSprintStartAttempt(req, sprint);

  const accessResult = await ensureSprintManagementAccess(req.user, sprint);

  if (accessResult.error) {
    res.status(accessResult.error.status);
    throw new Error(accessResult.error.message);
  }

  if (sprint.state === "ACTIVE" && !isSprintExpired(sprint)) {
    logSprintStartConflict({
      sprint,
      reason: "already_active",
    });
    throwHttpError(
      res,
      409,
      `Sprint "${sprint.name}" is already active.`,
      "SPRINT_ALREADY_ACTIVE",
      buildSprintConflictDetails(sprint)
    );
  }

  if (sprint.state === "COMPLETED") {
    logSprintStartConflict({
      sprint,
      reason: "already_completed",
    });
    throwHttpError(
      res,
      409,
      `Sprint "${sprint.name}" has already been completed and cannot be started again.`,
      "INVALID_SPRINT_STATE_TRANSITION",
      buildSprintConflictDetails(sprint)
    );
  }

  if (sprint.state !== "PLANNED") {
    logSprintStartConflict({
      sprint,
      reason: "invalid_state_transition",
    });
    throwHttpError(
      res,
      409,
      `Sprint "${sprint.name}" cannot move from ${String(sprint.state || "UNKNOWN").toLowerCase()} to active.`,
      "INVALID_SPRINT_STATE_TRANSITION",
      buildSprintConflictDetails(sprint)
    );
  }

  if (!sprint.startDate || !sprint.endDate) {
    res.status(400);
    throw new Error("Sprint start and end dates must be set before starting the sprint");
  }

  if (hasSprintPastEndDate(sprint)) {
    res.status(400);
    throw new Error("Sprint end date has already passed. Update the sprint dates before starting it.");
  }

  const overlapResult = await validateActiveSprintOverlap(sprint);

  if (overlapResult.error) {
    logSprintStartConflict({
      sprint,
      reason: overlapResult.error.code || "active_sprint_overlap",
      conflictingSprint: overlapResult.conflictingSprint || null,
    });
    throwHttpError(
      res,
      overlapResult.error.status,
      overlapResult.error.message,
      overlapResult.error.code,
      overlapResult.error.details
    );
  }

  const issues = await Issue.find({
    sprintId: sprint._id,
  })
    .select("_id storyPoints")
    .lean();

  sprint.state = ACTIVE_SPRINT_STATE;
  sprint.startedAt = new Date();
  sprint.expiredAt = null;
  sprint.lockOverride = {
    enabled: false,
    reopenedAt: null,
    reopenedBy: null,
  };
  sprint.snapshot = {
    committedIssueIds: issues.map((issue) => issue._id),
    committedPoints: issues.reduce(
      (sum, issue) => sum + Number(issue.storyPoints || 0),
      0
    ),
    completedIssueIds: [],
    completedPoints: 0,
    carriedOverIssueIds: [],
    carryOverMode: "",
  };

  await sprint.save();
  const startedSprint = await Sprint.findById(sprint._id).populate(
    "teamId",
    "name description workspaceId"
  );

  if (!startedSprint || startedSprint.state !== "ACTIVE") {
    console.error("[sprints] start verification failed", {
      sprintId: String(sprint._id),
      persistedState: startedSprint?.state || null,
    });
    throwHttpError(
      res,
      500,
      "Sprint state could not be confirmed after starting it.",
      "SPRINT_START_VERIFICATION_FAILED",
      buildSprintConflictDetails(startedSprint || sprint)
    );
  }

  console.info("[sprints] sprint became active", {
    sprintId: String(startedSprint._id),
    sprintName: startedSprint.name,
    projectId: String(startedSprint.projectId || ""),
    teamId: String(startedSprint.teamId?._id || startedSprint.teamId || ""),
    startedAt: startedSprint.startedAt,
  });

  try {
    const notificationResult = await handleSprintStarted(startedSprint._id, {
      actorUserId: req.user._id,
    });

    console.info("[sprint-notifications] sprint start notifications queued", {
      sprintId: String(startedSprint._id),
      queued: Number(notificationResult?.queued || 0),
      skipped: notificationResult?.skipped || "",
    });
  } catch (error) {
    console.error("[sprint-notifications] sprint start notification trigger failed", {
      sprintId: String(startedSprint._id),
      message: error.message,
    });
  }

    if (startedSprint.teamId) {
      await notifySprintEvent({
        sprint: startedSprint,
        eventType: "started",
        actorId: req.user._id,
      });
    }

  res.status(200).json(serializeSprint(startedSprint.toObject()));
});

const completeSprint = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400);
    throw new Error("Invalid sprint id");
  }

  const sprint = await Sprint.findById(req.params.id);

  if (!sprint) {
    res.status(404);
    throw new Error("Sprint not found");
  }

  const accessResult = await ensureSprintManagementAccess(req.user, sprint);

  if (accessResult.error) {
    res.status(accessResult.error.status);
    throw new Error(accessResult.error.message);
  }

  if (sprint.state !== "ACTIVE") {
    res.status(400);
    throw new Error("Only active sprints can be completed");
  }

  const carryOverMode =
    String(req.body?.carryOverMode || "BACKLOG").trim().toUpperCase() || "BACKLOG";
  const completionOptions = {
    autoCloseDoneStories: req.body?.options?.autoCloseDoneStories !== false,
    generateSprintReport: req.body?.options?.generateSprintReport !== false,
    updateVelocityMetrics: req.body?.options?.updateVelocityMetrics !== false,
    notifyTeamMembers: req.body?.options?.notifyTeamMembers !== false,
  };

  if (!["BACKLOG", "SPRINT", "NEW_SPRINT"].includes(carryOverMode)) {
    res.status(400);
    throw new Error("Carry-over mode must be BACKLOG, SPRINT, or NEW_SPRINT");
  }

  let completedSprint = null;
  let targetSprintId = "";
  let targetSprintName = "";
  let carriedOverIssueIds = [];
  let closedIssueIds = [];

  const runCompletion = async (session = null) => {
    const result = {
      completedSprint: null,
      targetSprintId: "",
      targetSprintName: "",
      carriedOverIssueIds: [],
      closedIssueIds: [],
    };

    const sprintForUpdate = await withOptionalSession(
      Sprint.findById(req.params.id),
      session
    );

      if (!sprintForUpdate) {
        throw createHttpError(404, "Sprint not found");
      }

      if (sprintForUpdate.state !== "ACTIVE") {
        throw createHttpError(400, "Only active sprints can be completed");
      }

    const issuesQuery = Issue.find({
      sprintId: sprintForUpdate._id,
    }).sort({
          planningOrder: 1,
          createdAt: 1,
    });
    const issues = await withOptionalSession(issuesQuery, session);
      const autoClosableIssues = issues.filter(isAutoClosableSprintIssue);
      const incompleteIssues = issues.filter(isIncompleteSprintIssue);
      let targetSprint = null;

      if (carryOverMode === "SPRINT" && incompleteIssues.length) {
        if (!mongoose.isValidObjectId(req.body?.targetSprintId)) {
          throw createHttpError(
            400,
            "A valid target sprint is required when carrying work forward"
          );
        }

        targetSprint = await withOptionalSession(
          Sprint.findOne({
            _id: req.body.targetSprintId,
            projectId: sprintForUpdate.projectId,
            state: "PLANNED",
          }),
          session
        );

        if (!targetSprint) {
          throw createHttpError(404, "Target sprint not found");
        }

        if (
          targetSprint.teamId &&
          incompleteIssues.some(
            (issue) => String(issue.teamId || "") !== String(targetSprint.teamId || "")
          )
        ) {
          throw createHttpError(
            400,
            "Target sprint team scope does not match one or more incomplete issues"
          );
        }
      }

      if (carryOverMode === "NEW_SPRINT" && incompleteIssues.length) {
        const sprintName = String(req.body?.newSprint?.name || "").trim();
        const sprintGoal = String(req.body?.newSprint?.goal || "").trim();
        const startDateResult = parseOptionalDate(req.body?.newSprint?.startDate, "start date");
        const endDateResult = parseOptionalDate(req.body?.newSprint?.endDate, "end date");

        if (!sprintName) {
          throw createHttpError(400, "Sprint name is required for the new sprint");
        }

        if (startDateResult.error) {
          throw createHttpError(
            startDateResult.error.status,
            startDateResult.error.message
          );
        }

        if (endDateResult.error) {
          throw createHttpError(endDateResult.error.status, endDateResult.error.message);
        }

        if (!startDateResult.value || !endDateResult.value) {
          throw createHttpError(
            400,
            "Start date and end date are required for the new sprint"
          );
        }

        if (startDateResult.value > endDateResult.value) {
          throw createHttpError(400, "Sprint start date must be before the end date");
        }

        targetSprint = await Sprint.create(
          [
            {
              projectId: sprintForUpdate.projectId,
              teamId: sprintForUpdate.teamId || null,
              workspaceId: sprintForUpdate.workspaceId,
              name: sprintName,
              goal: sprintGoal,
              state: "PLANNED",
              startDate: startDateResult.value,
              endDate: endDateResult.value,
              createdBy: req.user._id,
            },
          ],
          session ? { session } : undefined
        ).then((records) => records[0]);
      }

      if (completionOptions.autoCloseDoneStories) {
        for (const issue of autoClosableIssues) {
          const previousStatus = issue.status;
          issue.status = ISSUE_STATUS.CLOSED;
          issue.closedBy = req.user._id;
          issue.closedAt = issue.closedAt || new Date();
          await saveWithOptionalSession(issue, session);
          result.closedIssueIds.push(String(issue._id));

          await recordIssueHistory({
            issueId: issue._id,
            projectId: issue.projectId,
            actorId: req.user._id,
            eventType: issue.type === "Bug" ? "BUG_STATUS_CHANGED" : "ISSUE_UPDATED",
            field: "status",
            fromValue: previousStatus,
            toValue: ISSUE_STATUS.CLOSED,
            meta: {
              sprintCompletion: true,
              sprintId: String(sprintForUpdate._id),
              sprintName: sprintForUpdate.name,
            },
            session,
          });
        }
      }

      if (carryOverMode === "BACKLOG" && incompleteIssues.length) {
        let nextPlanningOrder = await getNextPlanningOrder(Issue, {
          projectId: sprintForUpdate.projectId,
          sprintId: null,
        });

        for (const issue of incompleteIssues) {
          issue.sprintId = null;
          issue.planningOrder = nextPlanningOrder;
          nextPlanningOrder += PLANNING_ORDER_INCREMENT;
          await saveWithOptionalSession(issue, session);
          result.carriedOverIssueIds.push(String(issue._id));
          await recordIssueHistory({
            issueId: issue._id,
            projectId: issue.projectId,
            actorId: req.user._id,
            eventType: "SPRINT_CARRY_OVER",
            field: "sprintId",
            fromValue: String(sprintForUpdate._id),
            toValue: null,
            meta: {
              carryOverMode,
              sprintName: sprintForUpdate.name,
            },
            session,
          });
        }
      }

      if (["SPRINT", "NEW_SPRINT"].includes(carryOverMode) && incompleteIssues.length && targetSprint) {
        result.targetSprintId = String(targetSprint._id);
        result.targetSprintName = targetSprint.name;

        for (const issue of incompleteIssues) {
          issue.sprintId = targetSprint._id;
          await saveWithOptionalSession(issue, session);
          result.carriedOverIssueIds.push(String(issue._id));
          await recordIssueHistory({
            issueId: issue._id,
            projectId: issue.projectId,
            actorId: req.user._id,
            eventType: "SPRINT_CARRY_OVER",
            field: "sprintId",
            fromValue: String(sprintForUpdate._id),
            toValue: String(targetSprint._id),
            meta: {
              carryOverMode,
              sprintName: sprintForUpdate.name,
              targetSprintName: targetSprint.name,
            },
            session,
          });
        }
      }

      const completedSnapshotIssues = issues.filter((issue) =>
        completionOptions.autoCloseDoneStories
          ? isCompletedSprintIssue(issue)
          : [ISSUE_STATUS.DONE, ISSUE_STATUS.CLOSED].includes(issue.status)
      );

      sprintForUpdate.state = "COMPLETED";
      sprintForUpdate.completedAt = new Date();
      sprintForUpdate.completedBy = req.user._id;
      sprintForUpdate.lockOverride = {
        enabled: false,
        reopenedAt: null,
        reopenedBy: null,
      };
      sprintForUpdate.snapshot = {
        ...(sprintForUpdate.snapshot || {}),
        committedIssueIds:
          sprintForUpdate.snapshot?.committedIssueIds || issues.map((issue) => issue._id),
        committedPoints:
          sprintForUpdate.snapshot?.committedPoints ||
          issues.reduce((sum, issue) => sum + Number(issue.storyPoints || 0), 0),
        completedIssueIds: completedSnapshotIssues.map((issue) => issue._id),
        completedPoints: completedSnapshotIssues.reduce(
          (sum, issue) => sum + Number(issue.storyPoints || 0),
          0
        ),
        carriedOverIssueIds: incompleteIssues.map((issue) => issue._id),
        carryOverMode,
      };

      await saveWithOptionalSession(sprintForUpdate, session);

      await syncEpicCompletionStatuses({
        projectId: sprintForUpdate.projectId,
        epicIds: issues.map((issue) => issue.epicId).filter(Boolean),
        session,
      });

    result.completedSprint = await withOptionalSession(
      Sprint.findById(sprintForUpdate._id).populate("teamId", "name description workspaceId"),
      session
    );

    return result;
  };

  const applyCompletionResult = (result) => {
    completedSprint = result.completedSprint;
    targetSprintId = result.targetSprintId;
    targetSprintName = result.targetSprintName;
    carriedOverIssueIds = result.carriedOverIssueIds;
    closedIssueIds = result.closedIssueIds;
  };

  const session = await mongoose.startSession();

  try {
    try {
      let transactionResult = null;

      await session.withTransaction(async () => {
        transactionResult = await runCompletion(session);
      });

      applyCompletionResult(transactionResult);
    } catch (error) {
      if (!isTransactionUnsupportedError(error)) {
        throw error;
      }

      console.warn(
        "[sprints] MongoDB transactions unavailable; completing sprint without transaction",
        {
          sprintId: String(req.params.id),
          message: error.message,
        }
      );

      applyCompletionResult(await runCompletion(null));
    }
  } catch (error) {
    if (error?.statusCode) {
      res.status(error.statusCode);
    }
    throw error;
  } finally {
    await session.endSession();
  }

  if (completedSprint?.teamId && completionOptions.notifyTeamMembers) {
    await notifySprintEvent({
      sprint: completedSprint,
      eventType: "ended",
      actorId: req.user._id,
    });
  }

  res.status(200).json({
    sprint: serializeSprint(completedSprint.toObject()),
    carriedOverIssueIds,
    closedIssueIds,
    targetSprintId,
    targetSprintName,
    options: completionOptions,
  });
});

const reopenSprint = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400);
    throw new Error("Invalid sprint id");
  }

  const sprint = await Sprint.findById(req.params.id);

  if (!sprint) {
    res.status(404);
    throw new Error("Sprint not found");
  }

  const accessResult = await ensureSprintManagementAccess(req.user, sprint);

  if (accessResult.error) {
    res.status(accessResult.error.status);
    throw new Error(accessResult.error.message);
  }

  if (req.user.role !== ROLE_ADMIN) {
    res.status(403);
    throw new Error("Only admins can reopen expired sprints");
  }

  if (!isSprintLocked(sprint) || getSprintLifecycleState(sprint) !== "EXPIRED") {
    res.status(400);
    throw new Error("Only expired active sprints can be reopened");
  }

  sprint.lockOverride = {
    enabled: true,
    reopenedAt: new Date(),
    reopenedBy: req.user._id,
  };

  await sprint.save();
  await sprint.populate("teamId", "name description workspaceId");

  res.status(200).json(serializeSprint(sprint.toObject()));
});

module.exports = {
  getSprints,
  getSprintIssues,
  createSprint,
  updateSprint,
  deleteSprint,
  startSprint,
  completeSprint,
  reopenSprint,
};
