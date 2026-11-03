import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  ListTodo,
  Plus,
  UserCircle2,
  Users2,
} from "lucide-react";
import {
  createIssue,
  deleteIssue,
  fetchIssues,
  fetchProjects,
  fetchWorkPermissions,
  uploadIssueAttachment,
  updateIssue,
  updateTaskStatus,
} from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import {
  resolveIssueAssigneeIds,
  resolveIssueAssignees,
  resolveIssueProjectId,
  ISSUE_TYPES,
  isIssueOverdue,
} from "@/lib/issues";
import {
  canDeleteIssues,
  hasAdminPanelAccess,
  hasTaskStoryLeadAccess,
  ROLE_ADMIN,
  DEFAULT_WORK_PERMISSIONS,
  normalizeWorkPermissions,
} from "@/lib/roles";
import IssueCreateDialog from "@/components/issues/IssueCreateDialog";
import IssueDetailsDialog from "@/components/issues/IssueDetailsDialog";
import TaskKanbanBoard from "@/components/tasks/TaskKanbanBoard";
import {
  TASK_BOARD_STATUS,
  getTaskBoardStatus,
} from "@/components/tasks/taskBoardStatus";
import EmptyState from "@/components/shared/EmptyState";
import ToastNotice from "@/components/shared/ToastNotice";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const STATUS_ONLY_TASK_FIELDS = new Set([
  "status",
  "statusChangeComment",
  "comment",
  "reopenReason",
  "rejectionReason",
  "targetRelease",
  "futureRelease",
]);

