const DAY = 86_400_000;
const CLOSED = new Set(["DONE", "CLOSED", "REJECTED", "DEFERRED"]);

export const clamp = (value, min = 0, max = 100) =>
  Math.min(max, Math.max(min, Number.isFinite(Number(value)) ? Number(value) : 0));
export const ratio = (part, total) => (total > 0 ? (Number(part || 0) / total) * 100 : 0);
const dateValue = (value) => {
  const time = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(time) ? time : null;
};
const duration = (start, end) => {
  const from = dateValue(start);
  const to = dateValue(end);
  return from !== null && to !== null && to >= from ? to - from : null;
};
const average = (values) => {
  const valid = values.filter((value) => Number.isFinite(value));
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : 0;
};
export const isClosedWorkItem = (issue) => CLOSED.has(issue?.status);
export const splitWorkItems = (issues = []) => ({
  tasks: issues.filter((issue) => issue?.type !== "BUG"),
  bugs: issues.filter((issue) => issue?.type === "BUG"),
});

export const calculateTaskMetrics = (tasks = []) => {
  const completed = tasks.filter(isClosedWorkItem);
  const committedPoints = tasks.reduce((sum, issue) => sum + Number(issue.storyPoints || 0), 0);
  const deliveredPoints = completed.reduce((sum, issue) => sum + Number(issue.storyPoints || 0), 0);
  const slaEligible = tasks.filter((issue) => issue.dueAt);
  const slaMet = slaEligible.filter((issue) => {
    const deadline = dateValue(issue.dueAt);
    const completion = dateValue(issue.closedAt);
    return completion ? completion <= deadline : Date.now() <= deadline;
  });

  return {
    total: tasks.length,
    completed: completed.length,
    open: tasks.length - completed.length,
    completionRate: ratio(completed.length, tasks.length),
    committedPoints,
    deliveredPoints,
    velocity: deliveredPoints || completed.length,
    leadTimeMs: average(completed.map((issue) => duration(issue.createdAt, issue.closedAt))),
    cycleTimeMs: average(completed.map((issue) => duration(issue.startedAt || issue.createdAt, issue.closedAt))),
    slaCompliance: slaEligible.length ? ratio(slaMet.length, slaEligible.length) : 100,
    overdue: tasks.filter((issue) => issue.dueAt && !isClosedWorkItem(issue) && dateValue(issue.dueAt) < Date.now()).length,
    productivity: ratio(deliveredPoints || completed.length, committedPoints || tasks.length),
  };
};

export const calculateBugMetrics = (bugs = [], deliveredPoints = 0) => {
  const resolved = bugs.filter(isClosedWorkItem);
  const reopened = bugs.filter((bug) => Number(bug.reopenedCount || 0) > 0 || bug.status === "REOPEN");
  const triaged = bugs.map((bug) => duration(bug.createdAt, bug.startedAt)).filter(Number.isFinite);
  const slaEligible = bugs.filter((bug) => bug.dueAt);
  const slaMet = slaEligible.filter((bug) => {
    const deadline = dateValue(bug.dueAt);
    const completion = dateValue(bug.closedAt);
    return completion ? completion <= deadline : Date.now() <= deadline;
  });
  const leakageRate = ratio(reopened.length, Math.max(resolved.length, bugs.length));
  const criticalOpen = bugs.filter(
    (bug) => !isClosedWorkItem(bug) && ["Blocker", "Critical"].includes(bug.severity)
  ).length;

  return {
    total: bugs.length,
    open: bugs.length - resolved.length,
    resolved: resolved.length,
    fixRate: ratio(resolved.length, bugs.length),
    mttrMs: average(resolved.map((bug) => duration(bug.createdAt, bug.closedAt))),
    mttdMs: average(triaged),
    reopened: reopened.length,
    bugLeakage: leakageRate,
    defectDensity: deliveredPoints > 0 ? (bugs.length / deliveredPoints) * 100 : 0,
    slaCompliance: slaEligible.length ? ratio(slaMet.length, slaEligible.length) : 100,
    criticalOpen,
    qualityScore: clamp(100 - leakageRate * 0.65 - ratio(criticalOpen, Math.max(bugs.length, 1)) * 0.35),
  };
};

const resolveDeveloperOwner = (issue) =>
  issue?.developerLead ||
  issue?.bugDetails?.developerLead ||
  issue?.assignedDeveloperId ||
  issue?.assignee ||
  issue?.assignees?.[0] ||
  null;
const ownerId = (issue) => {
  const owner = resolveDeveloperOwner(issue);
  return String(owner?._id || owner?.id || owner || "unassigned");
};
const ownerName = (issue) => {
  const owner = resolveDeveloperOwner(issue);
  return owner?.name || owner?.email || "Unassigned";
};
const scoreLabel = (score) =>
  score >= 85 ? "Excellent" : score >= 70 ? "Good" : score >= 55 ? "Average" : "Needs Improvement";

