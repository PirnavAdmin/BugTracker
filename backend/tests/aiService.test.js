const { test } = require("node:test");
const assert = require("node:assert");
const {
  MAX_DESCRIPTION_WORDS,
  enforceDescriptionWordLimit,
} = require("../services/aiService");

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
