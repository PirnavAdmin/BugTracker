const {
  ISSUE_STATUS,
  getCanonicalIssueStatus,
} = require("../utils/issueStatus");
const { getBugLifecycleStatus } = require("../utils/bugLifecycle");
const { getCanonicalIssueType, ISSUE_TYPES } = require("../utils/issueTypes");
const { buildIssueTimingMeta } = require("./issueTiming");
const { buildSprintLifecycleMeta } = require("./sprintLifecycle");

const issuePopulation = [
  { path: "assignee", select: "name email role avatarUrl" },
  { path: "assignees", select: "name email role avatarUrl" },
  { path: "bugDetails.testerOwner", select: "name email role avatarUrl" },
  { path: "bugDetails.developerLead", select: "name email role avatarUrl" },
  { path: "dependsOnIssueId", select: "title status dueAt" },
  { path: "dependencyIds", select: "title type status priority dueAt" },
  {
    path: "parentStoryId",
    select:
      "title type status priority storyPoints storyProgress epicId sprintId acceptanceCriteria",
  },
  { path: "parentTaskId", select: "title type status priority" },
  { path: "reporter", select: "name email role avatarUrl" },
  {
    path: "projectId",
    select:
      "name shortCode description createdBy isCompleted status priority themeColor manager projectManager teamLead qaLead",
    populate: [
      { path: "manager", select: "name email role avatarUrl" },
      { path: "projectManager", select: "name email role avatarUrl" },
      { path: "teamLead", select: "name email role avatarUrl" },
      { path: "qaLead", select: "name email role avatarUrl" },
    ],
  },
  { path: "teamId", select: "name description workspaceId" },
  { path: "epicId", select: "name color status planningOrder" },
  { path: "sprintId", select: "name state startDate endDate teamId startedAt completedAt" },
  { path: "updatedBy", select: "name email role avatarUrl" },
  { path: "closedBy", select: "name email role avatarUrl" },
];

const populateIssueQuery = (query) => query.populate(issuePopulation);

const populateIssueDocument = (issue) => issue.populate(issuePopulation);

const serializeIssue = (issue) => {
  const serializedIssue =
    typeof issue?.toObject === "function"
      ? issue.toObject()
      : {
          ...issue,
        };
  const assigneeReference =
    serializedIssue?.assignee?._id || serializedIssue?.assignee || null;
  const collaboratorReferences = Array.isArray(serializedIssue?.assignees)
    ? serializedIssue.assignees
        .map((assignee) => assignee?._id || assignee)
        .filter(Boolean)
    : [];
  const dependencyIssue =
    serializedIssue?.dependsOnIssueId &&
    typeof serializedIssue.dependsOnIssueId === "object"
      ? {
          ...serializedIssue.dependsOnIssueId,
          status: getCanonicalIssueStatus(
            serializedIssue.dependsOnIssueId.status,
            ISSUE_STATUS.TODO
          ),
        }
      : serializedIssue?.dependsOnIssueId || null;

  const status = getCanonicalIssueStatus(serializedIssue.status, ISSUE_STATUS.TODO);
  const type = getCanonicalIssueType(serializedIssue.type, serializedIssue.type);
  const isBug = type === ISSUE_TYPES.BUG;
  const sprintMeta =
    serializedIssue?.sprintId && typeof serializedIssue.sprintId === "object"
      ? {
          ...serializedIssue.sprintId,
          ...buildSprintLifecycleMeta(serializedIssue.sprintId),
        }
      : serializedIssue?.sprintId || null;

  return {
    ...serializedIssue,
    status,
    bugLifecycleStatus: isBug ? getBugLifecycleStatus(status) : null,
    sprintId: sprintMeta,
    reporterName:
      serializedIssue.reporterName ||
      serializedIssue.reporter?.name ||
      serializedIssue.reporter?.email ||
      "",
    testerOwnerName:
      serializedIssue.testerOwnerName ||
      serializedIssue.bugDetails?.testerOwner?.name ||
      serializedIssue.bugDetails?.testerOwner?.email ||
      "",
    dependsOnIssueId: dependencyIssue,
    assigneeId: assigneeReference ? String(assigneeReference) : null,
    assigneeIds: collaboratorReferences.length
      ? collaboratorReferences.map((assignee) => String(assignee))
      : assigneeReference
        ? [String(assigneeReference)]
        : [],
    assignedDeveloperId: serializedIssue.assignedDeveloperId
      ? String(serializedIssue.assignedDeveloperId)
      : null,
    previousAssignedDeveloperId: serializedIssue.previousAssignedDeveloperId
      ? String(serializedIssue.previousAssignedDeveloperId)
      : null,
    assignedDeveloperName:
      serializedIssue.assignedDeveloperName ||
      serializedIssue.bugDetails?.developerLead?.name ||
      serializedIssue.assignee?.name ||
      "",
    ...buildIssueTimingMeta({
      dueAt: serializedIssue.dueAt,
      status,
    }),
  };
};

const serializeIssues = (issues = []) => issues.map(serializeIssue);

module.exports = {
  populateIssueQuery,
  populateIssueDocument,
  serializeIssue,
  serializeIssues,
};
