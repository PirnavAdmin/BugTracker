import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getAiFindingCounts,
  getAiReviewViewState,
} from "../src/lib/ai-code-review.js";

test("AI review view state starts as not reviewed with run action", () => {
  const state = getAiReviewViewState();

  assert.equal(state.status, "NOT_REVIEWED");
  assert.equal(state.statusLabel, "Not reviewed");
  assert.equal(state.buttonLabel, "Run AI Review");
  assert.equal(state.canViewReview, false);
});

test("AI review view state exposes loading state without blocking QA status", () => {
  const state = getAiReviewViewState({
    review: { status: "NOT_REVIEWED" },
    running: true,
  });

  assert.equal(state.status, "REVIEWING");
  assert.equal(state.buttonLabel, "Reviewing...");
  assert.equal(state.canViewReview, false);
});

test("AI review completed state exposes score, findings, and modal affordance", () => {
  const state = getAiReviewViewState({
    review: {
      status: "COMPLETED",
      score: 87,
      findings: [
        { severity: "CRITICAL" },
        { severity: "HIGH" },
        { severity: "HIGH" },
        { severity: "SUGGESTION" },
      ],
    },
  });

  assert.equal(state.status, "COMPLETED");
  assert.equal(state.scoreLabel, "87 / 100");
  assert.equal(state.highRiskCount, 3);
  assert.equal(state.findingCount, 4);
  assert.equal(state.canViewReview, true);
  assert.equal(state.buttonLabel, "Run Review Again");
});

test("AI review failed state offers retry", () => {
  const state = getAiReviewViewState({
    review: { status: "FAILED", error: "Unable to complete review." },
  });

  assert.equal(state.status, "FAILED");
  assert.equal(state.buttonLabel, "Try Again");
  assert.equal(state.canViewReview, false);
});

test("AI review finding counts group severities for dashboard widgets", () => {
  assert.deepEqual(
    getAiFindingCounts([
      { severity: "critical" },
      { severity: "HIGH" },
      { severity: "low" },
      { severity: "unknown" },
      {},
    ]),
    {
      CRITICAL: 1,
      HIGH: 1,
      MEDIUM: 0,
      LOW: 1,
      SUGGESTION: 2,
    }
  );
});
