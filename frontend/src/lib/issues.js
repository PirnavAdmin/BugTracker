export const ISSUE_STATUS = Object.freeze({
  DRAFT: "DRAFT",
  READY: "READY",
  TODO: "TODO",
  SPRINT_BACKLOG: "SPRINT_BACKLOG",
  IN_PROGRESS: "IN_PROGRESS",
  BLOCKED: "BLOCKED",
  REVIEW: "REVIEW",
  CODE_REVIEW: "CODE_REVIEW",
  QA: "QA",
  QA_READY: "QA_READY",
  DEVELOPMENT_COMPLETE: "DEVELOPMENT_COMPLETE",
  READY_FOR_UAT: "READY_FOR_UAT",
  DONE: "DONE",
  NEW: "NEW",
  TRIAGED: "TRIAGED",
  NEEDS_TRIAGE: "NEEDS_TRIAGE",
  AVAILABLE_QUEUE: "AVAILABLE_QUEUE",
  OPEN: "OPEN",
  ASSIGNED: "ASSIGNED",
  READY_FOR_QA: "READY_FOR_QA",
  TESTING: "TESTING",
  FIXED: "FIXED",
  CLOSED: "CLOSED",
  RESOLVED: "RESOLVED",
  REOPEN: "REOPEN",
  REJECTED: "REJECTED",
  DEFERRED: "DEFERRED",
});

export const BUG_LIFECYCLE_STATUS = Object.freeze({
  REPORTED: "REPORTED",
  ASSIGNED: "ASSIGNED",
  IN_PROGRESS: "IN_PROGRESS",
  READY_FOR_QA: "READY_FOR_QA",
  REOPENED: "REOPENED",
  CLOSED: "CLOSED",
});

export const BUG_LIFECYCLE_STATUS_VALUES = Object.freeze(
  Object.values(BUG_LIFECYCLE_STATUS)
);

export const ISSUE_ACTIVE_STATUS_VALUES = Object.freeze([
  ISSUE_STATUS.IN_PROGRESS,
  ISSUE_STATUS.BLOCKED,
  ISSUE_STATUS.REVIEW,
  ISSUE_STATUS.QA,
  ISSUE_STATUS.OPEN,
  ISSUE_STATUS.TRIAGED,
  ISSUE_STATUS.ASSIGNED,
  ISSUE_STATUS.READY_FOR_QA,
  ISSUE_STATUS.TESTING,
  ISSUE_STATUS.FIXED,
  ISSUE_STATUS.REOPEN,
]);

export const BUG_SEVERITY_OPTIONS = ["Blocker", "Critical", "Major", "Minor"];
export const BUG_PRIORITY_OPTIONS = ["Critical", "High", "Medium", "Low"];
export const BUG_MODULE_OPTIONS = [
  "Login Page",
  "Dashboard",
  "Reports",
  "User Management",
  "API",
  "Database",
  "Mobile UI",
  "Notifications",
  "Authentication",
  "Chat",
  "File Upload",
];
export const BUG_CATEGORY_DESCRIPTIONS = Object.freeze({
  "Functional Bug":
    "Business logic not working as expected. Incorrect calculations. Workflow failures. Feature behavior differs from requirements.",
  "UI / UX Bug":
    "Layout issues. Alignment issues. Visual inconsistencies.",
  "Backend Bug": "Service layer issues. Processing failures.",
  "API Bug": "Endpoint failures. Request/response issues.",
  "Database Bug": "Data storage and retrieval issues.",
  "Integration Bug":
    "Third-party service integration failures. Inter-system communication issues.",
  "Performance Bug":
    "Slow loading. High response times. Resource consumption issues.",
  "Security Bug":
    "Authentication, authorization, data exposure vulnerabilities.",
  "Mobile Bug": "Mobile-specific behavior issues.",
  "Compatibility Bug": "Browser/device compatibility issues.",
  "Accessibility Bug":
    "WCAG/usability issues for assistive technologies.",
  "Validation Bug": "Incorrect input validation. Missing validation rules.",
  "Enhancement Request": "New feature or improvement request.",
});

export const BUG_CATEGORY_GROUPS = Object.freeze([
  {
    label: "Core Bug Types",
    categories: [
      "Functional Bug",
      "UI / UX Bug",
      "Backend Bug",
      "API Bug",
      "Database Bug",
      "Integration Bug",
      "Performance Bug",
      "Security Bug",
      "Mobile Bug",
      "Compatibility Bug",
      "Accessibility Bug",
      "Validation Bug",
    ],
  },
  {
    label: "Improvement Types",
    categories: ["Enhancement Request"],
  },
]);

