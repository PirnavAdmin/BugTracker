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
  uploadIssueAttachment,
  updateIssue,
  updateTaskStatus,
} from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import {
  ISSUE_TYPES,
} from "@/lib/issues";
import {
  canDeleteIssues,
  hasAdminPanelAccess,
  hasTaskStoryLeadAccess,
  ROLE_ADMIN,
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
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const canCoordinateTasks = hasAdminPanelAccess(role) || hasTaskStoryLeadAccess(role);
  const canDeleteTask = canDeleteIssues(role);
  const isAdminRole = role === ROLE_ADMIN;
  const statusFilter = useMemo(() => {
    const value = String(searchParams.get("status") || "all").trim().toUpperCase();

    return Object.values(TASK_BOARD_STATUS).includes(value) ? value : "all";
  }, [searchParams]);

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
  });

  const {
    data: teamTaskIssues = [],
    isLoading: isTeamTasksLoading,
    error: teamTasksError,
  } = useQuery({
    queryKey: ["issues", "task-progress", "tasks", user?._id || user?.id || ""],
    queryFn: () => fetchIssues({ type: ISSUE_TYPES.TASK, teamProgress: true }),
    enabled: canCoordinateTasks,
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

  const visibleTaskIssues = useMemo(
    () =>
      statusFilter === "all"
        ? activeTaskIssues
        : activeTaskIssues.filter((issue) => getTaskBoardStatus(issue) === statusFilter),
    [activeTaskIssues, statusFilter]
  );
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
