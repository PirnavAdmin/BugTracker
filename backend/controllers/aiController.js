const asyncHandler = require("../utils/asyncHandler");
const aiService = require("../services/aiService");
const Project = require("../models/Project");
const githubCommitDiff = require("../utils/githubCommitDiff");
const { buildProjectAccessQuery } = require("../utils/projectRelations");
const { reviewCodeChanges } = require("../services/aiCodeReviewService");

const MAX_TITLE_LENGTH = 180;
const MAX_OPTIONAL_FIELD_LENGTH = 120;
const MAX_REVIEW_CONTEXT_LENGTH = 4000;
const MAX_DIFF_LENGTH = 60000;
const SUPPORTED_WORK_ITEM_TYPES = new Set(["Task", "Bug"]);

const normalizeWorkItemType = (value = "Task") => {
  const normalized = String(value || "Task").trim().toLowerCase();

  if (normalized === "bug") {
    return "Bug";
  }

  if (normalized === "task") {
    return "Task";
  }

  return "";
};

const sendValidationError = (res, message) =>
  res.status(400).json({
    success: false,
    message,
  });

const normalizeOptionalField = (value, maxLength = MAX_OPTIONAL_FIELD_LENGTH) => {
  if (value === undefined || value === null) {
    return "";
  }

  return String(value).trim().slice(0, maxLength);
};

const normalizeCommitSha = (value) => String(value || "").trim();

const normalizeAiReviewForResponse = (review = {}) => ({
  status: review.status || "NOT_REVIEWED",
  score: review.score ?? null,
  rating: review.rating || "",
  summary: review.summary || "",
  findings: Array.isArray(review.findings) ? review.findings : [],
  security: Array.isArray(review.security) ? review.security : [],
  performance: Array.isArray(review.performance) ? review.performance : [],
  codeQuality: Array.isArray(review.codeQuality) ? review.codeQuality : [],
  regressionRisk: review.regressionRisk || { level: "low", areas: [], reason: "" },
  testing: review.testing || {
    risk: "low",
    recommendedTests: [],
    edgeCases: [],
    affectedModules: [],
  },
  release: review.release || {
    readiness: "needs_attention",
    risks: [],
    recommendations: [],
  },
  testingRecommendations: Array.isArray(review.testingRecommendations)
    ? review.testingRecommendations
    : [],
  positiveObservations: Array.isArray(review.positiveObservations)
    ? review.positiveObservations
    : [],
  reviewedAt: review.reviewedAt || null,
  error: review.error || "",
});

const getActivityCommitSha = (activity = {}) => String(activity.commitSha || "").trim();

const findGitActivity = (project, commitSha) => {
  const normalizedCommitSha = normalizeCommitSha(commitSha);
  const latestActivity = project.latestGitActivity || {};

  if (getActivityCommitSha(latestActivity) === normalizedCommitSha) {
    return {
      activity: latestActivity,
      isLatest: true,
      historyIndex: -1,
    };
  }

  const history = Array.isArray(project.gitActivityHistory) ? project.gitActivityHistory : [];
  const historyIndex = history.findIndex(
    (activity) => getActivityCommitSha(activity) === normalizedCommitSha
  );

  if (historyIndex >= 0) {
    return {
      activity: history[historyIndex],
      isLatest: false,
      historyIndex,
    };
  }

  return {
    activity: null,
    isLatest: false,
    historyIndex: -1,
  };
};

const applyReviewToGitActivity = ({ project, commitSha, review }) => {
  const normalizedCommitSha = normalizeCommitSha(commitSha);

  if (getActivityCommitSha(project.latestGitActivity) === normalizedCommitSha) {
    project.latestGitActivity.aiReview = review;
  }

  if (Array.isArray(project.gitActivityHistory)) {
    project.gitActivityHistory.forEach((activity) => {
      if (getActivityCommitSha(activity) === normalizedCommitSha) {
        activity.aiReview = review;
      }
    });
  }
};

const generateWorkItemDescription = asyncHandler(async (req, res) => {
  const { title, workItemType = "Task" } = req.body || {};

  if (typeof title !== "string") {
    return sendValidationError(res, "Title is required");
  }

  const normalizedTitle = title.trim();

  if (!normalizedTitle) {
    return sendValidationError(res, "Title is required");
  }

  if (normalizedTitle.length > MAX_TITLE_LENGTH) {
    return sendValidationError(
      res,
      `Title must be ${MAX_TITLE_LENGTH} characters or fewer`
    );
  }

  const normalizedWorkItemType = normalizeWorkItemType(workItemType);

  if (!SUPPORTED_WORK_ITEM_TYPES.has(normalizedWorkItemType)) {
    return sendValidationError(res, "Unsupported workItemType");
  }

  try {
    const description = await aiService.generateWorkItemDescription({
      title: normalizedTitle,
      workItemType: normalizedWorkItemType,
      projectName: normalizeOptionalField(req.body.projectName),
      priority: normalizeOptionalField(req.body.priority),
    });

    if (typeof description !== "string" || !description.trim()) {
      throw new Error("AI service returned an empty description");
    }

    return res.status(200).json({
      success: true,
      description: description.trim(),
    });
  } catch (error) {
    console.error("[ai] description generation failed", {
      userId: String(req.user?._id || req.user?.id || ""),
      workItemType: normalizedWorkItemType,
      message: error.cause?.message || error.message,
    });

    return res.status(502).json({
      success: false,
      message: "Unable to generate description at the moment.",
    });
  }
});