export const BUG_CATEGORY_OPTIONS = BUG_CATEGORY_GROUPS.flatMap(
  (group) => group.categories
);

export const getBugCategoryDescription = (category = "") =>
  BUG_CATEGORY_DESCRIPTIONS[category] || "";

export const getBugCategorySelectGroups = (currentValue = "") => {
  const knownCategories = new Set(BUG_CATEGORY_OPTIONS);
  const groups = BUG_CATEGORY_GROUPS.map((group) => ({
    label: group.label,
    options: group.categories.map((value) => ({
      value,
      label: value,
      description: getBugCategoryDescription(value),
    })),
  }));

  if (currentValue && !knownCategories.has(currentValue)) {
    groups.unshift({
      label: "Saved value",
      options: [
        {
          value: currentValue,
          label: currentValue,
          description: "Previously saved category.",
        },
      ],
    });
  }

  return groups;
};

export const filterBugCategoryOption = (option, inputValue = "") => {
  const term = String(inputValue).trim().toLowerCase();

  if (!term) {
    return true;
  }

  const label = String(option.label || "").toLowerCase();
  const description = String(
    option.data?.description ?? option.description ?? ""
  ).toLowerCase();

  return label.includes(term) || description.includes(term);
};

export const BUG_PLATFORM_OPTIONS = ["Web", "Mobile", "API", "Admin Panel"];
export const BUG_TEAM_OPTIONS = ["UI Team", "Backend Team", "QA Team", "DevOps Team"];
export const getSuggestedTeamForCategory = (category = "") => {
  const normalizedCategory = String(category).toLowerCase();

  if (
    normalizedCategory.includes("ui") ||
    normalizedCategory.includes("ux") ||
    normalizedCategory.includes("mobile") ||
    normalizedCategory.includes("accessibility") ||
    normalizedCategory.includes("compatibility")
  ) {
    return "UI Team";
  }

  if (
    normalizedCategory.includes("backend") ||
    normalizedCategory.includes("api") ||
    normalizedCategory.includes("database") ||
    normalizedCategory.includes("security") ||
    normalizedCategory.includes("integration") ||
    normalizedCategory.includes("validation")
  ) {
    return "Backend Team";
  }

  if (normalizedCategory.includes("performance")) {
    return "DevOps Team";
  }

  return "QA Team";
};
export const BUG_STATUS_OPTIONS = [
  { value: ISSUE_STATUS.NEW, label: "New" },
  { value: ISSUE_STATUS.TRIAGED, label: "Triaged" },
  { value: ISSUE_STATUS.OPEN, label: "Open" },
  { value: ISSUE_STATUS.ASSIGNED, label: "Assigned" },
  { value: ISSUE_STATUS.IN_PROGRESS, label: "In Progress" },
  { value: ISSUE_STATUS.READY_FOR_QA, label: "Ready for QA" },
  { value: ISSUE_STATUS.TESTING, label: "Testing" },
  { value: ISSUE_STATUS.FIXED, label: "Fixed" },
  { value: ISSUE_STATUS.DONE, label: "Done" },
  { value: ISSUE_STATUS.CLOSED, label: "Closed" },
  { value: ISSUE_STATUS.REOPEN, label: "Reopen" },
  { value: ISSUE_STATUS.REJECTED, label: "Rejected" },
  { value: ISSUE_STATUS.DEFERRED, label: "Deferred" },
];
export const BUG_STATUS_FLOW = [
  ISSUE_STATUS.NEW,
  ISSUE_STATUS.TRIAGED,
  ISSUE_STATUS.ASSIGNED,
  ISSUE_STATUS.IN_PROGRESS,
  ISSUE_STATUS.READY_FOR_QA,
  ISSUE_STATUS.TESTING,
  ISSUE_STATUS.DONE,
  ISSUE_STATUS.CLOSED,
];
export const BUG_ALTERNATE_TRANSITIONS = [
  [ISSUE_STATUS.FIXED, ISSUE_STATUS.REOPEN, ISSUE_STATUS.ASSIGNED],
  [ISSUE_STATUS.OPEN, ISSUE_STATUS.REJECTED],
  [ISSUE_STATUS.ASSIGNED, ISSUE_STATUS.REJECTED],
  [ISSUE_STATUS.OPEN, ISSUE_STATUS.DEFERRED],
  [ISSUE_STATUS.ASSIGNED, ISSUE_STATUS.DEFERRED],
];
export const BUG_TERMINAL_STATUSES = [
  ISSUE_STATUS.DONE,
  ISSUE_STATUS.CLOSED,
  ISSUE_STATUS.REJECTED,
  ISSUE_STATUS.DEFERRED,
];
export const BUG_LIFECYCLE_STATUSES = BUG_STATUS_OPTIONS.map((option) => option.value);
export const OPEN_STATUSES = Object.freeze([
  "Todo",
  "In Progress",
  "Pending",
  "Reopened",
]);
export const CLOSED_STATUSES = Object.freeze([
  "Done",
  "Closed",
  "Resolved",
]);
export const ISSUE_OPEN_STATUSES = Object.freeze([
  ISSUE_STATUS.TODO,
  ISSUE_STATUS.IN_PROGRESS,
  "PENDING",
  ISSUE_STATUS.REOPEN,
]);
export const ISSUE_COMPLETED_STATUSES = Object.freeze([
  ISSUE_STATUS.CLOSED,
  ISSUE_STATUS.RESOLVED,
  ISSUE_STATUS.DONE,
]);
export const ISSUE_HIGH_PRIORITY_VALUES = Object.freeze([
  "High",
  "Critical",
  "Urgent",
]);
export const ISSUE_CRITICAL_PRIORITY_VALUES = Object.freeze(["Critical"]);
export const ISSUE_CRITICAL_SEVERITY_VALUES = Object.freeze(["Critical"]);

