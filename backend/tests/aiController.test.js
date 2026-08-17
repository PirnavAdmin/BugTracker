const { test } = require("node:test");
const assert = require("node:assert");
const aiService = require("../services/aiService");
const githubCommitDiff = require("../utils/githubCommitDiff");
const Project = require("../models/Project");
const {
  generateWorkItemDescription,
  reviewCodeForCommit,
} = require("../controllers/aiController");
const { ROLE_ADMIN } = require("../utils/roles");

const originalGenerateWorkItemDescription = aiService.generateWorkItemDescription;
const originalGenerateCodeReview = aiService.generateCodeReview;
const originalGetCommitDiffForProject = githubCommitDiff.getCommitDiffForProject;
const originalProjectFindOne = Project.findOne;

const createResponse = () => {
  let body;

  return {
    get body() {
      return body;
    },
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      body = payload;
      return this;
    },
  };
};

const callController = async (body) => {
  const req = { body };
  const res = createResponse();

  await generateWorkItemDescription(req, res, () => {});

  return res;
};

const callReviewController = async (body, project) => {
  const req = {
    body,
    user: {
      _id: "user-1",
      id: "user-1",
      role: ROLE_ADMIN,
      workspaceId: "workspace-1",
    },
  };
  const res = createResponse();
  let nextError;

  Project.findOne = () => ({
    select: async () => project,
  });

  await reviewCodeForCommit(req, res, (error) => {
    nextError = error;
  });

  return { res, nextError };
};

const createProjectDoc = (overrides = {}) => ({
  _id: "project-1",
  name: "CureCode",
  workspaceId: "workspace-1",
  git: {
    repositoryOwner: "pradeep",
    repositoryName: "curecode",
  },
  latestGitActivity: {
    commitSha: "abc123",
    commitMessage: "Add AI review",
    branch: "dev2",
    filesChanged: ["backend/controllers/aiController.js"],
    modulesChanged: ["AI"],
    aiReview: { status: "NOT_REVIEWED" },
  },
  gitActivityHistory: [],
  saveCount: 0,
  async save() {
    this.saveCount += 1;
  },
  ...overrides,
});

test.afterEach(() => {
  aiService.generateWorkItemDescription = originalGenerateWorkItemDescription;
  aiService.generateCodeReview = originalGenerateCodeReview;
  githubCommitDiff.getCommitDiffForProject = originalGetCommitDiffForProject;
  Project.findOne = originalProjectFindOne;
});

test("validates task description generation request", async () => {
  let receivedPayload;
  aiService.generateWorkItemDescription = async (payload) => {
    receivedPayload = payload;
    return "## Objective\n\nAdd forgot password support.";
  };

  const res = await callController({
    title: " Add forgot password feature ",
    workItemType: "Task",
    projectName: "CureCode",
    priority: "Medium",
  });

  assert.strictEqual(res.statusCode, 200);
  assert.deepStrictEqual(receivedPayload, {
    title: "Add forgot password feature",
    workItemType: "Task",
    projectName: "CureCode",
    priority: "Medium",
  });
  assert.deepStrictEqual(res.body, {
    success: true,
    description: "## Objective\n\nAdd forgot password support.",
  });
});

test("validates bug description generation request", async () => {
  let receivedPayload;
  aiService.generateWorkItemDescription = async (payload) => {
    receivedPayload = payload;
    return "## Problem\n\nThe login page crashes after password reset.";
  };

  const res = await callController({
    title: "Login page crashes after password reset",
    workItemType: "Bug",
    projectName: "CureCode",
    priority: "High",
  });

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(receivedPayload.workItemType, "Bug");
  assert.strictEqual(res.body.success, true);
  assert.match(res.body.description, /^## Problem/);
});

test("rejects missing title", async () => {
  const res = await callController({
    workItemType: "Task",
  });

  assert.strictEqual(res.statusCode, 400);
  assert.deepStrictEqual(res.body, {
    success: false,
    message: "Title is required",
  });
});

test("rejects empty title", async () => {
  const res = await callController({
    title: "   ",
    workItemType: "Task",
  });

  assert.strictEqual(res.statusCode, 400);
  assert.deepStrictEqual(res.body, {
    success: false,
    message: "Title is required",
  });
});

test("rejects unsupported workItemType", async () => {
  const res = await callController({
    title: "Create release notes",
    workItemType: "Story",
  });

  assert.strictEqual(res.statusCode, 400);
  assert.deepStrictEqual(res.body, {
    success: false,
    message: "Unsupported workItemType",
  });
});

test("returns successful service response", async () => {
  aiService.generateWorkItemDescription = async () => "## Objective\n\nGenerated.";

  const res = await callController({
    title: "Generate task description",
    workItemType: "Task",
  });

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.description, "## Objective\n\nGenerated.");
});

