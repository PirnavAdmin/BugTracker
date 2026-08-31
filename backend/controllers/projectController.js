const mongoose = require("mongoose");
const Comment = require("../models/Comment");
const Epic = require("../models/Epic");
const Issue = require("../models/Issue");
const Project = require("../models/Project");
const ProjectMeeting = require("../models/ProjectMeeting");
const ProjectMember = require("../models/ProjectMember");
const {
  assertTenantCapacity,
  withTenantLimitLock,
} = require("../services/subscriptionUsageService");
const ProjectTeam = require("../models/ProjectTeam");
const Team = require("../models/Team");
const TeamMember = require("../models/TeamMember");
const User = require("../models/User");
const { sendProjectMeetingInviteEmail } = require("../services/emailService");
const { resolveMeetingWindow } = require("../utils/meetingWindow");
const asyncHandler = require("../utils/asyncHandler");
const { ROLE_ADMIN, ROLE_MANAGER, ROLE_TEAM_LEAD, hasAdminAccess } = require("../utils/roles");
const {
  buildProjectAccessQuery,
  loadSerializedProjectById,
  mergeProjectTeamIds,
  serializeProjectsWithRelations,
} = require("../utils/projectRelations");
const {
  logProjectTeamsDebug,
  logProjectTeamsWarning,
  summarizeTeams,
} = require("../utils/projectTeamDiagnostics");
const { ISSUE_STATUS } = require("../utils/issueStatus");
const { attachMembersToTeams } = require("../utils/teamRelations");
const { normalizeTenantId, withTenantFilter } = require("../utils/tenant");
const { normalizeWorkspaceId } = require("../utils/workspace");
const { PLANNING_ORDER_INCREMENT } = require("../utils/planningOrder");
const { decryptGitToken, encryptGitToken } = require("../utils/gitTokenCrypto");

const canUseMeetingSchedulerSender = (role = "") =>
  [ROLE_ADMIN, ROLE_MANAGER, ROLE_TEAM_LEAD].includes(role);
const { createUniqueProjectShortCode } = require("../utils/displayIds");
const TEAMS_MEETING_URL_PREFIX = "https://teams.microsoft.com/l/meetup-join/";

const projectPopulation = [
  { path: "createdBy", select: "name email role workspaceId tenantId" },
  { path: "manager", select: "name email role workspaceId tenantId" },
  { path: "projectManager", select: "name email role workspaceId tenantId" },
  { path: "teamLead", select: "name email role workspaceId tenantId" },
  { path: "qaLead", select: "name email role workspaceId tenantId" },
];

const PROJECT_STATUS_VALUES = ["Active", "On Hold", "Completed"];
const PROJECT_PRIORITY_VALUES = ["Low", "Medium", "High", "Critical"];
const CLOSED_DETACH_STATUS_VALUES = [
  ISSUE_STATUS.DONE,
  ISSUE_STATUS.CLOSED,
  ISSUE_STATUS.REJECTED,
  ISSUE_STATUS.DEFERRED,
];

const populateProject = (target) => target.populate(projectPopulation);

const getProjectIssueCount = async (projectId) => Issue.countDocuments({ projectId });

const canConfigureProjectDelivery = (role = "") =>
  [ROLE_ADMIN, ROLE_MANAGER].includes(role);

const normalizeString = (value, fallback = "") =>
  typeof value === "string" ? value.trim() : fallback;

const normalizeBoolean = (value, fallback = false) =>
  typeof value === "boolean" ? value : fallback;

const normalizeStringArray = (value) =>
  Array.isArray(value)
    ? Array.from(
        new Set(
          value
            .map((item) => String(item || "").trim())
            .filter(Boolean)
        )
      )
    : [];

const normalizeNullableNumber = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const numeric = Number(value);

  return Number.isFinite(numeric) ? numeric : null;
};

const normalizeAiReviewState = (review = {}) => {
  const status = normalizeString(review.status || "NOT_REVIEWED").toUpperCase();
  const allowedStatus = ["NOT_REVIEWED", "REVIEWING", "COMPLETED", "FAILED"].includes(status)
    ? status
    : "NOT_REVIEWED";
  const normalizeRiskLevel = (value, fallback = "low") => {
    const normalized = normalizeString(value || fallback).toLowerCase();

    return ["low", "medium", "high", "critical"].includes(normalized) ? normalized : fallback;
  };
  const normalizeReleaseReadiness = (value) => {
    const normalized = normalizeString(value || "needs_attention").toLowerCase();

    return ["ready", "needs_attention", "blocked"].includes(normalized)
      ? normalized
      : "needs_attention";
  };

  return {
    status: allowedStatus,
    score: normalizeNullableNumber(review.score),
    rating: normalizeString(review.rating),
    summary: normalizeString(review.summary),
    findings: Array.isArray(review.findings) ? review.findings : [],
    security: Array.isArray(review.security) ? review.security : [],
    performance: Array.isArray(review.performance) ? review.performance : [],
    codeQuality: Array.isArray(review.codeQuality) ? review.codeQuality : [],
    regressionRisk: {
      level: normalizeRiskLevel(review.regressionRisk?.level),
      areas: normalizeStringArray(review.regressionRisk?.areas),
      reason: normalizeString(review.regressionRisk?.reason),
    },
    testing: {
      risk: normalizeRiskLevel(review.testing?.risk),
      recommendedTests: normalizeStringArray(
        review.testing?.recommendedTests || review.testingRecommendations
      ),
      edgeCases: normalizeStringArray(review.testing?.edgeCases),
      affectedModules: normalizeStringArray(review.testing?.affectedModules),
    },
    release: {
      readiness: normalizeReleaseReadiness(review.release?.readiness),
      risks: normalizeStringArray(review.release?.risks),
      recommendations: normalizeStringArray(review.release?.recommendations),
    },
    testingRecommendations: normalizeStringArray(review.testingRecommendations),
    positiveObservations: normalizeStringArray(review.positiveObservations),
    reviewedAt: review.reviewedAt ? new Date(review.reviewedAt) : null,
    reviewedBy: review.reviewedBy || null,
    error: normalizeString(review.error),
  };
};

const normalizeGitActivityEntry = (activity = {}, fallback = {}) => ({
  commitSha: normalizeString(activity.commitSha, fallback.commitSha || ""),
  commitMessage: normalizeString(activity.commitMessage, fallback.commitMessage || ""),
  branch: normalizeString(activity.branch, fallback.branch || ""),
  pushedByName: normalizeString(activity.pushedByName, fallback.pushedByName || ""),
  pushedAt: activity.pushedAt ? new Date(activity.pushedAt) : fallback.pushedAt || null,
  filesChanged: normalizeStringArray(activity.filesChanged || fallback.filesChanged),
  additions: normalizeNullableNumber(
    activity.additions !== undefined ? activity.additions : fallback.additions
  ),
  deletions: normalizeNullableNumber(
    activity.deletions !== undefined ? activity.deletions : fallback.deletions
  ),
  modulesChanged: normalizeStringArray(activity.modulesChanged || fallback.modulesChanged),
  qaStatus: normalizeString(activity.qaStatus, fallback.qaStatus || "Waiting for QA"),
  aiReview: normalizeAiReviewState(activity.aiReview || fallback.aiReview || {}),
  event: normalizeString(activity.event, fallback.event || "push"),
  deliveryId: normalizeString(activity.deliveryId, fallback.deliveryId || ""),
  recordedAt: activity.recordedAt ? new Date(activity.recordedAt) : fallback.recordedAt || new Date(),
});

const hasGitActivityEntry = (activity = {}) =>
  Boolean(
    normalizeString(activity.commitSha) ||
      activity.pushedAt ||
      normalizeString(activity.commitMessage)
  );

const getGitActivityKey = (activity = {}) =>
  [normalizeString(activity.commitSha), activity.pushedAt ? new Date(activity.pushedAt).getTime() : ""]
    .filter(Boolean)
    .join(":");

const prependGitActivityHistory = (existingHistory = [], entries = []) => {
  const seen = new Set();

  return [...entries, ...existingHistory]
    .map((activity) => normalizeGitActivityEntry(activity?.toObject?.() || activity))
    .filter(hasGitActivityEntry)
    .filter((activity) => {
      const key = getGitActivityKey(activity);

      if (!key) {
        return true;
      }

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    })
    .sort((left, right) => new Date(right.pushedAt || 0) - new Date(left.pushedAt || 0));
};

const buildGitActivityEntriesFromGitHubCommits = ({
  branch = "",
  commits = [],
  latestCommitDetails = null,
} = {}) =>
  (Array.isArray(commits) ? commits : [])
    .map((commit) => {
      const commitSha = normalizeString(commit.sha);
      const isLatestCommit = commitSha && commitSha === normalizeString(latestCommitDetails?.sha);
      const filesChanged = isLatestCommit && Array.isArray(latestCommitDetails?.files)
        ? latestCommitDetails.files.map((file) => file?.filename).filter(Boolean)
        : [];

      return normalizeGitActivityEntry({
        commitSha,
        commitMessage: commit.commit?.message || "",
        branch,
        pushedByName:
          commit.author?.login ||
          commit.commit?.author?.name ||
          commit.commit?.committer?.name ||
          "",
        pushedAt: commit.commit?.author?.date || commit.commit?.committer?.date || null,
        filesChanged,
        additions: isLatestCommit ? latestCommitDetails?.stats?.additions : null,
        deletions: isLatestCommit ? latestCommitDetails?.stats?.deletions : null,
        modulesChanged: [],
        qaStatus: "Waiting for QA",
        event: "sync",
      });
    })
    .filter(hasGitActivityEntry);

