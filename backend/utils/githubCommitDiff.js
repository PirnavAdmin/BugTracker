const { decryptGitToken } = require("./gitTokenCrypto");

const MAX_PATCH_CHARS = 28000;

const normalizeString = (value = "") => String(value || "").trim();

const callGitHubCommitApi = async ({ owner, repo, sha, token }) => {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "CureCode-AI-Code-Review",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits/${encodeURIComponent(sha)}`,
    { headers }
  );
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data?.message || `GitHub commit lookup failed with status ${response.status}`);
    error.status = response.status;
    throw error;
  }

  return data;
};

const getProjectGitToken = (project) =>
  project?.git?.encryptedToken ? decryptGitToken(project.git.encryptedToken) : "";

const getCommitDiffForProject = async ({ project, commitSha }) => {
  const git = project?.git || {};
  const owner = normalizeString(git.repositoryOwner);
  const repo = normalizeString(git.repositoryName);
  const sha = normalizeString(commitSha);

  if (!owner || !repo || !sha) {
    const error = new Error("Project Git repository and commit SHA are required.");
    error.statusCode = 400;
    throw error;
  }

  const commit = await callGitHubCommitApi({
    owner,
    repo,
    sha,
    token: getProjectGitToken(project),
  });
  let usedChars = 0;
  const files = (Array.isArray(commit.files) ? commit.files : []).map((file) => {
    const patch = normalizeString(file.patch);
    const remainingChars = Math.max(0, MAX_PATCH_CHARS - usedChars);
    const limitedPatch = patch.slice(0, remainingChars);
    usedChars += limitedPatch.length;

    return {
      filename: normalizeString(file.filename),
      status: normalizeString(file.status),
      additions: Number(file.additions) || 0,
      deletions: Number(file.deletions) || 0,
      changes: Number(file.changes) || 0,
      patch: limitedPatch,
      patchTruncated: patch.length > limitedPatch.length,
    };
  });

  return {
    sha: normalizeString(commit.sha || sha),
    message: normalizeString(commit.commit?.message),
    stats: {
      additions: Number(commit.stats?.additions) || 0,
      deletions: Number(commit.stats?.deletions) || 0,
      total: Number(commit.stats?.total) || 0,
    },
    files,
    truncated: usedChars >= MAX_PATCH_CHARS,
  };
};

module.exports = {
  getCommitDiffForProject,
};
