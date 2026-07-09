import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { AlertTriangle, FolderKanban, LoaderCircle, Plus, Search, SlidersHorizontal, Trash2 } from "lucide-react";
import {
  createIssue,
  deleteIssue,
  fetchIssues,
  fetchProjects,
  updateIssue,
  uploadIssueAttachment,
} from "@/lib/api";
import {
  BUG_PRIORITY_OPTIONS,
  BUG_SEVERITY_OPTIONS,
  BUG_STATUS_OPTIONS,
  ISSUE_STATUS,
  getIssueDisplayKey,
  groupBugsByLifecycle,
  normalizeBugStatusForIssue,
  resolveBugDetails,
  resolveIssueProjectId,
} from "@/lib/issues";
import { getProjectTeams, resolveUserId } from "@/lib/project-teams";
import { useAuth } from "@/hooks/use-auth";
import { useBugWorkflowRealtime } from "@/hooks/useBugWorkflowRealtime";
import BugKanbanBoard from "@/components/bugs/BugKanbanBoard";
import { TESTER_BUG_COLUMNS } from "@/components/bugs/bugBoardConfig";
import IssueComposer from "@/components/issues/IssueComposer";
import IssueDetailsDialog from "@/components/issues/IssueDetailsDialog";
import EmptyState from "@/components/shared/EmptyState";
import ErrorBoundary from "@/components/shared/ErrorBoundary";
import ToastNotice from "@/components/shared/ToastNotice";
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

const ATTACHMENT_ACCEPT =
  "image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.log,.csv,.json,.xml,.zip";

const getReporterId = (issue) => resolveUserId(issue?.reporter);
const getTesterOwnerId = (issue) =>
  String(resolveBugDetails(issue)?.testerOwner?._id || resolveBugDetails(issue)?.testerOwner || "");
const getIssueSeverity = (issue) => resolveBugDetails(issue)?.severity || "Not set";
const isTesterTeam = (team, testerId) =>
  (team?.members || []).some((member) => resolveUserId(member) === testerId);
const getAssignedTeamsForTester = (project, testerId) =>
  getProjectTeams(project).filter((team) => isTesterTeam(team, testerId));

const buildTesterProject = (project, testerId) => {
  const assignedTeams = getAssignedTeamsForTester(project, testerId);

  if (!assignedTeams.length) {
    return null;
  }

  const teams = getProjectTeams(project);
  const uniqueMembers = new Map();

  teams.forEach((team) => {
    (team.members || []).forEach((member) => {
      const memberId = resolveUserId(member);

      if (memberId && !uniqueMembers.has(memberId)) {
        uniqueMembers.set(memberId, member);
      }
    });
  });

  return {
    ...project,
    teams,
    teamCount: teams.length,
    members: Array.from(uniqueMembers.values()),
    memberCount: uniqueMembers.size,
  };
};

const filterOptions = {
  statuses: [{ value: "all", label: "All statuses" }, ...BUG_STATUS_OPTIONS],
  severities: ["all", ...BUG_SEVERITY_OPTIONS],
  priorities: ["all", ...BUG_PRIORITY_OPTIONS],
};

