import {
  ROLE_DEVELOPER,
  ROLE_QA_LEAD,
  ROLE_TEAM_LEAD,
  ROLE_TESTER,
  hasAdminPanelAccess,
} from "@/lib/roles";
import { ISSUE_STATUS, normalizeBugStatusForIssue, resolveIssueProjectId } from "@/lib/issues";

export const canConfigureRepository = (role) =>
  hasAdminPanelAccess(role) || role === ROLE_TEAM_LEAD;

export const canUseProjectTestSetup = (role) =>
  [ROLE_TESTER, ROLE_QA_LEAD, ROLE_TEAM_LEAD].includes(role);

export const canViewPushInformation = (role) =>
  [ROLE_DEVELOPER, ROLE_TEAM_LEAD].includes(role) || hasAdminPanelAccess(role);

export const normalizeDeliveryModules = (project = {}) => {
  const configuredModules = Array.isArray(project.deliveryModules)
    ? project.deliveryModules.map((module) => module?.name || module).filter(Boolean)
    : [];
  const changedModules = Array.isArray(project.latestGitActivity?.modulesChanged)
    ? project.latestGitActivity.modulesChanged.filter(Boolean)
    : [];
  const fallbackModules = Array.isArray(project.modules)
    ? project.modules.map((module) => module?.name || module).filter(Boolean)
    : [];

  return Array.from(new Set([...changedModules, ...configuredModules, ...fallbackModules]));
};

export const getRepositorySummary = (project = {}) => {
  const repository = project.repository || {};
  const git = project.git || {};
  const gitStatus = git.status || {};

  return {
    provider: git.provider || repository.provider || repository.gitProvider || "GitHub",
    owner: git.repositoryOwner || repository.owner || "",
    name: git.repositoryName || repository.name || "",
    url: git.repositoryUrl || repository.url || repository.repository || "",
    defaultBranch: git.defaultBranch || repository.defaultBranch || project.latestGitActivity?.branch || "main",
    webhookEnabled: Boolean(git.webhookEnabled || repository.webhookEnabled),
    status: gitStatus.connectionStatus || repository.status || (git.repositoryUrl || repository.url ? "Connected" : "Not Configured"),
  };
};

const coerceNumber = (...values) => {
  const value = values.find((item) => item !== undefined && item !== null && item !== "");
  const numeric = Number(value);

  return Number.isFinite(numeric) ? numeric : null;
};

export const getLatestGitActivity = (project = {}) => {
  const repository = getRepositorySummary(project);
  const activity = project.latestGitActivity || {};

  return {
    projectName: project.name || "Project",
    repository: repository.url || "Repository not configured",
    branch: activity.branch || repository.defaultBranch,
    commitMessage: activity.commitMessage || "No pushes recorded yet",
    commitSha: activity.commitSha || "",
    filesChanged: Array.isArray(activity.filesChanged) ? activity.filesChanged : [],
    filesChangedCount: activity.filesChangedCount || activity.changedFiles || 0,
    additions: coerceNumber(activity.additions, activity.linesAdded, activity.added, activity.addedFiles),
    deletions: coerceNumber(activity.deletions, activity.linesDeleted, activity.removed, activity.removedFiles),
    modulesChanged: Array.isArray(activity.modulesChanged) ? activity.modulesChanged : [],
    pushedByName: activity.pushedByName || "Developer",
    pushedByUsername: activity.pushedByUsername || activity.pushedByLogin || "",
    pushedAt: activity.pushedAt || project.updatedAt || project.createdAt || null,
    qaStatus: activity.qaStatus || "Waiting for QA",
  };
};

export const getProjectDeliveryMetrics = ({ project = {}, issues = [] }) => {
  const projectId = String(project._id || project.id || "");
  const projectIssues = issues.filter((issue) => resolveIssueProjectId(issue) === projectId);
  const bugs = projectIssues.filter((issue) => issue.type === "Bug");
  const tasks = projectIssues.filter((issue) => issue.type !== "Bug");
  const pendingQa = projectIssues.filter((issue) =>
    [ISSUE_STATUS.READY_FOR_QA, ISSUE_STATUS.QA, ISSUE_STATUS.FIXED, ISSUE_STATUS.TESTING].includes(
      issue.type === "Bug" ? normalizeBugStatusForIssue(issue) : issue.status
    )
  ).length;
  const failedQa = projectIssues.filter((issue) =>
    [ISSUE_STATUS.REOPEN, ISSUE_STATUS.REJECTED, ISSUE_STATUS.BLOCKED].includes(
      issue.type === "Bug" ? normalizeBugStatusForIssue(issue) : issue.status
    )
  ).length;
  const completedTasks = tasks.filter((issue) =>
    [ISSUE_STATUS.DONE, ISSUE_STATUS.CLOSED].includes(issue.status)
  ).length;
  const criticalBugs = bugs.filter((issue) =>
    ["critical", "blocker"].includes(String(issue.priority || issue.severity || "").toLowerCase())
  ).length;
  const modules = normalizeDeliveryModules(project);
  const testCases = Array.isArray(project.testCases)
    ? project.testCases.filter((testCase) => testCase?.active !== false)
    : [];

  return {
    openBugs: bugs.filter((issue) => ![ISSUE_STATUS.CLOSED, ISSUE_STATUS.DONE].includes(normalizeBugStatusForIssue(issue))).length,
    criticalBugs,
    completedTasks,
    pendingQa,
    failedQa,
    readyForRelease: pendingQa === 0 && failedQa === 0 && projectIssues.length > 0,
    modulesSelected: modules.length,
    testCases: testCases.length,
    estimatedMinutes: testCases.reduce((sum, testCase) => sum + (Number(testCase.estimatedMinutes) || 0), 0),
  };
};