const generateWebhookSecret = () =>
  `cc_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;

const GITHUB_WEBHOOK_EVENT_VALUES = [
  "push",
  "pull_request",
  "release",
  "workflow_run",
  "create",
  "delete",
  "tag",
];

const GITHUB_WEBHOOK_EVENT_LABELS = {
  push: "Push",
  pull_request: "Pull Request",
  release: "Release",
  workflow_run: "Workflow Run",
  create: "Branch Create/Delete",
  delete: "Branch Create/Delete",
  tag: "Tag",
};

const GITHUB_COMMIT_SYNC_LIMIT = 100;

const normalizeWebhookEvents = (value) => {
  const events = normalizeStringArray(value)
    .map((event) => event.toLowerCase())
    .filter((event) => GITHUB_WEBHOOK_EVENT_VALUES.includes(event));

  return events.length ? Array.from(new Set(events)) : ["push", "pull_request"];
};

const normalizeAutomationRules = (rules = {}, existing = {}) => ({
  autoNotifyQa: normalizeBoolean(rules.autoNotifyQa, existing.autoNotifyQa ?? true),
  autoDetectChangedModules: normalizeBoolean(
    rules.autoDetectChangedModules,
    existing.autoDetectChangedModules ?? true
  ),
  autoLinkCommitsToTasks: normalizeBoolean(
    rules.autoLinkCommitsToTasks,
    existing.autoLinkCommitsToTasks ?? true
  ),
  autoLinkCommitsToBugs: normalizeBoolean(
    rules.autoLinkCommitsToBugs,
    existing.autoLinkCommitsToBugs ?? true
  ),
  autoGenerateReleaseNotes: normalizeBoolean(
    rules.autoGenerateReleaseNotes,
    existing.autoGenerateReleaseNotes ?? true
  ),
  autoCreateQaSession: normalizeBoolean(
    rules.autoCreateQaSession,
    existing.autoCreateQaSession ?? false
  ),
  autoUpdateTaskStatus: normalizeBoolean(
    rules.autoUpdateTaskStatus,
    existing.autoUpdateTaskStatus ?? true
  ),
  notifyAssignedDevelopers: normalizeBoolean(
    rules.notifyAssignedDevelopers,
    existing.notifyAssignedDevelopers ?? true
  ),
});

const normalizeModuleMappings = (value = []) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((mapping) => {
      const module = normalizeString(mapping?.module || mapping?.name);
      const paths = normalizeStringArray(mapping?.paths || mapping?.sourcePaths);

      return module ? { module, paths } : null;
    })
    .filter(Boolean);
};

const parseGitHubRepositoryUrl = (url = "") => {
  const normalizedUrl = normalizeString(url);

  if (!normalizedUrl) {
    return {};
  }

  const sshMatch = normalizedUrl.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/i);

  if (sshMatch) {
    return {
      owner: sshMatch[1],
      name: sshMatch[2],
    };
  }

  try {
    const parsedUrl = new URL(normalizedUrl);

    if (!/github\.com$/i.test(parsedUrl.hostname)) {
      return {};
    }

    const [owner, name] = parsedUrl.pathname
      .replace(/^\/+/, "")
      .replace(/\.git$/i, "")
      .split("/");

    return { owner, name };
  } catch {
    return {};
  }
};

const normalizeGitConfiguration = ({ payload = {}, project = {}, tokenRequired = false } = {}) => {
  const incoming = payload.git || payload.repository || {};
  const existingGit = project.git || {};
  const existingRepository = project.repository || {};
  const urlParts = parseGitHubRepositoryUrl(
    incoming.repositoryUrl || incoming.url || existingGit.repositoryUrl || existingRepository.url
  );
  const repositoryOwner = normalizeString(
    incoming.repositoryOwner || incoming.owner,
    existingGit.repositoryOwner || urlParts.owner || ""
  );
  const repositoryName = normalizeString(
    incoming.repositoryName || incoming.name,
    existingGit.repositoryName || existingRepository.name || urlParts.name || ""
  );
  const repositoryUrl = normalizeString(
    incoming.repositoryUrl || incoming.url,
    existingGit.repositoryUrl || existingRepository.url || ""
  );
  const defaultBranch = normalizeString(
    incoming.defaultBranch,
    existingGit.defaultBranch || existingRepository.defaultBranch || "main"
  );
  const token = normalizeString(incoming.token || incoming.personalAccessToken);
  const errors = [];

  if (!repositoryOwner) errors.push("Repository owner is required.");
  if (!repositoryName) errors.push("Repository name is required.");
  if (!repositoryUrl) errors.push("Repository URL is required.");
  if (!defaultBranch) errors.push("Default branch is required.");
  if (repositoryUrl && parseGitHubRepositoryUrl(repositoryUrl).owner) {
    const parsed = parseGitHubRepositoryUrl(repositoryUrl);
    if (
      parsed.owner &&
      parsed.name &&
      (parsed.owner.toLowerCase() !== repositoryOwner.toLowerCase() ||
        parsed.name.toLowerCase() !== repositoryName.toLowerCase())
    ) {
      errors.push("Repository URL must match the repository owner and name.");
    }
  }
  if (tokenRequired && !token && !existingGit.encryptedToken) {
    errors.push("GitHub Personal Access Token is required.");
  }

  return {
    errors,
    token,
    git: {
      enabled: normalizeBoolean(incoming.enabled, existingGit.enabled ?? true),
      provider: "GitHub",
      repositoryOwner,
      repositoryName,
      repositoryUrl,
      defaultBranch,
      webhookEndpoint: normalizeString(
        incoming.webhookEndpoint,
        existingGit.webhookEndpoint || existingRepository.webhookEndpoint || "/api/webhooks/github"
      ),
      webhookSecret: normalizeString(
        incoming.webhookSecret,
        existingGit.webhookSecret || existingRepository.webhookSecret || generateWebhookSecret()
      ),
      webhookEvents: normalizeWebhookEvents(incoming.webhookEvents || existingGit.webhookEvents),
      automationRules: normalizeAutomationRules(incoming.automationRules, existingGit.automationRules || {}),
      moduleMappings: normalizeModuleMappings(incoming.moduleMappings || existingGit.moduleMappings),
      encryptedToken: incoming.encryptedToken || existingGit.encryptedToken || "",
      tokenConfigured: normalizeBoolean(
        incoming.tokenConfigured,
        existingGit.tokenConfigured || Boolean(existingGit.encryptedToken)
      ),
      tokenUpdatedAt: incoming.tokenUpdatedAt || existingGit.tokenUpdatedAt || null,
      status: incoming.status || existingGit.status || {},
      auditLog: Array.isArray(incoming.auditLog)
        ? incoming.auditLog
        : Array.isArray(existingGit.auditLog)
          ? existingGit.auditLog
          : [],
    },
  };
};

const getGitHubTokenForProject = (project, replacementToken = "") => {
  const token = normalizeString(replacementToken);

  if (token) {
    return token;
  }

  if (!project.git?.encryptedToken) {
    return "";
  }

  return decryptGitToken(project.git.encryptedToken);
};

const callGitHubApi = async ({ token, path, method = "GET" }) => {
  const response = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "CureCode-Git-Configuration",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = data?.message || `GitHub API request failed with status ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
};

const validateGitHubConfiguration = async ({ git, token }) => {
  if (!token) {
    throw new Error("GitHub Personal Access Token is required.");
  }

  const owner = encodeURIComponent(git.repositoryOwner);
  const repo = encodeURIComponent(git.repositoryName);
  const [repository, branch] = await Promise.all([
    callGitHubApi({ token, path: `/repos/${owner}/${repo}` }),
    callGitHubApi({ token, path: `/repos/${owner}/${repo}/branches/${encodeURIComponent(git.defaultBranch)}` }),
  ]);

  const latestCommit = branch?.commit || {};
  const commitDetails = latestCommit.sha
    ? await callGitHubApi({ token, path: `/repos/${owner}/${repo}/commits/${latestCommit.sha}` })
    : null;
  const branchCommits = await callGitHubApi({
    token,
    path: `/repos/${owner}/${repo}/commits?sha=${encodeURIComponent(git.defaultBranch)}&per_page=${GITHUB_COMMIT_SYNC_LIMIT}`,
  });
  let hooks = [];
  let webhookStatus = "Accessible";

  try {
    hooks = await callGitHubApi({ token, path: `/repos/${owner}/${repo}/hooks` });
  } catch (error) {
    if (error.status === 403 || error.status === 404) {
      webhookStatus = "Permission Missing";
    } else {
      throw error;
    }
  }

  const hasWebhookPermission =
    repository?.permissions?.admin || repository?.permissions?.maintain || webhookStatus === "Accessible";

  if (!hasWebhookPermission || webhookStatus === "Permission Missing") {
    throw new Error("GitHub token must have repository webhook administration permission.");
  }

  const configuredHook = Array.isArray(hooks)
    ? hooks.find((hook) => String(hook?.config?.url || "").includes(git.webhookEndpoint))
    : null;
  const lastPushTime = repository?.pushed_at ? new Date(repository.pushed_at) : null;

  return {
    repository,
    branch,
    commits: Array.isArray(branchCommits) ? branchCommits : [],
    latestCommitDetails: commitDetails,
    hooks,
    status: {
      connectionStatus: "Connected",
      latestCommitHash: latestCommit.sha || "",
      latestCommitMessage: commitDetails?.commit?.message || latestCommit?.commit?.message || "",
      lastPushTime,
      lastSyncTime: new Date(),
      webhookStatus: configuredHook ? "Configured" : "Permission Verified",
      connectionHealth: "Healthy",
      lastError: "",
    },
  };
};

