const { ISSUE_TYPES } = require("../utils/issueTypes");
const { BUG_STATUS, normalizeBugStatus } = require("../utils/bugLifecycle");

const QA_READY_STATUSES = new Set([
  BUG_STATUS.READY_FOR_QA,
  BUG_STATUS.READY_FOR_TESTING,
  BUG_STATUS.READY_FOR_VERIFICATION,
  BUG_STATUS.TESTING,
  BUG_STATUS.FIXED,
]);
const QA_ACCEPTED_STATUSES = new Set([BUG_STATUS.DONE, BUG_STATUS.CLOSED]);
const QA_REJECTED_STATUSES = new Set([
  BUG_STATUS.REOPEN,
  BUG_STATUS.REOPENED,
  BUG_STATUS.REJECTED,
]);

const idOf = (value) => String(value?._id || value || "");
const testerIdsOf = (issue) => [...new Set([
  issue?.reporter,
  issue?.reporterId,
  issue?.bugDetails?.testerOwner,
  issue?.testerOwner,
  issue?.testerOwnerId,
].map(idOf).filter(Boolean))];
const isWithinRange = (date, { dateFrom, dateTo } = {}) => {
  const time = new Date(date).getTime();
  if (!Number.isFinite(time)) return false;
  return (!dateFrom || time >= new Date(dateFrom).getTime()) &&
    (!dateTo || time <= new Date(dateTo).getTime());
};
const isQaReviewTransition = (history) => {
  const from = normalizeBugStatus(history.fromValue, "");
  const to = normalizeBugStatus(history.toValue, "");
  return QA_READY_STATUSES.has(from) && (QA_ACCEPTED_STATUSES.has(to) || QA_REJECTED_STATUSES.has(to));
};
const hasCurrentQaOutcome = (issue) => {
  const status = normalizeBugStatus(issue?.status, "");
  if (QA_ACCEPTED_STATUSES.has(status) || status === BUG_STATUS.REJECTED) {
    return true;
  }
  const resolutionAndLabels = `${issue?.resolution || ""} ${Array.isArray(issue?.labels) ? issue.labels.join(" ") : ""}`;
  return ["DUPLICATE", "INVALID"].includes(status) || /invalid|duplicate/i.test(resolutionAndLabels);
};

const emptyMetrics = () => ({
  totalBugs: 0,
  qaReviewsCompleted: 0,
  qaAccepted: 0,
  qaRejected: 0,
  reopened: 0,
  readyForQA: 0,
  qaEfficiency: 0,
  productionEscapes: 0,
  qaAcceptanceRate: 0,
  reviewsWithinSla: null,
});

// This deliberately measures QA review completion, not developer first-pass quality.
// There is no dedicated QA SLA field in the current model, so every completed review
// is an effective completion. Add an SLA numerator here when that data becomes reliable.
const calculateQAMetrics = ({ issues = [], history = [], dateFrom, dateTo } = {}) => {
  const bugs = issues.filter((issue) => issue.type === ISSUE_TYPES.BUG);
  const byIssue = new Map(bugs.map((issue) => [idOf(issue._id), issue]));
  const reviewEvents = history
    .filter((entry) => byIssue.has(idOf(entry.issueId)))
    .filter(isQaReviewTransition)
    .filter((entry) => isWithinRange(entry.createdAt, { dateFrom, dateTo }));
  const metrics = emptyMetrics();
  metrics.totalBugs = bugs.length;
  metrics.qaReviewsCompleted = reviewEvents.length;
  metrics.qaAccepted = reviewEvents.filter((entry) =>
    QA_ACCEPTED_STATUSES.has(normalizeBugStatus(entry.toValue, ""))
  ).length;
  metrics.qaRejected = reviewEvents.filter((entry) =>
    QA_REJECTED_STATUSES.has(normalizeBugStatus(entry.toValue, ""))
  ).length;
  metrics.reopened = new Set(reviewEvents.filter((entry) => {
    const status = normalizeBugStatus(entry.toValue, "");
    return status === BUG_STATUS.REOPEN || status === BUG_STATUS.REOPENED;
  }).map((entry) => idOf(entry.issueId))).size;
  metrics.readyForQA = bugs.filter((issue) =>
    QA_READY_STATUSES.has(normalizeBugStatus(issue.status, ""))
  ).length;
  metrics.qaAcceptanceRate = metrics.qaReviewsCompleted
    ? Math.round((metrics.qaAccepted / metrics.qaReviewsCompleted) * 100)
    : 0;
  const completedOutcomeCount = new Set(bugs.filter(hasCurrentQaOutcome).map((issue) => idOf(issue._id))).size;
  metrics.qaEfficiency = metrics.totalBugs
    ? Math.round((completedOutcomeCount / metrics.totalBugs) * 100)
    : 0;
  return metrics;
};

const calculateQAMetricsByTester = ({ issues = [], history = [], dateFrom, dateTo } = {}) => {
  const testerIds = new Set();
  issues.forEach((issue) => {
    testerIdsOf(issue).forEach((testerId) => testerIds.add(testerId));
  });
  history.forEach((entry) => {
    if (isQaReviewTransition(entry) && idOf(entry.actorId)) testerIds.add(idOf(entry.actorId));
  });

  return Array.from(testerIds).reduce((rows, testerId) => {
    const testerHistory = history.filter((entry) => {
      if (!isQaReviewTransition(entry)) return false;
      const actorId = idOf(entry.actorId);
      if (actorId) return actorId === testerId;
      const issue = issues.find((candidate) => idOf(candidate._id) === idOf(entry.issueId));
      return testerIdsOf(issue).includes(testerId);
    });
    const testerIssues = issues.filter((issue) => testerIdsOf(issue).includes(testerId));
    const metrics = calculateQAMetrics({ issues: testerIssues, history: testerHistory, dateFrom, dateTo });
    // Accuracy belongs to the tester who performed each QA transition. Those
    // transitions can be on bugs reported or owned by another tester, so do
    // not limit the review denominator to the tester's own reported bugs.
    const completedReviews = testerHistory
      .filter(isQaReviewTransition)
      .filter((entry) => isWithinRange(entry.createdAt, { dateFrom, dateTo }));
    metrics.qaReviewsCompleted = completedReviews.length;
    metrics.qaAccepted = completedReviews.filter((entry) =>
      QA_ACCEPTED_STATUSES.has(normalizeBugStatus(entry.toValue, ""))
    ).length;
    metrics.qaRejected = completedReviews.filter((entry) =>
      QA_REJECTED_STATUSES.has(normalizeBugStatus(entry.toValue, ""))
    ).length;
    metrics.qaAcceptanceRate = metrics.qaReviewsCompleted
      ? Math.round((metrics.qaAccepted / metrics.qaReviewsCompleted) * 100)
      : 0;
    rows[testerId] = metrics;
    return rows;
  }, {});
};

module.exports = { calculateQAMetrics, calculateQAMetricsByTester };
