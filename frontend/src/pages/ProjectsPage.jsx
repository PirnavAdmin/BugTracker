import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderKanban, Plus, UserRoundPlus, Users2 } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  attachProjectTeam,
  addProjectMember,
  createEpic,
  createProject,
  createTeam,
  deleteEpic,
  deleteProject,
  deleteTeam,
  fetchProjects,
  fetchTeams,
  fetchWorkspaceUsers,
  fetchUsers,
  detachProjectTeam,
  removeProjectMember,
  updateEpic,
  updateProject,
  updateProjectStatus,
} from "@/lib/api";
import ProjectComposer from "@/components/projects/ProjectComposer";
import ProjectCard from "@/components/projects/ProjectCard";
import {
  projectDialogBodyClass,
  projectDialogContentClass,
  projectDialogHeaderClass,
} from "@/components/projects/projectDialogStyles";
import TeamCard from "@/components/teams/TeamCard";
import TeamComposer from "@/components/teams/TeamComposer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import EmptyState from "@/components/shared/EmptyState";
import ToastNotice from "@/components/shared/ToastNotice";
import { useAuth } from "@/hooks/use-auth";
import { hasAdminPanelAccess } from "@/lib/roles";
import { getWorkspaceScope } from "@/lib/workspace";

const PROJECT_GRID_SKELETON_COUNT = 4;
const TEAM_PANEL_SKELETON_COUNT = 3;