test("handles Bedrock service failure without exposing raw errors", async () => {
  aiService.generateWorkItemDescription = async () => {
    throw new Error("AccessDeniedException: sensitive provider detail");
  };

  const res = await callController({
    title: "Generate task description",
    workItemType: "Task",
  });

  assert.strictEqual(res.statusCode, 502);
  assert.deepStrictEqual(res.body, {
    success: false,
    message: "Unable to generate description at the moment.",
  });
});

test("handles empty AI service response as a sanitized failure", async () => {
  aiService.generateWorkItemDescription = async () => "   ";

  const res = await callController({
    title: "Generate task description",
    workItemType: "Task",
  });

  assert.strictEqual(res.statusCode, 502);
  assert.deepStrictEqual(res.body, {
    success: false,
    message: "Unable to generate description at the moment.",
  });
});

test("AI code review returns cached completed review without fetching diff", async () => {
  const project = createProjectDoc({
    latestGitActivity: {
      commitSha: "abc123",
      commitMessage: "Cached review",
      branch: "dev2",
      filesChanged: ["frontend/src/App.jsx"],
      modulesChanged: ["UI"],
      aiReview: {
        status: "COMPLETED",
        score: 94,
        rating: "Good",
        summary: "Looks good.",
        findings: [],
      },
    },
  });
  githubCommitDiff.getCommitDiffForProject = async () => {
    throw new Error("diff should not be fetched");
  };

  const { res, nextError } = await callReviewController(
    { projectId: "project-1", commitSha: "abc123" },
    project
  );

  assert.ifError(nextError);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.cached, true);
  assert.strictEqual(res.body.review.score, 94);
  assert.strictEqual(project.saveCount, 0);
});

test("AI code review saves generated review to latest activity and history", async () => {
  const project = createProjectDoc({
    gitActivityHistory: [
      {
        commitSha: "abc123",
        commitMessage: "Add AI review",
        branch: "dev2",
        filesChanged: ["backend/controllers/aiController.js"],
        modulesChanged: ["AI"],
        aiReview: { status: "NOT_REVIEWED" },
      },
    ],
  });
  let diffRequested = false;
  let reviewPayload;
  githubCommitDiff.getCommitDiffForProject = async ({ commitSha }) => {
    diffRequested = commitSha === "abc123";
    return {
      message: "Add AI review",
      files: [
        {
          filename: "backend/controllers/aiController.js",
          patch: "@@ -1 +1 @@\n-old\n+new",
        },
      ],
    };
  };
  aiService.generateCodeReview = async (payload) => {
    reviewPayload = payload;
    return {
      score: 81,
      rating: "Needs Attention",
      summary: "Review summary.",
      findings: [
        {
          severity: "HIGH",
          title: "Validate input",
          file: "backend/controllers/aiController.js",
          line: null,
          confidence: 80,
          description: "Input needs validation.",
          recommendation: "Validate the request payload.",
        },
      ],
      testingRecommendations: ["Add controller tests."],
      positiveObservations: [],
    };
  };

  const { res, nextError } = await callReviewController(
    { projectId: "project-1", commitSha: "abc123" },
    project
  );

  assert.ifError(nextError);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.cached, false);
  assert.strictEqual(res.body.review.status, "COMPLETED");
  assert.strictEqual(project.latestGitActivity.aiReview.score, 81);
  assert.strictEqual(project.gitActivityHistory[0].aiReview.score, 81);
  assert.strictEqual(project.saveCount, 2);
  assert.strictEqual(diffRequested, true);
  assert.strictEqual(reviewPayload.repository, "pradeep/curecode");
});

