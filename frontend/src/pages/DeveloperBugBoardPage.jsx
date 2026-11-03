import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bug, Eye, RefreshCcw, Search, UserCircle2, Users2 } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import {
  fetchBugBucket,
  fetchIssues,
  fetchMyIssues,
  fetchProjects,
  fetchWorkPermissions,
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
  resolveIssueAssigneeId,
  resolveIssueProjectId,
} from "@/lib/issues";
import { useAuth } from "@/hooks/use-auth";
import { useBugWorkflowRealtime } from "@/hooks/useBugWorkflowRealtime";
import { DEFAULT_WORK_PERMISSIONS, ROLE_TEAM_LEAD, normalizeWorkPermissions } from "@/lib/roles";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

const getSeverity = (issue) => resolveBugDetails(issue)?.severity || "Not set";
const getModuleName = (issue) => resolveBugDetails(issue)?.moduleName || "Unmapped module";
const getReporterName = (issue) =>
  issue?.reporter?.name || resolveBugDetails(issue)?.testerOwner?.name || "Unknown reporter";
const getDeveloperName = (issue) =>
  issue?.assignee?.name || resolveBugDetails(issue)?.developerLead?.name || "Unassigned";
const isIssueWithinDateRange = (issue, dateFrom, dateTo) => {
  if (!dateFrom && !dateTo) {
    return true;
  }

  const createdAt = new Date(issue?.createdAt || issue?.updatedAt || 0);

  if (Number.isNaN(createdAt.getTime())) {
    return false;
  }

  if (dateFrom && createdAt < new Date(`${dateFrom}T00:00:00`)) {
    return false;
  }

  return !dateTo || createdAt <= new Date(`${dateTo}T23:59:59.999`);
};

const dedupeIssues = (issues = []) => {
  const seen = new Map();

  issues.forEach((issue) => {
    if (issue?._id) {
      seen.set(issue._id, issue);
    }
  });

  return Array.from(seen.values());
};

const updateCachedIssue = (issues, issueId, updater) =>
  Array.isArray(issues)
    ? issues.map((issue) => (String(issue?._id) === String(issueId) ? updater(issue) : issue))
    : issues;

