const { ISSUE_TYPES } = require("../utils/issueTypes");
const { BUG_STATUS, normalizeBugStatus } = require("../utils/bugLifecycle");
const { isClosedIssueStatus } = require("../utils/issueStatus");

const QA_READY = new Set([BUG_STATUS.READY_FOR_QA, BUG_STATUS.READY_FOR_TESTING, BUG_STATUS.READY_FOR_VERIFICATION, BUG_STATUS.TESTING, BUG_STATUS.FIXED]);
const QA_ACCEPTED = new Set([BUG_STATUS.DONE, BUG_STATUS.CLOSED]);
const QA_REJECTED = new Set([BUG_STATUS.REOPEN, BUG_STATUS.REOPENED, BUG_STATUS.REJECTED]);
const idOf = (value) => String(value?._id || value || "");
const inRange = (date, { dateFrom, dateTo } = {}) => {
  const value = new Date(date).getTime();
  return Number.isFinite(value) && (!dateFrom || value >= new Date(dateFrom).getTime()) && (!dateTo || value <= new Date(dateTo).getTime());
};
const isStatusEvent = (entry) => entry.field === "status";

const emptyMetrics = () => ({
  tasksCompleted: 0, bugsResolved: 0, totalCompleted: 0, assignedWork: 0, completionRate: 0,
  tasksAssigned: 0, tasksActive: 0, taskStoryPointsDelivered: 0,
  bugsAssigned: 0, bugsActive: 0, bugsReadyForQA: 0, bugsClosedCurrent: 0,
  qaSubmissions: 0, firstPassAccepted: 0, firstPassFixRate: 0,
  qaRejected: 0, qaRejectionRate: 0, reworkedBugs: 0, reworkRate: 0, averageFixAttempts: 0,
  productionEscapes: 0, criticalProductionEscapes: 0,
  averageTaskResolutionTime: 0, averageBugResolutionTime: 0,
  activeWork: 0, readyForQA: 0,
});

