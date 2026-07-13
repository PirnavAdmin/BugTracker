const BUG_SEVERITIES = Object.freeze({
  BLOCKER: "Blocker",
  CRITICAL: "Critical",
  MAJOR: "Major",
  MINOR: "Minor",
});

const BUG_SEVERITY_VALUES = Object.freeze(Object.values(BUG_SEVERITIES));

const BUG_PRIORITIES = Object.freeze({
  CRITICAL: "Critical",
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
});

const BUG_PRIORITY_VALUES = Object.freeze(Object.values(BUG_PRIORITIES));

const BUG_STATUS = Object.freeze({
  REPORTED: "REPORTED",
  NEW: "NEW",
  AVAILABLE_QUEUE: "AVAILABLE_QUEUE",
  NEEDS_TRIAGE: "NEEDS_TRIAGE",
  TRIAGED: "TRIAGED",
  DUPLICATE: "DUPLICATE",
  NEED_INFO: "NEED_INFO",
  OPEN: "OPEN",
  ASSIGNED: "ASSIGNED",
  IN_PROGRESS: "IN_PROGRESS",
  READY_FOR_QA: "READY_FOR_QA",
  READY_FOR_TESTING: "READY_FOR_TESTING",
  READY_FOR_VERIFICATION: "READY_FOR_VERIFICATION",
  TESTING: "TESTING",
  FIXED: "FIXED",
  DONE: "DONE",
  CLOSED: "CLOSED",
  REOPEN: "REOPEN",
  REOPENED: "REOPENED",
  REJECTED: "REJECTED",
  DEFERRED: "DEFERRED",
});

const BUG_STATUS_VALUES = Object.freeze(Object.values(BUG_STATUS));

const BUG_STATUS_LABELS = Object.freeze({
  [BUG_STATUS.NEW]: "New",
  [BUG_STATUS.REPORTED]: "Reported",
  [BUG_STATUS.AVAILABLE_QUEUE]: "Available Queue",
  [BUG_STATUS.NEEDS_TRIAGE]: "Needs Triage",
  [BUG_STATUS.TRIAGED]: "Triaged",
  [BUG_STATUS.DUPLICATE]: "Duplicate",
  [BUG_STATUS.NEED_INFO]: "Need Info",
  [BUG_STATUS.OPEN]: "Open",
  [BUG_STATUS.ASSIGNED]: "Assigned",
  [BUG_STATUS.IN_PROGRESS]: "In Progress",
  [BUG_STATUS.READY_FOR_QA]: "Ready for QA",
  [BUG_STATUS.READY_FOR_TESTING]: "Ready for Testing",
  [BUG_STATUS.READY_FOR_VERIFICATION]: "Ready for Verification",
  [BUG_STATUS.TESTING]: "Testing",
  [BUG_STATUS.FIXED]: "Fixed",
  [BUG_STATUS.DONE]: "Done",
  [BUG_STATUS.CLOSED]: "Closed",
  [BUG_STATUS.REOPEN]: "Reopen",
  [BUG_STATUS.REOPENED]: "Reopened",
  [BUG_STATUS.REJECTED]: "Rejected",
  [BUG_STATUS.DEFERRED]: "Deferred",
});

const BUG_STATUS_FLOW = Object.freeze([
  BUG_STATUS.NEW,
  BUG_STATUS.NEEDS_TRIAGE,
  BUG_STATUS.AVAILABLE_QUEUE,
  BUG_STATUS.TRIAGED,
  BUG_STATUS.ASSIGNED,
  BUG_STATUS.IN_PROGRESS,
  BUG_STATUS.READY_FOR_QA,
  BUG_STATUS.READY_FOR_TESTING,
  BUG_STATUS.READY_FOR_VERIFICATION,
  BUG_STATUS.TESTING,
  BUG_STATUS.DONE,
  BUG_STATUS.CLOSED,
]);

const BUG_ALTERNATE_TRANSITIONS = Object.freeze([
  [BUG_STATUS.READY_FOR_QA, BUG_STATUS.REOPEN, BUG_STATUS.ASSIGNED],
  [BUG_STATUS.FIXED, BUG_STATUS.REOPEN, BUG_STATUS.ASSIGNED],
  [BUG_STATUS.OPEN, BUG_STATUS.REJECTED],
  [BUG_STATUS.ASSIGNED, BUG_STATUS.REJECTED],
  [BUG_STATUS.OPEN, BUG_STATUS.DEFERRED],
  [BUG_STATUS.ASSIGNED, BUG_STATUS.DEFERRED],
]);