const reviewCodeForCommit = asyncHandler(async (req, res) => {
  const projectId = String(req.body?.projectId || "").trim();
  const commitSha = normalizeCommitSha(req.body?.commitSha);
  const forceRefresh = req.body?.forceRefresh === true;

  if (!projectId) {
    return sendValidationError(res, "Project is required");
  }

  if (!commitSha) {
    return sendValidationError(res, "Commit SHA is required");
  }

  const accessQuery = await buildProjectAccessQuery(req.user);
  const project = await Project.findOne({
    ...accessQuery,
    _id: projectId,
  }).select("+git.encryptedToken");

  if (!project) {
    res.status(404);
    throw new Error("Project not found");
  }

  const { activity } = findGitActivity(project, commitSha);

  if (!activity) {
    return res.status(404).json({
      success: false,
      message: "Commit was not found in this project's Git activity.",
    });
  }

  const existingReview = activity.aiReview || {};

  if (!forceRefresh && existingReview.status === "COMPLETED") {
    return res.status(200).json({
      success: true,
      cached: true,
      review: normalizeAiReviewForResponse(existingReview),
    });
  }

  const reviewingState = {
    status: "REVIEWING",
    score: null,
    rating: "",
    summary: "",
    findings: [],
    security: [],
    performance: [],
    codeQuality: [],
    regressionRisk: { level: "low", areas: [], reason: "" },
    testing: {
      risk: "low",
      recommendedTests: [],
      edgeCases: [],
      affectedModules: [],
    },
    release: {
      readiness: "needs_attention",
      risks: [],
      recommendations: [],
    },
    testingRecommendations: [],
    positiveObservations: [],
    reviewedAt: null,
    reviewedBy: req.user._id,
    error: "",
  };

  applyReviewToGitActivity({
    project,
    commitSha,
    review: reviewingState,
  });
  await project.save();

  try {
    const repository = `${project.git?.repositoryOwner || ""}/${project.git?.repositoryName || ""}`.replace(
      /^\/|\/$/g,
      ""
    );
    const diff = await githubCommitDiff.getCommitDiffForProject({
      project,
      commitSha,
    });
    const review = await aiService.generateCodeReview({
      projectName: project.name,
      repository,
      branch: activity.branch || project.git?.defaultBranch || "",
      commitSha,
      commitMessage: activity.commitMessage || diff.message || "",
      filesChanged: Array.isArray(activity.filesChanged)
        ? activity.filesChanged
        : diff.files.map((file) => file.filename),
      modulesChanged: Array.isArray(activity.modulesChanged) ? activity.modulesChanged : [],
      diff,
    });
    const completedReview = {
      ...review,
      status: "COMPLETED",
      reviewedAt: new Date(),
      reviewedBy: req.user._id,
      error: "",
    };

    applyReviewToGitActivity({
      project,
      commitSha,
      review: completedReview,
    });
    await project.save();

    return res.status(200).json({
      success: true,
      cached: false,
      review: normalizeAiReviewForResponse(completedReview),
    });
  } catch (error) {
    console.error("[ai] code review failed", {
      userId: String(req.user?._id || req.user?.id || ""),
      projectId,
      commitSha,
      message: error.cause?.message || error.message,
    });

    const failedReview = {
      status: "FAILED",
      score: null,
      rating: "",
      summary: "",
      findings: [],
      security: [],
      performance: [],
      codeQuality: [],
      regressionRisk: { level: "low", areas: [], reason: "" },
      testing: {
        risk: "low",
        recommendedTests: [],
        edgeCases: [],
        affectedModules: [],
      },
      release: {
        readiness: "needs_attention",
        risks: [],
        recommendations: [],
      },
      testingRecommendations: [],
      positiveObservations: [],
      reviewedAt: new Date(),
      reviewedBy: req.user._id,
      error: "Unable to complete review.",
    };

    applyReviewToGitActivity({
      project,
      commitSha,
      review: failedReview,
    });
    await project.save();

    return res.status(502).json({
      success: false,
      message: "Unable to complete review.",
      review: normalizeAiReviewForResponse(failedReview),
    });
  }
});

const reviewCode = asyncHandler(async (req, res) => {
  const {
    diff,
    changedFiles = [],
    commitMessage = "",
    projectContext = "",
    storyContext = "",
  } = req.body || {};

  if (typeof diff !== "string" || !diff.trim()) {
    return sendValidationError(res, "Code diff is required");
  }

  if (diff.length > MAX_DIFF_LENGTH) {
    return sendValidationError(res, `Code diff must be ${MAX_DIFF_LENGTH} characters or fewer`);
  }

  if (!Array.isArray(changedFiles)) {
    return sendValidationError(res, "changedFiles must be an array");
  }

  if (changedFiles.length > 100) {
    return sendValidationError(res, "changedFiles cannot contain more than 100 files");
  }

  try {
    const review = await reviewCodeChanges({
      diff: diff.trim(),
      changedFiles,
      commitMessage: normalizeOptionalField(commitMessage, 1000),
      projectContext: normalizeOptionalField(projectContext, MAX_REVIEW_CONTEXT_LENGTH),
      storyContext: normalizeOptionalField(storyContext, MAX_REVIEW_CONTEXT_LENGTH),
    });

    return res.status(200).json({
      success: true,
      review,
    });
  } catch {
    return res.status(502).json({
      success: false,
      message: "Unable to complete AI code review",
    });
  }
});

module.exports = {
  generateWorkItemDescription,
  reviewCodeForCommit,
  reviewCode,
};
