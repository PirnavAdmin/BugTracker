const { ISSUE_STATUS, normalizeIssueStatus } = require("./issueStatus");

const OPEN_STATUSES = Object.freeze([
  "Todo",
  "In Progress",
  "Pending",
  "Reopened",
]);

const CLOSED_STATUSES = Object.freeze([
  "Done",
  "Closed",
  "Resolved",
]);

const OPEN_STATUS_VALUES = Object.freeze([
  ISSUE_STATUS.TODO,
  ISSUE_STATUS.IN_PROGRESS,
  ISSUE_STATUS.NEEDS_TRIAGE,
  ISSUE_STATUS.AVAILABLE_QUEUE,
  "PENDING",
  ISSUE_STATUS.REOPEN,
]);

const COMPLETED_STATUS_VALUES = Object.freeze([
  ISSUE_STATUS.DONE,
  ISSUE_STATUS.CLOSED,
  "RESOLVED",
]);

const COMPLETED_STATUS_QUERY_VALUES = Object.freeze([
  ...COMPLETED_STATUS_VALUES,
  "Done",
  "Closed",
  "Resolved",
]);

const HIGH_PRIORITY_VALUES = Object.freeze(["High", "Critical", "Urgent"]);
const CRITICAL_PRIORITY_VALUES = Object.freeze(["Critical"]);
const CRITICAL_SEVERITY_VALUES = Object.freeze(["Critical"]);

const isClosedStatus = (status) =>
  COMPLETED_STATUS_VALUES.includes(normalizeIssueStatus(status, ""));

const isOpenStatus = (status) =>
  OPEN_STATUS_VALUES.includes(normalizeIssueStatus(status, ""));

const isReopenedStatus = (status) =>
  normalizeIssueStatus(status, "") === ISSUE_STATUS.REOPEN;

const isHighPriorityIssue = (issue = {}) =>
  HIGH_PRIORITY_VALUES.includes(issue.priority);

const isCriticalIssue = (issue = {}) =>
  CRITICAL_PRIORITY_VALUES.includes(issue.priority) ||
  CRITICAL_SEVERITY_VALUES.includes(issue.severity || issue.bugDetails?.severity);

const getOpenIssues = (issues = []) =>
  issues.filter((issue) => isOpenStatus(issue.status));

const getClosedIssues = (issues = []) =>
  issues.filter((issue) => isClosedStatus(issue.status));

const getReopenedIssues = (issues = []) =>
  issues.filter((issue) => isReopenedStatus(issue.status));

const getCriticalIssues = (issues = []) =>
  issues.filter((issue) => isCriticalIssue(issue));

const getHighPriorityIssues = (issues = []) =>
  issues.filter((issue) => isHighPriorityIssue(issue));

const getFilterAlias = (value = "") => {
  const normalizedValue = String(value || "").trim().toLowerCase();

  return ["open", "closed", "reopened", "critical", "overdue"].includes(normalizedValue)
    ? normalizedValue
    : "";
};

const buildOpenIssueCondition = () => ({
  status: {
    $in: [
      ISSUE_STATUS.TODO,
      ISSUE_STATUS.NEW,
      ISSUE_STATUS.NEEDS_TRIAGE,
      ISSUE_STATUS.AVAILABLE_QUEUE,
      ISSUE_STATUS.IN_PROGRESS,
      ISSUE_STATUS.REOPEN,
      "PENDING",
      ...OPEN_STATUSES,
    ],
  },
});

const buildClosedIssueCondition = () => ({
  status: {
    $in: COMPLETED_STATUS_QUERY_VALUES,
  },
});

const buildReopenedIssueCondition = () => ({
  status: ISSUE_STATUS.REOPEN,
});

const buildHighPriorityIssueCondition = () => ({
  priority: {
    $in: HIGH_PRIORITY_VALUES,
  },
});

const buildCriticalIssueCondition = () => ({
  $or: [
    {
      priority: {
        $in: CRITICAL_PRIORITY_VALUES,
      },
    },
    {
      "bugDetails.severity": {
        $in: CRITICAL_SEVERITY_VALUES,
      },
    },
  ],
});

const buildOverdueIssueCondition = (now = new Date()) => ({
  dueAt: {
    $lt: now,
    $ne: null,
  },
  status: {
    $nin: COMPLETED_STATUS_QUERY_VALUES,
  },
});

module.exports = {
  COMPLETED_STATUS_QUERY_VALUES,
  COMPLETED_STATUS_VALUES,
  CLOSED_STATUSES,
  HIGH_PRIORITY_VALUES,
  OPEN_STATUSES,
  OPEN_STATUS_VALUES,
  buildClosedIssueCondition,
  buildCriticalIssueCondition,
  buildHighPriorityIssueCondition,
  buildOpenIssueCondition,
  buildOverdueIssueCondition,
  buildReopenedIssueCondition,
  getClosedIssues,
  getCriticalIssues,
  getFilterAlias,
  getHighPriorityIssues,
  getOpenIssues,
  getReopenedIssues,
  isClosedStatus,
  isCriticalIssue,
  isHighPriorityIssue,
  isOpenStatus,
  isReopenedStatus,
};
