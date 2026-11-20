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
    label: "To do",
    helper: "Ready to start",
    countLabel: "open",
    accentClassName: "bg-orange-500",
    borderClassName: "border-orange-200 dark:border-orange-900/40",
    surfaceClassName: "bg-orange-50/70 dark:bg-slate-900/50",
    activeClassName:
      "border-orange-300 bg-orange-50 shadow-[0_22px_48px_-32px_rgba(249,115,22,0.42)] dark:border-orange-700 dark:bg-orange-950/30",
    badgeClassName: "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-800/60 dark:bg-orange-950/40 dark:text-orange-300",
  },
  {
    key: TASK_BOARD_STATUS.IN_PROGRESS,
    label: "In Progress",
    helper: "Moving now",
    countLabel: "active",
    accentClassName: "bg-violet-500",
    borderClassName: "border-violet-200 dark:border-violet-900/40",
    surfaceClassName: "bg-violet-50/70 dark:bg-slate-900/50",
    activeClassName:
      "border-violet-300 bg-violet-50 shadow-[0_22px_48px_-32px_rgba(124,58,237,0.4)] dark:border-violet-700 dark:bg-violet-950/30",
    badgeClassName: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800/60 dark:bg-violet-950/40 dark:text-violet-300",
  },
  {
    key: TASK_BOARD_STATUS.DONE,
    label: "Done",
    helper: "Closed work",
    countLabel: "closed",
    accentClassName: "bg-emerald-500",
    borderClassName: "border-emerald-200 dark:border-emerald-900/40",
    surfaceClassName: "bg-emerald-50/70 dark:bg-slate-900/50",
    activeClassName:
      "border-emerald-300 bg-emerald-50 shadow-[0_22px_48px_-32px_rgba(16,185,129,0.4)] dark:border-emerald-700 dark:bg-emerald-950/30",
    badgeClassName: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300",
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
