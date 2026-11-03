import { ISSUE_TYPES, isBugIssue, normalizeIssueType } from "./issues.js";

const TASK_ONLY_QUERY_MARKERS = new Set([
  "task-progress",
  "tasks-page",
  "issues-page",
]);

export const isTaskOnlyIssueQueryKey = (queryKey = []) => {
  if (
    (queryKey[1] === "my" && queryKey[2] === "tasks") ||
    TASK_ONLY_QUERY_MARKERS.has(String(queryKey[1] || ""))
  ) {
    return true;
  }

  return queryKey.some((part) => {
    if (!part || typeof part !== "object" || Array.isArray(part)) return false;
    const type = normalizeIssueType(part.type, "");
    const excludedType = normalizeIssueType(part.excludeType, "");
    return [ISSUE_TYPES.TASK, ISSUE_TYPES.SUB_TASK].includes(type) ||
      excludedType === ISSUE_TYPES.BUG;
  });
};

export const removeBugsFromTaskOnlyIssueCache = (queryKey, current) => {
  if (!isTaskOnlyIssueQueryKey(queryKey) || !Array.isArray(current)) return current;
  const tasksOnly = current.filter((issue) => !isBugIssue(issue));
  return tasksOnly.length === current.length ? current : tasksOnly;
};

export const getDeveloperBugBucketQueryKey = (userId) => [
  "issues",
  "bucket",
  "available",
  String(userId || ""),
];

export const getDeveloperBugBucketQueryFilters = () => ({
  sortBy: "priority",
});

export const removeIssueFromBucketCaches = (queryClient, issueId) => {
  if (!issueId) {
    return;
  }

  queryClient.setQueriesData(
    {
      predicate: (query) =>
        query.queryKey?.[0] === "issues" && query.queryKey?.[1] === "bucket",
    },
    (current = []) =>
      Array.isArray(current)
        ? current.filter((issue) => issue?._id !== issueId)
        : current
  );
};