export const ISSUE_STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: ISSUE_STATUS.DRAFT, label: "Draft" },
  { value: ISSUE_STATUS.READY, label: "Ready" },
  { value: ISSUE_STATUS.TODO, label: "To Do" },
  { value: ISSUE_STATUS.SPRINT_BACKLOG, label: "Sprint Backlog" },
  { value: ISSUE_STATUS.IN_PROGRESS, label: "In Progress" },
  { value: ISSUE_STATUS.BLOCKED, label: "Blocked" },
  { value: ISSUE_STATUS.REVIEW, label: "Review" },
  { value: ISSUE_STATUS.CODE_REVIEW, label: "Code Review" },
  { value: ISSUE_STATUS.QA, label: "QA" },
  { value: ISSUE_STATUS.QA_READY, label: "QA Ready" },
  { value: ISSUE_STATUS.DEVELOPMENT_COMPLETE, label: "Development Complete" },
  { value: ISSUE_STATUS.TESTING, label: "Testing" },
  { value: ISSUE_STATUS.READY_FOR_UAT, label: "Ready for UAT" },
  { value: ISSUE_STATUS.DONE, label: "Done" },
  ...BUG_STATUS_OPTIONS,
];

export const ISSUE_WORKFLOW_STATUS_OPTIONS = ISSUE_STATUS_OPTIONS.filter(
  (option) => option.value !== "all"
);
export const GENERIC_ISSUE_WORKFLOW_STATUS_OPTIONS = [
  { value: ISSUE_STATUS.TODO, label: "To Do" },
  { value: ISSUE_STATUS.IN_PROGRESS, label: "In Progress" },
  { value: ISSUE_STATUS.BLOCKED, label: "Blocked" },
  { value: ISSUE_STATUS.REVIEW, label: "Review" },
  { value: ISSUE_STATUS.QA, label: "QA" },
  { value: ISSUE_STATUS.DONE, label: "Done" },
];
export const STORY_WORKFLOW_STATUS_OPTIONS = [
  { value: ISSUE_STATUS.DRAFT, label: "Draft" },
  { value: ISSUE_STATUS.READY, label: "Ready" },
  { value: ISSUE_STATUS.SPRINT_BACKLOG, label: "Sprint Backlog" },
  { value: ISSUE_STATUS.IN_PROGRESS, label: "In Progress" },
  { value: ISSUE_STATUS.DEVELOPMENT_COMPLETE, label: "Development Complete" },
  { value: ISSUE_STATUS.TESTING, label: "Testing" },
  { value: ISSUE_STATUS.READY_FOR_UAT, label: "Ready for UAT" },
  { value: ISSUE_STATUS.DONE, label: "Done" },
  { value: ISSUE_STATUS.CLOSED, label: "Closed" },
];
export const TASK_WORKFLOW_STATUS_OPTIONS = [
  { value: ISSUE_STATUS.TODO, label: "To Do" },
  { value: ISSUE_STATUS.IN_PROGRESS, label: "In Progress" },
  { value: ISSUE_STATUS.CODE_REVIEW, label: "Code Review" },
  { value: ISSUE_STATUS.QA_READY, label: "QA Ready" },
  { value: ISSUE_STATUS.DONE, label: "Done" },
];

