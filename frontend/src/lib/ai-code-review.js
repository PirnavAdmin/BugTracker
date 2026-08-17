export const AI_REVIEW_STATUS = {
  NOT_REVIEWED: "NOT_REVIEWED",
  REVIEWING: "REVIEWING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
};

export const AI_REVIEW_STATUS_LABEL = {
  [AI_REVIEW_STATUS.NOT_REVIEWED]: "Not reviewed",
  [AI_REVIEW_STATUS.REVIEWING]: "Reviewing",
  [AI_REVIEW_STATUS.COMPLETED]: "Reviewed",
  [AI_REVIEW_STATUS.FAILED]: "Failed",
};

export const defaultAiReview = { status: AI_REVIEW_STATUS.NOT_REVIEWED };
export const DEFAULT_REGRESSION_RISK = { level: "low", areas: [], reason: "" };
export const DEFAULT_TESTING_INSIGHT = {
  risk: "low",
  recommendedTests: [],
  edgeCases: [],
  affectedModules: [],
};
export const DEFAULT_RELEASE_INSIGHT = {
  readiness: "needs_attention",
  risks: [],
  recommendations: [],
};

export const getAiFindingCounts = (findings = []) =>
  findings.reduce(
    (counts, finding) => {
      const rawSeverity = String(finding?.severity || "SUGGESTION").toUpperCase();
      const severity = Object.prototype.hasOwnProperty.call(counts, rawSeverity)
        ? rawSeverity
        : "SUGGESTION";
      counts[severity] = (counts[severity] || 0) + 1;
      return counts;
    },
    { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, SUGGESTION: 0 }
  );

export const getAiReviewViewState = ({ review = defaultAiReview, running = false } = {}) => {
  const status = running ? AI_REVIEW_STATUS.REVIEWING : review.status || AI_REVIEW_STATUS.NOT_REVIEWED;
  const counts = getAiFindingCounts(review.findings);
  const highRiskCount = (counts.CRITICAL || 0) + (counts.HIGH || 0);

  return {
    status,
    statusLabel: AI_REVIEW_STATUS_LABEL[status] || status,
    buttonLabel:
      status === AI_REVIEW_STATUS.REVIEWING
        ? "Reviewing..."
        : review.status === AI_REVIEW_STATUS.COMPLETED
          ? "Run Review Again"
          : review.status === AI_REVIEW_STATUS.FAILED
            ? "Try Again"
            : "Run AI Review",
    canViewReview: review.status === AI_REVIEW_STATUS.COMPLETED,
    scoreLabel:
      review.status === AI_REVIEW_STATUS.COMPLETED && review.score !== undefined && review.score !== null
        ? `${review.score} / 100`
        : "",
    highRiskCount,
    findingCount: Array.isArray(review.findings) ? review.findings.length : 0,
  };
};

export const normalizeAiReview = (review = {}) => ({
  ...defaultAiReview,
  ...(review && typeof review === "object" ? review : {}),
  findings: Array.isArray(review?.findings) ? review.findings : [],
  security: Array.isArray(review?.security) ? review.security : [],
  performance: Array.isArray(review?.performance) ? review.performance : [],
  codeQuality: Array.isArray(review?.codeQuality) ? review.codeQuality : [],
  testingRecommendations: Array.isArray(review?.testingRecommendations)
    ? review.testingRecommendations
    : [],
  positiveObservations: Array.isArray(review?.positiveObservations)
    ? review.positiveObservations
    : [],
  regressionRisk: {
    ...DEFAULT_REGRESSION_RISK,
    ...(review?.regressionRisk && typeof review.regressionRisk === "object"
      ? review.regressionRisk
      : {}),
  },
  testing: {
    ...DEFAULT_TESTING_INSIGHT,
    ...(review?.testing && typeof review.testing === "object" ? review.testing : {}),
    recommendedTests: Array.isArray(review?.testing?.recommendedTests)
      ? review.testing.recommendedTests
      : Array.isArray(review?.testingRecommendations)
        ? review.testingRecommendations
        : [],
    edgeCases: Array.isArray(review?.testing?.edgeCases) ? review.testing.edgeCases : [],
    affectedModules: Array.isArray(review?.testing?.affectedModules)
      ? review.testing.affectedModules
      : Array.isArray(review?.regressionRisk?.areas)
        ? review.regressionRisk.areas
        : [],
  },
  release: {
    ...DEFAULT_RELEASE_INSIGHT,
    ...(review?.release && typeof review.release === "object" ? review.release : {}),
    risks: Array.isArray(review?.release?.risks) ? review.release.risks : [],
    recommendations: Array.isArray(review?.release?.recommendations)
      ? review.release.recommendations
      : [],
  },
});

export const getAiReviewPerspective = (role = "") => {
  const normalized = String(role || "").toLowerCase();

  if (normalized === "tester" || normalized === "q/a lead") {
    return "tester";
  }

  if (normalized === "admin" || normalized === "manager") {
    return "manager";
  }

  return "developer";
};

export const getRoleReviewTitle = (role = "") => {
  const perspective = getAiReviewPerspective(role);

  if (perspective === "tester") {
    return "AI QA Insights";
  }

  if (perspective === "manager") {
    return "AI Release Insight";
  }

  return "Technical Code Review";
};