const DeveloperBugBoardPage = () => {
  useBugWorkflowRealtime();

  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const searchQuery = searchParams.get("search") || "";
  const bugQuery = searchParams.get("bug") || "";
  const statusQuery = searchParams.get("status");
  const [selectedIssue, setSelectedIssue] = useState(null);
  const [rejectIssue, setRejectIssue] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [statusError, setStatusError] = useState("");
  const [bugScope, setBugScope] = useState("mine");
  const [filters, setFilters] = useState({
    search: searchQuery,
    status: statusQuery === "available" ? "available" : "all",
    severity: "all",
    priority: "all",
    projectId: "all",
    assigneeId: "all",
    dateFrom: "",
    dateTo: "",
  });
  const userId = String(user?._id || user?.id || "");
  const { data: workPermissions = DEFAULT_WORK_PERMISSIONS } = useQuery({
    queryKey: ["work-permissions"],
    queryFn: fetchWorkPermissions,
    enabled: Boolean(userId),
  });
  const canTeamLeadAssignFromQueue =
    user?.role === ROLE_TEAM_LEAD &&
    Boolean(normalizeWorkPermissions(workPermissions)?.[ROLE_TEAM_LEAD]?.manageBugs);
  const isTeamProgressView = canTeamLeadAssignFromQueue && bugScope === "team";
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
    data: teamBugIssues = [],
    isLoading: isTeamBugsLoading,
    error: teamBugsError,
    refetch: refetchTeamBugs,
    isFetching: isTeamBugsFetching,
  } = useQuery({
    queryKey: ["issues", "bug-progress", userId],
    queryFn: () => fetchIssues({ type: "Bug", teamProgress: true, sortBy: "recently-updated" }),
    enabled: isTeamProgressView,
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
  const boardIssues = useMemo(() => {
    if (isTeamProgressView) {
      return dedupeIssues((Array.isArray(teamBugIssues) ? teamBugIssues : []).filter(isBugIssue));
    }

    return dedupeIssues([...availableBugIssues, ...assignedBugIssues]);
  }, [assignedBugIssues, availableBugIssues, isTeamProgressView, teamBugIssues]);

  const assigneeOptions = useMemo(() => {
    const people = new Map();

    boardIssues.forEach((issue) => {
      const assignee = issue?.assignee || resolveBugDetails(issue)?.developerLead;
      const id = resolveIssueAssigneeId(issue) || String(assignee?._id || assignee || "");

      if (id && assignee && typeof assignee === "object") {
        people.set(String(id), assignee);
      }
    });

    return [...people.values()].sort((left, right) =>
      String(left?.name || left?.email || "").localeCompare(String(right?.name || right?.email || ""))
    );
  }, [boardIssues]);

  const projectOptions = useMemo(
    () =>
      isTeamProgressView
        ? projects.filter((project) =>
            boardIssues.some(
              (issue) => resolveIssueProjectId(issue) === String(project?._id || project?.id || "")
            )
          )
        : projects,
    [boardIssues, isTeamProgressView, projects]
  );

  useEffect(() => {
    setFilters((current) => ({
      ...current,
      search: searchQuery,
      status: statusQuery === "available" ? "available" : "all",
    }));
  }, [searchQuery, statusQuery]);

  useEffect(() => {
    if (!selectedIssue) {
      return;
    }

    const nextIssue = boardIssues.find((issue) => issue._id === selectedIssue._id);

    if (nextIssue) {
      setSelectedIssue(nextIssue);
    }
  }, [boardIssues, selectedIssue]);

  useEffect(() => {
    if (!boardIssues.length || (!bugQuery && !searchQuery)) {
      return;
    }

    const normalizedBugQuery = String(bugQuery).trim().toLowerCase();
    const normalizedSearchQuery = String(searchQuery).trim().toLowerCase();
    const nextIssue = boardIssues.find((issue) => {
      const issueId = String(issue?._id || "").trim().toLowerCase();
      const displayKey = String(getIssueDisplayKey(issue) || "").trim().toLowerCase();

      return (
        (normalizedBugQuery && (issueId === normalizedBugQuery || displayKey === normalizedBugQuery)) ||
        (normalizedSearchQuery &&
          (issueId === normalizedSearchQuery || displayKey === normalizedSearchQuery))
      );
    });

    if (nextIssue) {
      setSelectedIssue(nextIssue);
    }
  }, [boardIssues, bugQuery, searchQuery]);

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

      if (filters.assigneeId !== "all" && resolveIssueAssigneeId(issue) !== filters.assigneeId) {
        return false;
      }

      if (!isIssueWithinDateRange(issue, filters.dateFrom, filters.dateTo)) {
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
  const boardStatusOptions = useMemo(() => {
    const options = new Map();

    DEVELOPER_BUG_COLUMNS
      .filter((column) => column.key !== "available")
      .forEach((column) => {
        const value = column.statuses?.[0];

        if (!value || options.has(value)) {
          return;
        }

        options.set(value, {
          value,
          label: column.label === "Closed Bugs" ? "Closed" : column.label,
        });
      });

    return Array.from(options.values());
  }, []);

  const statusMutation = useMutation({
    mutationFn: ({ id, payload }) => updateIssue({ id, payload }),
    onMutate: async ({ id, payload }) => {
      setStatusError("");
      const queryKeys = [
        myIssuesQueryKey,
        bucketQueryKey,
        ["issues", "bug-progress", userId],
      ];
      const previousValues = queryKeys.map((queryKey) => [
        queryKey,
        queryClient.getQueryData(queryKey),
      ]);

      if (payload.status) {
        queryKeys.forEach((queryKey) => {
          queryClient.setQueryData(queryKey, (current) =>
            updateCachedIssue(current, id, (issue) => ({ ...issue, status: payload.status }))
          );
        });
      }

      return { previousValues };
    },
    onSuccess: (updatedIssue, { id }) => {
      [myIssuesQueryKey, bucketQueryKey, ["issues", "bug-progress", userId]].forEach(
        (queryKey) => {
          queryClient.setQueryData(queryKey, (current) =>
            updateCachedIssue(current, id, (issue) => ({ ...issue, ...updatedIssue }))
          );
        }
      );
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
    },
    onError: (error, _variables, context) => {
      context?.previousValues?.forEach(([queryKey, previousValue]) => {
        queryClient.setQueryData(queryKey, previousValue);
      });
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

  const openRejectDialog = (issue) => {
    setStatusError("");
    setRejectIssue(issue);
    setRejectReason("");
  };

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

    if (currentColumnKey === "rejected") {
      setStatusError("Rejected bugs are read-only for developers.");
      return Promise.reject(new Error("Rejected bugs are read-only"));
    }

    if (currentColumnKey === "available" && nextColumnKey === "assigned") {
      return pickMutation.mutateAsync(issue);
    }

    if (nextColumnKey === "available") {
      setStatusError("Available bugs can only be entered through the pickup queue.");
      return Promise.reject(new Error("Cannot move bug to available"));
    }

    if (nextColumnKey === "rejected" || status === ISSUE_STATUS.REJECTED) {
      openRejectDialog(issue);
      return Promise.reject(new Error("Rejected requires a reason"));
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
      reject: () => {
        openRejectDialog(issue);
        return Promise.resolve();
      },
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

  const handleRejectSubmit = async (event) => {
    event.preventDefault();

    const reason = rejectReason.trim();

    if (!rejectIssue?._id || !reason) {
      setStatusError("Rejected requires a reason.");
      return;
    }

    try {
      await statusMutation.mutateAsync({
        id: rejectIssue._id,
        payload: {
          status: ISSUE_STATUS.REJECTED,
          rejectionReason: reason,
          statusChangeComment: reason,
        },
      });
      setRejectIssue(null);
      setRejectReason("");
    } catch (error) {
      // Mutation handler already surfaces the error banner.
    }
  };

  const refreshBoard = () => {
    if (isTeamProgressView) {
      refetchTeamBugs();
      return;
    }
    refetchMyIssues();
    refetchBucket();
  };

  const error = projectsError || (isTeamProgressView ? teamBugsError : myIssuesError || bucketError);
  const isLoading = isProjectsLoading || (isTeamProgressView ? isTeamBugsLoading : isMyIssuesLoading || isBucketLoading);

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
      <div className="mx-auto w-[98%] max-w-none space-y-4">
        <Card className="border-white/70 bg-white/92 shadow-sm">
          <CardHeader>
            <CardTitle>{isTeamProgressView ? "Team Bug Progress" : "Developer Bug Board"}</CardTitle>
            <CardDescription>
              {isTeamProgressView
                ? "Review bugs across your project teams and assign or reassign developers."
                : "Pick available queue work and move bug lifecycle stages, separate from task and sprint boards."}
            </CardDescription>
          </CardHeader>
        </Card>
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
                {isTeamProgressView ? "Team Bug Progress" : "Developer Bug Board"}
              </CardTitle>
              <CardDescription>
                {isTeamProgressView
                  ? "Review bugs across your project teams and assign or reassign developers."
                  : "Pick available queue work and move bug lifecycle stages, separate from task and sprint boards."}
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {canTeamLeadAssignFromQueue ? (
                <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
                  <Button className="h-8 rounded-lg px-3" type="button" variant={bugScope === "mine" ? "default" : "ghost"} onClick={() => setBugScope("mine")}>
                    <UserCircle2 className="h-4 w-4" /> My bugs
                  </Button>
                  <Button className="h-8 rounded-lg px-3" type="button" variant={bugScope === "team" ? "default" : "ghost"} onClick={() => setBugScope("team")}>
                    <Users2 className="h-4 w-4" /> Team progress
                  </Button>
                </div>
              ) : null}
              <Button type="button" variant="outline" disabled={isTeamProgressView ? isTeamBugsFetching : isMyIssuesFetching || isBucketFetching} onClick={refreshBoard}>
                <RefreshCcw className={isTeamProgressView ? (isTeamBugsFetching ? "h-4 w-4 animate-spin" : "h-4 w-4") : (isMyIssuesFetching || isBucketFetching ? "h-4 w-4 animate-spin" : "h-4 w-4")} />
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-4 sm:p-5">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-7">
            {DEVELOPER_BUG_COLUMNS.map((column) => (
              <div key={column.key} className="rounded-lg border border-slate-200 bg-slate-50/80 px-4 py-3">
                <p className="truncate text-[11px] font-semibold uppercase text-slate-500">{column.label}</p>
                <p className="mt-1 text-2xl font-semibold text-slate-950">{columnCounts[column.key] || 0}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
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
              {projectOptions.map((project) => (
                <option key={project._id} value={project._id}>
                  {project.name}
                </option>
              ))}
            </select>
            <label className="sr-only" htmlFor="developer-bug-date-from">Created from</label>
            <input
              className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-500/20"
              id="developer-bug-date-from"
              aria-label="Created from"
              type="date"
              value={filters.dateFrom}
              onChange={(event) => setFilters((current) => ({ ...current, dateFrom: event.target.value }))}
            />
            <label className="sr-only" htmlFor="developer-bug-date-to">Created to</label>
            <input
              className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-500/20"
              id="developer-bug-date-to"
              aria-label="Created to"
              type="date"
              value={filters.dateTo}
              onChange={(event) => setFilters((current) => ({ ...current, dateTo: event.target.value }))}
            />
            {isTeamProgressView ? (
              <select
                className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-500/20"
                value={filters.assigneeId}
                onChange={(event) => setFilters((current) => ({ ...current, assigneeId: event.target.value }))}
              >
                <option value="all">All developers</option>
                {assigneeOptions.map((person) => (
                  <option key={person._id || person.id} value={person._id || person.id}>
                    {person.name || person.email || "Unnamed developer"}
                  </option>
                ))}
              </select>
            ) : null}
          </div>

          {statusError ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {statusError}
            </div>
          ) : null}

          {boardIssues.length ? isTeamProgressView ? (
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/70">
              <div className="flex flex-col gap-1 border-b border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-base font-semibold text-slate-950">Related project bugs</h2>
                  <p className="text-xs text-slate-500">{filteredIssues.length} bug{filteredIssues.length === 1 ? "" : "s"} matching the selected filters.</p>
                </div>
                <p className="text-xs font-medium text-slate-500">Open a bug to assign a developer or update its details.</p>
              </div>
              <div className="space-y-2 p-3">
                {filteredIssues.map((issue) => (
                  <article
                    className="grid cursor-pointer gap-3 rounded-xl border border-l-4 border-slate-200 border-l-blue-500 bg-white px-3 py-3 shadow-sm transition hover:border-blue-200 hover:bg-blue-50/30 xl:grid-cols-[minmax(260px,1.4fr)_minmax(160px,.7fr)_minmax(150px,.65fr)_minmax(170px,.75fr)_minmax(190px,.85fr)_auto] xl:items-center"
                    key={issue._id}
                    onClick={() => setSelectedIssue(issue)}
                  >
                    <button className="min-w-0 text-left" type="button" onClick={() => setSelectedIssue(issue)}>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-bold text-slate-600">{getIssueDisplayKey(issue)}</span>
                        <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-bold uppercase text-slate-600">{normalizeBugStatusForIssue(issue)}</span>
                      </div>
                      <h3 className="mt-1 truncate text-sm font-semibold text-slate-950 hover:text-blue-700">{issue.title || "Untitled bug"}</h3>
                      <p className="mt-0.5 truncate text-xs text-slate-500">{issue.projectId?.name || "Related project"} / {getModuleName(issue)}</p>
                    </button>
                    <div className="min-w-0 text-xs">
                      <p className="truncate font-semibold text-slate-800">{getReporterName(issue)}</p>
                      <p className="mt-0.5 text-slate-500">Reporter</p>
                    </div>
                    <div className="min-w-0 text-xs">
                      <p className="truncate font-semibold text-slate-800">{getDeveloperName(issue)}</p>
                      <p className="mt-0.5 text-slate-500">Developer</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700">{getSeverity(issue)}</span>
                      <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700">{issue.priority || "Medium"}</span>
                    </div>
                    <label className="min-w-0">
                      <span className="sr-only">Update bug status</span>
                      <select
                        className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-500/20"
                        value={normalizeBugStatusForIssue(issue)}
                        disabled={statusMutation.isPending}
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) => statusMutation.mutate({ id: issue._id, payload: { status: event.target.value } })}
                      >
                        {BUG_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    </label>
                    <Button className="h-9 rounded-lg" type="button" variant="outline" onClick={(event) => { event.stopPropagation(); setSelectedIssue(issue); }}>
                      <Eye className="h-4 w-4" /> Manage
                    </Button>
                  </article>
                ))}
              </div>
            </section>
          ) : (
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
          )
          : (
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
        canEditAssignee={
          canTeamLeadAssignFromQueue &&
          (isTeamProgressView || getBugColumnKey(selectedIssue || {}, DEVELOPER_BUG_COLUMNS) === "available")
        }
        canDeleteIssue={false}
        statusOptionsOverride={isTeamProgressView ? BUG_STATUS_OPTIONS : boardStatusOptions}
      />

      <Dialog
        open={Boolean(rejectIssue)}
        onOpenChange={(open) => {
          if (!open) {
            setRejectIssue(null);
            setRejectReason("");
          }
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader className="pr-10">
            <DialogTitle>Reject Bug</DialogTitle>
            <DialogDescription>
              Add the rejection reason before moving this bug to the rejected column.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleRejectSubmit}>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Bug
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-950">
                {rejectIssue?.title || "Selected bug"}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {rejectIssue ? getIssueDisplayKey(rejectIssue) : ""}
              </p>
            </div>
            <label className="block space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Rejection Reason
              </span>
              <Textarea
                autoFocus
                placeholder="Explain why this bug is being rejected"
                value={rejectReason}
                onChange={(event) => setRejectReason(event.target.value)}
              />
            </label>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setRejectIssue(null);
                  setRejectReason("");
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={statusMutation.isPending || !rejectReason.trim()}
              >
                {statusMutation.isPending ? "Saving..." : "Reject Bug"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DeveloperBugBoardPage;
