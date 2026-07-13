const { ISSUE_TYPES, getCanonicalIssueType } = require("./issueTypes");
const { BUG_TERMINAL_STATUS_VALUES } = require("./bugLifecycle");

const STORY_STATUS = Object.freeze({
  DRAFT: "DRAFT",
  READY: "READY",
  SPRINT_BACKLOG: "SPRINT_BACKLOG",
  IN_PROGRESS: "IN_PROGRESS",
  DEVELOPMENT_COMPLETE: "DEVELOPMENT_COMPLETE",
  TESTING: "TESTING",
  READY_FOR_UAT: "READY_FOR_UAT",
  DONE: "DONE",
  CLOSED: "CLOSED",
});

const STORY_STATUS_VALUES = Object.freeze(Object.values(STORY_STATUS));
const STORY_COMPLETION_STATUSES = Object.freeze([
  STORY_STATUS.DONE,
  STORY_STATUS.CLOSED,
]);
const TASK_COMPLETION_STATUSES = Object.freeze(["DONE", "CLOSED"]);
const BLOCKING_BUG_PRIORITIES = Object.freeze(["Critical", "High"]);

const isStoryType = (value) =>
  getCanonicalIssueType(value, "") === ISSUE_TYPES.STORY;

const isStoryChildType = (value) =>
  [ISSUE_TYPES.TASK, ISSUE_TYPES.SUB_TASK, ISSUE_TYPES.BUG].includes(
    getCanonicalIssueType(value, "")
  );

const isTaskComplete = (issue) =>
  TASK_COMPLETION_STATUSES.includes(String(issue?.status || "").toUpperCase());

const isBugResolved = (issue) =>
  BUG_TERMINAL_STATUS_VALUES.includes(String(issue?.status || "").toUpperCase());

const calculateStoryProgress = (children = []) => {
  const tasks = children.filter((issue) =>
    [ISSUE_TYPES.TASK, ISSUE_TYPES.SUB_TASK].includes(
      getCanonicalIssueType(issue?.type, "")
    )
  );
  const bugs = children.filter(
    (issue) => getCanonicalIssueType(issue?.type, "") === ISSUE_TYPES.BUG
  );
  const completedTaskCount = tasks.filter(isTaskComplete).length;
  const resolvedBugCount = bugs.filter(isBugResolved).length;
  const totalWorkItems = tasks.length + bugs.length;
  const completedWorkItems = completedTaskCount + resolvedBugCount;

  return {
    percent: totalWorkItems
      ? Math.round((completedWorkItems / totalWorkItems) * 100)
      : 0,
    taskCount: tasks.length,
    completedTaskCount,
    bugCount: bugs.length,
    resolvedBugCount,
    openBlockingBugCount: bugs.filter(
      (bug) =>
        BLOCKING_BUG_PRIORITIES.includes(bug?.priority) && !isBugResolved(bug)
    ).length,
  };
};

const getStoryCompletionBlocker = (story, children = []) => {
  const progress = calculateStoryProgress(children);
  const acceptanceCriteria = Array.isArray(story?.acceptanceCriteria)
    ? story.acceptanceCriteria
    : [];

  if (
    !acceptanceCriteria.length ||
    acceptanceCriteria.some((criterion) => !criterion?.completed)
  ) {
    return "All acceptance criteria must be completed before closing the Story";
  }

  if (progress.completedTaskCount !== progress.taskCount) {
    return "All Tasks must be completed before closing the Story";
  }

  if (progress.openBlockingBugCount) {
    return "Critical and High priority Bugs must be resolved before closing the Story";
  }

  return "";
};

const deriveStoryStatus = (story, progress) => {
  const currentStatus = String(story?.status || STORY_STATUS.DRAFT).toUpperCase();

  if (STORY_COMPLETION_STATUSES.includes(currentStatus)) {
    return currentStatus;
  }

  if (progress.taskCount > 0 && progress.completedTaskCount === progress.taskCount) {
    return progress.openBlockingBugCount
      ? STORY_STATUS.TESTING
      : STORY_STATUS.READY_FOR_UAT;
  }

  if (progress.completedTaskCount > 0 || progress.resolvedBugCount > 0) {
    return STORY_STATUS.IN_PROGRESS;
  }

  return currentStatus;
};

module.exports = {
  BLOCKING_BUG_PRIORITIES,
  STORY_COMPLETION_STATUSES,
  STORY_STATUS,
  STORY_STATUS_VALUES,
  calculateStoryProgress,
  deriveStoryStatus,
  getStoryCompletionBlocker,
  isBugResolved,
  isStoryChildType,
  isStoryType,
  isTaskComplete,
};
