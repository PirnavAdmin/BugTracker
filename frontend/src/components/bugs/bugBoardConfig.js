import {
  BUG_LIFECYCLE_STATUS,
  ISSUE_STATUS,
  isIssueClosed,
  normalizeBugLifecycleStatus,
  normalizeBugStatusForIssue,
  resolveBugDetails,
} from "@/lib/issues";

export const BUG_BOARD_PAGE_SIZE = 20;

export const TESTER_BUG_COLUMNS = [
  {
    key: "reported",
    label: "Reported",
    helper: "Waiting for developer pickup",
    statuses: [ISSUE_STATUS.NEW, ISSUE_STATUS.OPEN, ISSUE_STATUS.TRIAGED],
    accentClassName: "bg-orange-500",
    borderClassName: "border-orange-100",
    surfaceClassName: "bg-orange-50/55",
    activeClassName: "ring-2 ring-orange-300/60",
    badgeClassName: "border-orange-200 bg-orange-50 text-orange-700",
  },
  {
    key: "assigned",
    label: "Assigned",
    helper: "Developer owns this bug",
    statuses: [ISSUE_STATUS.ASSIGNED],
    accentClassName: "bg-violet-500",
    borderClassName: "border-violet-100",
    surfaceClassName: "bg-violet-50/55",
    activeClassName: "ring-2 ring-violet-300/60",
    badgeClassName: "border-violet-200 bg-violet-50 text-violet-700",
  },
  {
    key: "inProgress",
    label: "In Progress",
    helper: "Fix is underway",
    statuses: [ISSUE_STATUS.IN_PROGRESS],
    accentClassName: "bg-blue-500",
    borderClassName: "border-blue-100",
    surfaceClassName: "bg-blue-50/55",
    activeClassName: "ring-2 ring-blue-300/60",
    badgeClassName: "border-blue-200 bg-blue-50 text-blue-700",
  },
  {
    key: "readyForQa",
    label: "Ready For QA",
    helper: "Tester verification needed",
    statuses: [ISSUE_STATUS.READY_FOR_QA, ISSUE_STATUS.FIXED, ISSUE_STATUS.TESTING, ISSUE_STATUS.QA],
    accentClassName: "bg-cyan-500",
    borderClassName: "border-cyan-100",
    surfaceClassName: "bg-cyan-50/55",
    activeClassName: "ring-2 ring-cyan-300/60",
    badgeClassName: "border-cyan-200 bg-cyan-50 text-cyan-700",
  },
  {
    key: "closed",
    label: "Closed",
    helper: "Verified and closed",
    statuses: [ISSUE_STATUS.CLOSED, ISSUE_STATUS.DONE],
    accentClassName: "bg-emerald-500",
    borderClassName: "border-emerald-100",
    surfaceClassName: "bg-emerald-50/55",
    activeClassName: "ring-2 ring-emerald-300/60",
    badgeClassName: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
];

export const DEVELOPER_BUG_COLUMNS = [
  {
    key: "available",
    label: "Available Work",
    helper: "Ready for pickup",
    statuses: [ISSUE_STATUS.NEW, ISSUE_STATUS.OPEN, ISSUE_STATUS.TRIAGED],
    accentClassName: "bg-orange-500",
    borderClassName: "border-orange-100",
    surfaceClassName: "bg-orange-50/55",
    activeClassName: "ring-2 ring-orange-300/60",
    badgeClassName: "border-orange-200 bg-orange-50 text-orange-700",
  },
  {
    key: "assigned",
    label: "Assigned",
    helper: "Picked up but not started",
    statuses: [ISSUE_STATUS.ASSIGNED],
    accentClassName: "bg-violet-500",
    borderClassName: "border-violet-100",
    surfaceClassName: "bg-violet-50/55",
    activeClassName: "ring-2 ring-violet-300/60",
    badgeClassName: "border-violet-200 bg-violet-50 text-violet-700",
  },
  {
    key: "inProgress",
    label: "In Progress",
    helper: "Active fix work",
    statuses: [ISSUE_STATUS.IN_PROGRESS],
    accentClassName: "bg-blue-500",
    borderClassName: "border-blue-100",
    surfaceClassName: "bg-blue-50/55",
    activeClassName: "ring-2 ring-blue-300/60",
    badgeClassName: "border-blue-200 bg-blue-50 text-blue-700",
  },
  {
    key: "readyForQa",
    label: "Ready For QA",
    helper: "Waiting for tester verification",
    statuses: [ISSUE_STATUS.READY_FOR_QA, ISSUE_STATUS.FIXED, ISSUE_STATUS.TESTING, ISSUE_STATUS.QA],
    accentClassName: "bg-cyan-500",
    borderClassName: "border-cyan-100",
    surfaceClassName: "bg-cyan-50/55",
    activeClassName: "ring-2 ring-cyan-300/60",
    badgeClassName: "border-cyan-200 bg-cyan-50 text-cyan-700",
  },
  {
    key: "reopened",
    label: "Reopened",
    helper: "Returned by QA",
    statuses: [ISSUE_STATUS.REOPEN],
    accentClassName: "bg-amber-500",
    borderClassName: "border-amber-100",
    surfaceClassName: "bg-amber-50/55",
    activeClassName: "ring-2 ring-amber-300/60",
    badgeClassName: "border-amber-200 bg-amber-50 text-amber-700",
  },
  {
    key: "closed",
    label: "Closed Bugs",
    helper: "Verified and closed",
    statuses: [ISSUE_STATUS.CLOSED, ISSUE_STATUS.DONE],
    accentClassName: "bg-emerald-500",
    borderClassName: "border-emerald-100",
    surfaceClassName: "bg-emerald-50/55",
    activeClassName: "ring-2 ring-emerald-300/60",
    badgeClassName: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
];

const getTesterBugColumnKey = (issue, columns) => {
  const lifecycleStatus = normalizeBugLifecycleStatus(issue);
  const keyByStatus = {
    [BUG_LIFECYCLE_STATUS.REPORTED]: "reported",
    [BUG_LIFECYCLE_STATUS.ASSIGNED]: "assigned",
    [BUG_LIFECYCLE_STATUS.IN_PROGRESS]: "inProgress",
    [BUG_LIFECYCLE_STATUS.READY_FOR_QA]: "readyForQa",
    [BUG_LIFECYCLE_STATUS.REOPENED]: "inProgress",
    [BUG_LIFECYCLE_STATUS.CLOSED]: "closed",
  };
  const columnKey = keyByStatus[lifecycleStatus] || "";

  if (columnKey && columns.some((column) => column.key === columnKey)) {
    return columnKey;
  }

  return "";
};

export const getBugColumnKey = (issue, columns) => {
  const isTesterBoard = columns.some((column) => column.key === "reported") &&
    columns.some((column) => column.key === "closed") &&
    !columns.some((column) => column.key === "available");

  if (isTesterBoard) {
    return getTesterBugColumnKey(issue, columns);
  }

  const hasClosedColumn = columns.some((column) =>
    column.statuses.includes(ISSUE_STATUS.CLOSED)
  );

  if (isIssueClosed(issue) && !hasClosedColumn) {
    return "";
  }

  const hasAvailableColumn = columns.some((column) => column.key === "available");
  const isUnassigned =
    !issue?.assignee &&
    !issue?.assignedDeveloperId &&
    !resolveBugDetails(issue)?.developerLead;

  if (hasAvailableColumn && isUnassigned && issue?.pickupEligibility) {
    return "available";
  }

  const status = normalizeBugStatusForIssue(issue);
  const matchedColumn = columns.find((column) => column.statuses.includes(status));

  return matchedColumn?.key || "";
};

export const getBugStatusForColumn = (columnKey, role = "tester") => {
  if (role === "developer") {
    const statusByColumn = {
      assigned: ISSUE_STATUS.ASSIGNED,
      inProgress: ISSUE_STATUS.IN_PROGRESS,
      readyForQa: ISSUE_STATUS.READY_FOR_QA,
      reopened: ISSUE_STATUS.IN_PROGRESS,
    };

    return statusByColumn[columnKey] || "";
  }

  const testerStatusByColumn = {
    closed: ISSUE_STATUS.CLOSED,
    reopened: ISSUE_STATUS.REOPEN,
  };

  return testerStatusByColumn[columnKey] || "";
};

export const sortBugsForBoard = (issues = []) =>
  [...issues].sort((left, right) => {
    const priorityRank = { Critical: 0, High: 1, Medium: 2, Low: 3 };
    const severityRank = { Blocker: 0, Critical: 1, Major: 2, Minor: 3, Trivial: 4 };
    const leftDetails = resolveBugDetails(left);
    const rightDetails = resolveBugDetails(right);
    const severityDelta =
      (severityRank[leftDetails.severity] ?? 10) - (severityRank[rightDetails.severity] ?? 10);

    if (severityDelta !== 0) {
      return severityDelta;
    }

    const priorityDelta =
      (priorityRank[left.priority] ?? 10) - (priorityRank[right.priority] ?? 10);

    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    return (
      new Date(right.updatedAt || right.createdAt || 0).getTime() -
      new Date(left.updatedAt || left.createdAt || 0).getTime()
    );
  });
