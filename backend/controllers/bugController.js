const {
  getIssues,
  createIssue,
  updateIssue,
  deleteIssue,
} = require("./issueController");
const Issue = require("../models/Issue");
const asyncHandler = require("../utils/asyncHandler");
const { loadTenantSafeIssue } = require("../utils/issueAccess");
const { ISSUE_TYPES } = require("../utils/issueTypes");

const forceBugType = (req) => {
  Object.assign(req.query, {
    type: ISSUE_TYPES.BUG,
  });
};

const getBugs = (req, res, next) => {
  forceBugType(req);
  return getIssues(req, res, next);
};

const createBug = (req, res, next) => {
  req.body = {
    ...req.body,
    type: ISSUE_TYPES.BUG,
  };

  return createIssue(req, res, next);
};

const ensureBugRecord = asyncHandler(async (req, res, next) => {
  const issue = await loadTenantSafeIssue(req.user, req.params.id, {
    select: "_id type",
    lean: true,
  });

  if (!issue) {
    res.status(404);
    throw new Error("Bug not found");
  }

  if (issue.type !== ISSUE_TYPES.BUG) {
    res.status(400);
    throw new Error("Bug endpoint can only manage Bug records");
  }

  return next();
});

module.exports = {
  getBugs,
  createBug,
  ensureBugRecord,
  updateBug: updateIssue,
  deleteBug: deleteIssue,
};
