const { test } = require("node:test");
const assert = require("node:assert");
const {
  MAX_DESCRIPTION_WORDS,
  enforceDescriptionWordLimit,
  generateWorkItemDescription,
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