export const ISSUE_TYPES = Object.freeze({
  TASK: "Task",
  STORY: "Story",
  BUG: "Bug",
  EPIC: "Epic",
  SUB_TASK: "Sub-task",
});

export const ISSUE_TYPE_OPTIONS = [
  ISSUE_TYPES.TASK,
  ISSUE_TYPES.STORY,
  ISSUE_TYPES.BUG,
  ISSUE_TYPES.EPIC,
  ISSUE_TYPES.SUB_TASK,
];

export const ISSUE_SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "priority", label: "Priority" },
  { value: "recently-started", label: "Recently started" },
];

const priorityRank = {
  Critical: 0,
  High: 1,
  Medium: 2,
  Low: 3,
};

const workflowRank = {
  [ISSUE_STATUS.IN_PROGRESS]: 0,
  [ISSUE_STATUS.BLOCKED]: 1,
  [ISSUE_STATUS.REVIEW]: 2,
  [ISSUE_STATUS.QA]: 3,
  [ISSUE_STATUS.TODO]: 4,
  [ISSUE_STATUS.DONE]: 5,
  [ISSUE_STATUS.NEW]: 0,
  [ISSUE_STATUS.OPEN]: 1,
  [ISSUE_STATUS.TRIAGED]: 1,
  [ISSUE_STATUS.ASSIGNED]: 2,
  [ISSUE_STATUS.IN_PROGRESS]: 3,
  [ISSUE_STATUS.READY_FOR_QA]: 4,
  [ISSUE_STATUS.TESTING]: 5,
  [ISSUE_STATUS.FIXED]: 5,
  [ISSUE_STATUS.REOPEN]: 6,
  [ISSUE_STATUS.DONE]: 7,
  [ISSUE_STATUS.REJECTED]: 8,
  [ISSUE_STATUS.DEFERRED]: 9,
  [ISSUE_STATUS.CLOSED]: 10,
};

const projectKeyWord = (value = "") =>
  value
    .trim()
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase() || "")
    .join("")
    .slice(0, 4);

export const normalizeIssueStatus = (value, fallback = ISSUE_STATUS.TODO) => {
  if (value === null || typeof value === "undefined") {
    return fallback;
  }

  const normalizedValue = String(value)
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");

  if (!normalizedValue) {
    return fallback;
  }

  if (normalizedValue === "INPROGRESS") {
    return ISSUE_STATUS.IN_PROGRESS;
  }

  if (normalizedValue === "TO_DO") {
    return ISSUE_STATUS.TODO;
  }

  if (normalizedValue === "IN_REVIEW") {
    return ISSUE_STATUS.REVIEW;
  }

  if (normalizedValue === "READY_FOR_QA") {
    return ISSUE_STATUS.READY_FOR_QA;
  }

  if (normalizedValue === "RE_OPEN" || normalizedValue === "REOPENED") {
    return ISSUE_STATUS.REOPEN;
  }

  if (normalizedValue === "RESOLVED") {
    return ISSUE_STATUS.RESOLVED;
  }

  if (normalizedValue === "PENDING") {
    return "PENDING";
  }

  return Object.values(ISSUE_STATUS).includes(normalizedValue)
    ? normalizedValue
    : fallback;
};

const normalizeStatusToken = (value = "") =>
  String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");