export const calculateDeveloperPerformance = (tasks = [], bugs = []) => {
  const rows = new Map();
  const ensure = (issue) => {
    const id = ownerId(issue);
    const row = rows.get(id) || { id, name: ownerName(issue), tasks: [], bugs: [], projects: new Set(), teams: new Set() };
    if (issue.project?._id) row.projects.add(String(issue.project._id));
    if (issue.team?._id) row.teams.add(String(issue.team._id));
    rows.set(id, row);
    return row;
  };
  tasks.forEach((issue) => ensure(issue).tasks.push(issue));
  bugs.forEach((issue) => ensure(issue).bugs.push(issue));

  return Array.from(rows.values())
    .filter((row) => row.id !== "unassigned")
    .map((row) => {
      const task = calculateTaskMetrics(row.tasks);
      const bug = calculateBugMetrics(row.bugs, task.deliveredPoints);
      const qaRejected = row.bugs.filter((issue) => issue.status === "REJECTED").length;
      const reviewCompletion = ratio(
        row.tasks.filter((issue) => issue.reviewCompleted || isClosedWorkItem(issue)).length,
        row.tasks.length
      );
      const sprintContribution = ratio(task.deliveredPoints || task.completed, Math.max(task.committedPoints || task.total, 1));
      const deploymentSuccess = clamp(100 - bug.bugLeakage);
      const collaboration = clamp(50 + Math.min(row.projects.size * 8, 24) + Math.min(row.teams.size * 10, 20));
      const resolutionScore = clamp(100 - (bug.mttrMs / DAY / 10) * 100);
      const trendScore = clamp((task.completionRate + bug.fixRate) / 2);
      const dimensions = {
        taskCompletionRate: task.completionRate,
        storyPointsDelivered: ratio(task.deliveredPoints, Math.max(task.committedPoints, 1)),
        bugFixRate: bug.fixRate,
        averageResolutionTime: resolutionScore,
        codeReviewCompletion: reviewCompletion,
        qaAcceptanceRate: 100 - ratio(qaRejected, Math.max(row.bugs.length, 1)),
        reopenedBugQuality: 100 - bug.bugLeakage,
        slaCompliance: (task.slaCompliance + bug.slaCompliance) / 2,
        productivityTrend: trendScore,
        sprintContribution,
        deploymentSuccess,
        collaborationScore: collaboration,
      };
      const weights = {
        taskCompletionRate: 0.13, storyPointsDelivered: 0.1, bugFixRate: 0.1,
        averageResolutionTime: 0.08, codeReviewCompletion: 0.08, qaAcceptanceRate: 0.08,
        reopenedBugQuality: 0.09, slaCompliance: 0.09, productivityTrend: 0.07,
        sprintContribution: 0.07, deploymentSuccess: 0.06, collaborationScore: 0.05,
      };
      const score = clamp(Object.entries(dimensions).reduce((sum, [key, value]) => sum + clamp(value) * weights[key], 0));
      const sorted = Object.entries(dimensions).sort((left, right) => right[1] - left[1]);

      return {
        ...row,
        taskMetrics: task,
        bugMetrics: bug,
        dimensions,
        score: Math.round(score),
        rating: Math.max(1, Math.min(5, Math.round(score / 20))),
        label: scoreLabel(score),
        strengths: sorted.slice(0, 3).map(([key]) => key),
        improvements: sorted.slice(-3).reverse().map(([key]) => key),
      };
    })
    .sort((left, right) => right.score - left.score)
    .map((row, index) => ({ ...row, rank: index + 1, topPerformer: index === 0 && row.score >= 70 }));
};

export const buildPerformanceInsights = (developer) => {
  if (!developer) return [];
  const insights = [];
  if (developer.taskMetrics.completionRate >= 80) insights.push("Delivery reliability is a clear strength; preserve the current planning discipline.");
  if (developer.bugMetrics.bugLeakage > 15) insights.push("Reopen leakage is elevated; add a focused pre-QA regression checklist.");
  if (developer.dimensions.slaCompliance < 75) insights.push("SLA performance needs attention; surface aging work earlier in the sprint.");
  if (developer.dimensions.codeReviewCompletion < 70) insights.push("Increase review completion by reserving daily review capacity.");
  if (!insights.length) insights.push("Performance is balanced across delivery and quality; continue monitoring trend stability.");
  return insights;
};

export const metricLabel = (key) => key.replace(/([A-Z])/g, " $1").replace(/^./, (value) => value.toUpperCase());
