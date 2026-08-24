const Epic = require("../models/Epic");
const Issue = require("../models/Issue");
const Sprint = require("../models/Sprint");
const Team = require("../models/Team");
const TeamMember = require("../models/TeamMember");
const ProjectMember = require("../models/ProjectMember");
const ProjectTeam = require("../models/ProjectTeam");
const User = require("../models/User");
const { ISSUE_TYPES } = require("../utils/issueTypes");
const {
  isClosedIssueStatus,
  isInProgressIssueStatus,
  normalizeIssueStatus,
} = require("../utils/issueStatus");

const asId = (value) => String(value?._id || value || "");
const percentage = (part, total) => (total ? Math.round((part / total) * 100) : 0);
const unique = (values) => [...new Set(values.filter(Boolean).map(asId))];
const isBugClosed = (issue) =>
  ["DONE", "CLOSED", "RESOLVED"].includes(normalizeIssueStatus(issue.status));
const isBugFixed = (issue) =>
  isBugClosed(issue) || normalizeIssueStatus(issue.status) === "FIXED";

const issueOwnerIds = (issue = {}) =>
  unique([
    issue.assignee,
    issue.assignedDeveloperId,
    ...(Array.isArray(issue.assignees) ? issue.assignees : []),
  ]);

const buildMemberPerformance = ({ users, issues, roleMatcher, ownershipIds, now }) =>
  users.filter((user) => roleMatcher(user.role)).map((user) => {
    const userId = asId(user);
    const assigned = issues.filter((issue) => ownershipIds(issue).includes(userId));
    const completed = assigned.filter((issue) => isClosedIssueStatus(issue.status));
    const active = assigned.filter((issue) => !isClosedIssueStatus(issue.status));
    const completedPoints = completed.reduce((sum, issue) => sum + (Number(issue.storyPoints) || 0), 0);

    return {
      userId,
      name: user.name || user.email || "Project member",
      role: user.role,
      assigned: assigned.length,
      completed: completed.length,
      active: active.length,
      overdue: active.filter((issue) => issue.dueAt && new Date(issue.dueAt) < now).length,
      completionRate: percentage(completed.length, assigned.length),
      completedStoryPoints: completedPoints,
    };
  });

const resolveSprintInsight = ({ sprints, issues, now }) => {
  const sprint =
    sprints.find((item) => item.state === "ACTIVE") ||
    [...sprints]
      .filter((item) => item.state === "COMPLETED")
      .sort((a, b) => new Date(b.completedAt || b.updatedAt || 0) - new Date(a.completedAt || a.updatedAt || 0))[0] ||
    null;

  if (!sprint) return null;
  const sprintIssues = issues.filter((issue) => asId(issue.sprintId) === asId(sprint));
  const completed = sprintIssues.filter((issue) => isClosedIssueStatus(issue.status)).length;
  const blocked = sprintIssues.filter((issue) => normalizeIssueStatus(issue.status) === "BLOCKED").length;
  const overdue = sprintIssues.filter(
    (issue) => !isClosedIssueStatus(issue.status) && issue.dueAt && new Date(issue.dueAt) < now
  ).length;
  const completionRate = percentage(completed, sprintIssues.length);
  const endPassed = sprint.endDate && new Date(sprint.endDate) < now && sprint.state !== "COMPLETED";
  const status = blocked || overdue || endPassed
    ? blocked > 1 || overdue > 2 || endPassed
      ? "Critical"
      : "At Risk"
    : "On Track";

  return {
    sprintId: asId(sprint),
    name: sprint.name,
    state: sprint.state,
    status,
    startDate: sprint.startDate || null,
    endDate: sprint.endDate || null,
    totalItems: sprintIssues.length,
    completedItems: completed,
    completionRate,
    blockedItems: blocked,
    overdueItems: overdue,
    carryOverItems: sprint.snapshot?.carriedOverIssueIds?.length || 0,
  };
};

