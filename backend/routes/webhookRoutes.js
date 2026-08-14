const express = require("express");
const Project = require("../models/Project");
const { notifyGitPushEvent } = require("../services/notificationService");
const { decryptGitToken } = require("../utils/gitTokenCrypto");
const { normalizeWorkspaceId } = require("../utils/workspace");

const router = express.Router();

const normalizeString = (value = "") => String(value || "").trim();

const getGithubRepositoryIdentity = (payload = {}) => {
  const repository = payload.repository || {};
  const fullName = normalizeString(repository.full_name);
  const [ownerFromFullName, nameFromFullName] = fullName.split("/");

  return {
    owner: normalizeString(repository.owner?.login || repository.owner?.name || ownerFromFullName),
    name: normalizeString(repository.name || nameFromFullName),
    fullName,
    url: normalizeString(repository.html_url || repository.url),
  };
};

const getLatestCommit = (payload = {}) => {
  if (payload.head_commit) {
    return payload.head_commit;
  }

  if (Array.isArray(payload.commits) && payload.commits.length) {
    return payload.commits[payload.commits.length - 1];
  }

  if (payload.workflow_run?.head_sha) {
    return {
      id: payload.workflow_run.head_sha,
      message: payload.workflow_run.display_title || payload.workflow_run.name || "Workflow run updated",
      timestamp: payload.workflow_run.updated_at || payload.workflow_run.created_at,
    };
  }

  if (payload.release?.tag_name) {
    return {
      id: payload.release.tag_name,
      message: payload.release.name || payload.release.tag_name,
      timestamp: payload.release.published_at || payload.release.created_at,
    };
  }

  return null;
};

const findProjectForGithubRepository = async ({ owner, name, fullName, url }) => {
  const ownerRegex = owner ? new RegExp(`^${owner.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") : null;
  const nameRegex = name ? new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") : null;

  return Project.findOne({
    $or: [
      ...(ownerRegex && nameRegex
        ? [{ "git.repositoryOwner": ownerRegex, "git.repositoryName": nameRegex }]
        : []),
      ...(fullName ? [{ "repository.repositoryIdentifier": fullName }] : []),
      ...(nameRegex ? [{ "repository.name": nameRegex }] : []),
      ...(url ? [{ "git.repositoryUrl": url }, { "repository.url": url }] : []),
    ],
  }).select("+git.encryptedToken");
};

const getGitHubCommitStats = async ({ owner, repo, sha, token }) => {
  if (!owner || !repo || !sha) {
    return null;
  }

  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "CureCode-Git-Webhook",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits/${encodeURIComponent(sha)}`,
    { headers }
  );

  if (!response.ok) {
    return null;
  }

  const data = await response.json().catch(() => null);

  return data?.stats || null;
};

const getCommitFiles = (commit = {}) =>
  Array.from(
    new Set(
      [
        ...(Array.isArray(commit.added) ? commit.added : []),
        ...(Array.isArray(commit.modified) ? commit.modified : []),
        ...(Array.isArray(commit.removed) ? commit.removed : []),
      ].filter(Boolean)
    )
  );

const getActivityKey = (activity = {}) =>
  [normalizeString(activity.commitSha), activity.pushedAt ? new Date(activity.pushedAt).getTime() : ""]
    .filter(Boolean)
    .join(":");