const appendGitAuditLog = (git = {}, { action, actor, message }) => ({
  ...git,
  auditLog: [
    ...(Array.isArray(git.auditLog) ? git.auditLog : []),
    {
      action,
      actor: actor?._id || actor?.id || null,
      actorName: actor?.name || actor?.email || "",
      message,
      createdAt: new Date(),
    },
  ].slice(-50),
});

const normalizeDeliveryModules = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((module, index) => {
      const name = normalizeString(
        typeof module === "string" ? module : module?.name
      );

      if (!name) {
        return null;
      }

      return {
        name,
        description: normalizeString(module?.description),
        ownerRole: normalizeString(module?.ownerRole, "Shared"),
        order: Number.isFinite(Number(module?.order)) ? Number(module.order) : index,
        sourcePaths: normalizeStringArray(module?.sourcePaths),
        defaultTestSuites: normalizeStringArray(module?.defaultTestSuites),
      };
    })
    .filter(Boolean);
};

const normalizeTestCases = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((testCase) => {
      const title = normalizeString(testCase?.title);

      if (!title) {
        return null;
      }

      return {
        module: normalizeString(testCase?.module),
        title,
        description: normalizeString(testCase?.description),
        estimatedMinutes: Math.max(0, Number(testCase?.estimatedMinutes) || 10),
        active: normalizeBoolean(testCase?.active, true),
      };
    })
    .filter(Boolean);
};

const buildDeliveryWorkflowPatch = (payload = {}, project = {}) => {
  const patch = {};

  if (Object.prototype.hasOwnProperty.call(payload, "git")) {
    const { errors, git } = normalizeGitConfiguration({ payload, project, tokenRequired: false });

    if (errors.length) {
      const error = new Error(errors.join(" "));
      error.status = 400;
      throw error;
    }

    patch.git = git;
    patch.repository = {
      enabled: git.enabled,
      provider: "GitHub",
      name: git.repositoryName,
      url: git.repositoryUrl,
      defaultBranch: git.defaultBranch,
      developmentBranch: project.repository?.developmentBranch || "develop",
      qaBranch: project.repository?.qaBranch || "qa",
      releaseBranch: project.repository?.releaseBranch || "release",
      webhookEnabled: git.webhookEvents.length > 0,
      webhookSecret: git.webhookSecret,
      webhookEndpoint: git.webhookEndpoint,
      repositoryIdentifier: `${git.repositoryOwner}/${git.repositoryName}`,
      branchStrategy: {
        mainBranch: git.defaultBranch,
        developmentBranch: project.repository?.branchStrategy?.developmentBranch || "develop",
        featurePattern: project.repository?.branchStrategy?.featurePattern || "feature/*",
        hotfixPattern: project.repository?.branchStrategy?.hotfixPattern || "hotfix/*",
        releasePattern: project.repository?.branchStrategy?.releasePattern || "release/*",
      },
      status: git.status?.connectionStatus || "Not Configured",
    };
    patch.deliveryWorkflow = {
      autoModuleDetection: git.automationRules.autoDetectChangedModules,
      autoQaNotification: git.automationRules.autoNotifyQa,
      releaseApprovalRequired: project.deliveryWorkflow?.releaseApprovalRequired ?? true,
      qaRequired: project.deliveryWorkflow?.qaRequired ?? true,
      autoLinkCommitsToTasks: git.automationRules.autoLinkCommitsToTasks,
      autoLinkCommitsToBugs: git.automationRules.autoLinkCommitsToBugs,
      releaseNotesGeneration: git.automationRules.autoGenerateReleaseNotes,
    };
  }

  if (Object.prototype.hasOwnProperty.call(payload, "repository")) {
    const repository = payload.repository || {};
    const existingRepository = project.repository || {};
    const provider = normalizeString(repository.provider || repository.gitProvider, existingRepository.provider || "GitHub");
    const url = normalizeString(repository.url || repository.repository, existingRepository.url || "");
    const repoName = normalizeString(repository.name || repository.repositoryName, existingRepository.name || "");
    const defaultBranch = normalizeString(repository.defaultBranch, existingRepository.defaultBranch || "main");
    const developmentBranch = normalizeString(
      repository.developmentBranch,
      existingRepository.developmentBranch || "develop"
    );
    const qaBranch = normalizeString(repository.qaBranch, existingRepository.qaBranch || "qa");
    const releaseBranch = normalizeString(
      repository.releaseBranch,
      existingRepository.releaseBranch || "release"
    );
    const branchStrategy = repository.branchStrategy || {};
    const webhookEndpoint = normalizeString(
      repository.webhookEndpoint,
      provider.toLowerCase() === "gitlab"
        ? "/api/webhooks/gitlab"
        : provider.toLowerCase() === "bitbucket"
          ? "/api/webhooks/bitbucket"
          : "/api/webhooks/github"
    );

    patch.repository = {
      enabled: normalizeBoolean(repository.enabled, existingRepository.enabled ?? true),
      provider,
      name: repoName,
      url,
      defaultBranch,
      developmentBranch,
      qaBranch,
      releaseBranch,
      webhookEnabled: normalizeBoolean(repository.webhookEnabled, existingRepository.webhookEnabled ?? true),
      webhookSecret: normalizeString(
        repository.webhookSecret,
        existingRepository.webhookSecret || generateWebhookSecret()
      ),
      webhookEndpoint,
      repositoryIdentifier: normalizeString(
        repository.repositoryIdentifier,
        existingRepository.repositoryIdentifier || repoName || url
      ),
      branchStrategy: {
        mainBranch: normalizeString(branchStrategy.mainBranch, defaultBranch),
        developmentBranch: normalizeString(branchStrategy.developmentBranch, developmentBranch),
        featurePattern: normalizeString(branchStrategy.featurePattern, "feature/*"),
        hotfixPattern: normalizeString(branchStrategy.hotfixPattern, "hotfix/*"),
        releasePattern: normalizeString(branchStrategy.releasePattern, "release/*"),
      },
      status: normalizeString(
        repository.status,
        url ? "Connected" : "Not Configured"
      ),
    };
  }

  if (Object.prototype.hasOwnProperty.call(payload, "deliveryWorkflow")) {
    const workflow = payload.deliveryWorkflow || {};
    const existingWorkflow = project.deliveryWorkflow || {};
    patch.deliveryWorkflow = {
      autoModuleDetection: normalizeBoolean(
        workflow.autoModuleDetection,
        existingWorkflow.autoModuleDetection ?? true
      ),
      autoQaNotification: normalizeBoolean(
        workflow.autoQaNotification,
        existingWorkflow.autoQaNotification ?? true
      ),
      releaseApprovalRequired: normalizeBoolean(
        workflow.releaseApprovalRequired,
        existingWorkflow.releaseApprovalRequired ?? true
      ),
      qaRequired: normalizeBoolean(workflow.qaRequired, existingWorkflow.qaRequired ?? true),
      autoLinkCommitsToTasks: normalizeBoolean(
        workflow.autoLinkCommitsToTasks,
        existingWorkflow.autoLinkCommitsToTasks ?? true
      ),
      autoLinkCommitsToBugs: normalizeBoolean(
        workflow.autoLinkCommitsToBugs,
        existingWorkflow.autoLinkCommitsToBugs ?? true
      ),
      releaseNotesGeneration: normalizeBoolean(
        workflow.releaseNotesGeneration,
        existingWorkflow.releaseNotesGeneration ?? true
      ),
    };
  }

  if (Object.prototype.hasOwnProperty.call(payload, "deliveryModules")) {
    patch.deliveryModules = normalizeDeliveryModules(payload.deliveryModules);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "defaultTestSuites")) {
    patch.defaultTestSuites = normalizeStringArray(payload.defaultTestSuites);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "testCases")) {
    patch.testCases = normalizeTestCases(payload.testCases);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "latestGitActivity")) {
    const activity = payload.latestGitActivity || {};
    patch.latestGitActivity = normalizeGitActivityEntry(activity);

    if (hasGitActivityEntry(patch.latestGitActivity)) {
      patch.gitActivityHistory = prependGitActivityHistory(
        project.gitActivityHistory || [],
        [patch.latestGitActivity]
      );
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, "gitActivityHistory")) {
    const existingHistory = project.gitActivityHistory || [];
    patch.gitActivityHistory = patch.gitActivityHistory
      ? prependGitActivityHistory(existingHistory, [
          ...(payload.gitActivityHistory || []),
          ...patch.gitActivityHistory,
        ])
      : prependGitActivityHistory(existingHistory, payload.gitActivityHistory || []);
  }

  return patch;
};

const parseProjectCompletedValue = (value) => {
  if (typeof value === "boolean") {
    return {
      value,
    };
  }

  if (value === "true" || value === "false") {
    return {
      value: value === "true",
    };
  }

  return {
    error: {
      status: 400,
      message: "Project status must include isCompleted as a boolean",
    },
  };
};