export const normalizeBugLifecycleStatus = (
  issueOrStatus,
  fallback = BUG_LIFECYCLE_STATUS.REPORTED
) => {
  const explicitLifecycle =
    typeof issueOrStatus === "object"
      ? issueOrStatus?.bugLifecycleStatus ||
        issueOrStatus?.bugStatus ||
        issueOrStatus?.workflowStatus ||
        issueOrStatus?.bugDetails?.bugLifecycleStatus ||
        issueOrStatus?.bugDetails?.status
      : "";
  const rawStatus =
    typeof issueOrStatus === "object" ? issueOrStatus?.status : issueOrStatus;
  const token = normalizeStatusToken(explicitLifecycle || rawStatus);

  if (BUG_LIFECYCLE_STATUS_VALUES.includes(token)) {
    return token;
  }

  if (["NEW", "OPEN", "TRIAGED", "TODO", "REPORTED"].includes(token)) {
    return BUG_LIFECYCLE_STATUS.REPORTED;
  }

  if (token === "ASSIGNED") {
    return BUG_LIFECYCLE_STATUS.ASSIGNED;
  }

  if (["IN_PROGRESS", "INPROGRESS"].includes(token)) {
    return BUG_LIFECYCLE_STATUS.IN_PROGRESS;
  }

  if (["READY_FOR_QA", "READYFORQA", "FIXED", "TESTING", "QA", "REVIEW"].includes(token)) {
    return BUG_LIFECYCLE_STATUS.READY_FOR_QA;
  }

  if (["REOPEN", "RE_OPEN", "REOPENED"].includes(token)) {
    return BUG_LIFECYCLE_STATUS.REOPENED;
  }

  if (["CLOSED", "DONE", "RESOLVED"].includes(token)) {
    return BUG_LIFECYCLE_STATUS.CLOSED;
  }

  return fallback;
};

export const normalizeIssueType = (value, fallback = ISSUE_TYPES.TASK) => {
  if (value === null || typeof value === "undefined") {
    return fallback;
  }

  const normalizedValue = String(value)
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");

  if (!normalizedValue) {
    return fallback;
  }

  if (normalizedValue === "SUBTASK") {
    return ISSUE_TYPES.SUB_TASK;
  }

  return (
    ISSUE_TYPE_OPTIONS.find(
      (issueType) =>
        issueType.toUpperCase().replace(/[\s-]+/g, "_") === normalizedValue
    ) || fallback
  );
};

export const getIssueWorkflowLane = (status) => {
  const normalizedStatus = normalizeIssueStatus(status);

  if (
    normalizedStatus === ISSUE_STATUS.DONE ||
    BUG_TERMINAL_STATUSES.includes(normalizedStatus)
  ) {
    return ISSUE_STATUS.DONE;
  }

  if (normalizedStatus === ISSUE_STATUS.TODO || normalizedStatus === ISSUE_STATUS.NEW) {
    return ISSUE_STATUS.TODO;
  }

  return ISSUE_STATUS.IN_PROGRESS;
};

export const isIssueClosed = (issueOrStatus) => {
  const status =
    typeof issueOrStatus === "object" ? issueOrStatus?.status : issueOrStatus;

  return ISSUE_COMPLETED_STATUSES.includes(normalizeIssueStatus(status, ""));
};

export const isIssueOpen = (issueOrStatus) => {
  const status =
    typeof issueOrStatus === "object" ? issueOrStatus?.status : issueOrStatus;

  return ISSUE_OPEN_STATUSES.includes(normalizeIssueStatus(status, ""));
};

export const isIssueReopened = (issueOrStatus) => {
  const status =
    typeof issueOrStatus === "object" ? issueOrStatus?.status : issueOrStatus;

  return normalizeIssueStatus(status, "") === ISSUE_STATUS.REOPEN;
};

export const isHighPriorityIssue = (issue = {}) =>
  ISSUE_HIGH_PRIORITY_VALUES.includes(issue.priority);

export const isCriticalIssue = (issue = {}) =>
  ISSUE_CRITICAL_PRIORITY_VALUES.includes(issue.priority) ||
  ISSUE_CRITICAL_SEVERITY_VALUES.includes(issue.severity || issue.bugDetails?.severity);

export const getOpenIssues = (issues = []) => issues.filter(isIssueOpen);

export const getClosedIssues = (issues = []) => issues.filter(isIssueClosed);

export const getReopenedIssues = (issues = []) => issues.filter(isIssueReopened);

export const getCriticalIssues = (issues = []) => issues.filter(isCriticalIssue);

export const getHighPriorityIssues = (issues = []) => issues.filter(isHighPriorityIssue);

export const normalizeIssueFilterAlias = (value = "") => {
  const normalizedValue = String(value || "").trim().toLowerCase();

  return ["open", "closed", "reopened", "critical"].includes(normalizedValue)
    ? normalizedValue
    : "";
};

export const isIssueInProgress = (issueOrStatus) =>
  ISSUE_ACTIVE_STATUS_VALUES.includes(
    normalizeIssueStatus(
      typeof issueOrStatus === "object" ? issueOrStatus?.status : issueOrStatus
    )
  );

