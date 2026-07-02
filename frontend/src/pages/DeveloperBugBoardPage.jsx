import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bug, RefreshCcw, Search } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import {
  fetchBugBucket,
  fetchMyIssues,
  fetchProjects,
  pickIssue,
  updateIssue,
} from "@/lib/api";
import {
  BUG_PRIORITY_OPTIONS,
  BUG_SEVERITY_OPTIONS,
  BUG_STATUS_OPTIONS,
  ISSUE_STATUS,
  getIssueDisplayKey,
  isBugIssue,
  isIssueClosed,
  normalizeBugStatusForIssue,
  resolveBugDetails,
  resolveIssueProjectId,
} from "@/lib/issues";
import { useAuth } from "@/hooks/use-auth";
import { useBugWorkflowRealtime } from "@/hooks/useBugWorkflowRealtime";
import {
  getDeveloperBugBucketQueryFilters,
  getDeveloperBugBucketQueryKey,
  removeIssueFromBucketCaches,
} from "@/lib/bug-workflow-cache";
import BugKanbanBoard from "@/components/bugs/BugKanbanBoard";
import {
  DEVELOPER_BUG_COLUMNS,
  getBugColumnKey,
} from "@/components/bugs/bugBoardConfig";
import IssueDetailsDialog from "@/components/issues/IssueDetailsDialog";
import EmptyState from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const getSeverity = (issue) => resolveBugDetails(issue)?.severity || "Not set";
const getModuleName = (issue) => resolveBugDetails(issue)?.moduleName || "Unmapped module";
const getReporterName = (issue) =>
  issue?.reporter?.name || resolveBugDetails(issue)?.testerOwner?.name || "Unknown reporter";

const dedupeIssues = (issues = []) => {
  const seen = new Map();

  issues.forEach((issue) => {
    if (issue?._id) {
      seen.set(issue._id, issue);
    }
  });

  return Array.from(seen.values());
};

