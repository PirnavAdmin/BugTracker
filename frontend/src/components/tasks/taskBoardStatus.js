import { ISSUE_STATUS, normalizeIssueStatus } from "@/lib/issues";

export const TASK_BOARD_STATUS = Object.freeze({
  OPEN: "OPEN",
  IN_PROGRESS: "IN_PROGRESS",
  CODE_REVIEW: "CODE_REVIEW",
  QA_READY: "QA_READY",
  DONE: "DONE",
});

export const TASK_BOARD_COLUMNS = [
  {
    key: TASK_BOARD_STATUS.OPEN,
    label: "Open",
    helper: "Ready to start",
    countLabel: "open",
    accentClassName: "bg-orange-500",
    borderClassName: "border-orange-200",
    surfaceClassName: "bg-orange-50/70",
    activeClassName:
      "border-orange-300 bg-orange-50 shadow-[0_22px_48px_-32px_rgba(249,115,22,0.42)]",
    badgeClassName: "border-orange-200 bg-orange-50 text-orange-700",
  },
  {
    key: TASK_BOARD_STATUS.IN_PROGRESS,
    label: "In Progress",
    helper: "Moving now",
    countLabel: "active",
    accentClassName: "bg-violet-500",
    borderClassName: "border-violet-200",
    surfaceClassName: "bg-violet-50/70",
    activeClassName:
      "border-violet-300 bg-violet-50 shadow-[0_22px_48px_-32px_rgba(124,58,237,0.4)]",
    badgeClassName: "border-violet-200 bg-violet-50 text-violet-700",
  },
  {
    key: TASK_BOARD_STATUS.CODE_REVIEW,
    label: "Code Review",
    helper: "Awaiting review",
    countLabel: "review",
    accentClassName: "bg-blue-500",
    borderClassName: "border-blue-200",
    surfaceClassName: "bg-blue-50/70",
    activeClassName:
      "border-blue-300 bg-blue-50 shadow-[0_22px_48px_-32px_rgba(59,130,246,0.4)]",
    badgeClassName: "border-blue-200 bg-blue-50 text-blue-700",
  },
  {
    key: TASK_BOARD_STATUS.QA_READY,
    label: "QA Ready",
    helper: "Ready for testing",
    countLabel: "QA ready",
    accentClassName: "bg-cyan-500",
    borderClassName: "border-cyan-200",
    surfaceClassName: "bg-cyan-50/70",
    activeClassName:
      "border-cyan-300 bg-cyan-50 shadow-[0_22px_48px_-32px_rgba(6,182,212,0.4)]",
    badgeClassName: "border-cyan-200 bg-cyan-50 text-cyan-700",
  },
  {
    key: TASK_BOARD_STATUS.DONE,
    label: "Done",
    helper: "Closed work",
    countLabel: "closed",
    accentClassName: "bg-emerald-500",
    borderClassName: "border-emerald-200",
    surfaceClassName: "bg-emerald-50/70",
    activeClassName:
      "border-emerald-300 bg-emerald-50 shadow-[0_22px_48px_-32px_rgba(16,185,129,0.4)]",
    badgeClassName: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
];

const ACTIVE_WORKFLOW_STATUSES = new Set([
  ISSUE_STATUS.IN_PROGRESS,
  ISSUE_STATUS.BLOCKED,
  ISSUE_STATUS.REVIEW,
  ISSUE_STATUS.QA,
  ISSUE_STATUS.CODE_REVIEW,
  ISSUE_STATUS.QA_READY,
  ISSUE_STATUS.OPEN,
  ISSUE_STATUS.ASSIGNED,
  ISSUE_STATUS.FIXED,
  ISSUE_STATUS.REOPEN,
]);

const CLOSED_WORKFLOW_STATUSES = new Set([
  ISSUE_STATUS.DONE,
  ISSUE_STATUS.CLOSED,
  ISSUE_STATUS.REJECTED,
  ISSUE_STATUS.DEFERRED,
]);

export const getTaskBoardStatus = (issueOrStatus) => {
  const status = normalizeIssueStatus(
    typeof issueOrStatus === "object" ? issueOrStatus?.status : issueOrStatus
  );

  if (CLOSED_WORKFLOW_STATUSES.has(status)) {
    return TASK_BOARD_STATUS.DONE;
  }

  if (status === ISSUE_STATUS.CODE_REVIEW) {
    return TASK_BOARD_STATUS.CODE_REVIEW;
  }

  if (status === ISSUE_STATUS.QA_READY) {
    return TASK_BOARD_STATUS.QA_READY;
  }

  if (ACTIVE_WORKFLOW_STATUSES.has(status)) {
    return TASK_BOARD_STATUS.IN_PROGRESS;
  }

  return TASK_BOARD_STATUS.OPEN;
};

const priorityRank = {
  Critical: 0,
  High: 1,
  Medium: 2,
  Low: 3,
};

export const sortTasksByPriority = (tasks = []) =>
  [...tasks].sort((left, right) => {
    const priorityDelta =
      (priorityRank[left.priority] ?? Number.MAX_SAFE_INTEGER) -
      (priorityRank[right.priority] ?? Number.MAX_SAFE_INTEGER);

    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    const leftDueAt = left.dueAt ? new Date(left.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
    const rightDueAt = right.dueAt
      ? new Date(right.dueAt).getTime()
      : Number.MAX_SAFE_INTEGER;
    const dueDelta = leftDueAt - rightDueAt;

    if (dueDelta !== 0) {
      return dueDelta;
    }

    return new Date(right.createdAt || 0) - new Date(left.createdAt || 0);
  });
