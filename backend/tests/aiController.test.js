const { test } = require("node:test");
const assert = require("node:assert");
const aiService = require("../services/aiService");
const { generateWorkItemDescription } = require("../controllers/aiController");

const originalGenerateWorkItemDescription = aiService.generateWorkItemDescription;

const createResponse = () => {
  let body;

  return {
    get body() {
      return body;
    },
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      body = payload;
      return this;
    },
  };
};

const callController = async (body) => {
  const req = { body };
  const res = createResponse();

  await generateWorkItemDescription(req, res, () => {});

  return res;
};

test.afterEach(() => {
  aiService.generateWorkItemDescription = originalGenerateWorkItemDescription;
});

test("validates task description generation request", async () => {
  let receivedPayload;
  aiService.generateWorkItemDescription = async (payload) => {
    receivedPayload = payload;
    return "## Objective\n\nAdd forgot password support.";
  };

  const res = await callController({
    title: " Add forgot password feature ",
    workItemType: "Task",
    projectName: "CureCode",
    priority: "Medium",
  });

  assert.strictEqual(res.statusCode, 200);
  assert.deepStrictEqual(receivedPayload, {
    title: "Add forgot password feature",
    workItemType: "Task",
    projectName: "CureCode",
    priority: "Medium",
  });
  assert.deepStrictEqual(res.body, {
    success: true,
    description: "## Objective\n\nAdd forgot password support.",
  });
});

test("validates bug description generation request", async () => {
  let receivedPayload;
  aiService.generateWorkItemDescription = async (payload) => {
    receivedPayload = payload;
    return "## Problem\n\nThe login page crashes after password reset.";
  };

  const res = await callController({
    title: "Login page crashes after password reset",
    workItemType: "Bug",
    projectName: "CureCode",
    priority: "High",
  });

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(receivedPayload.workItemType, "Bug");
  assert.strictEqual(res.body.success, true);
  assert.match(res.body.description, /^## Problem/);
});

test("rejects missing title", async () => {
  const res = await callController({
    workItemType: "Task",
  });

  assert.strictEqual(res.statusCode, 400);
  assert.deepStrictEqual(res.body, {
    success: false,
    message: "Title is required",
  });
});

test("rejects empty title", async () => {
  const res = await callController({
    title: "   ",
    workItemType: "Task",
  });

  assert.strictEqual(res.statusCode, 400);
  assert.deepStrictEqual(res.body, {
    success: false,
    message: "Title is required",
  });
});

test("rejects unsupported workItemType", async () => {
  const res = await callController({
    title: "Create release notes",
    workItemType: "Story",
  });

  assert.strictEqual(res.statusCode, 400);
  assert.deepStrictEqual(res.body, {
    success: false,
    message: "Unsupported workItemType",
  });
});

test("returns successful service response", async () => {
  aiService.generateWorkItemDescription = async () => "## Objective\n\nGenerated.";

  const res = await callController({
    title: "Generate task description",
    workItemType: "Task",
  });

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.description, "## Objective\n\nGenerated.");
});

test("handles Bedrock service failure without exposing raw errors", async () => {
  aiService.generateWorkItemDescription = async () => {
    throw new Error("AccessDeniedException: sensitive provider detail");
  };

  const res = await callController({
    title: "Generate task description",
    workItemType: "Task",
  });

  assert.strictEqual(res.statusCode, 502);
  assert.deepStrictEqual(res.body, {
    success: false,
    message: "Unable to generate description at the moment.",
  });
});

test("handles empty AI service response as a sanitized failure", async () => {
  aiService.generateWorkItemDescription = async () => "   ";

  const res = await callController({
    title: "Generate task description",
    workItemType: "Task",
  });

  assert.strictEqual(res.statusCode, 502);
  assert.deepStrictEqual(res.body, {
    success: false,
    message: "Unable to generate description at the moment.",
  });
});