const BUG_ALLOWED_TRANSITIONS = Object.freeze({
  [BUG_STATUS.NEW]: Object.freeze([BUG_STATUS.TRIAGED, BUG_STATUS.OPEN, BUG_STATUS.ASSIGNED, BUG_STATUS.NEEDS_TRIAGE, BUG_STATUS.AVAILABLE_QUEUE]),
  [BUG_STATUS.NEEDS_TRIAGE]: Object.freeze([
    BUG_STATUS.ASSIGNED,
    BUG_STATUS.AVAILABLE_QUEUE,
    BUG_STATUS.TRIAGED,
    BUG_STATUS.REJECTED,
    BUG_STATUS.DUPLICATE,
    BUG_STATUS.NEED_INFO,
  ]),
  [BUG_STATUS.AVAILABLE_QUEUE]: Object.freeze([
    BUG_STATUS.ASSIGNED,
    BUG_STATUS.TRIAGED,
    BUG_STATUS.REJECTED,
  ]),
  [BUG_STATUS.NEED_INFO]: Object.freeze([
    BUG_STATUS.ASSIGNED,
    BUG_STATUS.AVAILABLE_QUEUE,
    BUG_STATUS.TRIAGED,
    BUG_STATUS.REJECTED,
    BUG_STATUS.NEEDS_TRIAGE,
  ]),
  [BUG_STATUS.TRIAGED]: Object.freeze([
    BUG_STATUS.ASSIGNED,
    BUG_STATUS.REJECTED,
    BUG_STATUS.DEFERRED,
  ]),
  [BUG_STATUS.OPEN]: Object.freeze([
    BUG_STATUS.ASSIGNED,
    BUG_STATUS.REJECTED,
    BUG_STATUS.DEFERRED,
  ]),
  [BUG_STATUS.ASSIGNED]: Object.freeze([
    BUG_STATUS.IN_PROGRESS,
    BUG_STATUS.READY_FOR_QA,
    BUG_STATUS.READY_FOR_TESTING,
    BUG_STATUS.READY_FOR_VERIFICATION,
    BUG_STATUS.FIXED,
    BUG_STATUS.REJECTED,
    BUG_STATUS.DEFERRED,
  ]),
  [BUG_STATUS.IN_PROGRESS]: Object.freeze([
    BUG_STATUS.READY_FOR_QA,
    BUG_STATUS.READY_FOR_TESTING,
    BUG_STATUS.READY_FOR_VERIFICATION,
    BUG_STATUS.FIXED,
    BUG_STATUS.REJECTED,
    BUG_STATUS.DEFERRED,
  ]),
  [BUG_STATUS.READY_FOR_QA]: Object.freeze([
    BUG_STATUS.TESTING,
    BUG_STATUS.DONE,
    BUG_STATUS.CLOSED,
    BUG_STATUS.REOPEN,
  ]),
  [BUG_STATUS.READY_FOR_TESTING]: Object.freeze([
    BUG_STATUS.TESTING,
    BUG_STATUS.DONE,
    BUG_STATUS.CLOSED,
    BUG_STATUS.REOPEN,
  ]),
  [BUG_STATUS.READY_FOR_VERIFICATION]: Object.freeze([
    BUG_STATUS.TESTING,
    BUG_STATUS.DONE,
    BUG_STATUS.CLOSED,
    BUG_STATUS.REOPEN,
  ]),
  [BUG_STATUS.TESTING]: Object.freeze([
    BUG_STATUS.DONE,
    BUG_STATUS.CLOSED,
    BUG_STATUS.REOPEN,
  ]),
  [BUG_STATUS.FIXED]: Object.freeze([BUG_STATUS.TESTING, BUG_STATUS.CLOSED, BUG_STATUS.REOPEN]),
  [BUG_STATUS.DONE]: Object.freeze([BUG_STATUS.CLOSED, BUG_STATUS.REOPEN]),
  [BUG_STATUS.REOPEN]: Object.freeze([BUG_STATUS.ASSIGNED, BUG_STATUS.IN_PROGRESS]),
  [BUG_STATUS.CLOSED]: Object.freeze([]),
  [BUG_STATUS.REJECTED]: Object.freeze([BUG_STATUS.REOPEN]),
  [BUG_STATUS.DEFERRED]: Object.freeze([]),
});