const normalizeProjectStatus = (value, fallback = "Active") => {
  if (value === null || typeof value === "undefined" || value === "") {
    return {
      value: fallback,
    };
  }

  const normalizedValue = String(value).trim().toLowerCase();
  const status = PROJECT_STATUS_VALUES.find(
    (item) => item.toLowerCase() === normalizedValue
  );

  if (!status) {
    return {
      error: {
        status: 400,
        message: `Project status must be ${PROJECT_STATUS_VALUES.join(", ")}`,
      },
    };
  }

  return {
    value: status,
  };
};

const normalizeProjectPriority = (value, fallback = "Medium") => {
  if (value === null || typeof value === "undefined" || value === "") {
    return {
      value: fallback,
    };
  }

  const normalizedValue = String(value).trim().toLowerCase();
  const priority = PROJECT_PRIORITY_VALUES.find(
    (item) => item.toLowerCase() === normalizedValue
  );

  if (!priority) {
    return {
      error: {
        status: 400,
        message: `Project priority must be ${PROJECT_PRIORITY_VALUES.join(", ")}`,
      },
    };
  }

  return {
    value: priority,
  };
};

const normalizeThemeColor = (value, fallback = "#2563EB") => {
  if (value === null || typeof value === "undefined" || value === "") {
    return fallback;
  }

  const color = String(value).trim();

  if (/^#[0-9A-Fa-f]{6}$/.test(color)) {
    return color.toUpperCase();
  }

  return fallback;
};

const normalizeProjectEpics = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }

  const uniqueEpics = new Map();

  value.forEach((epic) => {
    const epicName = typeof epic === "string" ? epic : epic?.name;

    if (typeof epicName !== "string") {
      return;
    }

    const normalizedEpic = epicName.trim();

    if (!normalizedEpic) {
      return;
    }

    const dedupeKey = normalizedEpic.toLowerCase();

    if (!uniqueEpics.has(dedupeKey)) {
      uniqueEpics.set(dedupeKey, normalizedEpic);
    }
  });

  return Array.from(uniqueEpics.values());
};

const normalizeOptionalDate = (value) => {
  if (!value) {
    return null;
  }

  const parsedDate = new Date(value);

  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
};

const normalizeProjectEpicInputs = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }

  const uniqueEpics = new Map();

  value.forEach((epic) => {
    const epicName = typeof epic === "string" ? epic : epic?.name;

    if (typeof epicName !== "string") {
      return;
    }

    const name = epicName.trim();

    if (!name) {
      return;
    }

    const dedupeKey = name.toLowerCase();

    if (!uniqueEpics.has(dedupeKey)) {
      uniqueEpics.set(dedupeKey, {
        name,
        startDate: typeof epic === "object" ? normalizeOptionalDate(epic.startDate) : null,
        targetDate: typeof epic === "object" ? normalizeOptionalDate(epic.targetDate) : null,
      });
    }
  });

  return Array.from(uniqueEpics.values());
};

const loadWorkspaceUserAssignment = async ({
  userId,
  workspaceId,
  reqUser,
  label,
  allowedRoles = [],
}) => {
  if (userId === null || userId === "" || typeof userId === "undefined") {
    return {
      value: null,
    };
  }

  if (!mongoose.isValidObjectId(userId)) {
    return {
      error: {
        status: 400,
        message: `Invalid ${label} user`,
      },
    };
  }

  const user = await User.findOne(withTenantFilter({
    _id: userId,
    workspaceId: normalizeWorkspaceId(workspaceId),
  }, reqUser))
    .select("_id name email role workspaceId tenantId")
    .lean();

  if (!user) {
    return {
      error: {
        status: 404,
        message: `${label} could not be found in this workspace`,
      },
    };
  }

  if (allowedRoles.length && !allowedRoles.includes(user.role)) {
    return {
      error: {
        status: 400,
        message: `${label} must have one of these roles: ${allowedRoles.join(", ")}`,
      },
    };
  }

  return {
    value: user._id,
  };
};

const buildProjectQuery = async (user) => {
  const accessQuery = await buildProjectAccessQuery(user);

  if (hasAdminAccess(user.role)) {
    return accessQuery;
  }

  const workspaceId = normalizeWorkspaceId(user.workspaceId);
  const userId = user.id || user._id;
  const directlyAssignedProjectIds = await Issue.find({
    assignee: userId,
  }).distinct("projectId");
  const assignedProjectIds = directlyAssignedProjectIds.length
    ? await Project.find(withTenantFilter({
        _id: {
          $in: directlyAssignedProjectIds,
        },
        workspaceId,
      }, user)).distinct("_id")
    : [];

  if (!assignedProjectIds.length) {
    return accessQuery;
  }

  return {
    ...accessQuery,
    $or: [
      ...(accessQuery.$or || []),
      {
        _id: {
          $in: assignedProjectIds,
        },
      },
    ],
  };
};

const buildProjectResponse = async (projectId) => {
  const serializedProject = await loadSerializedProjectById(
    Project,
    projectId,
    populateProject
  );

  if (!serializedProject) {
    return null;
  }

  return {
    ...serializedProject,
    issueCount: await getProjectIssueCount(serializedProject._id),
  };
};

const serializeProjectMeeting = (meeting) => {
  const serializedMeeting =
    typeof meeting?.toObject === "function" ? meeting.toObject() : meeting;

  if (!serializedMeeting) {
    return null;
  }

  return {
    _id: serializedMeeting._id,
    projectId: serializedMeeting.projectId,
    workspaceId: normalizeWorkspaceId(serializedMeeting.workspaceId),
    scheduledBy: serializedMeeting.scheduledBy,
    provider: serializedMeeting.provider,
    subject: serializedMeeting.subject,
    meetingId: serializedMeeting.meetingId,
    joinUrl: serializedMeeting.joinUrl,
    startDateTime: serializedMeeting.startDateTime,
    endDateTime: serializedMeeting.endDateTime,
    durationMinutes: serializedMeeting.durationMinutes,
    participants: serializedMeeting.participants || [],
    createdAt: serializedMeeting.createdAt,
  };
};

const loadAccessibleProject = async (user, projectId) =>
  Project.findOne({
    _id: projectId,
    ...(await buildProjectAccessQuery(user)),
  })
    .select("_id name workspaceId")
    .lean();

const getAttachedTeamParticipants = async ({ projectId, workspaceId, user }) => {
  const [project, projectTeams] = await Promise.all([
    Project.findOne(withTenantFilter({ _id: projectId, workspaceId }, user || { workspaceId }))
      .select("_id attachedTeams teamIds")
      .lean(),
    ProjectTeam.find({
      projectId,
    })
      .select("teamId")
      .lean(),
  ]);
  const attachedTeamIds = mergeProjectTeamIds(project || { _id: projectId }, projectTeams);

  if (!attachedTeamIds.length) {
    return [];
  }

  const teamMemberships = await TeamMember.find(withTenantFilter({
    teamId: {
      $in: attachedTeamIds,
    },
  }, user || {}))
    .select("userId")
    .lean();
  const userIds = Array.from(
    new Set(teamMemberships.map((item) => String(item.userId)).filter(Boolean))
  );

  if (!userIds.length) {
    return [];
  }

  const users = await User.find(withTenantFilter({
    _id: {
      $in: userIds,
    },
    workspaceId: normalizeWorkspaceId(workspaceId),
  }, user || {}))
    .select("_id name email role workspaceId")
    .lean();
  const participantsByEmail = new Map();

  users.forEach((user) => {
    const email = String(user?.email || "").trim().toLowerCase();

    if (!email || participantsByEmail.has(email)) {
      return;
    }

    participantsByEmail.set(email, {
      userId: user._id,
      name: user.name || email,
      email,
      role: user.role || "",
    });
  });

  return Array.from(participantsByEmail.values()).sort((left, right) =>
    left.name.localeCompare(right.name)
  );
};

const getProjects = asyncHandler(async (req, res) => {
  if (!req.user) {
    res.status(401);
    throw new Error("Unauthorized");
  }

  const userId = req.user.id || req.user._id;

  if (!userId) {
    res.status(401);
    throw new Error("Unauthorized");
  }

  const projectQuery = await buildProjectQuery(req.user);
  const projects = await populateProject(Project.find(projectQuery))
    .sort({ createdAt: -1 })
    .lean();
  const serializedProjects = await serializeProjectsWithRelations(projects);
  const issueCounts = await Issue.aggregate([
    {
      $match: {
        projectId: {
          $in: serializedProjects.map((project) => project._id),
        },
      },
    },
    {
      $group: {
        _id: "$projectId",
        count: { $sum: 1 },
      },
    },
  ]);
  const issueCountMap = new Map(
    issueCounts.map((item) => [String(item._id), item.count])
  );

  res.status(200).json(
    serializedProjects.map((project) => ({
      ...project,
      issueCount: issueCountMap.get(String(project._id)) || 0,
    }))
  );
});

