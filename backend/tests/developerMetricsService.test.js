const test = require("node:test");
const assert = require("node:assert/strict");
const { calculateDeveloperMetrics } = require("../services/developerMetricsService");

const bug = { _id: "bug-1", type: "Bug", status: "CLOSED", createdAt: "2026-01-01T00:00:00Z", assignedDeveloperId: "dev-1" };
const entry = (fromValue, toValue, createdAt) => ({ issueId: "bug-1", field: "status", fromValue, toValue, createdAt });

test("a first-pass accepted fix has no developer rework", () => {
  const metrics = calculateDeveloperMetrics({ issues: [bug], developerId: "dev-1", history: [
    entry("IN_PROGRESS", "READY_FOR_QA", "2026-01-02T00:00:00Z"),
    entry("READY_FOR_QA", "CLOSED", "2026-01-03T00:00:00Z"),
  ] });
  assert.equal(metrics.qaSubmissions, 1);
  assert.equal(metrics.firstPassAccepted, 1);
  assert.equal(metrics.firstPassFixRate, 100);
  assert.equal(metrics.qaRejected, 0);
  assert.equal(metrics.reworkedBugs, 0);
});

test("QA rejections are developer rework and multiple cycles remain one bug", () => {
  const metrics = calculateDeveloperMetrics({ issues: [bug], developerId: "dev-1", history: [
    entry("IN_PROGRESS", "READY_FOR_QA", "2026-01-02T00:00:00Z"), entry("READY_FOR_QA", "REOPEN", "2026-01-03T00:00:00Z"),
    entry("IN_PROGRESS", "READY_FOR_QA", "2026-01-04T00:00:00Z"), entry("READY_FOR_QA", "REOPEN", "2026-01-05T00:00:00Z"),
    entry("IN_PROGRESS", "READY_FOR_QA", "2026-01-06T00:00:00Z"), entry("READY_FOR_QA", "CLOSED", "2026-01-07T00:00:00Z"),
  ] });
  assert.equal(metrics.qaSubmissions, 3);
  assert.equal(metrics.qaRejected, 2);
  assert.equal(metrics.reworkedBugs, 1);
  assert.equal(metrics.firstPassFixRate, 0);
  assert.equal(metrics.averageFixAttempts, 3);
});
