const test = require("node:test");
const assert = require("node:assert/strict");
const {
  STORY_STATUS,
  calculateStoryProgress,
  deriveStoryStatus,
  getStoryCompletionBlocker,
} = require("../utils/storyWorkflow");

test("story progress combines completed tasks and resolved bugs", () => {
  const progress = calculateStoryProgress([
    { type: "Task", status: "DONE" },
    { type: "Task", status: "IN_PROGRESS" },
    { type: "Bug", status: "CLOSED", priority: "High" },
    { type: "Bug", status: "IN_PROGRESS", priority: "Critical" },
  ]);

  assert.deepEqual(progress, {
    percent: 50,
    taskCount: 2,
    completedTaskCount: 1,
    bugCount: 2,
    resolvedBugCount: 1,
    openBlockingBugCount: 1,
  });
});

test("story completion is blocked by unfinished criteria, tasks, and high bugs", () => {
  const story = {
    acceptanceCriteria: [{ text: "Given/when/then", completed: true }],
  };

  assert.equal(
    getStoryCompletionBlocker(story, [
      { type: "Task", status: "DONE" },
      { type: "Bug", status: "IN_PROGRESS", priority: "High" },
    ]),
    "Critical and High priority Bugs must be resolved before closing the Story"
  );
});

test("story automatically advances when development work is complete", () => {
  const progress = calculateStoryProgress([
    { type: "Task", status: "DONE" },
    { type: "Bug", status: "CLOSED", priority: "Critical" },
  ]);

  assert.equal(
    deriveStoryStatus({ status: STORY_STATUS.IN_PROGRESS }, progress),
    STORY_STATUS.READY_FOR_UAT
  );
});
