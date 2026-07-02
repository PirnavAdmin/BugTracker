const test = require("node:test");
const assert = require("node:assert/strict");

const Issue = require("../models/Issue");

test("tasks and bugs can be validated without a parent Story", () => {
  for (const type of ["Task", "Bug"]) {
    const issue = new Issue({
      title: `${type} without a parent`,
      type,
    });
    const validationError = issue.validateSync();

    assert.equal(validationError?.errors?.parentStoryId, undefined);
    assert.equal(issue.parentStoryId, null);
  }
});
