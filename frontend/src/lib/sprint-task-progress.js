import { isIssueClosed, resolveIssueAssigneeIds } from "./issues.js";

export const ACTIVE_SPRINT_TASK_FILTER = "active-sprint-tasks";
export const MY_SPRINT_TASKS_PATH = `/tasks?filter=${ACTIVE_SPRINT_TASK_FILTER}`;

// Keep the dashboard's existing stored-state definition of active for this metric.
export const isActiveSprintTask = (issue) =>
  ["Task", "Sub-task"].includes(issue?.type) &&
  String(issue?.sprintId?.state || issue?.sprintId?.status || "") === "ACTIVE";

export const selectMyActiveSprintTasks = (issues, userId) =>
  issues.filter(
    (issue) => isActiveSprintTask(issue) &&
      Boolean(userId) && resolveIssueAssigneeIds(issue).includes(String(userId))
  );

export const calculateSprintTaskProgress = (taskIssues) => {
  const activeSprintTasks = taskIssues.filter(isActiveSprintTask);
  const total = activeSprintTasks.length;
  const completed = activeSprintTasks.filter(isIssueClosed).length;

  return {
    completed,
    total,
    percentage: total ? Math.round((completed / total) * 100) : 0,
    hasActiveSprint: total > 0,
  };
};