const prependGitActivityHistory = (project, activities = []) => {
  const existingHistory = Array.isArray(project.gitActivityHistory)
    ? project.gitActivityHistory.map((activity) => activity?.toObject?.() || activity)
    : [];
  const seen = new Set();

  project.gitActivityHistory = [...activities, ...existingHistory]
    .filter((activity) => hasGitActivity(activity))
    .filter((activity) => {
      const key = getActivityKey(activity);

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

const hasGitActivity = (activity = {}) =>
  Boolean(
    normalizeString(activity.commitSha) ||
      activity.pushedAt ||
      normalizeString(activity.commitMessage)
  );

router.post("/github", async (req, res) => {
  const eventName = normalizeString(req.get("x-github-event") || "unknown");
  const deliveryId = normalizeString(req.get("x-github-delivery"));
  const payload = req.body || {};

  if (eventName === "ping") {
    return res.status(200).json({
      message: "CureCode GitHub webhook is reachable.",
      deliveryId,
    });
  }

  const repositoryIdentity = getGithubRepositoryIdentity(payload);

  if (!repositoryIdentity.owner || !repositoryIdentity.name) {
    return res.status(400).json({
      message: "GitHub webhook payload is missing repository owner or name.",
    });
  }

  const project = await findProjectForGithubRepository(repositoryIdentity);

  if (!project) {
    return res.status(404).json({
      message: "No CureCode project is configured for this GitHub repository.",
      repository: repositoryIdentity.fullName || `${repositoryIdentity.owner}/${repositoryIdentity.name}`,
    });
  }

  const commit = getLatestCommit(payload);
  const branch =
    normalizeString(payload.ref).replace(/^refs\/heads\//, "").replace(/^refs\/tags\//, "") ||
    normalizeString(payload.workflow_run?.head_branch) ||
    project.git?.defaultBranch ||
    project.repository?.defaultBranch ||
    "main";
  const pushedAt = commit?.timestamp ? new Date(commit.timestamp) : new Date();
  const latestCommitHash = normalizeString(commit?.id || commit?.sha || payload.after || payload.workflow_run?.head_sha);
  const latestCommitMessage = normalizeString(commit?.message || payload.action || eventName);
  const commits = Array.isArray(payload.commits) ? payload.commits : [];
  const addedFiles = new Set(commits.flatMap((item) => item.added || []).filter(Boolean));
  const removedFiles = new Set(commits.flatMap((item) => item.removed || []).filter(Boolean));
  let commitStats = null;

  try {
    const token = project.git?.encryptedToken ? decryptGitToken(project.git.encryptedToken) : "";
    commitStats = await getGitHubCommitStats({
      owner: repositoryIdentity.owner,
      repo: repositoryIdentity.name,
      sha: latestCommitHash,
      token,
    });
  } catch {
    commitStats = null;
  }

  const latestActivity = {
    ...(project.latestGitActivity?.toObject?.() || project.latestGitActivity || {}),
    commitSha: latestCommitHash,
    commitMessage: latestCommitMessage,
    branch,
    pushedByName: normalizeString(payload.sender?.login || payload.pusher?.name),
    pushedAt,
    filesChanged: Array.from(
      new Set(
        commits
          .flatMap((item) => [
            ...(item.added || []),
            ...(item.modified || []),
            ...(item.removed || []),
          ])
          .filter(Boolean)
      )
    ),
    additions: Number.isFinite(Number(commitStats?.additions)) ? Number(commitStats.additions) : addedFiles.size,
    deletions: Number.isFinite(Number(commitStats?.deletions)) ? Number(commitStats.deletions) : removedFiles.size,
    event: eventName,
    deliveryId,
    recordedAt: new Date(),
  };
  const activityHistoryEntries = (commits.length ? commits : [commit])
    .filter(Boolean)
    .map((item) => {
      const commitSha = normalizeString(item.id || item.sha);
      const isLatestCommit = commitSha && commitSha === latestCommitHash;
      const filesChanged = getCommitFiles(item);
      const commitRemovedFiles = Array.isArray(item.removed) ? item.removed.filter(Boolean).length : 0;

      return {
        commitSha,
        commitMessage: normalizeString(item.message || latestCommitMessage),
        branch,
        pushedByName: normalizeString(item.author?.username || item.author?.name || payload.sender?.login || payload.pusher?.name),
        pushedAt: item.timestamp ? new Date(item.timestamp) : pushedAt,
        filesChanged,
        additions: isLatestCommit && Number.isFinite(Number(commitStats?.additions)) ? Number(commitStats.additions) : filesChanged.length,
        deletions: isLatestCommit && Number.isFinite(Number(commitStats?.deletions)) ? Number(commitStats.deletions) : commitRemovedFiles,
        modulesChanged: [],
        qaStatus: "Waiting for QA",
        event: eventName,
        deliveryId,
        recordedAt: new Date(),
      };
    });

  project.latestGitActivity = latestActivity;
  prependGitActivityHistory(project, activityHistoryEntries.length ? activityHistoryEntries : [latestActivity]);

  project.git = {
    ...(project.git?.toObject?.() || project.git || {}),
    provider: "GitHub",
    repositoryOwner: project.git?.repositoryOwner || repositoryIdentity.owner,
    repositoryName: project.git?.repositoryName || repositoryIdentity.name,
    repositoryUrl: project.git?.repositoryUrl || repositoryIdentity.url,
    status: {
      ...(project.git?.status?.toObject?.() || project.git?.status || {}),
      connectionStatus: "Connected",
      latestCommitHash,
      latestCommitMessage,
      lastPushTime: pushedAt,
      lastSyncTime: new Date(),
      webhookStatus: "Receiving Events",
      connectionHealth: "Healthy",
      lastError: "",
    },
    auditLog: [
      ...(Array.isArray(project.git?.auditLog) ? project.git.auditLog : []),
      {
        action: "webhook",
        actor: null,
        actorName: "GitHub",
        message: `Received ${eventName} webhook${deliveryId ? ` (${deliveryId})` : ""}.`,
        createdAt: new Date(),
      },
    ].slice(-50),
  };

  await project.save();

  if (eventName === "push") {
    try {
      await notifyGitPushEvent({
        project,
        branch,
        commitSha: latestCommitHash,
        commitMessage: latestCommitMessage,
        pushedByName: project.latestGitActivity?.pushedByName,
      });
    } catch (error) {
      console.error("[webhookRoutes] Error creating Git push notifications:", error);
    }
  }

  req.app.get("io")?.to?.(`workspace:${normalizeWorkspaceId(project.workspaceId)}`)?.emit?.(
    "project_git_webhook_received",
    {
      projectId: String(project._id),
      event: eventName,
      latestGitActivity: project.latestGitActivity,
      gitStatus: project.git.status,
    }
  );

  return res.status(200).json({
    message: "GitHub webhook processed.",
    projectId: project._id,
    event: eventName,
  });
});

module.exports = router;