const TesterBugsPage = () => {
  useBugWorkflowRealtime();

  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const reportFormRef = useRef(null);
  const [selectedIssue, setSelectedIssue] = useState(null);
  const [deleteCandidate, setDeleteCandidate] = useState(null);
  const [toast, setToast] = useState(null);
  const [filters, setFilters] = useState({
    search: "",
    status: "all",
    severity: "all",
    priority: "all",
    projectId: "all",
  });
  const testerId = String(user?._id || user?.id || "");
  const focusedBugId = searchParams.get("bug") || "";
  const activeView = searchParams.get("view") || "";

  const showToast = (type, message) => {
    setToast({ id: Date.now(), type, message });
  };

  const {
    data: projects = [],
    isLoading: isProjectsLoading,
    error: projectsError,
  } = useQuery({
    queryKey: ["projects"],
    queryFn: fetchProjects,
  });

  const {
    data: issues = [],
    isLoading: isIssuesLoading,
    error: issuesError,
  } = useQuery({
    queryKey: ["issues", "tester-bugs", testerId],
    queryFn: () => fetchIssues({ type: "Bug" }),
    enabled: Boolean(testerId),
  });

  useEffect(() => {
    if (!selectedIssue) {
      return;
    }

    const nextIssue = issues.find((issue) => issue._id === selectedIssue._id);

    if (nextIssue) {
      setSelectedIssue(nextIssue);
    }
  }, [issues, selectedIssue]);

  useEffect(() => {
    if (!toast?.id) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(timeoutId);
  }, [toast?.id]);

  const assignedProjects = useMemo(
    () => projects.map((project) => buildTesterProject(project, testerId)).filter(Boolean),
    [projects, testerId]
  );

  const reportedIssues = useMemo(
    () =>
      issues
        .filter((issue) => getReporterId(issue) === testerId || getTesterOwnerId(issue) === testerId)
        .sort(
          (a, b) =>
            new Date(b.updatedAt || b.createdAt || 0).getTime() -
            new Date(a.updatedAt || a.createdAt || 0).getTime()
        ),
    [issues, testerId]
  );

  useEffect(() => {
    if (!focusedBugId) {
      return;
    }

    const focusedIssue = reportedIssues.find((issue) => String(issue._id) === focusedBugId);

    if (focusedIssue) {
      setSelectedIssue(focusedIssue);
    }
  }, [focusedBugId, reportedIssues]);

  useEffect(() => {
    if (activeView !== "report") {
      return undefined;
    }

    const frameId = window.requestAnimationFrame(() => {
      reportFormRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [activeView]);

  const filteredIssues = useMemo(() => {
    const search = filters.search.trim().toLowerCase();

    return reportedIssues.filter((issue) => {
      const status = normalizeBugStatusForIssue(issue);
      const severity = getIssueSeverity(issue);
      const projectId = resolveIssueProjectId(issue);

      if (filters.status !== "all" && status !== filters.status) {
        return false;
      }

      if (filters.severity !== "all" && severity !== filters.severity) {
        return false;
      }

      if (filters.priority !== "all" && issue.priority !== filters.priority) {
        return false;
      }

      if (filters.projectId !== "all" && projectId !== filters.projectId) {
        return false;
      }

      if (!search) {
        return true;
      }

      return [getIssueDisplayKey(issue), issue.title]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(search));
    });
  }, [filters, reportedIssues]);

  const groupedFilteredIssues = useMemo(
    () => groupBugsByLifecycle(filteredIssues),
    [filteredIssues]
  );
  const reviewStats = useMemo(
    () => ({
      reported: groupedFilteredIssues.reported.length,
      active:
        groupedFilteredIssues.reported.length +
        groupedFilteredIssues.assigned.length +
        groupedFilteredIssues.inProgress.length +
        groupedFilteredIssues.readyForQa.length +
        groupedFilteredIssues.reopened.length,
      qa: groupedFilteredIssues.readyForQa.length,
      closed: groupedFilteredIssues.closed.length,
    }),
    [groupedFilteredIssues]
  );

  const createIssueMutation = useMutation({
    mutationFn: createIssue,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["issues"] });
      queryClient.invalidateQueries({ queryKey: ["bugs"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
    },
  });

  const uploadAttachmentMutation = useMutation({
    mutationFn: uploadIssueAttachment,
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["issue", variables?.issueId, "attachments"] });
      queryClient.invalidateQueries({ queryKey: ["issue", variables?.issueId, "history"] });
    },
  });

  const updateIssueMutation = useMutation({
    mutationFn: updateIssue,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["issues"] });
      queryClient.invalidateQueries({ queryKey: ["bugs"] });
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (error) => {
      showToast("error", error.response?.data?.message || "Unable to update bug status.");
    },
  });

  const deleteIssueMutation = useMutation({
    mutationFn: deleteIssue,
    onSuccess: (_data, deletedIssueId) => {
      queryClient.setQueryData(["issues", "tester-bugs", testerId], (current = []) =>
        Array.isArray(current)
          ? current.filter((issue) => String(issue?._id || "") !== String(deletedIssueId))
          : current
      );
      queryClient.invalidateQueries({ queryKey: ["issues"] });
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      showToast("success", "Bug deleted successfully.");
      setDeleteCandidate(null);
      setSelectedIssue((current) =>
        String(current?._id || "") === String(deletedIssueId) ? null : current
      );
    },
    onError: (error) => {
      showToast("error", error.response?.data?.message || "Unable to delete bug.");
    },
  });

  const handleStatusChange = (issue, status) => {
    const currentStatus = normalizeBugStatusForIssue(issue);
    const canTesterMove =
      [ISSUE_STATUS.READY_FOR_QA, ISSUE_STATUS.FIXED, ISSUE_STATUS.TESTING, ISSUE_STATUS.QA].includes(
        currentStatus
      ) && [ISSUE_STATUS.CLOSED, ISSUE_STATUS.REOPEN].includes(status);

    if (!canTesterMove) {
      showToast("warning", "Tester updates are limited to closing or reopening bugs from Ready For QA.");
      return Promise.reject(new Error("Unsupported tester bug transition"));
    }

    if (status === ISSUE_STATUS.REOPEN) {
      const reason = window.prompt("Add a brief reason for reopening this bug:");

      if (!reason?.trim()) {
        return Promise.reject(new Error("Reopen reason is required"));
      }

      return updateIssueMutation.mutateAsync({
        id: issue._id,
        payload: {
          status,
          reopenReason: reason.trim(),
        },
      });
    }

    return updateIssueMutation.mutateAsync({
      id: issue._id,
      payload: {
        status,
        statusChangeComment: "QA approved the fixed bug.",
      },
    });
  };

  const handleBoardAction = (action, issue) => {
    if (action === "close") {
      return handleStatusChange(issue, ISSUE_STATUS.CLOSED);
    }

    if (action === "reopen") {
      return handleStatusChange(issue, ISSUE_STATUS.REOPEN);
    }

    if (action === "edit") {
      setSelectedIssue(issue);
      return Promise.resolve();
    }

    if (action === "delete") {
      setDeleteCandidate(issue);
      return Promise.resolve();
    }

    setSelectedIssue(issue);
    return Promise.resolve();
  };

  const handleOpenReportBug = () => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("view", "report");
    nextParams.delete("bug");
    setSearchParams(nextParams);

    window.requestAnimationFrame(() => {
      reportFormRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  };

  const handleConfirmDelete = async () => {
    if (!deleteCandidate?._id || deleteIssueMutation.isPending) {
      return;
    }

    try {
      await deleteIssueMutation.mutateAsync(deleteCandidate._id);
    } catch (error) {
      // The mutation onError shows the toast and keeps the dialog open.
    }
  };

  const error = projectsError || issuesError;
  const isLoading = isProjectsLoading || isIssuesLoading;

  if (error) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-rose-700">
          {error.response?.data?.message || "Unable to load tester bugs data."}
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <div className="grid gap-6">
        <Skeleton className="h-[620px] w-full rounded-[24px]" />
      </div>
    );
  }

  if (!assignedProjects.length) {
    return (
      <EmptyState
        title="No assigned projects yet"
        description="Once an admin adds you to a project team, you can report and track bugs from this page."
        icon={<FolderKanban className="h-5 w-5" />}
      />
    );
  }

  return (
    <ErrorBoundary>
    <div className="mx-auto w-[98%] max-w-none space-y-4">
      <Card className="overflow-hidden border-white/70 bg-white/92 shadow-[0_18px_50px_-34px_rgba(15,23,42,0.45)] backdrop-blur">
        <CardHeader className="border-b border-slate-200/80 bg-white/94 p-4 sm:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle>Reported Bug Board</CardTitle>
              <CardDescription>
                Track your reported bugs by workflow stage and verify fixes from Ready For QA.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" onClick={handleOpenReportBug}>
                <Plus className="h-4 w-4" />
                Report Bug
              </Button>
              <Button type="button" variant="outline" onClick={() => queryClient.invalidateQueries({ queryKey: ["issues"] })}>
                <SlidersHorizontal className="h-4 w-4" />
                Refresh Board
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 p-4 sm:p-5">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Reported", reviewStats.reported],
              ["Active", reviewStats.active],
              ["Ready For QA", reviewStats.qa],
              ["Closed", reviewStats.closed],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-slate-200 bg-slate-50/80 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase text-slate-500">{label}</p>
                <p className="mt-1 text-2xl font-semibold text-slate-950">{value}</p>
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
              {filterOptions.statuses.map((option) => (
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
              {filterOptions.severities.map((severity) => (
                <option key={severity} value={severity}>
                  {severity === "all" ? "All severities" : severity}
                </option>
              ))}
            </select>
            <select
              className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-500/20"
              value={filters.priority}
              onChange={(event) => setFilters((current) => ({ ...current, priority: event.target.value }))}
            >
              {filterOptions.priorities.map((priority) => (
                <option key={priority} value={priority}>
                  {priority === "all" ? "All priorities" : priority}
                </option>
              ))}
            </select>
            <select
              className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-500/20"
              value={filters.projectId}
              onChange={(event) => setFilters((current) => ({ ...current, projectId: event.target.value }))}
            >
              <option value="all">All projects</option>
              {assignedProjects.map((project) => (
                <option key={project._id} value={project._id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>

          <BugKanbanBoard
            actionMode="tester"
            columns={TESTER_BUG_COLUMNS}
            currentUserId={testerId}
            issues={filteredIssues}
            onAction={handleBoardAction}
            onOpen={setSelectedIssue}
            onStatusChange={handleStatusChange}
            updatingId={updateIssueMutation.isPending ? updateIssueMutation.variables?.id : ""}
          />
        </CardContent>
      </Card>

      <div ref={reportFormRef}>
        <IssueComposer
          defaultAssigneeId={testerId}
          defaultStatus={ISSUE_STATUS.TODO}
          defaultType="Bug"
          isPending={createIssueMutation.isPending || uploadAttachmentMutation.isPending}
          lockType
          onSubmit={async (payload) => {
            const createdIssue = await createIssueMutation.mutateAsync(payload);
            const hasAssignedDeveloper = Boolean(payload?.bugDetails?.developerLeadId);

            if (hasAssignedDeveloper) {
              showToast(
                createdIssue?.emailNotification?.status === "sent" ? "success" : "warning",
                createdIssue?.emailNotification?.status === "sent"
                  ? "Bug created and email sent to developer."
                  : "Bug created, but email notification failed."
              );
            }

            return createdIssue;
          }}
          onUploadAttachment={(payload) => uploadAttachmentMutation.mutateAsync(payload)}
          projects={assignedProjects}
          allowedTypes={["Bug"]}
          showAssigneeField={false}
          showStatusField={false}
          submitLabel="Report Assigned Project Bug / Issue"
          headerLabel="Bug / Issue Reporting Form"
          cardTitle="Report assigned project bug / issue"
          cardDescription="Choose one of your assigned projects, describe the issue clearly, and attach screenshots, documents, PDFs, or logs."
          projectLabel="Assigned Project"
          titleLabel="Issue title"
          titlePlaceholder="Describe the assigned project issue"
          descriptionPlaceholder="Summarize the behavior, impacted area, and testing context."
          includeAttachments
          attachmentAccept={ATTACHMENT_ACCEPT}
          isTesterBugReport
          reporterName={user?.name || user?.email || "Tester"}
        />
      </div>

      <IssueDetailsDialog
        deletingId={deleteIssueMutation.isPending ? deleteIssueMutation.variables : ""}
        issue={selectedIssue}
        onDeleteIssue={(id) => deleteIssueMutation.mutateAsync(id)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedIssue(null);
          }
        }}
        onUpdateIssue={(id, payload) => updateIssueMutation.mutateAsync({ id, payload })}
        open={Boolean(selectedIssue)}
        projects={assignedProjects}
        updatingId={updateIssueMutation.isPending ? updateIssueMutation.variables?.id : ""}
        canEditCoreDetails={
          selectedIssue &&
          normalizeBugStatusForIssue(selectedIssue) === ISSUE_STATUS.NEW &&
          !selectedIssue.assignee &&
          !resolveBugDetails(selectedIssue)?.developerLead &&
          String(selectedIssue.reporter?._id || selectedIssue.reporter || "") === testerId
        }
        canEditPriority={
          selectedIssue &&
          normalizeBugStatusForIssue(selectedIssue) === ISSUE_STATUS.NEW &&
          !selectedIssue.assignee &&
          !resolveBugDetails(selectedIssue)?.developerLead &&
          String(selectedIssue.reporter?._id || selectedIssue.reporter || "") === testerId
        }
        canEditAssignee={false}
        canDeleteIssue={
          selectedIssue &&
          normalizeBugStatusForIssue(selectedIssue) === ISSUE_STATUS.NEW &&
          !selectedIssue.assignee &&
          !resolveBugDetails(selectedIssue)?.developerLead &&
          String(selectedIssue.reporter?._id || selectedIssue.reporter || "") === testerId
        }
      />
      <Dialog open={Boolean(deleteCandidate)} onOpenChange={(open) => !open && setDeleteCandidate(null)}>
        <DialogContent className="max-w-2xl gap-0 rounded-[22px] border-rose-100 p-0 shadow-[0_24px_80px_-40px_rgba(15,23,42,0.5)]">
          <div className="grid gap-4 px-5 pb-4 pt-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start sm:pr-14">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-rose-200 bg-rose-50 text-rose-600 sm:mt-0.5">
              <AlertTriangle className="h-4 w-4" />
            </div>

            <div className="min-w-0 space-y-3">
              <DialogHeader className="space-y-1.5">
                <DialogTitle className="text-lg">Delete Bug</DialogTitle>
                <DialogDescription className="leading-5">
                  Are you sure you want to delete this bug? This action cannot be undone.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                  <p className="text-xs font-semibold uppercase text-slate-500">Bug</p>
                  <p className="mt-1 truncate text-sm font-semibold text-slate-950">
                    {deleteCandidate?.title || getIssueDisplayKey(deleteCandidate) || "Selected bug"}
                  </p>
                </div>

                <DialogFooter className="gap-2 sm:flex-row sm:justify-end">
                  <Button
                    className="h-9 rounded-xl px-4"
                    type="button"
                    variant="outline"
                    disabled={deleteIssueMutation.isPending}
                    onClick={() => setDeleteCandidate(null)}
                  >
                    Cancel
                  </Button>
                  <Button
                    className="h-9 rounded-xl px-4"
                    type="button"
                    variant="destructive"
                    disabled={deleteIssueMutation.isPending || !deleteCandidate?._id}
                    onClick={handleConfirmDelete}
                  >
                    {deleteIssueMutation.isPending ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                    {deleteIssueMutation.isPending ? "Deleting..." : "Delete Bug"}
                  </Button>
                </DialogFooter>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <ToastNotice toast={toast} onDismiss={() => setToast(null)} />
    </div>
    </ErrorBoundary>
  );
};

export default TesterBugsPage;