export const isBugIssue = (issueOrType) =>
  normalizeIssueType(
    typeof issueOrType === "object" ? issueOrType?.type : issueOrType,
    ""
  ) === ISSUE_TYPES.BUG;

export const getWorkflowStatusOptionsForIssue = (issueOrType) => {
  if (isBugIssue(issueOrType)) {
    return BUG_STATUS_OPTIONS;
  }

  const type = normalizeIssueType(
    typeof issueOrType === "object" ? issueOrType?.type : issueOrType,
    ""
  );

  if (type === ISSUE_TYPES.STORY) {
    return STORY_WORKFLOW_STATUS_OPTIONS;
  }

  if ([ISSUE_TYPES.TASK, ISSUE_TYPES.SUB_TASK].includes(type)) {
    return TASK_WORKFLOW_STATUS_OPTIONS;
  }

  return GENERIC_ISSUE_WORKFLOW_STATUS_OPTIONS;
};

export const normalizeBugStatusForIssue = (issue) => {
  const lifecycleStatus = normalizeBugLifecycleStatus(issue, "");

  if (lifecycleStatus === BUG_LIFECYCLE_STATUS.REPORTED) {
    return ISSUE_STATUS.NEW;
  }

  if (lifecycleStatus === BUG_LIFECYCLE_STATUS.REOPENED) {
    return ISSUE_STATUS.REOPEN;
  }

  if (lifecycleStatus && lifecycleStatus !== BUG_LIFECYCLE_STATUS.CLOSED) {
    return lifecycleStatus;
  }

  if (lifecycleStatus === BUG_LIFECYCLE_STATUS.CLOSED) {
    return ISSUE_STATUS.CLOSED;
  }

  const status = normalizeIssueStatus(issue?.status, "");

  if (BUG_LIFECYCLE_STATUSES.includes(status)) {
    return status;
  }

  if (status === ISSUE_STATUS.IN_PROGRESS || status === ISSUE_STATUS.BLOCKED) {
    return ISSUE_STATUS.ASSIGNED;
  }

  if (status === ISSUE_STATUS.REVIEW || status === ISSUE_STATUS.QA) {
    return ISSUE_STATUS.READY_FOR_QA;
  }

  if (status === ISSUE_STATUS.DONE) {
    return ISSUE_STATUS.DONE;
  }

  return ISSUE_STATUS.NEW;
};

export const isBugLifecycleClosed = (issueOrStatus) =>
  normalizeBugLifecycleStatus(issueOrStatus, "") === BUG_LIFECYCLE_STATUS.CLOSED;

export const groupBugsByLifecycle = (issues = []) =>
  issues.reduce(
    (groups, issue) => {
      const lifecycleStatus = normalizeBugLifecycleStatus(issue);
      const keyByStatus = {
        [BUG_LIFECYCLE_STATUS.REPORTED]: "reported",
        [BUG_LIFECYCLE_STATUS.ASSIGNED]: "assigned",
        [BUG_LIFECYCLE_STATUS.IN_PROGRESS]: "inProgress",
        [BUG_LIFECYCLE_STATUS.READY_FOR_QA]: "readyForQa",
        [BUG_LIFECYCLE_STATUS.REOPENED]: "reopened",
        [BUG_LIFECYCLE_STATUS.CLOSED]: "closed",
      };
      const key = keyByStatus[lifecycleStatus] || "reported";

      groups[key].push(issue);
      return groups;
    },
    {
      reported: [],
      assigned: [],
      inProgress: [],
      readyForQa: [],
      reopened: [],
      closed: [],
    }
  );

export const resolveBugDetails = (issue) => issue?.bugDetails || {};

export const getIssueStatusMetrics = (issues = []) => ({
  total: issues.length,
  open: getOpenIssues(issues).length,
  inProgress: issues.filter((issue) => isIssueInProgress(issue)).length,
  closed: getClosedIssues(issues).length,
});

export const createIssueListFilters = (overrides = {}) => ({
  search: "",
  status: "all",
  type: "all",
  priority: "all",
  projectId: "all",
  teamId: "all",
  assigneeId: "all",
  sortBy: "newest",
  ...overrides,
});

export const getIssueStatusLabel = (status) =>
  ISSUE_WORKFLOW_STATUS_OPTIONS.find(
    (option) => option.value === normalizeIssueStatus(status, "")
  )?.label || "Unknown";

