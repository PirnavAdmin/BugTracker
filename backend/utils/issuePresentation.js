const {
  ISSUE_STATUS,
  getCanonicalIssueStatus,
} = require("../utils/issueStatus");
const { getBugLifecycleStatus } = require("../utils/bugLifecycle");
const { getCanonicalIssueType, ISSUE_TYPES } = require("../utils/issueTypes");

const issuePopulation = [
  { path: "assignee", select: "name email role" },
  { path: "bugDetails.testerOwner", select: "name email role" },
  { path: "bugDetails.developerLead", select: "name email role" },
  { path: "dependsOnIssueId", select: "title status dueAt" },
  { path: "dependencyIds", select: "title type status priority dueAt" },
  {
    path: "parentStoryId",
    select:
      "title type status priority storyPoints storyProgress epicId sprintId acceptanceCriteria",
  },
  { path: "parentTaskId", select: "title type status priority" },
  { path: "reporter", select: "name email role" },
  {
    path: "projectId",
    select:
      "name shortCode description createdBy isCompleted status priority themeColor manager projectManager teamLead qaLead",
  },
  { path: "teamId", select: "name description workspaceId" },
  { path: "epicId", select: "name color status planningOrder" },
  { path: "sprintId", select: "name state startDate endDate teamId startedAt completedAt" },
  { path: "updatedBy", select: "name email role" },
  { path: "closedBy", select: "name email role" },
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

  return {
    ...serializedIssue,
    status,
    bugLifecycleStatus: isBug ? getBugLifecycleStatus(status) : null,
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
  };
};

const serializeIssues = (issues = []) => issues.map(serializeIssue);

module.exports = {
  populateIssueQuery,
  populateIssueDocument,
  serializeIssue,
  serializeIssues,
};