test("AI code review marks failed state when review generation fails", async () => {
  const project = createProjectDoc();
  githubCommitDiff.getCommitDiffForProject = async () => ({
    files: [{ filename: "app.js", patch: "@@ -1 +1 @@\n-old\n+new" }],
  });
  aiService.generateCodeReview = async () => {
    throw new Error("provider unavailable");
  };

  const { res, nextError } = await callReviewController(
    { projectId: "project-1", commitSha: "abc123" },
    project
  );

  assert.ifError(nextError);
  assert.strictEqual(res.statusCode, 502);
  assert.strictEqual(res.body.success, false);
  assert.strictEqual(res.body.message, "Unable to complete review.");
  assert.strictEqual(res.body.review.status, "FAILED");
  assert.strictEqual(res.body.review.error, "Unable to complete review.");
  assert.deepStrictEqual(res.body.review.findings, []);
  assert.deepStrictEqual(res.body.review.security, []);
  assert.deepStrictEqual(res.body.review.performance, []);
  assert.deepStrictEqual(res.body.review.codeQuality, []);
  assert.deepStrictEqual(res.body.review.regressionRisk, {
    level: "low",
    areas: [],
    reason: "",
  });
  assert.deepStrictEqual(res.body.review.testing, {
    risk: "low",
    recommendedTests: [],
    edgeCases: [],
    affectedModules: [],
  });
  assert.deepStrictEqual(res.body.review.release, {
    readiness: "needs_attention",
    risks: [],
    recommendations: [],
  });
  assert.strictEqual(res.body.review.reviewedAt, project.latestGitActivity.aiReview.reviewedAt);
  assert.strictEqual(project.latestGitActivity.aiReview.status, "FAILED");
  assert.strictEqual(project.saveCount, 2);
});

test("AI code review marks failed state when GitHub diff lookup fails", async () => {
  const project = createProjectDoc();
  githubCommitDiff.getCommitDiffForProject = async () => {
    throw new Error("GitHub commit lookup failed");
  };
  aiService.generateCodeReview = async () => {
    throw new Error("review should not be generated");
  };

  const { res, nextError } = await callReviewController(
    { projectId: "project-1", commitSha: "abc123" },
    project
  );

  assert.ifError(nextError);
  assert.strictEqual(res.statusCode, 502);
  assert.strictEqual(res.body.review.status, "FAILED");
  assert.strictEqual(project.latestGitActivity.aiReview.status, "FAILED");
  assert.strictEqual(project.saveCount, 2);
});

test("AI code review rejects missing project or commit identifiers", async () => {
  const project = createProjectDoc();
  const missingProject = await callReviewController({ commitSha: "abc123" }, project);
  const missingCommit = await callReviewController({ projectId: "project-1" }, project);

  assert.strictEqual(missingProject.res.statusCode, 400);
  assert.strictEqual(missingProject.res.body.message, "Project is required");
  assert.strictEqual(missingCommit.res.statusCode, 400);
  assert.strictEqual(missingCommit.res.body.message, "Commit SHA is required");
});

test("AI code review rejects unauthorized or missing projects", async () => {
  const { res, nextError } = await callReviewController(
    { projectId: "project-1", commitSha: "abc123" },
    null
  );

  assert.strictEqual(res.statusCode, 404);
  assert.match(nextError?.message || "", /Project not found/);
});

test("AI code review returns not found when commit is not in project activity", async () => {
  const project = createProjectDoc();

  const { res, nextError } = await callReviewController(
    { projectId: "project-1", commitSha: "missing" },
    project
  );

  assert.ifError(nextError);
  assert.strictEqual(res.statusCode, 404);
  assert.strictEqual(res.body.message, "Commit was not found in this project's Git activity.");
});