export const getIssueStatusVariant = (status) => {
  const normalizedStatus = normalizeIssueStatus(status);

  if (normalizedStatus === ISSUE_STATUS.DONE) {
    return "success";
  }

  if (normalizedStatus === ISSUE_STATUS.CLOSED) {
    return "success";
  }

  if (normalizedStatus === ISSUE_STATUS.REJECTED) {
    return "danger";
  }

  if (normalizedStatus === ISSUE_STATUS.DEFERRED) {
    return "secondary";
  }

  if (normalizedStatus === ISSUE_STATUS.BLOCKED) {
    return "danger";
  }

  if (
    normalizedStatus === ISSUE_STATUS.REVIEW ||
    normalizedStatus === ISSUE_STATUS.FIXED
  ) {
    return "default";
  }

  if (
    normalizedStatus === ISSUE_STATUS.QA ||
    normalizedStatus === ISSUE_STATUS.ASSIGNED ||
    normalizedStatus === ISSUE_STATUS.REOPEN
  ) {
    return "warning";
  }

  if (
    normalizedStatus === ISSUE_STATUS.IN_PROGRESS ||
    normalizedStatus === ISSUE_STATUS.OPEN
  ) {
    return "warning";
  }

  return "secondary";
};

export const getIssuePriorityVariant = (priority) => {
  if (priority === "Critical") {
    return "danger";
  }

  if (priority === "High") {
    return "danger";
  }

  if (priority === "Medium") {
    return "warning";
  }

  return "success";
};

export const getIssueTypeVariant = (type) => {
  const normalizedType = normalizeIssueType(type, "");

  if (normalizedType === ISSUE_TYPES.BUG) {
    return "danger";
  }

  if (normalizedType === ISSUE_TYPES.STORY) {
    return "default";
  }

  if (normalizedType === ISSUE_TYPES.EPIC) {
    return "warning";
  }

  if (normalizedType === ISSUE_TYPES.SUB_TASK) {
    return "outline";
  }

  return "secondary";
};

export const resolveIssueProjectId = (issue) =>
  String(issue?.projectId?._id || issue?.projectId || "");

export const resolveIssueAssigneeId = (issue) =>
  String(issue?.assigneeId || issue?.assignee?._id || issue?.assignee || "");

export const resolveIssueAssignee = (issue) =>
  issue?.assignee && typeof issue.assignee === "object" ? issue.assignee : null;

export const resolveIssueTeamId = (issue) =>
  String(issue?.teamId?._id || issue?.teamId || "");

export const resolveIssueEpicId = (issue) =>
  String(issue?.epicId?._id || issue?.epicId || "");

export const resolveIssueSprintId = (issue) =>
  String(issue?.sprintId?._id || issue?.sprintId || "");

export const resolveIssueDependencyId = (issue) =>
  String(issue?.dependsOnIssueId?._id || issue?.dependsOnIssueId || "");

export const resolveIssueDependency = (issue) =>
  issue?.dependsOnIssueId && typeof issue.dependsOnIssueId === "object"
    ? issue.dependsOnIssueId
    : null;

export const getIssueDisplayKey = (issue) => {
  const displayBugId =
    typeof issue?.displayBugId === "string" ? issue.displayBugId.trim() : "";

  if (displayBugId) {
    return displayBugId;
  }

  const explicitKey =
    typeof issue?.issueKey === "string" ? issue.issueKey.trim() : "";

  if (explicitKey) {
    return explicitKey;
  }

  const projectName = issue?.projectId?.name || "";
  const projectKey = projectKeyWord(projectName) || "WORK";
  const suffix = String(issue?._id || "")
    .slice(-5)
    .toUpperCase();

  return suffix ? `${projectKey}-${suffix}` : `${projectKey}-NEW`;
};