const BUG_TERMINAL_STATUS_VALUES = Object.freeze([
  BUG_STATUS.DONE,
  BUG_STATUS.CLOSED,
  BUG_STATUS.REJECTED,
  BUG_STATUS.DEFERRED,
  BUG_STATUS.DUPLICATE,
]);

const normalizeToken = (value, fallback = "") => {
  if (value === null || typeof value === "undefined") {
    return fallback;
  }

  const normalizedValue = String(value)
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");

  return normalizedValue || fallback;
};

const normalizeBugStatus = (value, fallback = "") => {
  const normalizedValue = normalizeToken(value, fallback);

  if (normalizedValue === "RE_OPEN") {
    return BUG_STATUS.REOPEN;
  }

  return normalizedValue;
};

const BUG_LIFECYCLE_STATUS = Object.freeze({
  REPORTED: "REPORTED",
  ASSIGNED: "ASSIGNED",
  IN_PROGRESS: "IN_PROGRESS",
  READY_FOR_QA: "READY_FOR_QA",
  REOPENED: "REOPENED",
  CLOSED: "CLOSED",
});

const BUG_LIFECYCLE_STATUS_VALUES = Object.freeze(Object.values(BUG_LIFECYCLE_STATUS));

const getBugLifecycleStatus = (value, fallback = BUG_LIFECYCLE_STATUS.REPORTED) => {
  const normalizedValue = normalizeToken(value, fallback);

  if (["REPORTED", "NEW", "OPEN", "TRIAGED", "TODO", "NEEDS_TRIAGE", "AVAILABLE_QUEUE"].includes(normalizedValue)) {
    return BUG_LIFECYCLE_STATUS.REPORTED;
  }

  if (normalizedValue === "ASSIGNED") {
    return BUG_LIFECYCLE_STATUS.ASSIGNED;
  }

  if (["IN_PROGRESS", "INPROGRESS"].includes(normalizedValue)) {
    return BUG_LIFECYCLE_STATUS.IN_PROGRESS;
  }

  if (["READY_FOR_QA", "READYFORQA", "FIXED", "TESTING", "QA", "REVIEW"].includes(normalizedValue)) {
    return BUG_LIFECYCLE_STATUS.READY_FOR_QA;
  }

  if (["REOPEN", "RE_OPEN", "REOPENED"].includes(normalizedValue)) {
    return BUG_LIFECYCLE_STATUS.REOPENED;
  }

  if (["CLOSED", "DONE", "RESOLVED"].includes(normalizedValue)) {
    return BUG_LIFECYCLE_STATUS.CLOSED;
  }

  return fallback;
};

const getCanonicalBugStatus = (value, fallback = BUG_STATUS.NEW) => {
  const normalizedValue = normalizeBugStatus(value, fallback);

  if (BUG_STATUS_VALUES.includes(normalizedValue)) {
    return normalizedValue;
  }

  return fallback;
};

const isBugStatus = (value) => BUG_STATUS_VALUES.includes(normalizeBugStatus(value));

const getBugStatusLabel = (status) =>
  BUG_STATUS_LABELS[getCanonicalBugStatus(status, "")] || String(status || "");

const normalizeBugSeverity = (value, fallback = "") => {
  const normalizedValue = normalizeToken(value, fallback);

  return (
    BUG_SEVERITY_VALUES.find(
      (severity) => severity.toUpperCase() === normalizedValue
    ) || fallback
  );
};

const normalizeBugPriority = (value, fallback = "") => {
  const normalizedValue = normalizeToken(value, fallback);

  return (
    BUG_PRIORITY_VALUES.find(
      (priority) => priority.toUpperCase() === normalizedValue
    ) || fallback
  );
};

module.exports = {
  BUG_SEVERITIES,
  BUG_SEVERITY_VALUES,
  BUG_PRIORITIES,
  BUG_PRIORITY_VALUES,
  BUG_STATUS,
  BUG_STATUS_VALUES,
  BUG_STATUS_LABELS,
  BUG_LIFECYCLE_STATUS,
  BUG_LIFECYCLE_STATUS_VALUES,
  BUG_STATUS_FLOW,
  BUG_ALTERNATE_TRANSITIONS,
  BUG_ALLOWED_TRANSITIONS,
  BUG_TERMINAL_STATUS_VALUES,
  normalizeBugStatus,
  getBugLifecycleStatus,
  getCanonicalBugStatus,
  isBugStatus,
  getBugStatusLabel,
  normalizeBugSeverity,
  normalizeBugPriority,
};