const ProjectsPage = () => {
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const workspaceScope = getWorkspaceScope(user);
  const [activeTab, setActiveTab] = useState("projects");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isCreateTeamDialogOpen, setIsCreateTeamDialogOpen] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (type, message) => {
    setToast({
      id: Date.now(),
      type,
      message,
    });
  };

  useEffect(() => {
    if (!toast?.id) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setToast(null);
    }, 3600);

    return () => window.clearTimeout(timer);
  }, [toast?.id]);

  useEffect(() => {
    if (!location.state?.toast) {
      return;
    }

    setToast({
      id: Date.now(),
      ...location.state.toast,
    });

    navigate(location.pathname, {
      replace: true,
      state: null,
    });
  }, [location.pathname, location.state, navigate]);

  const {
    data: projects = [],
    isLoading: isProjectsLoading,
    error: projectsError,
  } = useQuery({
    queryKey: ["projects"],
    queryFn: fetchProjects,
  });

  const {
    data: teams = [],
    isLoading: isTeamsLoading,
    error: teamsError,
  } = useQuery({
    queryKey: ["teams", "project-attachments", workspaceScope],
    queryFn: () => fetchTeams(workspaceScope),
  });

  const {
    data: users = [],
    isLoading: isUsersLoading,
    error: usersError,
  } = useQuery({
    queryKey: ["users", "project-composer"],
    queryFn: fetchUsers,
  });

  const {
    data: workspaceUsers = [],
    isLoading: isWorkspaceUsersLoading,
    error: workspaceUsersError,
  } = useQuery({
    queryKey: ["workspace-users", workspaceScope],
    queryFn: () => fetchWorkspaceUsers(workspaceScope),
  });

  const createProjectMutation = useMutation({
    mutationFn: createProject,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
    },
  });

  const createTeamMutation = useMutation({
    mutationFn: createTeam,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teams"] });
    },
  });

  const attachProjectTeamMutation = useMutation({
    mutationFn: attachProjectTeam,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["project-teams"] });
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
    },
  });

  const detachProjectTeamMutation = useMutation({
    mutationFn: detachProjectTeam,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["project-teams"] });
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
    },
  });

  const updateProjectMutation = useMutation({
    mutationFn: updateProject,
    onSuccess: async (updatedProject, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["projects"] }),
        queryClient.invalidateQueries({ queryKey: ["issues"] }),
        queryClient.invalidateQueries({ queryKey: ["reports"] }),
        queryClient.invalidateQueries({ queryKey: ["analytics"] }),
        queryClient.invalidateQueries({ queryKey: ["backlog"] }),
        queryClient.invalidateQueries({
          queryKey: ["project-epics", variables?.projectId],
        }),
      ]);
      showToast("success", updatedProject?.message || "Project updated.");
    },
  });

  const updateProjectStatusMutation = useMutation({
    mutationFn: updateProjectStatus,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
    },
  });

  const createEpicMutation = useMutation({
    mutationFn: createEpic,
    onSuccess: async (_createdEpic, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["projects"] }),
        queryClient.invalidateQueries({ queryKey: ["backlog"] }),
        queryClient.invalidateQueries({ queryKey: ["issues"] }),
        queryClient.invalidateQueries({ queryKey: ["project-epics", variables?.projectId] }),
      ]);
    },
  });

  const updateEpicMutation = useMutation({
    mutationFn: updateEpic,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["projects"] }),
        queryClient.invalidateQueries({ queryKey: ["backlog"] }),
        queryClient.invalidateQueries({ queryKey: ["issues"] }),
        queryClient.invalidateQueries({ queryKey: ["project-epics"] }),
      ]);
    },
  });

  const deleteEpicMutation = useMutation({
    mutationFn: deleteEpic,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["projects"] }),
        queryClient.invalidateQueries({ queryKey: ["backlog"] }),
        queryClient.invalidateQueries({ queryKey: ["issues"] }),
        queryClient.invalidateQueries({ queryKey: ["project-epics"] }),
      ]);
    },
  });

  const deleteProjectMutation = useMutation({
    mutationFn: deleteProject,
    onSuccess: async (_, deletedProjectId) => {
      queryClient.removeQueries({
        queryKey: ["project-meetings", deletedProjectId],
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["projects"] }),
        queryClient.invalidateQueries({ queryKey: ["project-teams"] }),
        queryClient.invalidateQueries({ queryKey: ["issues"] }),
        queryClient.invalidateQueries({ queryKey: ["reports"] }),
        queryClient.invalidateQueries({ queryKey: ["analytics"] }),
      ]);
    },
    onError: (error) => {
      showToast(
        "error",
        error.response?.data?.message || "Unable to delete this project right now."
      );
    },
  });

  const deleteTeamMutation = useMutation({
    mutationFn: deleteTeam,
    onSuccess: async (data) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["teams"] }),
        queryClient.invalidateQueries({ queryKey: ["projects"] }),
        queryClient.invalidateQueries({ queryKey: ["project-teams"] }),
        queryClient.invalidateQueries({ queryKey: ["analytics"] }),
      ]);
      showToast("success", data?.message || "Team deleted successfully.");
    },
    onError: (error) => {
      showToast(
        "error",
        error.response?.data?.message || "Unable to delete this team right now."
      );
    },
  });

  const addProjectMemberMutation = useMutation({
    mutationFn: addProjectMember,
    onSuccess: async (data) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["projects"] }),
        queryClient.invalidateQueries({ queryKey: ["analytics"] }),
      ]);
      showToast("success", data?.message || "Member added to the project.");
    },
  });

  const removeProjectMemberMutation = useMutation({
    mutationFn: removeProjectMember,
    onSuccess: async (data) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["projects"] }),
        queryClient.invalidateQueries({ queryKey: ["analytics"] }),
      ]);
      showToast("success", data?.message || "Member removed from the project.");
    },
  });

  const teamsErrorMessage =
    teamsError?.response?.data?.message ||
    (teamsError ? "Couldn't load workspace teams right now." : "");
  const usersErrorMessage =
    usersError?.response?.data?.message ||
    (usersError ? "Couldn't load workspace users right now." : "");
  const workspaceUsersErrorMessage =
    workspaceUsersError?.response?.data?.message ||
    (workspaceUsersError
      ? "Couldn't load workspace users for team creation right now."
      : "");

  const teamStats = useMemo(() => {
    const emptyTeams = teams.filter(
      (team) => !(team.memberCount || team.members?.length)
    ).length;
    const totalMembersAssigned = teams.reduce(
      (total, team) => total + (team.memberCount || team.members?.length || 0),
      0
    );

    return {
      totalTeams: teams.length,
      emptyTeams,
      totalMembersAssigned,
    };
  }, [teams]);

  const handleCreateProject = async (payload) => {
    await createProjectMutation.mutateAsync(payload);
    setIsCreateDialogOpen(false);
  };

  const handleCreateTeam = async (payload) => {
    await createTeamMutation.mutateAsync(payload);
    setIsCreateTeamDialogOpen(false);
    showToast("success", "Team created successfully.");
  };

  if (projectsError) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-rose-700">
          {projectsError.response?.data?.message || "Unable to load projects."}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="w-full space-y-4">
      <ToastNotice toast={toast} onDismiss={() => setToast(null)} />

      <section className="w-full">
        <Card className="overflow-hidden border-white/70 bg-white/82 shadow-[0_16px_44px_-34px_rgba(15,23,42,0.32)] backdrop-blur-xl">
          <CardContent className="flex flex-col gap-2 p-1 sm:flex-row sm:items-center sm:justify-between">
            <div
              aria-label="Projects and teams"
              className="grid grid-cols-2 gap-1 rounded-2xl border border-slate-200/80 bg-slate-50/80 p-1 sm:inline-grid"
              role="tablist"
            >
              {[
                { id: "projects", label: "Projects", Icon: FolderKanban },
                { id: "teams", label: "Teams", Icon: Users2 },
              ].map(({ id, label, Icon }) => {
                const isSelected = activeTab === id;

                return (
                  <button
                    key={id}
                    aria-controls={`${id}-panel`}
                    aria-selected={isSelected}
                    className={`interactive-button inline-flex h-8 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-semibold transition ${
                      isSelected
                        ? "bg-slate-950 text-white shadow-[0_10px_24px_-18px_rgba(15,23,42,0.8)]"
                        : "border border-transparent bg-white/70 text-slate-600 hover:border-slate-200 hover:bg-white hover:text-slate-950"
                    }`}
                    id={`${id}-tab`}
                    role="tab"
                    type="button"
                    onClick={() => setActiveTab(id)}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </button>
                );
              })}
            </div>

            {activeTab === "projects" ? (
              <Button
                className="interactive-button h-8 w-full rounded-xl border border-indigo-300/30 bg-[linear-gradient(90deg,#2563EB_0%,#6366F1_55%,#8B5CF6_100%)] px-3 text-xs text-white shadow-[0_10px_24px_-18px_rgba(99,102,241,0.82)] hover:brightness-105 sm:w-auto"
                onClick={() => setIsCreateDialogOpen(true)}
                type="button"
              >
                <Plus className="h-3.5 w-3.5" />
                Create Project
              </Button>
            ) : (
              <Button
                className="interactive-button h-8 w-full rounded-xl border border-emerald-300/40 bg-[linear-gradient(90deg,#059669_0%,#0891B2_100%)] px-3 text-xs text-white shadow-[0_10px_24px_-18px_rgba(16,185,129,0.72)] hover:brightness-105 sm:w-auto"
                onClick={() => setIsCreateTeamDialogOpen(true)}
                type="button"
              >
                <Plus className="h-3.5 w-3.5" />
                Create Team
              </Button>
            )}
          </CardContent>
        </Card>
      </section>

      {activeTab === "projects" ? (
        <section
          aria-labelledby="projects-tab"
          className="min-w-0 w-full space-y-3"
          id="projects-panel"
          role="tabpanel"
        >
          <div className="grid min-w-0 w-full grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {isProjectsLoading ? (
              Array.from({ length: PROJECT_GRID_SKELETON_COUNT }).map((_, index) => (
                <Skeleton
                  key={`project-skeleton-${index}`}
                  className="h-[286px] w-full rounded-2xl"
                />
              ))
            ) : projects.length ? (
              projects.map((project, index) => (
                <ProjectCard
                  key={project._id}
                  canManageProject={hasAdminPanelAccess(user?.role)}
                  index={index}
                  isAttachingTeam={
                    attachProjectTeamMutation.isPending &&
                    attachProjectTeamMutation.variables?.projectId === project._id
                  }
                  isUpdatingStatus={
                    updateProjectStatusMutation.isPending &&
                    updateProjectStatusMutation.variables?.projectId === project._id
                  }
                  isUpdatingProject={
                    updateProjectMutation.isPending &&
                    updateProjectMutation.variables?.projectId === project._id
                  }
                  detachingTeamId={
                    detachProjectTeamMutation.isPending &&
                    detachProjectTeamMutation.variables?.projectId === project._id
                      ? detachProjectTeamMutation.variables?.teamId
                      : ""
                  }
                  onAttachTeam={(payload) =>
                    attachProjectTeamMutation.mutateAsync(payload)
                  }
                  onDetachTeam={(payload) =>
                    detachProjectTeamMutation.mutateAsync(payload)
                  }
                  onUpdateProject={(payload) =>
                    updateProjectMutation.mutateAsync(payload)
                  }
                  onUpdateStatus={(payload) =>
                    updateProjectStatusMutation.mutateAsync(payload)
                  }
                  onDeleteProject={(projectId) =>
                    deleteProjectMutation.mutateAsync(projectId)
                  }
                  onAddProjectMember={(payload) =>
                    addProjectMemberMutation.mutateAsync(payload)
                  }
                  onRemoveProjectMember={(payload) =>
                    removeProjectMemberMutation.mutateAsync(payload)
                  }
                  onCreateEpic={(payload) =>
                    createEpicMutation.mutateAsync(payload)
                  }
                  onUpdateEpic={(payload) =>
                    updateEpicMutation.mutateAsync(payload)
                  }
                  onDeleteEpic={(payload) =>
                    deleteEpicMutation.mutateAsync(payload)
                  }
                  onOpenTeamsComposer={() =>
                    showToast("success", "Opening Microsoft Teams...")
                  }
                  isDeletingProject={
                    deleteProjectMutation.isPending &&
                    deleteProjectMutation.variables === project._id
                  }
                  isAddingProjectMember={
                    addProjectMemberMutation.isPending &&
                    addProjectMemberMutation.variables?.projectId === project._id
                  }
                  removingProjectMemberUserId={
                    removeProjectMemberMutation.isPending &&
                    removeProjectMemberMutation.variables?.projectId === project._id
                      ? removeProjectMemberMutation.variables?.userId
                      : ""
                  }
                  isSavingEpic={createEpicMutation.isPending || updateEpicMutation.isPending}
                  deletingEpicId={
                    deleteEpicMutation.isPending ? deleteEpicMutation.variables?.id : ""
                  }
                  project={project}
                  users={users}
                  workspaceTeams={teams}
                  teamsErrorMessage={isTeamsLoading ? "" : teamsErrorMessage}
                  usersErrorMessage={isUsersLoading ? "" : usersErrorMessage}
                />
              ))
            ) : (
              <div className="md:col-span-2 xl:col-span-3 2xl:col-span-4">
                <EmptyState
                  title="No projects yet"
                  description="Create a project, attach a team, and start organizing work in a tighter project space."
                  icon={<FolderKanban className="h-5 w-5" />}
                />
              </div>
            )}
          </div>
        </section>
      ) : null}

      {activeTab === "teams" ? (
        <section
          aria-labelledby="teams-tab"
          className="min-w-0 w-full space-y-3"
          id="teams-panel"
          role="tabpanel"
        >
          <div className="grid gap-3 md:grid-cols-3">
            {isTeamsLoading ? (
              <>
                <Skeleton className="h-[110px] w-full rounded-2xl" />
                <Skeleton className="h-[110px] w-full rounded-2xl" />
                <Skeleton className="h-[110px] w-full rounded-2xl" />
              </>
            ) : (
              <>
                <Card className="stats-card stats-tile">
                  <CardContent className="flex h-full flex-col justify-between p-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-600">
                      <Users2 className="h-4 w-4 text-emerald-600" />
                      <span>Total teams</span>
                    </div>
                    <p className="text-3xl font-semibold leading-none text-slate-950">
                      {teamStats.totalTeams}
                    </p>
                  </CardContent>
                </Card>

                <Card className="stats-card stats-tile">
                  <CardContent className="flex h-full flex-col justify-between p-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-600">
                      <UserRoundPlus className="h-4 w-4 text-sky-600" />
                      <span>Members assigned</span>
                    </div>
                    <p className="text-3xl font-semibold leading-none text-slate-950">
                      {teamStats.totalMembersAssigned}
                    </p>
                  </CardContent>
                </Card>

                <Card className="stats-card stats-tile">
                  <CardContent className="flex h-full flex-col justify-between p-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-600">
                      <Users2 className="h-4 w-4 text-amber-600" />
                      <span>Empty teams</span>
                    </div>
                    <p className="text-3xl font-semibold leading-none text-slate-950">
                      {teamStats.emptyTeams}
                    </p>
                  </CardContent>
                </Card>
              </>
            )}
          </div>

          {teamsErrorMessage && !isTeamsLoading ? (
            <Card>
              <CardContent className="p-4 text-sm text-rose-700">
                {teamsErrorMessage}
              </CardContent>
            </Card>
          ) : null}

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {isTeamsLoading ? (
              Array.from({ length: TEAM_PANEL_SKELETON_COUNT }).map((_, index) => (
                <Skeleton
                  key={`team-skeleton-${index}`}
                  className="h-[170px] w-full rounded-2xl"
                />
              ))
            ) : teams.length ? (
              teams.map((team) => (
                <TeamCard
                  key={team._id}
                  canManageTeam={hasAdminPanelAccess(user?.role)}
                  isDeleting={
                    deleteTeamMutation.isPending &&
                    deleteTeamMutation.variables === team._id
                  }
                  onDeleteTeam={(teamId) => deleteTeamMutation.mutateAsync(teamId)}
                  team={team}
                />
              ))
            ) : (
              <div className="md:col-span-2 xl:col-span-3">
                <EmptyState
                  title="No teams yet. Create your first team."
                  description="Build workspace-specific teams to keep ownership, planning, and delivery clearer across projects."
                  icon={<Users2 className="h-5 w-5" />}
                  action={
                    <Button
                      onClick={() => setIsCreateTeamDialogOpen(true)}
                      type="button"
                    >
                      <Plus className="h-4 w-4" />
                      Create Team
                    </Button>
                  }
                />
              </div>
            )}
          </div>
        </section>
      ) : null}

      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent
          className={projectDialogContentClass(
            "grid max-h-[calc(100svh-6.5rem)] w-[92vw] max-w-[1100px] grid-rows-[auto_minmax(0,1fr)] rounded-[24px] sm:max-h-[calc(100vh-120px)]"
          )}
        >
          <DialogHeader className={projectDialogHeaderClass()}>
            <DialogTitle className="pr-10 text-xl font-semibold tracking-tight text-slate-950">
              Create Project
            </DialogTitle>
            <DialogDescription className="max-w-[42rem] pr-10 text-sm leading-6 text-slate-600">
              Capture ownership, scope, and the first workstreams for the new
              project.
            </DialogDescription>
          </DialogHeader>

          <div className={projectDialogBodyClass("py-3.5 sm:py-4")}>
            <ProjectComposer
              onSubmit={handleCreateProject}
              isPending={createProjectMutation.isPending}
              onCancel={() => setIsCreateDialogOpen(false)}
              users={users}
              usersErrorMessage={isUsersLoading ? "" : usersErrorMessage}
            />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isCreateTeamDialogOpen} onOpenChange={setIsCreateTeamDialogOpen}>
        <DialogContent
          className={projectDialogContentClass(
            "grid w-[96vw] max-w-[1280px] grid-rows-[auto_minmax(0,1fr)] rounded-[24px] sm:max-h-[calc(100vh-56px)]"
          )}
        >
          <DialogHeader className={projectDialogHeaderClass()}>
            <DialogTitle className="pr-10 text-xl font-semibold tracking-tight text-slate-950">
              Create Team
            </DialogTitle>
          </DialogHeader>

          <div className={projectDialogBodyClass("overflow-visible py-3.5 sm:py-4")}>
            {workspaceUsersErrorMessage && !isWorkspaceUsersLoading ? (
              <div className="mb-4 rounded-[20px] border border-rose-200 bg-rose-50/80 px-4 py-3 text-sm text-rose-700">
                {workspaceUsersErrorMessage}
              </div>
            ) : null}

            {isWorkspaceUsersLoading ? (
              <Skeleton className="h-[700px] w-full rounded-[28px]" />
            ) : (
              <TeamComposer
                users={workspaceUsers}
                workspaceId={workspaceScope}
                isPending={createTeamMutation.isPending}
                onSubmit={handleCreateTeam}
                variant="modal"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProjectsPage;
