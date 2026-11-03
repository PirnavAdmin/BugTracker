const test = require("node:test");
const assert = require("node:assert/strict");
const { calculateQAMetrics } = require("../services/qaMetricsService");

const bug = { _id: "bug-1", type: "Bug", status: "CLOSED" };
const event = (fromValue, toValue, createdAt = "2026-01-02T10:00:00Z") => ({
  issueId: "bug-1", fromValue, toValue, createdAt,
});

test("QA rejection is a completed review and does not lower QA efficiency", () => {
  const metrics = calculateQAMetrics({ issues: [bug], history: [event("READY_FOR_QA", "REOPEN")] });
  assert.equal(metrics.qaReviewsCompleted, 1);
  assert.equal(metrics.qaRejected, 1);
  assert.equal(metrics.reopened, 1);
  assert.equal(metrics.qaEfficiency, 100);
});

test("multiple QA cycles stay one bug while recording each completed review", () => {
  const metrics = calculateQAMetrics({
    issues: [bug],
    history: [event("READY_FOR_QA", "REOPEN"), event("READY_FOR_QA", "REOPEN"), event("READY_FOR_QA", "CLOSED")],
  });
  assert.equal(metrics.totalBugs, 1);
  assert.equal(metrics.qaReviewsCompleted, 3);
  assert.equal(metrics.qaAccepted, 1);
  assert.equal(metrics.qaRejected, 2);
  assert.equal(metrics.reopened, 1);
  assert.equal(metrics.qaEfficiency, 100);
});

test("QA date filtering uses the review event date", () => {
  const metrics = calculateQAMetrics({
    issues: [bug], history: [event("READY_FOR_QA", "CLOSED", "2026-02-03T10:00:00Z")],
    dateFrom: "2026-02-01T00:00:00Z", dateTo: "2026-02-28T23:59:59Z",
  });
  assert.equal(metrics.qaReviewsCompleted, 1);
});

test("a non-QA rejection is not confused with a QA review or production escape", () => {
  const metrics = calculateQAMetrics({
    issues: [bug], history: [event("OPEN", "REJECTED")],
  });
  assert.equal(metrics.qaReviewsCompleted, 0);
  assert.equal(metrics.qaRejected, 0);
  assert.equal(metrics.productionEscapes, 0);
});
