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
import { ROLE_TEAM_LEAD } from "@/lib/roles";
import IssueCreateDialog from "@/components/issues/IssueCreateDialog";
import IssueDetailsDialog from "@/components/issues/IssueDetailsDialog";
import TaskKanbanBoard from "@/components/tasks/TaskKanbanBoard";
import {
  TASK_BOARD_STATUS,
  getTaskBoardStatus,
} from "@/components/tasks/taskBoardStatus";
import EmptyState from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const TasksPage = () => {
  const queryClient = useQueryClient();
  const { role, user } = useAuth();
  const [searchParams] = useSearchParams();
  const [selectedIssue, setSelectedIssue] = useState(null);
  const [taskScope, setTaskScope] = useState("mine");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const isTeamLead = role === ROLE_TEAM_LEAD;
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
    queryKey: ["issues", "team-lead", "tasks", user?._id || user?.id || ""],
    queryFn: () => fetchIssues({ type: ISSUE_TYPES.TASK, teamProgress: true }),
    enabled: isTeamLead,
  });

  const {
    data: dependencyIssues = [],
  } = useQuery({
    queryKey: ["issues", "tasks-page", "dependency-options", role],
    queryFn: () => fetchIssues({ excludeType: ISSUE_TYPES.BUG }),
    enabled: isTeamLead && isCreateDialogOpen,
  });

  const activeTaskIssues = isTeamLead && taskScope === "team" ? teamTaskIssues : taskIssues;
  const isTeamProgressView = isTeamLead && taskScope === "team";

  useEffect(() => {
    if (!selectedIssue) {
      return;
    }

    const nextIssue = activeTaskIssues.find(
      (issue) => issue._id === selectedIssue._id
    );

    if (nextIssue) {
      setSelectedIssue(nextIssue);
    }
  }, [activeTaskIssues, selectedIssue]);

  const visibleTaskIssues = useMemo(
    () =>
      statusFilter === "all"
        ? activeTaskIssues
        : activeTaskIssues.filter((issue) => getTaskBoardStatus(issue) === statusFilter),
    [activeTaskIssues, statusFilter]
  );

  const updateIssueMutation = useMutation({
    mutationFn: updateIssue,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["issues"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
    },
  });

  const updateTaskStatusMutation = useMutation({
    mutationFn: updateTaskStatus,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["issues"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
    },
  });

  const createIssueMutation = useMutation({
    mutationFn: createIssue,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["issues"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
    },
  });

  const error = projectsError || tasksError || teamTasksError;
  const isWorkLoading = isProjectsLoading || isTasksLoading || (isTeamLead && isTeamTasksLoading);

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
                  {isTeamLead
                    ? "Switch between your own assigned tasks and read-only team progress."
                    : "Tasks assigned to you by managers or admins. For bug reporting and review, visit the Bugs page."}
                </CardDescription>
              </div>

              {isTeamLead ? (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="inline-flex rounded-2xl border border-slate-200 bg-white/80 p-1 shadow-sm">
                    <Button
                      className="h-9 rounded-xl px-3"
                      type="button"
                      variant={taskScope === "mine" ? "default" : "ghost"}
                      onClick={() => setTaskScope("mine")}
                    >
                      <UserCircle2 className="h-4 w-4" />
                      My tasks
                    </Button>
                    <Button
                      className="h-9 rounded-xl px-3"
                      type="button"
                      variant={taskScope === "team" ? "default" : "ghost"}
                      onClick={() => setTaskScope("team")}
                    >
                      <Users2 className="h-4 w-4" />
                      Team progress
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
        deletingId=""
        issue={selectedIssue}
        onDeleteIssue={async () => {}}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedIssue(null);
          }
        }}
        onUpdateIssue={(id, payload) =>
          updateIssueMutation.mutateAsync({ id, payload })
        }
        open={Boolean(selectedIssue)}
        projects={projects}
        updatingId={updateIssueMutation.isPending ? updateIssueMutation.variables?.id : ""}
        canEditStatus={!isTeamProgressView}
        canEditPriority={false}
        canEditAssignee={false}
        canDeleteIssue={false}
      />

      {isTeamLead ? (
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
    </div>
  );
};

export default TasksPage;
