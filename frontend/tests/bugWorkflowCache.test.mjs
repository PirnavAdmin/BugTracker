import test from "node:test";
import assert from "node:assert/strict";
import {
  isTaskOnlyIssueQueryKey,
  removeBugsFromTaskOnlyIssueCache,
} from "../src/lib/bug-workflow-cache.js";

const task = { _id: "task-1", type: "TASK" };
const bug = { _id: "bug-1", type: "Bug" };

test("recognizes task-only issue query keys", () => {
  assert.equal(isTaskOnlyIssueQueryKey(["issues", "my", "tasks"]), true);
  assert.equal(isTaskOnlyIssueQueryKey(["issues", "task-progress", "tasks", "user-1"]), true);
  assert.equal(isTaskOnlyIssueQueryKey(["issues", "issues-page", "board-lane"]), true);
  assert.equal(isTaskOnlyIssueQueryKey(["issues", "overview", { excludeType: "Bug" }]), true);
  assert.equal(isTaskOnlyIssueQueryKey(["issues", "project-overview", "project-1"]), false);
});

test("removes bugs from task-only caches while preserving task rows", () => {
  const result = removeBugsFromTaskOnlyIssueCache(["issues", "my", "tasks"], [task, bug]);
  assert.deepEqual(result, [task]);
});

test("leaves mixed issue caches unchanged", () => {
  const issues = [task, bug];
  assert.equal(
    removeBugsFromTaskOnlyIssueCache(["issues", "project-overview", "project-1"], issues),
    issues
  );
});

test("preserves task cache identity when it is already clean", () => {
  const issues = [task];
  assert.equal(removeBugsFromTaskOnlyIssueCache(["issues", "my", "tasks"], issues), issues);
});
