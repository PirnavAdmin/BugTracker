const { updateIssue } = require("./issueController");
const Issue = require("../models/Issue");
const Project = require("../models/Project");
const asyncHandler = require("../utils/asyncHandler");
const { loadTenantSafeIssue } = require("../utils/issueAccess");
const { buildProjectAccessQuery } = require("../utils/projectRelations");
const {
  populateIssueQuery,
  serializeIssues,
} = require("../utils/issuePresentation");
const { ISSUE_STATUS } = require("../utils/issueStatus");
const { ISSUE_TYPES } = require("../utils/issueTypes");
const { hasTesterAccess } = require("../utils/roles");

const RECENT_TASK_LIMIT = 5;

const TASK_STATUS_TO_ISSUE_STATUS = Object.freeze({
  OPEN: ISSUE_STATUS.TODO,
  TODO: ISSUE_STATUS.TODO,
  IN_PROGRESS: ISSUE_STATUS.IN_PROGRESS,
  DONE: ISSUE_STATUS.DONE,
});

const normalizeTaskStatusInput = (value) =>
  String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");

const updateTaskStatus = asyncHandler(async (req, res, next) => {
  const requestedStatus = normalizeTaskStatusInput(req.body?.status);
  const issueStatus = TASK_STATUS_TO_ISSUE_STATUS[requestedStatus];

  if (!issueStatus) {
    res.status(400);
    throw new Error("Status must be OPEN, IN_PROGRESS, or DONE");
  }

  const task = await loadTenantSafeIssue(req.user, req.params.id, {
    select:
      "_id type projectId assignee assignees reporter bugDetails.testerOwner bugDetails.developerLead",
    lean: true,
  });

  if (!task) {
    res.status(404);
    throw new Error("Task not found");
  }

  if (task.type !== ISSUE_TYPES.TASK) {
    res.status(400);
    throw new Error("Only Task work items can be updated from the task board");
  }

  req.body = {
    status: issueStatus,
  };

  return updateIssue(req, res, next);
});

const getRecentTasks = asyncHandler(async (req, res) => {
  if (!hasTesterAccess(req.user.role)) {
    res.status(403);
    throw new Error("Only tester roles can access recent tasks");
  }

  const accessibleProjectIds = await Project.find(
    await buildProjectAccessQuery(req.user)
  ).distinct("_id");
  const tasks = await populateIssueQuery(
    Issue.find({
      assignee: req.user._id,
      projectId: {
        $in: accessibleProjectIds,
      },
      type: ISSUE_TYPES.TASK,
    })
      .sort({
        createdAt: -1,
      })
      .limit(RECENT_TASK_LIMIT)
  );

  res.status(200).json(serializeIssues(tasks));
});

module.exports = {
  getRecentTasks,
  updateTaskStatus,
};
