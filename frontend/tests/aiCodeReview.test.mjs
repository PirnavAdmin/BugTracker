import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getAiReviewPerspective,
  getAiFindingCounts,
  getAiReviewViewState,
  getRoleReviewTitle,
  normalizeAiReview,
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

test("AI review role perspectives map CureCode roles to presentation modes", () => {
  assert.equal(getAiReviewPerspective("Developer"), "developer");
  assert.equal(getAiReviewPerspective("Tester"), "tester");
  assert.equal(getAiReviewPerspective("Q/A Lead"), "tester");
  assert.equal(getAiReviewPerspective("Manager"), "manager");
  assert.equal(getAiReviewPerspective("Admin"), "manager");
  assert.equal(getRoleReviewTitle("Developer"), "Technical Code Review");
  assert.equal(getRoleReviewTitle("Tester"), "AI QA Insights");
  assert.equal(getRoleReviewTitle("Manager"), "AI Release Insight");
});

test("AI review normalization keeps older review payloads renderable", () => {
  const review = normalizeAiReview({
    status: "COMPLETED",
    score: 85,
    findings: [{ severity: "HIGH", title: "Fix validation" }],
    testingRecommendations: ["Run regression test"],
  });

  assert.equal(review.regressionRisk.level, "low");
  assert.equal(review.testing.risk, "low");
  assert.deepEqual(review.testing.recommendedTests, ["Run regression test"]);
  assert.equal(review.release.readiness, "needs_attention");
  assert.deepEqual(review.security, []);
  assert.deepEqual(review.performance, []);
  assert.deepEqual(review.codeQuality, []);
});

test("AI review normalization exposes Phase 3 testing and release fields", () => {
  const review = normalizeAiReview({
    regressionRisk: {
      level: "medium",
      areas: ["AI Review"],
      reason: "Review rendering changed.",
    },
    testing: {
      risk: "high",
      recommendedTests: ["Verify tester view"],
      edgeCases: ["Missing optional fields"],
      affectedModules: ["Dashboard"],
    },
    release: {
      readiness: "needs_attention",
      risks: ["Regression testing required"],
      recommendations: ["Review before release"],
    },
  });

  assert.equal(review.regressionRisk.level, "medium");
  assert.equal(review.testing.risk, "high");
  assert.deepEqual(review.testing.edgeCases, ["Missing optional fields"]);
  assert.deepEqual(review.release.risks, ["Regression testing required"]);
});