// QA return events are attributed to the developer who submitted the immediately
// preceding fix, rather than the current assignee. This keeps QA and developer
// reporting deliberately separate while sharing the same status history.
const calculateDeveloperMetrics = ({ issues = [], history = [], developerId = "", dateFrom, dateTo } = {}) => {
  const metrics = emptyMetrics();
  const developer = String(developerId || "");
  const relevantIssues = issues;
  const issueIds = new Set(relevantIssues.map((issue) => idOf(issue._id)));
  const histories = history.filter((entry) => issueIds.has(idOf(entry.issueId))).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const eventsByIssue = histories.reduce((rows, entry) => {
    const id = idOf(entry.issueId); rows.set(id, [...(rows.get(id) || []), entry]); return rows;
  }, new Map());
  const completedTaskDurations = [];
  const completedBugDurations = [];
  const reworked = new Set();

  relevantIssues.forEach((issue) => {
    const issueId = idOf(issue._id);
    const owner = idOf(issue.assignedDeveloperId || issue.bugDetails?.developerLead || issue.assignee);
    const belongsToDeveloper = !developer || owner === developer;
    const events = eventsByIssue.get(issueId) || [];
    const completion = events.filter((entry) => isStatusEvent(entry) && isClosedIssueStatus(entry.toValue)).at(-1);
    if (belongsToDeveloper) metrics.assignedWork += 1;
    if (belongsToDeveloper && !isClosedIssueStatus(issue.status)) metrics.activeWork += 1;
    if (issue.type !== ISSUE_TYPES.BUG) {
      if (belongsToDeveloper) {
        metrics.tasksAssigned += 1;
        if (!isClosedIssueStatus(issue.status)) metrics.tasksActive += 1;
      }
      if (belongsToDeveloper && completion && inRange(completion.createdAt, { dateFrom, dateTo })) {
        metrics.tasksCompleted += 1;
        metrics.taskStoryPointsDelivered += Number(issue.storyPoints || 0);
        const duration = new Date(completion.createdAt) - new Date(issue.createdAt);
        if (duration >= 0) completedTaskDurations.push(duration);
      }
      return;
    }

    if (belongsToDeveloper) {
      metrics.bugsAssigned += 1;
      if (!isClosedIssueStatus(issue.status)) metrics.bugsActive += 1;
      if (isClosedIssueStatus(issue.status)) metrics.bugsClosedCurrent += 1;
      if (QA_READY.has(normalizeBugStatus(issue.status, ""))) metrics.bugsReadyForQA += 1;
    }

    let currentDeveloper = owner;
    let submittedDeveloper = "";
    let attempts = 0;
    let firstOutcomePending = false;
    events.forEach((entry) => {
      if (["assignee", "assignedDeveloperId", "bugDetails.developerLead"].includes(entry.field)) {
        currentDeveloper = idOf(entry.toValue) || currentDeveloper;
        return;
      }
      if (!isStatusEvent(entry)) return;
      const from = normalizeBugStatus(entry.fromValue, "");
      const to = normalizeBugStatus(entry.toValue, "");
      if (QA_READY.has(to)) {
        submittedDeveloper = currentDeveloper || owner;
        if (!developer || submittedDeveloper === developer) {
          attempts += 1;
          metrics.qaSubmissions += 1;
          if (attempts === 1) firstOutcomePending = true;
        }
      }
      if ((QA_ACCEPTED.has(to) || QA_REJECTED.has(to)) && QA_READY.has(from)) {
        const responsibleDeveloper = submittedDeveloper || currentDeveloper || owner;
        if (!developer || responsibleDeveloper === developer) {
          if (QA_REJECTED.has(to)) {
            metrics.qaRejected += 1;
            reworked.add(issueId);
            firstOutcomePending = false;
          } else if (firstOutcomePending) {
            metrics.firstPassAccepted += 1;
            firstOutcomePending = false;
          }
        }
      }
    });
    if (belongsToDeveloper && completion && inRange(completion.createdAt, { dateFrom, dateTo })) {
      metrics.bugsResolved += 1;
      const duration = new Date(completion.createdAt) - new Date(issue.createdAt);
      if (duration >= 0) completedBugDurations.push(duration);
    }
    if (belongsToDeveloper && QA_READY.has(normalizeBugStatus(issue.status, ""))) metrics.readyForQA += 1;
  });
  metrics.reworkedBugs = reworked.size;
  metrics.totalCompleted = metrics.tasksCompleted + metrics.bugsResolved;
  metrics.completionRate = metrics.assignedWork ? Math.round(metrics.totalCompleted / metrics.assignedWork * 100) : 0;
  metrics.firstPassFixRate = metrics.qaSubmissions ? Math.round(metrics.firstPassAccepted / metrics.qaSubmissions * 100) : 0;
  metrics.qaRejectionRate = metrics.qaSubmissions ? Math.round(metrics.qaRejected / metrics.qaSubmissions * 100) : 0;
  metrics.reworkRate = metrics.qaSubmissions ? Math.round(metrics.qaRejected / metrics.qaSubmissions * 100) : 0;
  const fixedBugs = new Set();
  histories.forEach((entry) => { if (QA_READY.has(normalizeBugStatus(entry.toValue, ""))) fixedBugs.add(idOf(entry.issueId)); });
  metrics.averageFixAttempts = fixedBugs.size ? Number((metrics.qaSubmissions / fixedBugs.size).toFixed(2)) : 0;
  metrics.averageTaskResolutionTime = completedTaskDurations.length ? Math.round(completedTaskDurations.reduce((a, b) => a + b, 0) / completedTaskDurations.length) : 0;
  metrics.averageBugResolutionTime = completedBugDurations.length ? Math.round(completedBugDurations.reduce((a, b) => a + b, 0) / completedBugDurations.length) : 0;
  return metrics;
};

const calculateDeveloperMetricsByDeveloper = (args = {}) => {
  const ids = new Set(args.issues.flatMap((issue) => [issue.assignee, issue.assignedDeveloperId, issue.bugDetails?.developerLead].map(idOf).filter(Boolean)));
  return Array.from(ids).reduce((rows, developerId) => ({ ...rows, [developerId]: calculateDeveloperMetrics({ ...args, developerId }) }), {});
};

module.exports = { calculateDeveloperMetrics, calculateDeveloperMetricsByDeveloper };
