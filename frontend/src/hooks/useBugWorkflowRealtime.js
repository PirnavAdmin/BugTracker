import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import {
  ISSUE_STATUS,
  isBugIssue,
  isIssueClosed,
  normalizeBugLifecycleStatus,
} from "@/lib/issues";
import { isTaskOnlyIssueQueryKey, removeBugsFromTaskOnlyIssueCache } from "@/lib/bug-workflow-cache";
import { getChatSocket } from "@/lib/socket";

const BUG_EVENTS = [
  "BugCreated",
  "BugUpdated",
  "BugAssigned",
  "BugPicked",
  "BugStatusChanged",
  "BugPriorityChanged",
  "BugClosed",
  "BugReopened",
  "CommentAdded",
];

const AVAILABLE_BUCKET_STATUSES = new Set([
  ISSUE_STATUS.NEW,
  ISSUE_STATUS.TRIAGED,
  ISSUE_STATUS.AVAILABLE_QUEUE,
  ISSUE_STATUS.OPEN,
  ISSUE_STATUS.REOPEN,
]);
const DEVELOPER_WORKFLOW_QUERY_MARKERS = new Set([
  "available",
  "developer-dashboard",
  "developer-bug-board",
]);

const getId = (value) => String(value?._id || value || "");

const getEventBug = (bug) => {
  if (!bug || typeof bug !== "object" || !bug.status || !isBugIssue(bug)) {
    return bug;
  }

  // The top-level workflow status is the persisted source of truth. Socket
  // payloads from older clients may omit bugLifecycleStatus, and cached issues
  // may still carry the lifecycle from before a reopen/re-verify transition.
  return {
    ...bug,
    bugLifecycleStatus: normalizeBugLifecycleStatus(bug.status),
  };
};

const getAssignedDeveloperId = (bug) =>
  getId(bug?.assignedDeveloperId) ||
  getId(bug?.bugDetails?.developerLead) ||
  getId(bug?.assignee);

const isAvailableBucketBug = (bug) =>
  Boolean(bug) &&
  !getId(bug.assignee) &&
  !getId(bug.assignedDeveloperId) &&
  !getId(bug?.bugDetails?.developerLead) &&
  AVAILABLE_BUCKET_STATUSES.has(String(bug.status || "").toUpperCase());

const mergeBugIntoList = (queryKey, current, bug, { eventName, userId }) => {
  if (!Array.isArray(current) || !bug?._id) {
    return current;
  }

  if (isTaskOnlyIssueQueryKey(queryKey)) {
    return removeBugsFromTaskOnlyIssueCache(queryKey, current);
  }

  const queryIsBucket = current.some((item) => Boolean(item?.pickupEligibility));
  const queryIsPersonal = current.some(
    (item) =>
      getId(item?.assignee) === userId ||
      getId(item?.reporter) === userId ||
      getId(item?.bugDetails?.testerOwner) === userId ||
      getAssignedDeveloperId(item) === userId
  );
  const existingIndex = current.findIndex((item) => item?._id === bug._id);

  if (queryIsBucket && !isAvailableBucketBug(bug)) {
    return existingIndex >= 0
      ? current.filter((item) => item?._id !== bug._id)
      : current;
  }

  if (existingIndex >= 0) {
    return current.map((item) =>
      item?._id === bug._id ? { ...item, ...getEventBug(bug) } : item
    );
  }

  if (
    eventName === "BugCreated" ||
    (queryIsBucket && isAvailableBucketBug(bug)) ||
    (queryIsPersonal && getAssignedDeveloperId(bug) === userId)
  ) {
    return [bug, ...current];
  }

  return current;
};

const isDeveloperWorkflowQuery = (queryKey = []) =>
  queryKey.some((part) => DEVELOPER_WORKFLOW_QUERY_MARKERS.has(String(part || "")));

const shouldPruneFromDeveloperWorkflow = (queryKey, bug) =>
  isDeveloperWorkflowQuery(queryKey) && isBugIssue(bug) && isIssueClosed(bug);

const invalidateWorkflowQueries = (queryClient) => {
  ["issues", "bugs", "reports", "analytics", "developer-dashboard"].forEach((key) => {
    // Incoming workflow events are merged into array-backed active views above.
    // Mark every other cached view stale without forcing the current board to
    // refetch and discard its optimistic state after each drag/drop.
    queryClient.invalidateQueries({ queryKey: [key], refetchType: "inactive" });
  });
};

export const useBugWorkflowRealtime = () => {
  const queryClient = useQueryClient();
  const { isAuthenticated, token, user } = useAuth();
  const userId = getId(user);

  useEffect(() => {
    if (!isAuthenticated || !token) {
      return undefined;
    }

    const socket = getChatSocket(token);

    if (!socket) {
      return undefined;
    }

    const handleBugEvent = (payload = {}, eventName = "BugUpdated") => {
      const bug = getEventBug(payload.bug || payload.issue);

      if (bug?._id) {
        const matchingQueries = queryClient
          .getQueryCache()
          .findAll({
            predicate: (query) =>
              ["issues", "bugs"].includes(String(query.queryKey?.[0] || "")),
          });

        // A dashboard list request may have started before this event. Cancel
        // it before merging the authoritative event so its older response
        // cannot replace the newer lifecycle state when it completes.
        matchingQueries.forEach((query) => {
          void queryClient.cancelQueries({ queryKey: query.queryKey, exact: true });
        });

        matchingQueries.forEach((query) => {
          queryClient.setQueryData(query.queryKey, (current) => {
            if (
              Array.isArray(current) &&
              shouldPruneFromDeveloperWorkflow(query.queryKey, bug)
            ) {
              return current.filter((item) => item?._id !== bug._id);
            }

            return mergeBugIntoList(query.queryKey, current, bug, { eventName, userId });
          });
        });
      }

      invalidateWorkflowQueries(queryClient);
    };

    BUG_EVENTS.forEach((eventName) => {
      socket.on(eventName, (payload) => handleBugEvent(payload, eventName));
    });

    if (!socket.connected) {
      socket.connect();
    }

    return () => {
      BUG_EVENTS.forEach((eventName) => {
        socket.off(eventName);
      });
    };
  }, [isAuthenticated, queryClient, token, userId]);
};
