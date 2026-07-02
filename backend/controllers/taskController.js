const { updateIssue } = require("./issueController");
const Issue = require("../models/Issue");
const asyncHandler = require("../utils/asyncHandler");
const {
  populateIssueQuery,
  serializeIssues,
} = require("../utils/issuePresentation");
const { ISSUE_STATUS } = require("../utils/issueStatus");
const { ISSUE_TYPES } = require("../utils/issueTypes");
const { ROLE_TESTER } = require("../utils/roles");

const RECENT_TASK_LIMIT = 5;

const TASK_STATUS_TO_ISSUE_STATUS = Object.freeze({
  OPEN: ISSUE_STATUS.TODO,
  TODO: ISSUE_STATUS.TODO,
  IN_PROGRESS: ISSUE_STATUS.IN_PROGRESS,
  CODE_REVIEW: ISSUE_STATUS.CODE_REVIEW,
  QA_READY: ISSUE_STATUS.QA_READY,
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
    throw new Error("Status must be OPEN, IN_PROGRESS, CODE_REVIEW, QA_READY, or DONE");
  }

  const task = await Issue.findById(req.params.id).select("_id type").lean();

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
  if (req.user.role !== ROLE_TESTER) {
    res.status(403);
    throw new Error("Only testers can access recent tasks");
  }

  const tasks = await populateIssueQuery(
    Issue.find({
      assignee: req.user._id,
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
