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