export const filterIssues = (issues, filters) => {
  const searchTerm = filters.search?.trim().toLowerCase() || "";
  const assigneeFilter = filters.assigneeId ?? filters.assignee ?? "all";
  const priorityGroup = filters.priorityGroup || "all";
  const statusGroup = filters.statusGroup || "all";
  const filterAlias = normalizeIssueFilterAlias(filters.filter);
  const normalizedStatusFilter =
    filters.status && filters.status !== "all"
      ? normalizeIssueStatus(filters.status)
      : "all";
  const normalizedTypeFilter =
    filters.type && filters.type !== "all"
      ? normalizeIssueType(filters.type, "")
      : "all";

  return issues.filter((issue) => {
    const normalizedIssueStatus = normalizeIssueStatus(issue.status);

    if (filterAlias === "open" && !isIssueOpen(issue)) {
      return false;
    }

    if (filterAlias === "closed" && !isIssueClosed(issue)) {
      return false;
    }

    if (filterAlias === "reopened" && !isIssueReopened(issue)) {
      return false;
    }

    if (filterAlias === "critical" && !isCriticalIssue(issue)) {
      return false;
    }

    if (statusGroup === "open" && !isIssueOpen(issue)) {
      return false;
    }

    if (statusGroup === "closed" && !isIssueClosed(issue)) {
      return false;
    }

    if (
      normalizedStatusFilter !== "all" &&
      normalizedIssueStatus !== normalizedStatusFilter
    ) {
      return false;
    }

    if (
      normalizedTypeFilter !== "all" &&
      normalizeIssueType(issue.type, "") !== normalizedTypeFilter
    ) {
      return false;
    }

    if (
      priorityGroup === "high" &&
      !isHighPriorityIssue(issue)
    ) {
      return false;
    }

    if (filters.priority !== "all" && issue.priority !== filters.priority) {
      return false;
    }

    if (
      filters.projectId !== "all" &&
      resolveIssueProjectId(issue) !== String(filters.projectId)
    ) {
      return false;
    }

    if (filters.teamId !== "all" && resolveIssueTeamId(issue) !== String(filters.teamId)) {
      return false;
    }

    if (filters.epicId === "unassigned" && resolveIssueEpicId(issue)) {
      return false;
    }

    if (
      filters.epicId &&
      filters.epicId !== "all" &&
      filters.epicId !== "unassigned" &&
      resolveIssueEpicId(issue) !== String(filters.epicId)
    ) {
      return false;
    }

    if (filters.sprintId === "backlog" && resolveIssueSprintId(issue)) {
      return false;
    }

    if (
      filters.sprintId &&
      filters.sprintId !== "all" &&
      filters.sprintId !== "backlog" &&
      resolveIssueSprintId(issue) !== String(filters.sprintId)
    ) {
      return false;
    }

    if (
      assigneeFilter !== "all" &&
      resolveIssueAssigneeId(issue) !== String(assigneeFilter)
    ) {
      return false;
    }

    if (!searchTerm) {
      return true;
    }

    return [
      getIssueDisplayKey(issue),
      issue.title,
      issue.description,
      issue.projectId?.name,
      issue.teamId?.name,
      issue.epicId?.name,
      resolveIssueAssignee(issue)?.name,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(searchTerm));
  });
};

export const sortIssues = (issues, sortBy = "newest") => {
  const items = [...issues];

  return items.sort((left, right) => {
    if (sortBy === "oldest") {
      return new Date(left.createdAt) - new Date(right.createdAt);
    }

    if (sortBy === "priority") {
      const priorityDelta =
        (priorityRank[left.priority] ?? Number.MAX_SAFE_INTEGER) -
        (priorityRank[right.priority] ?? Number.MAX_SAFE_INTEGER);

      if (priorityDelta !== 0) {
        return priorityDelta;
      }
    }

    if (sortBy === "recently-started") {
      const leftStartedAt = left.startedAt ? new Date(left.startedAt).getTime() : 0;
      const rightStartedAt = right.startedAt ? new Date(right.startedAt).getTime() : 0;
      const startedDelta = rightStartedAt - leftStartedAt;

      if (startedDelta !== 0) {
        return startedDelta;
      }
    }

    if (sortBy === "priority") {
      const workflowDelta =
        (workflowRank[normalizeIssueStatus(left.status)] ?? Number.MAX_SAFE_INTEGER) -
        (workflowRank[normalizeIssueStatus(right.status)] ?? Number.MAX_SAFE_INTEGER);

      if (workflowDelta !== 0) {
        return workflowDelta;
      }
    }

    return new Date(right.createdAt) - new Date(left.createdAt);
  });
};

export const countIssuesByStatus = (issues) =>
  ISSUE_STATUS_OPTIONS.reduce(
    (counts, option) => {
      if (option.value === "all") {
        counts.all = issues.length;
        return counts;
      }

      counts[option.value] = issues.filter(
        (issue) => normalizeIssueStatus(issue.status) === option.value
      ).length;
      return counts;
    },
    { all: issues.length }
  );