const buildProjectAIData = async ({ project, tenantId, now = new Date() }) => {
  const projectId = asId(project);
  // Keep AI metrics aligned with the Task and Bug pages: soft-deleted work is
  // never part of an active project view or an AI analysis.
  const boundary = { tenantId, projectId };
  const activeIssueBoundary = { ...boundary, isDeleted: { $ne: true } };
  const [epics, issues, sprints, directMembers, projectTeamLinks] = await Promise.all([
    Epic.find(boundary).select("name status priority targetDate").lean(),
    Issue.find(activeIssueBoundary)
      .select("type status priority storyPoints dueAt sprintId assignee assignees assignedDeveloperId bugDetails.testerOwner createdAt updatedAt")
      .lean(),
    Sprint.find(boundary).select("name state startDate endDate completedAt updatedAt snapshot").lean(),
    ProjectMember.find({ projectId }).select("userId role").lean(),
    ProjectTeam.find({ projectId }).select("teamId").lean(),
  ]);

  const attachedTeamIds = unique([
    ...(project.attachedTeams || []),
    ...projectTeamLinks.map((link) => link.teamId),
  ]);
  const projectTeams = attachedTeamIds.length
    ? await Team.find({ tenantId, _id: { $in: attachedTeamIds } }).select("_id").lean()
    : [];
  const teamIds = projectTeams.map(asId);
  const teamMembers = teamIds.length
    ? await TeamMember.find({ tenantId, teamId: { $in: teamIds } }).select("userId").lean()
    : [];
  const userIds = unique([
    project.manager,
    ...directMembers.map((member) => member.userId),
    ...teamMembers.map((member) => member.userId),
    ...issues.flatMap(issueOwnerIds),
    ...issues.map((issue) => issue.bugDetails?.testerOwner),
  ]);
  const users = userIds.length
    ? await User.find({ tenantId, _id: { $in: userIds } }).select("name email role designation").lean()
    : [];

  const tasks = issues.filter((issue) => [ISSUE_TYPES.TASK, ISSUE_TYPES.SUB_TASK].includes(issue.type));
  const stories = issues.filter((issue) => issue.type === ISSUE_TYPES.STORY);
  const bugs = issues.filter((issue) => issue.type === ISSUE_TYPES.BUG);
  const workItems = [...stories, ...tasks, ...bugs];
  const completed = workItems.filter((issue) => isClosedIssueStatus(issue.status));
  const openBugs = bugs.filter((issue) => !isBugClosed(issue));
  const activeItems = workItems.filter((issue) => !isClosedIssueStatus(issue.status));
  const storyPoints = stories.reduce((sum, issue) => sum + (Number(issue.storyPoints) || 0), 0);
  const completedStoryPoints = stories
    .filter((issue) => isClosedIssueStatus(issue.status))
    .reduce((sum, issue) => sum + (Number(issue.storyPoints) || 0), 0);
  const completedSprints = sprints.filter((sprint) => sprint.state === "COMPLETED").length;

  const metrics = {
    projectHealth: {
      completionRate: percentage(completed.length, workItems.length),
      totalWorkItems: workItems.length,
      stories: {
        total: stories.length,
        completed: stories.filter((issue) => isClosedIssueStatus(issue.status)).length,
        storyPoints,
        completedStoryPoints,
      },
      tasks: {
        total: tasks.length,
        completed: tasks.filter((issue) => isClosedIssueStatus(issue.status)).length,
        inProgress: tasks.filter((issue) => isInProgressIssueStatus(issue.status)).length,
        pending: tasks.filter((issue) => !isClosedIssueStatus(issue.status) && !isInProgressIssueStatus(issue.status)).length,
        overdue: tasks.filter(
          (issue) => !isClosedIssueStatus(issue.status) && issue.dueAt && new Date(issue.dueAt) < now
        ).length,
        blocked: tasks.filter((issue) => normalizeIssueStatus(issue.status) === "BLOCKED").length,
        unassigned: tasks.filter(
          (issue) => !isClosedIssueStatus(issue.status) && issueOwnerIds(issue).length === 0
        ).length,
      },
      bugs: {
        total: bugs.length,
        open: openBugs.length,
        resolved: bugs.length - openBugs.length,
        inProgress: openBugs.filter((issue) => normalizeIssueStatus(issue.status) === "IN_PROGRESS").length,
        readyForQa: openBugs.filter((issue) =>
          ["READY_FOR_QA", "READY_FOR_TESTING", "READY_FOR_VERIFICATION", "TESTING", "QA", "QA_READY"].includes(
            normalizeIssueStatus(issue.status)
          )
        ).length,
        reopened: bugs.filter((issue) => normalizeIssueStatus(issue.status) === "REOPEN").length,
        criticalOpen: openBugs.filter((issue) => issue.priority === "Critical").length,
        overdue: openBugs.filter((issue) => issue.dueAt && new Date(issue.dueAt) < now).length,
        unassigned: openBugs.filter((issue) => issueOwnerIds(issue).length === 0).length,
      },
      sprints: {
        total: sprints.length,
        active: sprints.filter((sprint) => sprint.state === "ACTIVE").length,
        completed: completedSprints,
        completionRate: percentage(completedSprints, sprints.length),
      },
      overdueItems: activeItems.filter((issue) => issue.dueAt && new Date(issue.dueAt) < now).length,
      blockedItems: activeItems.filter((issue) => normalizeIssueStatus(issue.status) === "BLOCKED").length,
      unassignedItems: activeItems.filter((issue) => issueOwnerIds(issue).length === 0).length,
    },
  };

  const developers = buildMemberPerformance({
    users,
    issues: tasks,
    roleMatcher: (role) => ["Developer", "Team Lead"].includes(role),
    ownershipIds: issueOwnerIds,
    now,
  }).map((row) => ({
    userId: row.userId,
    name: row.name,
    role: row.role,
    assignedTasks: row.assigned,
    completedTasks: row.completed,
    activeTasks: row.active,
    overdueTasks: row.overdue,
    taskCompletionRate: row.completionRate,
    completedStoryPoints: row.completedStoryPoints,
    bugsFixed: bugs.filter(
      (bug) => issueOwnerIds(bug).includes(row.userId) && isBugFixed(bug)
    ).length,
  }));
  const testers = buildMemberPerformance({
    users,
    issues: bugs,
    roleMatcher: (role) => ["Tester", "Q/A Lead"].includes(role),
    ownershipIds: (issue) => unique([issue.bugDetails?.testerOwner]),
    now,
  }).map((row) => ({
    ...row,
    bugsVerified: bugs.filter(
      (bug) => asId(bug.bugDetails?.testerOwner) === row.userId && isBugClosed(bug)
    ).length,
    reopenedBugs: bugs.filter(
      (bug) => asId(bug.bugDetails?.testerOwner) === row.userId && normalizeIssueStatus(bug.status) === "REOPEN"
    ).length,
  }));

  const sprintInsight = resolveSprintInsight({ sprints, issues: workItems, now });
  const gitActivity = [project.latestGitActivity, ...(project.gitActivityHistory || [])].filter(
    (activity) => activity?.commitSha
  );
  const payload = {
    project: {
      name: project.name,
      status: project.status,
      priority: project.priority,
      startDate: project.startDate || null,
      targetDate: project.targetDate || null,
    },
    metrics: metrics.projectHealth,
    developers,
    testers,
    sprint: sprintInsight,
    epics: epics.map((epic) => ({
      name: epic.name,
      status: epic.status,
      priority: epic.priority,
      targetDate: epic.targetDate || null,
    })),
    activity: {
      commitCount: gitActivity.length,
      latestPushAt: project.git?.status?.lastPushTime || null,
    },
  };

  return { metrics, developers, testers, sprintInsight, payload };
};

module.exports = { buildProjectAIData };
