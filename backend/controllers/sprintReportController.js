const mongoose = require("mongoose");
const Issue = require("../models/Issue");
const IssueWorklog = require("../models/IssueWorklog");
const Sprint = require("../models/Sprint");
const asyncHandler = require("../utils/asyncHandler");
const { loadReadableProject } = require("../utils/backlogAccess");

const buildSprintReportRow = (sprint, issues = [], worklogs = []) => {
  const committedIssueIds = sprint.snapshot?.committedIssueIds || issues.map((issue) => issue._id);
  const committedPoints =
    sprint.snapshot?.committedPoints ||
    issues.reduce((sum, issue) => sum + Number(issue.storyPoints || 0), 0);
  const completedIssueIds =
    sprint.snapshot?.completedIssueIds ||
    issues.filter((issue) => issue.status === "DONE").map((issue) => issue._id);
  const completedPoints =
    sprint.snapshot?.completedPoints ||
    issues
      .filter((issue) => issue.status === "DONE")
      .reduce((sum, issue) => sum + Number(issue.storyPoints || 0), 0);
  const carriedOverIssueIds = sprint.snapshot?.carriedOverIssueIds || [];
  const velocity = committedPoints ? Math.round((completedPoints / committedPoints) * 100) : 0;

  return {
    sprintId: sprint._id,
    name: sprint.name,
    state: sprint.state,
    teamId: sprint.teamId,
    startDate: sprint.startDate,
    endDate: sprint.endDate,
    startedAt: sprint.startedAt,
    completedAt: sprint.completedAt,
    committedIssueCount: committedIssueIds.length,
    committedPoints,
    completedIssueCount: completedIssueIds.length,
    completedPoints,
    carriedOverIssueCount: carriedOverIssueIds.length,
    worklogMinutes: worklogs.reduce((sum, worklog) => sum + Number(worklog.minutes || 0), 0),
    completionRate: committedIssueIds.length
      ? Math.round((completedIssueIds.length / committedIssueIds.length) * 100)
      : 0,
    velocity,
  };
};

const getSprintReports = asyncHandler(async (req, res) => {
  const { projectId } = req.query;

  if (!projectId || !mongoose.isValidObjectId(projectId)) {
    res.status(400);
    throw new Error("A valid project id is required");
  }

  const project = await loadReadableProject(req.user, projectId);

  if (!project) {
    res.status(404);
    throw new Error("Project not found or inaccessible");
  }

  const sprints = await Sprint.find({
    projectId,
  })
    .populate("teamId", "name")
    .sort({
      createdAt: -1,
    })
    .lean();
  const sprintIds = sprints.map((sprint) => sprint._id);
  const [issues, worklogs] = await Promise.all([
    Issue.find({ sprintId: { $in: sprintIds } })
      .select("sprintId status storyPoints")
      .lean(),
    IssueWorklog.find({ sprintId: { $in: sprintIds } })
      .select("sprintId minutes")
      .lean(),
  ]);
  const issuesBySprintId = new Map();
  const worklogsBySprintId = new Map();

  for (const issue of issues) {
    const key = String(issue.sprintId);
    const values = issuesBySprintId.get(key) || [];
    values.push(issue);
    issuesBySprintId.set(key, values);
  }

  for (const worklog of worklogs) {
    const key = String(worklog.sprintId);
    const values = worklogsBySprintId.get(key) || [];
    values.push(worklog);
    worklogsBySprintId.set(key, values);
  }

  const reports = sprints.map((sprint) =>
    buildSprintReportRow(
      sprint,
      issuesBySprintId.get(String(sprint._id)) || [],
      worklogsBySprintId.get(String(sprint._id)) || []
    )
  );

  res.status(200).json({
    sprints: reports,
  });
});

const getSprintReportById = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400);
    throw new Error("Invalid sprint id");
  }

  const sprint = await Sprint.findById(req.params.id)
    .populate("teamId", "name")
    .lean();

  if (!sprint) {
    res.status(404);
    throw new Error("Sprint not found");
  }

  const project = await loadReadableProject(req.user, sprint.projectId);

  if (!project) {
    res.status(404);
    throw new Error("Project not found or inaccessible");
  }

  const [issues, worklogs] = await Promise.all([
    Issue.find({ sprintId: sprint._id }).select("status storyPoints").lean(),
    IssueWorklog.find({ sprintId: sprint._id }).select("minutes").lean(),
  ]);

  res.status(200).json({
    sprint: buildSprintReportRow(sprint, issues, worklogs),
  });
});

module.exports = {
  getSprintReports,
  getSprintReportById,
};
