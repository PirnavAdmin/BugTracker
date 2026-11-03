const test = require("node:test");
const assert = require("node:assert/strict");

const Issue = require("../models/Issue");
const projection = require("../utils/issueListProjection");
const backlogProjection = require("../utils/backlogIssueProjection");

test("issue list projection excludes large detail-only fields", () => {
  for (const field of ["description", "activityLogs", "comments", "checklist", "acceptanceCriteria"]) {
    assert.match(projection, new RegExp(`-${field}`));
  }
  assert.doesNotMatch(projection, /-_id/);
});

test("issue schema declares the project story list sort index", () => {
  const indexes = Issue.schema.indexes().map(([keys]) => keys);
  assert.ok(indexes.some((keys) =>
    keys.projectId === 1 &&
    keys.type === 1 &&
    keys.updatedAt === -1 &&
    keys.createdAt === -1
  ));
});

test("backlog projection keeps fields used by client side search and details drawer", () => {
  assert.doesNotMatch(backlogProjection, /-description|-acceptanceCriteria|-definitionOfDone/);
  assert.match(backlogProjection, /-activityLogs/);
  assert.match(backlogProjection, /-comments/);
});