const TasksPage = () => {
  const queryClient = useQueryClient();
  const { role, user } = useAuth();
  const [searchParams] = useSearchParams();
  const [selectedIssue, setSelectedIssue] = useState(null);
  const [taskScope, setTaskScope] = useState("mine");
  const [progressFilters, setProgressFilters] = useState({
    projectId: "all",
    assigneeId: "all",
    status: "all",
  });
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const { data: workPermissions = DEFAULT_WORK_PERMISSIONS } = useQuery({
    queryKey: ["work-permissions"],
    queryFn: fetchWorkPermissions,
    enabled: Boolean(user),
  });
  const canCoordinateTasks =
    hasAdminPanelAccess(role) ||
    (hasTaskStoryLeadAccess(role) && Boolean(normalizeWorkPermissions(workPermissions)?.[role]?.manageTasks));
  const canDeleteTask = canDeleteIssues(role);
  const isAdminRole = role === ROLE_ADMIN;
  const statusFilter = useMemo(() => {
    const value = String(searchParams.get("status") || "all").trim().toUpperCase();

    return Object.values(TASK_BOARD_STATUS).includes(value) ? value : "all";
  }, [searchParams]);
  const taskFilter = useMemo(
    () => String(searchParams.get("filter") || "all").trim().toLowerCase(),
    [searchParams]
  );

  const {
    data: projects = [],
    isLoading: isProjectsLoading,
    error: projectsError,
  } = useQuery({
    queryKey: ["projects"],
    queryFn: fetchProjects,
  });

  const {
    data: taskIssues = [],
    isLoading: isTasksLoading,
    error: tasksError,
  } = useQuery({
    queryKey: ["issues", "my", "tasks"],
    queryFn: () => fetchIssues({ type: ISSUE_TYPES.TASK, assigneeId: "me" }),
    enabled: !canCoordinateTasks || taskScope === "mine",
  });

  const {
    data: teamTaskIssues = [],
    isLoading: isTeamTasksLoading,
    error: teamTasksError,
  } = useQuery({
    queryKey: ["issues", "task-progress", "tasks", user?._id || user?.id || ""],
    queryFn: () => fetchIssues({ type: ISSUE_TYPES.TASK, teamProgress: true }),
    enabled: canCoordinateTasks && taskScope === "team",
  });

  const {
    data: dependencyIssues = [],
  } = useQuery({
    queryKey: ["issues", "tasks-page", "dependency-options", role],
    queryFn: () => fetchIssues({ excludeType: ISSUE_TYPES.BUG }),
    enabled: canCoordinateTasks && isCreateDialogOpen,
  });

  const activeTaskIssues = canCoordinateTasks && taskScope === "team" ? teamTaskIssues : taskIssues;
  const isTeamProgressView = canCoordinateTasks && taskScope === "team";

  useEffect(() => {
    if (isAdminRole && taskScope === "mine") {
      setTaskScope("team");
    }
  }, [isAdminRole, taskScope]);

  useEffect(() => {
    if (!selectedIssue) {
      return;
    }

    const nextIssue = activeTaskIssues.find(
      (issue) => issue._id === selectedIssue._id
    );

    if (nextIssue) {
      setSelectedIssue(nextIssue);
      return;
    }

    setSelectedIssue(null);
  }, [activeTaskIssues, selectedIssue]);

  const removeIssueFromCachedLists = (issueId) => {
    queryClient
      .getQueriesData({
        queryKey: ["issues"],
      })
      .forEach(([queryKey, currentData]) => {
        if (!Array.isArray(currentData)) {
          return;
        }

        queryClient.setQueryData(
          queryKey,
          currentData.filter((issue) => String(issue._id) !== String(issueId))
        );
      });
  };

  const invalidateTaskWorkspaceQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["issues"] }),
      queryClient.invalidateQueries({ queryKey: ["tasks"] }),
      queryClient.invalidateQueries({ queryKey: ["reports"] }),
      queryClient.invalidateQueries({ queryKey: ["analytics"] }),
    ]);
  };

  const progressProjectOptions = useMemo(
    () =>
      projects.filter((project) =>
        activeTaskIssues.some(
          (issue) => resolveIssueProjectId(issue) === String(project._id || project.id || "")
        )
      ),
    [activeTaskIssues, projects]
  );

  const progressIssues = useMemo(() => {
    if (!isTeamProgressView) {
      return activeTaskIssues;
    }

    return activeTaskIssues.filter((issue) => {
      const isInSelectedProject =
        progressFilters.projectId === "all" ||
        resolveIssueProjectId(issue) === progressFilters.projectId;
      const isAssignedToSelectedPerson =
        progressFilters.assigneeId === "all" ||
        resolveIssueAssigneeIds(issue).includes(progressFilters.assigneeId);

      return isInSelectedProject && isAssignedToSelectedPerson;
    });
  }, [activeTaskIssues, isTeamProgressView, progressFilters.assigneeId, progressFilters.projectId]);

  const progressAssigneeOptions = useMemo(() => {
    const people = new Map();

    progressIssues.forEach((issue) => {
      resolveIssueAssignees(issue).forEach((assignee) => {
        const id = String(assignee?._id || assignee?.id || "");

        if (id) {
          people.set(id, assignee);
        }
      });
    });

    return [...people.values()].sort((left, right) =>
      String(left?.name || "").localeCompare(String(right?.name || ""))
    );
  }, [progressIssues]);

  const progressStatusCounts = useMemo(
    () =>
      TASK_BOARD_STATUS && Object.values(TASK_BOARD_STATUS).reduce(
        (counts, status) => ({
          ...counts,
          [status]: progressIssues.filter((issue) => getTaskBoardStatus(issue) === status).length,
        }),
        {}
      ),
    [progressIssues]
  );

  const visibleTaskIssues = useMemo(
    () => {
      const selectedStatus = isTeamProgressView ? progressFilters.status : statusFilter;
      const statusFiltered =
        selectedStatus === "all"
          ? progressIssues
          : progressIssues.filter((issue) => getTaskBoardStatus(issue) === selectedStatus);

      if (taskFilter === "overdue") {
        return statusFiltered.filter((issue) => isIssueOverdue(issue));
      }

      return statusFiltered;
    },
    [isTeamProgressView, progressFilters.status, progressIssues, statusFilter, taskFilter]
  );

  const updateProgressFilter = (field, value) => {
    setProgressFilters((current) => ({
      ...current,
      [field]: value,
      ...(field === "projectId" ? { assigneeId: "all" } : {}),
    }));
  };
  const isTaskStatusOnlyPayload = (payload = {}) => {
    const keys = Object.keys(payload || {});

    return Boolean(keys.length) && keys.every((key) => STATUS_ONLY_TASK_FIELDS.has(key));
  };

  const updateIssueMutation = useMutation({
    mutationFn: updateIssue,
    onSuccess: async () => {
      await invalidateTaskWorkspaceQueries();
    },
  });

  const updateTaskStatusMutation = useMutation({
    mutationFn: updateTaskStatus,
    onSuccess: async () => {
      await invalidateTaskWorkspaceQueries();
    },
  });

  const createIssueMutation = useMutation({
    mutationFn: createIssue,
    onSuccess: async () => {
      await invalidateTaskWorkspaceQueries();
    },
  });

  const deleteIssueMutation = useMutation({
    mutationFn: deleteIssue,
    onSuccess: (_response, deletedIssueId) => {
      removeIssueFromCachedLists(deletedIssueId);
      setSelectedIssue((current) =>
        String(current?._id || "") === String(deletedIssueId) ? null : current
      );
      setToast({
        id: `delete-success-${Date.now()}`,
        type: "success",
        message: "Task deleted successfully.",
      });
      invalidateTaskWorkspaceQueries();
    },
    onError: (error) => {
      setToast({
        id: `delete-error-${Date.now()}`,
        type: "error",
        message: error.response?.data?.message || "Unable to delete this task.",
      });
    },
  });

  const error = projectsError || tasksError || teamTasksError;
  const isWorkLoading = isProjectsLoading || isTasksLoading || (canCoordinateTasks && isTeamTasksLoading);

  if (error) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-rose-700">
          {error.response?.data?.message || "Unable to load your tasks right now."}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {isWorkLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-[92px] w-full rounded-[16px]" />
          <div className="grid gap-4 xl:grid-cols-3">
            <Skeleton className="h-[520px] w-full rounded-[16px]" />
            <Skeleton className="h-[520px] w-full rounded-[16px]" />
            <Skeleton className="h-[520px] w-full rounded-[16px]" />
          </div>
        </div>
      ) : (
        <Card className="overflow-hidden border-white/70 bg-white/92 shadow-[0_18px_50px_-34px_rgba(15,23,42,0.45)] backdrop-blur">
          <CardHeader className="border-b border-slate-200/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.94),rgba(239,246,255,0.92),rgba(238,242,255,0.88))]">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <CardTitle>
                  {isTeamProgressView ? "Team Progress" : "Assigned Tasks"}
                </CardTitle>
                <CardDescription>
                  {canCoordinateTasks
                    ? "Switch between your own assigned tasks and read-only project progress."
                    : "Tasks assigned to you by managers or admins. For bug reporting and review, visit the Bugs page."}
                </CardDescription>
              </div>

              {canCoordinateTasks ? (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="inline-flex rounded-2xl border border-slate-200 bg-white/80 p-1 shadow-sm">
                    {!isAdminRole ? (
                      <Button
                        className="h-9 rounded-xl px-3"
                        type="button"
                        variant={taskScope === "mine" ? "default" : "ghost"}
                        onClick={() => setTaskScope("mine")}
                      >
                        <UserCircle2 className="h-4 w-4" />
                        My tasks
                      </Button>
                    ) : null}
                    <Button
                      className="h-9 rounded-xl px-3"
                      type="button"
                      variant={taskScope === "team" ? "default" : "ghost"}
                      onClick={() => setTaskScope("team")}
                    >
                      <Users2 className="h-4 w-4" />
                      Project progress
                    </Button>
                  </div>
                  <Button
                    className="h-10 rounded-2xl"
                    type="button"
                    onClick={() => setIsCreateDialogOpen(true)}
                  >
                    <Plus className="h-4 w-4" />
                    Assign task
                  </Button>
                </div>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="p-4 sm:p-5">
            {isTeamProgressView ? (
              <div className="mb-5 space-y-4 rounded-[20px] border border-slate-200 bg-slate-50/75 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="space-y-1.5">
                      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                        Project
                      </span>
                      <select
                        className="field-select min-w-[210px]"
                        value={progressFilters.projectId}
                        onChange={(event) => updateProgressFilter("projectId", event.target.value)}
                      >
                        <option value="all">All my projects</option>
                        {progressProjectOptions.map((project) => (
                          <option key={project._id || project.id} value={project._id || project.id}>
                            {project.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                        Individual
                      </span>
                      <select
                        className="field-select min-w-[210px]"
                        value={progressFilters.assigneeId}
                        onChange={(event) => updateProgressFilter("assigneeId", event.target.value)}
                      >
                        <option value="all">Everyone</option>
                        {progressAssigneeOptions.map((person) => (
                          <option key={person._id || person.id} value={person._id || person.id}>
                            {person.name || person.email || "Unnamed user"}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <Button
                    className="self-start lg:self-auto"
                    variant="ghost"
                    size="sm"
                    type="button"
                    onClick={() => setProgressFilters({ projectId: "all", assigneeId: "all", status: "all" })}
                  >
                    Clear filters
                  </Button>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    { key: TASK_BOARD_STATUS.OPEN, label: "To do", className: "border-orange-200 bg-orange-50 text-orange-800" },
                    { key: TASK_BOARD_STATUS.IN_PROGRESS, label: "In progress", className: "border-violet-200 bg-violet-50 text-violet-800" },
                    { key: TASK_BOARD_STATUS.DONE, label: "Done", className: "border-emerald-200 bg-emerald-50 text-emerald-800" },
                  ].map((status) => (
                    <button
                      key={status.key}
                      className={`rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-sm ${status.className} ${progressFilters.status === status.key ? "ring-2 ring-blue-500/30" : ""}`}
                      type="button"
                      onClick={() => updateProgressFilter("status", progressFilters.status === status.key ? "all" : status.key)}
                    >
                      <span className="text-sm font-semibold">{status.label}</span>
                      <span className="mt-2 block text-3xl font-bold leading-none">
                        {progressStatusCounts[status.key] || 0}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {activeTaskIssues.length ? (
              <TaskKanbanBoard
                issues={visibleTaskIssues}
                updatingId={
                  updateTaskStatusMutation.isPending
                    ? updateTaskStatusMutation.variables?.id
                    : ""
                }
                onSelectIssue={setSelectedIssue}
                readOnly={isTeamProgressView}
                onStatusChange={
                  isTeamProgressView
                    ? undefined
                    : (id, status) =>
                        updateTaskStatusMutation.mutateAsync({
                          id,
                          status,
                        })
                }
                emptyStateTitle={
                  isTeamProgressView ? "No team tasks found" : "No assigned tasks"
                }
                emptyStateDescription={
                  isTeamProgressView
                    ? "Team tasks will appear here once developers have assigned work."
                    : "Assigned work will appear here once it is available."
                }
              />
            ) : (
              <EmptyState
                title={isTeamProgressView ? "No team tasks found" : "No tasks assigned yet"}
                description={
                  isTeamProgressView
                    ? "Team tasks will appear here once developers have assigned work."
                    : "Tasks assigned to you by managers or admins will appear here. For bug reporting and review, visit the Bugs page."
                }
                icon={<ListTodo className="h-5 w-5" />}
              />
            )}
          </CardContent>
        </Card>
      )}

      <IssueDetailsDialog
        deletingId={deleteIssueMutation.isPending ? deleteIssueMutation.variables : ""}
        issue={selectedIssue}
        onDeleteIssue={(id) => deleteIssueMutation.mutateAsync(id)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedIssue(null);
          }
        }}
        onUpdateIssue={(id, payload) => {
          if (isTaskStatusOnlyPayload(payload)) {
            return updateTaskStatusMutation.mutateAsync({
              id,
              status: payload.status,
            });
          }

          return updateIssueMutation.mutateAsync({ id, payload });
        }}
        open={Boolean(selectedIssue)}
        projects={projects}
        updatingId={
          updateTaskStatusMutation.isPending
            ? updateTaskStatusMutation.variables?.id
            : updateIssueMutation.isPending
              ? updateIssueMutation.variables?.id
              : ""
        }
        canEditCoreDetails={canCoordinateTasks}
        canEditStatus={!isTeamProgressView}
        canEditPriority={canCoordinateTasks}
        canEditAssignee={canCoordinateTasks}
        canDeleteIssue={canDeleteTask && !isTeamProgressView}
      />

      {canCoordinateTasks ? (
        <IssueCreateDialog
          open={isCreateDialogOpen}
          onOpenChange={setIsCreateDialogOpen}
          projects={projects}
          availableIssues={dependencyIssues}
          defaultType={ISSUE_TYPES.TASK}
          allowedTypes={[ISSUE_TYPES.TASK]}
          lockType
          isPending={createIssueMutation.isPending}
          onSubmit={async (payload) => {
            const createdIssue = await createIssueMutation.mutateAsync(payload);
            setIsCreateDialogOpen(false);
            return createdIssue;
          }}
          onUploadAttachment={uploadIssueAttachment}
        />
      ) : null}

      <ToastNotice toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
};

export default TasksPage;