const createProject = asyncHandler(async (req, res) => {
  if (!req.user) {
    res.status(401);
    throw new Error("Unauthorized");
  }

  const userId = req.user.id || req.user._id;
  const workspaceId = normalizeWorkspaceId(req.user.workspaceId);
  const tenantId = normalizeTenantId(req.user.tenantId);
  const {
    name,
    description = "",
    epics = [],
    manager = null,
    projectManager = null,
    teamLead = null,
    qaLead = null,
    status = "Active",
    priority = "Medium",
    themeColor = "#2563EB",
    startDate = null,
    targetDate = null,
    teamIds = [],
    attachedTeams = [],
    git,
    repository,
    deliveryWorkflow,
    deliveryModules,
    defaultTestSuites,
    testCases,
    latestGitActivity,
  } = req.body;

  if (!userId) {
    res.status(401);
    throw new Error("Unauthorized");
  }

  if (!hasAdminAccess(req.user.role)) {
    res.status(403);
    throw new Error("Only admins and managers can create projects");
  }

  if (!name || !name.trim()) {
    res.status(400);
    throw new Error("Project name is required");
  }

  const existingProjectName = await Project.exists({
    workspaceId,
    name: { $regex: `^${name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
  });

  if (existingProjectName) {
    res.status(409);
    throw new Error("Project name must be unique");
  }

  const repositoryInput = repository || git || {};
  const shouldRequireRepository = Boolean(git);

  if (shouldRequireRepository) {
    const requiredRepositoryFields = [
      [git ? "repositoryOwner" : "provider", git ? "Repository owner is required" : "Git provider is required"],
      [git ? "repositoryName" : "name", "Repository name is required"],
      [git ? "repositoryUrl" : "url", "Repository URL is required"],
      ["defaultBranch", "Default branch is required"],
    ];

    requiredRepositoryFields.forEach(([field, message]) => {
      if (!normalizeString(repositoryInput[field])) {
        res.status(400);
        throw new Error(message);
      }
    });
  }

  if (!Array.isArray(deliveryModules) || !normalizeDeliveryModules(deliveryModules).length) {
    res.status(400);
    throw new Error("At least one project module is required");
  }

  const statusResult = normalizeProjectStatus(status, "Active");
  const priorityResult = normalizeProjectPriority(priority, "Medium");

  if (statusResult.error) {
    res.status(statusResult.error.status);
    throw new Error(statusResult.error.message);
  }

  if (priorityResult.error) {
    res.status(priorityResult.error.status);
    throw new Error(priorityResult.error.message);
  }

  const requestedManager = projectManager || manager;
  const [managerResult, teamLeadResult, qaLeadResult] = await Promise.all([
    loadWorkspaceUserAssignment({
      userId: requestedManager,
      workspaceId,
      reqUser: req.user,
      label: "Project manager",
      allowedRoles: ["Admin", "Manager"],
    }),
    loadWorkspaceUserAssignment({
      userId: teamLead,
      workspaceId,
      reqUser: req.user,
      label: "Team lead",
      allowedRoles: ["Team Lead"],
    }),
    loadWorkspaceUserAssignment({
      userId: qaLead,
      workspaceId,
      reqUser: req.user,
      label: "QA lead",
      allowedRoles: ["Admin", "Manager", "Tester", "Q/A Lead"],
    }),
  ]);

  if (managerResult.error) {
    res.status(managerResult.error.status);
    throw new Error(managerResult.error.message);
  }

  if (teamLeadResult.error) {
    res.status(teamLeadResult.error.status);
    throw new Error(teamLeadResult.error.message);
  }

  if (qaLeadResult.error) {
    res.status(qaLeadResult.error.status);
    throw new Error(qaLeadResult.error.message);
  }

  const shortCode = await createUniqueProjectShortCode({
    Project,
    name,
    workspaceId,
  });
  const requestedTeamIds = Array.from(
    new Set(
      [...(Array.isArray(teamIds) ? teamIds : []), ...(Array.isArray(attachedTeams) ? attachedTeams : [])]
        .map((teamId) => String(teamId || "").trim())
        .filter(Boolean)
    )
  );

  if (requestedTeamIds.some((teamId) => !mongoose.isValidObjectId(teamId))) {
    res.status(400);
    throw new Error("Invalid team id");
  }

  const selectedTeams = requestedTeamIds.length
    ? await Team.find(withTenantFilter({
        _id: { $in: requestedTeamIds },
        workspaceId,
      }, req.user))
        .select("_id name")
        .lean()
    : [];
  const selectedTeamIds = selectedTeams.map((team) => team._id);

  if (selectedTeams.length !== requestedTeamIds.length) {
    res.status(404);
    throw new Error("One or more selected teams could not be found in this workspace");
  }

  const normalizedEpicInputs = normalizeProjectEpicInputs(epics);
  let createGitPatch = {};

  if (git) {
    if (!canConfigureProjectDelivery(req.user.role)) {
      res.status(403);
      throw new Error("Only Admins and Managers can create Git settings");
    }

    const normalizedGit = normalizeGitConfiguration({
      payload: { git },
      project: {},
      tokenRequired: true,
    });

    if (normalizedGit.errors.length) {
      res.status(400);
      throw new Error(normalizedGit.errors.join(" "));
    }

    try {
      const testResult = await validateGitHubConfiguration({
        git: normalizedGit.git,
        token: normalizedGit.token,
      });
      const syncedCommitActivities = buildGitActivityEntriesFromGitHubCommits({
        branch: normalizedGit.git.defaultBranch,
        commits: testResult.commits,
        latestCommitDetails: testResult.latestCommitDetails,
      });

      createGitPatch = {
        git: appendGitAuditLog(
          {
            ...normalizedGit.git,
            encryptedToken: encryptGitToken(normalizedGit.token),
            tokenConfigured: true,
            tokenUpdatedAt: new Date(),
            status: testResult.status,
          },
          {
            action: "create",
            actor: req.user,
            message: "Git configuration tested and created.",
          }
        ),
        ...(syncedCommitActivities.length
          ? {
              gitActivityHistory: syncedCommitActivities,
              latestGitActivity: syncedCommitActivities[0],
            }
          : {}),
      };
    } catch (error) {
      res.status(400);
      throw new Error(`Git connection failed: ${error.message}`);
    }
  }

  const projectPayload = {
    name: name.trim(),
    description: typeof description === "string" ? description.trim() : "",
    shortCode,
    status: statusResult.value,
    priority: priorityResult.value,
    themeColor: normalizeThemeColor(themeColor),
    startDate: normalizeOptionalDate(startDate),
    targetDate: normalizeOptionalDate(targetDate),
    epics: normalizedEpicInputs.map((epic) => epic.name),
    manager: managerResult.value,
    projectManager: managerResult.value,
    teamLead: teamLeadResult.value,
    qaLead: qaLeadResult.value,
    attachedTeams: selectedTeamIds,
    teamIds: selectedTeamIds,
    workspaceId,
    tenantId,
    createdBy: userId,
    isCompleted: statusResult.value === "Completed",
    ...buildDeliveryWorkflowPatch(
      {
        ...(createGitPatch.git ? {} : { repository }),
        ...(createGitPatch.git ? { git: createGitPatch.git } : {}),
        deliveryWorkflow,
        deliveryModules,
        defaultTestSuites,
        testCases,
        latestGitActivity: createGitPatch.latestGitActivity || latestGitActivity,
        ...(createGitPatch.gitActivityHistory
          ? { gitActivityHistory: createGitPatch.gitActivityHistory }
          : {}),
      },
      {}
    ),
  };
  const project = await withTenantLimitLock(tenantId, async () => {
    await assertTenantCapacity({ tenantId, resource: "projects" });
    return Project.create(projectPayload);
  });

  if (normalizedEpicInputs.length) {
    await Epic.insertMany(
      normalizedEpicInputs.map((epic, index) => ({
        projectId: project._id,
        workspaceId,
        name: epic.name,
        description: "",
        color: "#3B82F6",
        startDate: epic.startDate,
        targetDate: epic.targetDate,
        planningOrder: (index + 1) * PLANNING_ORDER_INCREMENT,
        status: "ACTIVE",
        createdBy: userId,
      }))
    );
  }

  if (selectedTeamIds.length) {
    await ProjectTeam.insertMany(
      selectedTeamIds.map((teamId) => ({
        projectId: project._id,
        teamId,
      })),
      { ordered: false }
    );
  }

  res.status(201).json(await buildProjectResponse(project._id));
});

const updateProject = asyncHandler(async (req, res) => {
  if (!req.user) {
    res.status(401);
    throw new Error("Unauthorized");
  }

  if (!hasAdminAccess(req.user.role)) {
    res.status(403);
    throw new Error("Only admins and managers can update projects");
  }

  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400);
    throw new Error("Invalid project id");
  }

  const workspaceId = normalizeWorkspaceId(req.user.workspaceId);
  const project = await Project.findOne(withTenantFilter({
    _id: req.params.id,
    workspaceId,
  }, req.user));

  if (!project) {
    res.status(404);
    throw new Error("Project not found");
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "name")) {
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";

    if (!name) {
      res.status(400);
      throw new Error("Project name is required");
    }

    project.name = name;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "description")) {
    project.description =
      typeof req.body.description === "string" ? req.body.description.trim() : "";
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "status")) {
    const statusResult = normalizeProjectStatus(req.body.status, project.status || "Active");

    if (statusResult.error) {
      res.status(statusResult.error.status);
      throw new Error(statusResult.error.message);
    }

    project.status = statusResult.value;
    project.isCompleted = statusResult.value === "Completed";
  } else if (Object.prototype.hasOwnProperty.call(req.body, "isCompleted")) {
    const completedValueResult = parseProjectCompletedValue(req.body.isCompleted);

    if (completedValueResult.error) {
      res.status(completedValueResult.error.status);
      throw new Error(completedValueResult.error.message);
    }

    project.isCompleted = completedValueResult.value;
    project.status = completedValueResult.value ? "Completed" : "Active";
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "priority")) {
    const priorityResult = normalizeProjectPriority(
      req.body.priority,
      project.priority || "Medium"
    );

    if (priorityResult.error) {
      res.status(priorityResult.error.status);
      throw new Error(priorityResult.error.message);
    }

    project.priority = priorityResult.value;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "themeColor")) {
    project.themeColor = normalizeThemeColor(req.body.themeColor, project.themeColor);
  }

  const deliveryPatch = buildDeliveryWorkflowPatch(req.body, project);
  Object.entries(deliveryPatch).forEach(([key, value]) => {
    project[key] = value;
  });

  const hasProjectManagerInput =
    Object.prototype.hasOwnProperty.call(req.body, "projectManager") ||
    Object.prototype.hasOwnProperty.call(req.body, "manager");
  const hasTeamLeadInput = Object.prototype.hasOwnProperty.call(req.body, "teamLead");
  const hasQaLeadInput = Object.prototype.hasOwnProperty.call(req.body, "qaLead");

  if (hasProjectManagerInput || hasTeamLeadInput || hasQaLeadInput) {
    const [managerResult, teamLeadResult, qaLeadResult] = await Promise.all([
      hasProjectManagerInput
        ? loadWorkspaceUserAssignment({
            userId: Object.prototype.hasOwnProperty.call(req.body, "projectManager")
              ? req.body.projectManager
              : req.body.manager,
            workspaceId,
            reqUser: req.user,
            label: "Project manager",
            allowedRoles: ["Admin", "Manager"],
          })
        : Promise.resolve({ value: project.projectManager || project.manager || null }),
      hasTeamLeadInput
        ? loadWorkspaceUserAssignment({
            userId: req.body.teamLead,
            workspaceId,
            reqUser: req.user,
            label: "Team lead",
            allowedRoles: ["Team Lead"],
          })
        : Promise.resolve({ value: project.teamLead || null }),
      hasQaLeadInput
        ? loadWorkspaceUserAssignment({
            userId: req.body.qaLead,
            workspaceId,
            reqUser: req.user,
            label: "QA lead",
            allowedRoles: ["Admin", "Manager", "Tester", "Q/A Lead"],
          })
        : Promise.resolve({ value: project.qaLead || null }),
    ]);

    if (managerResult.error) {
      res.status(managerResult.error.status);
      throw new Error(managerResult.error.message);
    }

    if (teamLeadResult.error) {
      res.status(teamLeadResult.error.status);
      throw new Error(teamLeadResult.error.message);
    }

    if (qaLeadResult.error) {
      res.status(qaLeadResult.error.status);
      throw new Error(qaLeadResult.error.message);
    }

    if (hasProjectManagerInput) {
      project.manager = managerResult.value;
      project.projectManager = managerResult.value;
    }

    if (hasTeamLeadInput) {
      project.teamLead = teamLeadResult.value;
    }

    if (hasQaLeadInput) {
      project.qaLead = qaLeadResult.value;
    }
  }

  await project.save();

  res.status(200).json({
    message: "Project updated successfully",
    ...(await buildProjectResponse(project._id)),
  });
});

const updateProjectLeadership = updateProject;

const updateProjectDeliveryWorkflow = asyncHandler(async (req, res) => {
  if (!req.user) {
    res.status(401);
    throw new Error("Unauthorized");
  }

  if (!canConfigureProjectDelivery(req.user.role)) {
    res.status(403);
    throw new Error("Only Admins and Managers can configure Git settings");
  }

  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400);
    throw new Error("Invalid project id");
  }

  const workspaceId = normalizeWorkspaceId(req.user.workspaceId);
  const project = await Project.findOne(withTenantFilter({
    _id: req.params.id,
    workspaceId,
  }, req.user)).select("+git.encryptedToken");

  if (!project) {
    res.status(404);
    throw new Error("Project not found");
  }

  let requestBody = req.body;

  if (Object.prototype.hasOwnProperty.call(req.body, "git")) {
    const { errors, git, token } = normalizeGitConfiguration({
      payload: req.body,
      project,
      tokenRequired: true,
    });

    if (errors.length) {
      res.status(400);
      throw new Error(errors.join(" "));
    }

    try {
      const testResult = await validateGitHubConfiguration({
        git,
        token: getGitHubTokenForProject(project, token),
      });

      const nextGit = appendGitAuditLog(
        {
          ...git,
          encryptedToken: token ? encryptGitToken(token) : project.git?.encryptedToken || "",
          tokenConfigured: token ? true : project.git?.tokenConfigured || Boolean(project.git?.encryptedToken),
          tokenUpdatedAt: token ? new Date() : project.git?.tokenUpdatedAt || null,
          status: testResult.status,
        },
        {
          action: "save",
          actor: req.user,
          message: "Git configuration tested and saved.",
        }
      );

      requestBody = {
        ...req.body,
        git: nextGit,
      };

      const syncedCommitActivities = buildGitActivityEntriesFromGitHubCommits({
        branch: git.defaultBranch,
        commits: testResult.commits,
        latestCommitDetails: testResult.latestCommitDetails,
      });

      if (syncedCommitActivities.length) {
        requestBody.gitActivityHistory = syncedCommitActivities;
        requestBody.latestGitActivity = syncedCommitActivities[0];
      }
    } catch (error) {
      res.status(400);
      throw new Error(`Git connection failed: ${error.message}`);
    }
  }

  const deliveryPatch = buildDeliveryWorkflowPatch(requestBody, project);

  Object.entries(deliveryPatch).forEach(([key, value]) => {
    project[key] = value;
  });

  await project.save();

  req.app.get("io")?.to?.(`workspace:${workspaceId}`)?.emit?.("project_delivery_workflow_updated", {
    projectId: String(project._id),
    project: await buildProjectResponse(project._id),
  });

  res.status(200).json({
    message: "Project delivery workflow updated successfully",
    ...(await buildProjectResponse(project._id)),
  });
});

const testProjectGitConnection = asyncHandler(async (req, res) => {
  if (!req.user) {
    res.status(401);
    throw new Error("Unauthorized");
  }

  if (!canConfigureProjectDelivery(req.user.role)) {
    res.status(403);
    throw new Error("Only Admins and Managers can test Git settings");
  }

  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400);
    throw new Error("Invalid project id");
  }

  const workspaceId = normalizeWorkspaceId(req.user.workspaceId);
  const project = await Project.findOne(withTenantFilter({ _id: req.params.id, workspaceId }, req.user)).select("+git.encryptedToken");

  if (!project) {
    res.status(404);
    throw new Error("Project not found");
  }

  const { errors, git, token } = normalizeGitConfiguration({
    payload: req.body,
    project,
    tokenRequired: true,
  });

  if (errors.length) {
    res.status(400);
    throw new Error(errors.join(" "));
  }

  try {
    const result = await validateGitHubConfiguration({
      git,
      token: getGitHubTokenForProject(project, token),
    });

    project.git = appendGitAuditLog(
      {
        ...(project.git?.toObject?.() || project.git || {}),
        ...git,
        status: result.status,
      },
      {
        action: "test",
        actor: req.user,
        message: "GitHub connection test succeeded.",
      }
    );
    await project.save();

    res.status(200).json({
      message: "GitHub connection verified successfully.",
      status: result.status,
      permissions: {
        webhookAdministration: true,
        repository: "Accessible",
        branch: "Accessible",
      },
    });
  } catch (error) {
    res.status(400);
    throw new Error(`Git connection failed: ${error.message}`);
  }
});

const syncProjectGitRepository = asyncHandler(async (req, res) => {
  if (!req.user) {
    res.status(401);
    throw new Error("Unauthorized");
  }

  if (!canConfigureProjectDelivery(req.user.role)) {
    res.status(403);
    throw new Error("Only Admins and Managers can synchronize Git settings");
  }

  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400);
    throw new Error("Invalid project id");
  }

  const workspaceId = normalizeWorkspaceId(req.user.workspaceId);
  const project = await Project.findOne(withTenantFilter({ _id: req.params.id, workspaceId }, req.user)).select("+git.encryptedToken");

  if (!project) {
    res.status(404);
    throw new Error("Project not found");
  }

  const { errors, git } = normalizeGitConfiguration({
    payload: { git: project.git || project.repository || {} },
    project,
    tokenRequired: true,
  });

  if (errors.length) {
    res.status(400);
    throw new Error(errors.join(" "));
  }

  try {
    const result = await validateGitHubConfiguration({
      git,
      token: getGitHubTokenForProject(project),
    });
    const nextGit = appendGitAuditLog(
      {
        ...(project.git?.toObject?.() || project.git || {}),
        ...git,
        status: result.status,
      },
      {
        action: "sync",
        actor: req.user,
        message: "Repository metadata synchronized.",
      }
    );

    project.git = nextGit;
    const syncedActivity = normalizeGitActivityEntry({
      ...(project.latestGitActivity?.toObject?.() || project.latestGitActivity || {}),
      commitSha: result.status.latestCommitHash,
      commitMessage: result.status.latestCommitMessage,
      branch: git.defaultBranch,
      pushedAt: result.status.lastPushTime,
      pushedByName: req.user.name || req.user.email || "CureCode",
      event: "sync",
    });

    project.latestGitActivity = syncedActivity;

    const syncedCommitActivities = buildGitActivityEntriesFromGitHubCommits({
      branch: git.defaultBranch,
      commits: result.commits,
      latestCommitDetails: result.latestCommitDetails,
    });
    const activitiesToStore = syncedCommitActivities.length
      ? syncedCommitActivities
      : [syncedActivity];

    if (activitiesToStore.some(hasGitActivityEntry)) {
      project.gitActivityHistory = prependGitActivityHistory(
        project.gitActivityHistory || [],
        activitiesToStore
      );
    }
    await project.save();

    res.status(200).json({
      message: "Repository metadata synchronized successfully.",
      status: result.status,
      lastSyncTime: result.status.lastSyncTime,
      ...(await buildProjectResponse(project._id)),
    });
  } catch (error) {
    res.status(400);
    throw new Error(`Git synchronization failed: ${error.message}`);
  }
});

const normalizeProjectMemberRole = (value, fallback = "Developer") => {
  const allowedRoles = ["Developer", "Tester", "Q/A Lead", "Team Lead", "Manager"];
  const role = allowedRoles.find(
    (item) => item.toLowerCase() === String(value || "").trim().toLowerCase()
  );
  const fallbackRole = allowedRoles.includes(fallback) ? fallback : "Developer";

  return role || fallbackRole;
};

const addProjectMember = asyncHandler(async (req, res) => {
  if (!req.user) {
    res.status(401);
    throw new Error("Unauthorized");
  }

  if (!hasAdminAccess(req.user.role)) {
    res.status(403);
    throw new Error("Only admins and managers can manage project members");
  }

  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400);
    throw new Error("Invalid project id");
  }

  if (!mongoose.isValidObjectId(req.body.userId)) {
    res.status(400);
    throw new Error("Invalid user id");
  }

  const workspaceId = normalizeWorkspaceId(req.user.workspaceId);
  const [project, user] = await Promise.all([
    Project.findOne(withTenantFilter({
      _id: req.params.id,
      workspaceId,
    }, req.user))
      .select("_id workspaceId tenantId")
      .lean(),
    User.findOne(withTenantFilter({
      _id: req.body.userId,
      workspaceId,
    }, req.user))
      .select("_id name email role workspaceId tenantId")
      .lean(),
  ]);

  if (!project) {
    res.status(404);
    throw new Error("Project not found");
  }

  if (!user) {
    res.status(400);
    throw new Error("Selected user does not belong to this workspace");
  }

  const projectRole = normalizeProjectMemberRole(req.body.role, user.role);

  await ProjectMember.findOneAndUpdate(
    {
      projectId: project._id,
      userId: user._id,
    },
    {
      $set: {
        role: projectRole,
        updatedAt: new Date(),
      },
      $setOnInsert: {
        projectId: project._id,
        userId: user._id,
        createdAt: new Date(),
      },
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    }
  );

  res.status(200).json({
    message: `${user.name || user.email || "Member"} added to the project`,
    ...(await buildProjectResponse(project._id)),
  });
});

const removeProjectMember = asyncHandler(async (req, res) => {
  if (!req.user) {
    res.status(401);
    throw new Error("Unauthorized");
  }

  if (!hasAdminAccess(req.user.role)) {
    res.status(403);
    throw new Error("Only admins and managers can manage project members");
  }

  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400);
    throw new Error("Invalid project id");
  }

  if (!mongoose.isValidObjectId(req.params.userId)) {
    res.status(400);
    throw new Error("Invalid user id");
  }

  const workspaceId = normalizeWorkspaceId(req.user.workspaceId);
  const project = await Project.findOne(withTenantFilter({
    _id: req.params.id,
    workspaceId,
  }, req.user))
    .select("_id")
    .lean();

  if (!project) {
    res.status(404);
    throw new Error("Project not found");
  }

  const membership = await ProjectMember.findOneAndDelete({
    projectId: project._id,
    userId: req.params.userId,
  }).lean();

  if (!membership) {
    res.status(404);
    throw new Error("Member is not directly assigned to this project");
  }

  const removedUserId = new mongoose.Types.ObjectId(req.params.userId);
  await Issue.updateMany(
    {
      projectId: project._id,
      $or: [
        { assignee: removedUserId },
        { assignedDeveloperId: removedUserId },
        { "bugDetails.developerLead": removedUserId },
      ],
    },
    {
      $set: {
        assignee: null,
        assignedDeveloperId: null,
        assignedDeveloperName: "",
        "bugDetails.developerLead": null,
        updatedAt: new Date(),
        updatedBy: req.user._id,
      },
    }
  );

  res.status(200).json({
    message: "Member removed from the project",
    ...(await buildProjectResponse(project._id)),
  });
});

const deleteProject = asyncHandler(async (req, res) => {
  if (!req.user) {
    res.status(401);
    throw new Error("Unauthorized");
  }

  if (!hasAdminAccess(req.user.role)) {
    res.status(403);
    throw new Error("Only admins and managers can delete projects");
  }

  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400);
    throw new Error("Invalid project id");
  }

  const workspaceId = normalizeWorkspaceId(req.user.workspaceId);
  const project = await Project.findOne(withTenantFilter({
    _id: req.params.id,
    workspaceId,
  }, req.user))
    .select("_id")
    .lean();

  if (!project) {
    res.status(404);
    throw new Error("Project not found");
  }

  const issueIds = await Issue.find({
    projectId: project._id,
  }).distinct("_id");

  await Promise.all([
    issueIds.length
      ? Comment.deleteMany({
          issueId: {
            $in: issueIds,
          },
        })
      : Promise.resolve(),
    Issue.deleteMany({
      projectId: project._id,
    }),
    Epic.deleteMany({
      projectId: project._id,
    }),
    ProjectTeam.deleteMany({
      projectId: project._id,
    }),
    ProjectMember.deleteMany({
      projectId: project._id,
    }),
    ProjectMeeting.deleteMany({
      projectId: project._id,
    }),
    Project.deleteOne(withTenantFilter({
      _id: project._id,
      workspaceId,
    }, req.user)),
  ]);

  res.status(200).json({
    message: "Project deleted successfully",
  });
});

const attachProjectTeam = asyncHandler(async (req, res) => {
  if (!req.user) {
    res.status(401);
    throw new Error("Unauthorized");
  }

  if (!hasAdminAccess(req.user.role)) {
    res.status(403);
    throw new Error("Only admins and managers can attach teams to projects");
  }

  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400);
    throw new Error("Invalid project id");
  }

  if (!mongoose.isValidObjectId(req.body.teamId)) {
    res.status(400);
    throw new Error("Invalid team id");
  }

  const workspaceId = normalizeWorkspaceId(req.user.workspaceId);
  const [project, team, existingProjectTeam] = await Promise.all([
    Project.findOne(withTenantFilter({
      _id: req.params.id,
      workspaceId,
    }, req.user))
      .select("_id workspaceId tenantId attachedTeams teamIds")
      .lean(),
    Team.findOne(withTenantFilter({
      _id: req.body.teamId,
      workspaceId,
    }, req.user))
      .select("_id name workspaceId tenantId")
      .lean(),
    ProjectTeam.findOne({
      projectId: req.params.id,
      teamId: req.body.teamId,
    })
      .select("_id")
      .lean(),
  ]);

  if (!project) {
    res.status(404);
    throw new Error("Project not found");
  }

  if (!team) {
    res.status(404);
    throw new Error("Selected team could not be found in this workspace");
  }

  if (existingProjectTeam) {
    await Project.updateOne(
      withTenantFilter({
        _id: project._id,
        workspaceId,
      }, req.user),
      {
        $addToSet: {
          attachedTeams: team._id,
          teamIds: team._id,
        },
      }
    );

    res.status(200).json({
      message: `${team.name} is already attached to the project`,
      ...(await buildProjectResponse(project._id)),
    });
    return;
  }

  await Promise.all([
    ProjectTeam.create({
      projectId: project._id,
      teamId: team._id,
    }),
    Project.updateOne(
      withTenantFilter({
        _id: project._id,
        workspaceId,
      }, req.user),
      {
        $addToSet: {
          attachedTeams: team._id,
          teamIds: team._id,
        },
      }
    ),
  ]);

  res.status(200).json({
    message: `${team.name} attached to the project`,
    ...(await buildProjectResponse(project._id)),
  });
});

const getProjectTeams = asyncHandler(async (req, res) => {
  if (!req.user) {
    res.status(401);
    throw new Error("Unauthorized");
  }

  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400);
    throw new Error("Invalid project id");
  }

  const project = await Project.findOne({
    _id: req.params.id,
    ...(await buildProjectQuery(req.user)),
  })
    .lean();

  if (!project) {
    res.status(404);
    throw new Error("Project not found");
  }

  const workspaceId = normalizeWorkspaceId(project.workspaceId || req.user.workspaceId);
  logProjectTeamsDebug("Selected project teams request", {
    projectId: String(project._id),
    projectName: project.name || "",
    workspaceId,
    currentUserRole: req.user.role || "",
  });

  const projectTeams = await ProjectTeam.find({
    projectId: project._id,
  })
    .sort({ createdAt: 1 })
    .select("teamId")
    .lean();
  const teamIds = mergeProjectTeamIds(project, projectTeams);

  if (!teamIds.length) {
    logProjectTeamsDebug("Project teams API response", {
      projectId: String(project._id),
      responseShape: "array",
      projectTeamLinkCount: projectTeams.length,
      attachedTeamCount: 0,
      returnedTeamsCount: 0,
      currentUserRole: req.user.role || "",
      teams: [],
    });

    res.status(200).json([]);
    return;
  }

  const teams = await Team.find(withTenantFilter({
    _id: {
      $in: teamIds,
    },
    workspaceId,
  }, req.user)).lean();
  const serializedTeams = await attachMembersToTeams(teams, req.user);
  const teamsById = new Map(serializedTeams.map((team) => [String(team._id), team]));
  const orderedTeams = teamIds
    .map((teamId) => teamsById.get(teamId))
    .filter(Boolean);
  const missingTeamIds = teamIds.filter((teamId) => !teamsById.has(teamId));

  if (missingTeamIds.length) {
    logProjectTeamsWarning("Project team links exist but some teams were not returned", {
      projectId: String(project._id),
      workspaceId,
      currentUserRole: req.user.role || "",
      projectTeamLinkCount: projectTeams.length,
      attachedTeamCount: teamIds.length,
      returnedTeamsCount: orderedTeams.length,
      missingTeamIds,
    });
  }

  logProjectTeamsDebug("Project teams API response", {
    projectId: String(project._id),
    responseShape: "array",
    projectTeamLinkCount: projectTeams.length,
    attachedTeamCount: teamIds.length,
    returnedTeamsCount: orderedTeams.length,
    currentUserRole: req.user.role || "",
    teams: summarizeTeams(orderedTeams),
  });

  res.status(200).json(orderedTeams);
});

const detachProjectTeam = asyncHandler(async (req, res) => {
  if (!req.user) {
    res.status(401);
    throw new Error("Unauthorized");
  }

  if (!hasAdminAccess(req.user.role)) {
    res.status(403);
    throw new Error("Only admins and managers can detach teams from projects");
  }

  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400);
    throw new Error("Invalid project id");
  }

  if (!mongoose.isValidObjectId(req.params.teamId)) {
    res.status(400);
    throw new Error("Invalid team id");
  }

  const workspaceId = normalizeWorkspaceId(req.user.workspaceId);
  const [project, team, projectTeam] = await Promise.all([
    Project.findOne(withTenantFilter({
      _id: req.params.id,
      workspaceId,
    }, req.user))
      .select("_id workspaceId tenantId attachedTeams teamIds")
      .lean(),
    Team.findOne(withTenantFilter({
      _id: req.params.teamId,
      workspaceId,
    }, req.user))
      .select("_id name tenantId")
      .lean(),
    ProjectTeam.findOne({
      projectId: req.params.id,
      teamId: req.params.teamId,
    })
      .select("_id")
      .lean(),
  ]);

  if (!project) {
    res.status(404);
    throw new Error("Project not found");
  }

  if (!team) {
    res.status(404);
    throw new Error("Selected team could not be found in this workspace");
  }

  const hasInlineProjectTeam = mergeProjectTeamIds(project, []).some(
    (teamId) => String(teamId) === String(req.params.teamId)
  );

  if (!projectTeam && !hasInlineProjectTeam) {
    res.status(404);
    throw new Error("This team is not attached to the project");
  }

  const activeIssueFilter = {
    projectId: project._id,
    teamId: team._id,
    status: {
      $nin: CLOSED_DETACH_STATUS_VALUES,
    },
  };

  const activeIssueCount = await Issue.countDocuments(activeIssueFilter);

  await Promise.all([
    projectTeam
      ? ProjectTeam.deleteOne({
          _id: projectTeam._id,
        })
      : Promise.resolve(),
    Project.updateOne(
      withTenantFilter({
        _id: project._id,
        workspaceId,
      }, req.user),
      {
        $pull: {
          attachedTeams: team._id,
          teamIds: team._id,
        },
      }
    ),
    activeIssueCount
      ? Issue.updateMany(activeIssueFilter, {
          $unset: {
            teamId: "",
            team: "",
          },
        })
      : Promise.resolve(),
  ]);

  res.status(200).json({
    message: `${team.name} detached from the project${
      activeIssueCount
        ? ` and removed from ${activeIssueCount} active work item${
            activeIssueCount === 1 ? "" : "s"
          }`
        : ""
    }`,
    ...(await buildProjectResponse(project._id)),
  });
});

const updateProjectStatus = asyncHandler(async (req, res) => {
  if (!req.user) {
    res.status(401);
    throw new Error("Unauthorized");
  }

  if (!hasAdminAccess(req.user.role)) {
    res.status(403);
    throw new Error("Only admins and managers can update project status");
  }

  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400);
    throw new Error("Invalid project id");
  }

  const completedValueResult = parseProjectCompletedValue(req.body?.isCompleted);

  if (completedValueResult.error) {
    res.status(completedValueResult.error.status);
    throw new Error(completedValueResult.error.message);
  }

  const workspaceId = normalizeWorkspaceId(req.user.workspaceId);
  const project = await Project.findOne(withTenantFilter({
    _id: req.params.id,
    workspaceId,
  }, req.user));

  if (!project) {
    res.status(404);
    throw new Error("Project not found");
  }

  project.isCompleted = completedValueResult.value;
  project.status = completedValueResult.value ? "Completed" : "Active";
  await project.save();

  res.status(200).json({
    message: project.isCompleted ? "Project marked as completed" : "Project reopened",
    ...(await buildProjectResponse(project._id)),
  });
});

const scheduleProjectMeeting = asyncHandler(async (req, res) => {
  if (!req.user) {
    res.status(401);
    throw new Error("Unauthorized");
  }

  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400);
    throw new Error("Invalid project id");
  }

  const subject = typeof req.body?.subject === "string" ? req.body.subject.trim() : "";
  const meetingUrl = typeof req.body?.meetingUrl === "string"
    ? req.body.meetingUrl.trim()
    : typeof req.body?.joinUrl === "string"
      ? req.body.joinUrl.trim()
      : "";
  const meetingWindow = resolveMeetingWindow({
    startDateTime: req.body?.startDateTime,
    endDateTime: req.body?.endDateTime,
    durationMinutes: req.body?.durationMinutes,
  });

  if (!subject) {
    res.status(400);
    throw new Error("Meeting title is required");
  }

  if (!meetingUrl.startsWith(TEAMS_MEETING_URL_PREFIX)) {
    res.status(400);
    throw new Error("Please enter a valid Microsoft Teams meeting link.");
  }

  if (meetingWindow.error) {
    res.status(400);
    throw new Error(meetingWindow.error);
  }

  const { startDate, endDate, durationMinutes } = meetingWindow;
  const project = await loadAccessibleProject(req.user, req.params.id);

  if (!project) {
    res.status(404);
    throw new Error("Project not found");
  }

  const workspaceId = normalizeWorkspaceId(req.user.workspaceId);
  const mailWorkspaceId = normalizeWorkspaceId(project.workspaceId || workspaceId);
  const participants = await getAttachedTeamParticipants({
    projectId: project._id,
    workspaceId,
    user: req.user,
  });

  if (!participants.length) {
    res.status(400);
    throw new Error("No users found in attached teams. Attach a team with members first.");
  }

  const meeting = await ProjectMeeting.create({
    projectId: project._id,
    workspaceId,
    scheduledBy: req.user._id,
    provider: "microsoft_teams",
    subject,
    meetingId: `manual-${Date.now()}`,
    joinUrl: meetingUrl,
    startDateTime: startDate,
    endDateTime: endDate,
    durationMinutes,
    participants: participants.map((participant) => ({
      userId: participant.userId,
      name: participant.name,
      email: participant.email,
      role: participant.role,
    })),
  });

  let inviteWarning = "";

  try {
    await sendProjectMeetingInviteEmail(
      participants.map((participant) => participant.email),
      {
        subject: meeting.subject,
        joinUrl: meeting.joinUrl,
        startDateTime: meeting.startDateTime,
        endDateTime: meeting.endDateTime,
        projectName: project.name,
        durationMinutes: meeting.durationMinutes,
        participants,
      },
      {
        workspaceId: mailWorkspaceId,
        senderUserId: canUseMeetingSchedulerSender(req.user.role) ? req.user._id : null,
      }
    );
  } catch (inviteError) {
    inviteWarning =
      "Meeting created, but invite emails could not be sent right now.";
    console.error("[project-meetings] Failed to send meeting invites", {
      projectId: String(project._id),
      error: inviteError?.message || inviteError,
    });
  }

  res.status(201).json({
    message: "Meeting scheduled successfully",
    meeting: serializeProjectMeeting(meeting),
    warning: inviteWarning || undefined,
  });
});

const getProjectMeetings = asyncHandler(async (req, res) => {
  if (!req.user) {
    res.status(401);
    throw new Error("Unauthorized");
  }

  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400);
    throw new Error("Invalid project id");
  }

  const project = await loadAccessibleProject(req.user, req.params.id);

  if (!project) {
    res.status(404);
    throw new Error("Project not found");
  }

  const workspaceId = normalizeWorkspaceId(req.user.workspaceId);
  const meetings = await ProjectMeeting.find({
    projectId: req.params.id,
    workspaceId,
    endDateTime: {
      $gte: new Date(),
    },
  })
    .sort({ startDateTime: 1 })
    .limit(8)
    .lean();

  res.status(200).json(meetings.map(serializeProjectMeeting).filter(Boolean));
});

module.exports = {
  getProjects,
  getProjectTeams,
  createProject,
  updateProject,
  updateProjectLeadership,
  updateProjectDeliveryWorkflow,
  testProjectGitConnection,
  syncProjectGitRepository,
  addProjectMember,
  removeProjectMember,
  deleteProject,
  attachProjectTeam,
  detachProjectTeam,
  updateProjectStatus,
  scheduleProjectMeeting,
  getProjectMeetings,
};
