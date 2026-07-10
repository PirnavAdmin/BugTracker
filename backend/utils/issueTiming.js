const { isClosedIssueStatus } = require("./issueStatus");

const HOUR_IN_MS = 60 * 60 * 1000;
const DAY_IN_MS = 24 * HOUR_IN_MS;

const getIssueDueTime = (issue) => {
  if (!issue?.dueAt) {
    return Number.NaN;
  }

  return new Date(issue.dueAt).getTime();
};

const buildIssueTimingMeta = (issue, now = new Date()) => {
  const dueTime = getIssueDueTime(issue);
  const isDueDateAvailable = Number.isFinite(dueTime);
  const isClosed = isClosedIssueStatus(issue?.status);
  const diffMs = isDueDateAvailable ? dueTime - now.getTime() : Number.NaN;
  const isOverdue = isDueDateAvailable && !isClosed && diffMs < 0;
  const isNearDue =
    isDueDateAvailable && !isClosed && diffMs >= 0 && diffMs <= DAY_IN_MS;
  const overdueDays = isOverdue ? Math.max(1, Math.ceil(Math.abs(diffMs) / DAY_IN_MS)) : 0;
  const remainingHours = isNearDue ? Math.max(1, Math.ceil(diffMs / HOUR_IN_MS)) : 0;

  return {
    isOverdue,
    isNearDue,
    overdueDays,
    remainingHours,
    dueState: isOverdue ? "OVERDUE" : isNearDue ? "NEAR_DUE" : "NORMAL",
  };
};

module.exports = {
  buildIssueTimingMeta,
};
