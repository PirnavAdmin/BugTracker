const { test } = require("node:test");
const assert = require("node:assert");
const {
  MAX_DESCRIPTION_WORDS,
  enforceDescriptionWordLimit,
  generateWorkItemDescription,
  generateCodeReview,
  normalizeCodeReviewResult,
  setBedrockClientForTests,
} = require("../services/aiService");

test.afterEach(() => {
  setBedrockClientForTests(null);
});

test("AI description post-processing removes markdown structure", () => {
  const description = enforceDescriptionWordLimit(`# Objective

Implement the forgot password feature.

- Let users request help when they cannot access their account.
- Keep the flow clear and editable.

## Acceptance Criteria

1. Users can start the reset flow.
2. Existing login behavior remains usable.`);

  assert.strictEqual(
    description,
    "Implement the forgot password feature. Let users request help when they cannot access their account. Keep the flow clear and editable. Users can start the reset flow. Existing login behavior remains usable."
  );
  assert.ok(!description.includes("#"));
  assert.ok(!description.includes("- Let"));
  assert.ok(!description.includes("Acceptance Criteria"));
});

test("AI description post-processing caps output at 350 words", () => {
  const longDescription = Array.from({ length: MAX_DESCRIPTION_WORDS + 25 }, (_, index) =>
    `word${index}`
  ).join(" ");
  const description = enforceDescriptionWordLimit(longDescription);
  const wordCount = description.split(/\s+/).filter(Boolean).length;

  assert.ok(wordCount <= MAX_DESCRIPTION_WORDS);
});

test("Bedrock success returns sanitized generated description", async () => {
  setBedrockClientForTests({
    send: async () => ({
      output: {
        message: {
          content: [{ text: "## Problem\n\nGenerated bug description." }],
        },
      },
    }),
  });

  const description = await generateWorkItemDescription({
    title: "Login fails",
    workItemType: "Bug",
  });

  assert.strictEqual(description, "Generated bug description.");
});

test("empty Bedrock response is sanitized as a generation failure", async () => {
  setBedrockClientForTests({
    send: async () => ({
      output: {
        message: {
          content: [],
        },
      },
    }),
  });

  await assert.rejects(
    () =>
      generateWorkItemDescription({
        title: "Create task",
        workItemType: "Task",
      }),
    /Unable to generate work item description/
  );
});

test("Bedrock failure is wrapped without raw provider details", async () => {
  setBedrockClientForTests({
    send: async () => {
      throw new Error("AccessDeniedException: provider detail");
    },
  });

  await assert.rejects(
    () =>
      generateWorkItemDescription({
        title: "Create task",
        workItemType: "Task",
      }),
    (error) => {
      assert.strictEqual(error.message, "Unable to generate work item description");
      assert.match(error.cause.message, /AccessDeniedException/);
      return true;
    }
  );
});

test("AI code review normalization accepts JSON embedded in provider text", () => {
  const review = normalizeCodeReviewResult(`Here is JSON:
{
  "score": 88,
  "rating": "Good",
  "summary": "Looks focused.",
  "findings": [
    {
      "severity": "high",
      "title": "Validate project access",
      "file": "backend/controllers/aiController.js",
      "line": null,
      "confidence": 91,
      "description": "Missing access checks could expose reviews.",
      "recommendation": "Use the existing project access query."
    }
  ],
  "testingRecommendations": ["Add controller coverage."],
  "positiveObservations": ["Reuses the existing AI client."]
}`);

  assert.strictEqual(review.status, "COMPLETED");
  assert.strictEqual(review.score, 88);
  assert.strictEqual(review.findings[0].severity, "HIGH");
  assert.strictEqual(review.findings[0].line, null);
  assert.deepStrictEqual(review.testingRecommendations, ["Add controller coverage."]);
  assert.strictEqual(review.regressionRisk.level, "low");
  assert.strictEqual(review.testing.risk, "low");
  assert.strictEqual(review.release.readiness, "needs_attention");
});

test("AI code review rejects invalid provider JSON", () => {
  assert.throws(() => normalizeCodeReviewResult("not json"), /Invalid AI code review response/);
  assert.throws(
    () => normalizeCodeReviewResult({ score: "bad", findings: [] }),
    /Invalid AI code review score/
  );
});

test("Bedrock code review success returns normalized review", async () => {
  setBedrockClientForTests({
    send: async () => ({
      output: {
        message: {
          content: [
            {
              text: JSON.stringify({
                score: 73,
                rating: "Needs Attention",
                summary: "Review summary.",
                findings: [],
                testingRecommendations: [],
                positiveObservations: [],
              }),
            },
          ],
        },
      },
    }),
  });

  const review = await generateCodeReview({
    projectName: "CureCode",
    commitSha: "abc123",
    diff: {
      files: [
        {
          filename: "backend/controllers/aiController.js",
          patch: "@@ -1 +1 @@\n-old\n+new",
        },
      ],
    },
  });

  assert.strictEqual(review.score, 73);
  assert.strictEqual(review.rating, "Needs Attention");
});

test("AI code review normalization preserves role-aware Phase 3 fields", () => {
  const review = normalizeCodeReviewResult({
    score: 82,
    rating: "Needs Attention",
    summary: "Review summary.",
    findings: [
      {
        severity: "medium",
        title: "Add fallback handling",
        file: "frontend/src/components/ai/AiCodeReviewPanel.jsx",
        line: null,
        confidence: 84,
        description: "Fallback handling needs coverage.",
        whyItMatters: "A malformed response could break the review panel.",
        recommendation: "Render a safe fallback.",
        regressionImpact: "AI review display can regress.",
      },
    ],
    security: [],
    performance: [],
    codeQuality: [
      {
        severity: "low",
        title: "Simplify layout",
        file: "frontend/src/components/ai/AiCodeReviewPanel.jsx",
        line: 277,
        confidence: 70,
        description: "Responsive classes are hard to reason about.",
        recommendation: "Use one breakpoint pattern.",
      },
    ],
    regressionRisk: {
      level: "medium",
      areas: ["AI Review"],
      reason: "The modal rendering changed by role.",
    },
    testing: {
      risk: "high",
      recommendedTests: ["Verify developer view", "Verify tester view"],
      edgeCases: ["Missing optional fields"],
      affectedModules: ["Developer Dashboard"],
    },
    release: {
      readiness: "needs_attention",
      risks: ["QA should verify role-specific views."],
      recommendations: ["Review before release."],
    },
    positiveObservations: ["Single review is reused."],
  });

  assert.strictEqual(review.findings[0].whyItMatters, "A malformed response could break the review panel.");
  assert.strictEqual(review.findings[0].regressionImpact, "AI review display can regress.");
  assert.strictEqual(review.codeQuality[0].severity, "LOW");
  assert.strictEqual(review.regressionRisk.level, "medium");
  assert.deepStrictEqual(review.testing.recommendedTests, [
    "Verify developer view",
    "Verify tester view",
  ]);
  assert.strictEqual(review.release.readiness, "needs_attention");
});