const DeveloperBugBoardPage = () => {
  useBugWorkflowRealtime();

  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [selectedIssue, setSelectedIssue] = useState(null);
  const [statusError, setStatusError] = useState("");
  const [filters, setFilters] = useState({
    search: "",
    status: searchParams.get("status") === "available" ? "available" : "all",
    severity: "all",
    priority: "all",
    projectId: "all",
  });
  const userId = String(user?._id || user?.id || "");
  const myIssuesQueryKey = useMemo(() => ["issues", "my", userId, "developer-bug-board"], [userId]);
  const bucketQueryKey = useMemo(() => getDeveloperBugBucketQueryKey(userId), [userId]);

  const {
    data: projects = [],
    isLoading: isProjectsLoading,
    error: projectsError,
  } = useQuery({
    queryKey: ["projects"],
    queryFn: fetchProjects,
  });

  const {
    data: myIssues = [],
    isLoading: isMyIssuesLoading,
    error: myIssuesError,
    refetch: refetchMyIssues,
    isFetching: isMyIssuesFetching,
  } = useQuery({
    queryKey: myIssuesQueryKey,
    queryFn: () =>
      fetchMyIssues({
        type: "Bug",
        limit: 250,
        sortBy: "recently-updated",
      }),
    enabled: Boolean(userId),
  });

  const {
    data: bucketIssues = [],
    isLoading: isBucketLoading,
    error: bucketError,
    refetch: refetchBucket,
    isFetching: isBucketFetching,
  } = useQuery({
    queryKey: bucketQueryKey,
    queryFn: () => fetchBugBucket(getDeveloperBugBucketQueryFilters()),
    enabled: Boolean(userId),
  });

  const assignedBugIssues = useMemo(
    () =>
      (Array.isArray(myIssues)
        ? myIssues.filter((issue) => isBugIssue(issue))
        : []),
    [myIssues]
  );
  const availableBugIssues = useMemo(
    () =>
      (Array.isArray(bucketIssues) ? bucketIssues : [])
        .filter((issue) => !isIssueClosed(issue))
        .map((issue) => ({
          ...issue,
          status: normalizeBugStatusForIssue(issue),
        })),
    [bucketIssues]
  );
  const boardIssues = useMemo(
    () => dedupeIssues([...availableBugIssues, ...assignedBugIssues]),
    [assignedBugIssues, availableBugIssues]
  );

  useEffect(() => {
    if (!selectedIssue) {
      return;
    }

    const nextIssue = boardIssues.find((issue) => issue._id === selectedIssue._id);

    if (nextIssue) {
      setSelectedIssue(nextIssue);
    }
  }, [boardIssues, selectedIssue]);

  const filteredIssues = useMemo(() => {
    const search = filters.search.trim().toLowerCase();

    return boardIssues.filter((issue) => {
      const status = normalizeBugStatusForIssue(issue);

      if (
        filters.status === "available" &&
        getBugColumnKey(issue, DEVELOPER_BUG_COLUMNS) !== "available"
      ) {
        return false;
      }

      if (filters.status !== "all" && filters.status !== "available" && status !== filters.status) {
        return false;
      }

      if (filters.severity !== "all" && getSeverity(issue) !== filters.severity) {
        return false;
      }

      if (filters.priority !== "all" && issue.priority !== filters.priority) {
        return false;
      }

      if (filters.projectId !== "all" && resolveIssueProjectId(issue) !== filters.projectId) {
        return false;
      }

      if (!search) {
        return true;
      }

      return [
        getIssueDisplayKey(issue),
        issue.title,
        getReporterName(issue),
        issue.projectId?.name,
        getModuleName(issue),
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(search));
    });
  }, [boardIssues, filters]);

  const columnCounts = useMemo(
    () =>
      DEVELOPER_BUG_COLUMNS.reduce((counts, column) => {
        counts[column.key] = filteredIssues.filter(
          (issue) => getBugColumnKey(issue, DEVELOPER_BUG_COLUMNS) === column.key
        ).length;
        return counts;
      }, {}),
    [filteredIssues]
  );

  const statusMutation = useMutation({
    mutationFn: ({ id, payload }) => updateIssue({ id, payload }),
    onMutate: () => {
      setStatusError("");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["issues", "bucket"] });
      queryClient.invalidateQueries({ queryKey: ["issues"] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
    },
    onError: (error) => {
      setStatusError(error.response?.data?.message || "Unable to update this bug right now.");
    },
  });

  const pickMutation = useMutation({
    mutationFn: (issue) => pickIssue(issue._id),
    onMutate: () => {
      setStatusError("");
    },
    onSuccess: (pickedIssue) => {
      queryClient.setQueryData(myIssuesQueryKey, (current = []) =>
        Array.isArray(current) ? [pickedIssue, ...current] : current
      );
      removeIssueFromBucketCaches(queryClient, pickedIssue?._id);
      queryClient.invalidateQueries({ queryKey: ["issues"] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
    },
    onError: (error) => {
      setStatusError(error.response?.data?.message || "Unable to pick this bug right now.");
      queryClient.invalidateQueries({ queryKey: ["issues", "bucket"] });
    },
  });

  const handleStatusChange = (issue, status, nextColumnKey) => {
    const currentColumnKey = getBugColumnKey(issue, DEVELOPER_BUG_COLUMNS);

    if (currentColumnKey === "readyForQa") {
      setStatusError("Bugs submitted to QA are read-only for developers.");
      return Promise.reject(new Error("Ready for QA is read-only"));
    }

    if (currentColumnKey === "closed") {
      setStatusError("Closed bugs are read-only for developers.");
      return Promise.reject(new Error("Closed bugs are read-only"));
    }

    if (currentColumnKey === "available" && nextColumnKey === "assigned") {
      return pickMutation.mutateAsync(issue);
    }

    if (nextColumnKey === "available") {
      setStatusError("Available bugs can only be entered through the pickup queue.");
      return Promise.reject(new Error("Cannot move bug to available"));
    }

    return statusMutation.mutateAsync({
      id: issue._id,
      payload: {
        status,
      },
    });
  };

  const handleBoardAction = (action, issue) => {
    const actionMap = {
      pick: () => pickMutation.mutateAsync(issue),
      start: () =>
        statusMutation.mutateAsync({
          id: issue._id,
          payload: { status: ISSUE_STATUS.IN_PROGRESS },
        }),
      readyForQa: () =>
        statusMutation.mutateAsync({
          id: issue._id,
          payload: {
            status: ISSUE_STATUS.READY_FOR_QA,
            statusChangeComment: "Developer submitted the bug for QA verification.",
          },
        }),
      resume: () =>
        statusMutation.mutateAsync({
          id: issue._id,
          payload: { status: ISSUE_STATUS.IN_PROGRESS },
        }),
      notes: () => {
        setSelectedIssue(issue);
        return Promise.resolve();
      },
    };

    return actionMap[action]?.() || Promise.resolve(setSelectedIssue(issue));
  };

  const refreshBoard = () => {
    refetchMyIssues();
    refetchBucket();
  };

  const error = projectsError || myIssuesError || bucketError;
  const isLoading = isProjectsLoading || isMyIssuesLoading || isBucketLoading;

  if (error) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-rose-700">
          {error.response?.data?.message || "Unable to load developer bug board."}
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <div className="grid gap-6">
        <Skeleton className="h-[720px] w-full rounded-[24px]" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-[98%] max-w-none space-y-4">
      <Card className="overflow-hidden border-white/70 bg-white/92 shadow-[0_18px_50px_-34px_rgba(15,23,42,0.45)] backdrop-blur">
        <CardHeader className="border-b border-slate-200/80 bg-white/94">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Bug className="h-5 w-5 text-rose-600" />
                Developer Bug Board
              </CardTitle>
              <CardDescription>
                Pick available queue work and move bug lifecycle stages, separate from task and sprint boards.
              </CardDescription>
            </div>
            <Button type="button" variant="outline" disabled={isMyIssuesFetching || isBucketFetching} onClick={refreshBoard}>
              <RefreshCcw className={isMyIssuesFetching || isBucketFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-4 sm:p-5">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
            {DEVELOPER_BUG_COLUMNS.map((column) => (
              <div key={column.key} className="rounded-lg border border-slate-200 bg-slate-50/80 px-4 py-3">
                <p className="truncate text-[11px] font-semibold uppercase text-slate-500">{column.label}</p>
                <p className="mt-1 text-2xl font-semibold text-slate-950">{columnCounts[column.key] || 0}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(240px,1.4fr)_repeat(4,minmax(150px,0.8fr))]">
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-500/20"
                placeholder="Search by bug ID or title"
                value={filters.search}
                onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
              />
            </label>
            <select
              className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-500/20"
              value={filters.status}
              onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}
            >
              <option value="all">All statuses</option>
              <option value="available">Available Work</option>
              {BUG_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-500/20"
              value={filters.severity}
              onChange={(event) => setFilters((current) => ({ ...current, severity: event.target.value }))}
            >
              <option value="all">All severities</option>
              {BUG_SEVERITY_OPTIONS.map((severity) => (
                <option key={severity} value={severity}>
                  {severity}
                </option>
              ))}
            </select>
            <select
              className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-500/20"
              value={filters.priority}
              onChange={(event) => setFilters((current) => ({ ...current, priority: event.target.value }))}
            >
              <option value="all">All priorities</option>
              {BUG_PRIORITY_OPTIONS.map((priority) => (
                <option key={priority} value={priority}>
                  {priority}
                </option>
              ))}
            </select>
            <select
              className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-500/20"
              value={filters.projectId}
              onChange={(event) => setFilters((current) => ({ ...current, projectId: event.target.value }))}
            >
              <option value="all">All projects</option>
              {projects.map((project) => (
                <option key={project._id} value={project._id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>

          {statusError ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {statusError}
            </div>
          ) : null}

          {boardIssues.length ? (
            <BugKanbanBoard
              actionMode="developer"
              columns={DEVELOPER_BUG_COLUMNS}
              issues={filteredIssues}
              onAction={handleBoardAction}
              onOpen={setSelectedIssue}
              onStatusChange={handleStatusChange}
              updatingId={
                statusMutation.isPending
                  ? statusMutation.variables?.id
                  : pickMutation.isPending
                    ? pickMutation.variables?._id
                    : ""
              }
            />
          ) : (
            <EmptyState
              title="No developer bugs yet"
              description="Available queue work and your assigned bug work will appear here independently from tasks and sprints."
              icon={<Bug className="h-5 w-5" />}
            />
          )}
        </CardContent>
      </Card>

      <IssueDetailsDialog
        deletingId=""
        issue={selectedIssue}
        onDeleteIssue={async () => {}}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedIssue(null);
          }
        }}
        onUpdateIssue={(id, payload) => statusMutation.mutateAsync({ id, payload })}
        open={Boolean(selectedIssue)}
        projects={projects}
        updatingId={statusMutation.isPending ? statusMutation.variables?.id : ""}
        canEditPriority={false}
        canEditAssignee={false}
        canDeleteIssue={false}
      />
    </div>
  );
};

export default DeveloperBugBoardPage;
