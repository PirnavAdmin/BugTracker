import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpDown,
  Archive,
  BarChart3,
  Bug,
  CheckCircle2,
  Filter,
  FolderKanban,
  LayoutGrid,
  Layers3,
  List,
  MoreHorizontal,
  Plus,
  Route,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Star,
  UserRoundPlus,
  Users2,
} from "lucide-react";
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
import { getProjectTeams } from "@/lib/project-teams";

const PROJECT_GRID_SKELETON_COUNT = 4;
const TEAM_PANEL_SKELETON_COUNT = 3;
const PROJECT_STATUS_FILTERS = ["all", "Active", "On Hold", "Completed"];
const PROJECT_SORT_OPTIONS = [
  { value: "name", label: "Name" },
  { value: "issues", label: "Issues" },
  { value: "members", label: "Members" },
  { value: "teams", label: "Teams" },
];

const getProjectStatus = (project) =>
  project?.status || (project?.isCompleted ? "Completed" : "Active");

const getProjectMemberCount = (project) =>
  project?.memberCount || project?.members?.length || project?.projectMembers?.length || 0;

const getProjectThemeColor = (project) => {
  const color = String(project?.themeColor || "").trim();

  return /^#[0-9a-f]{6}$/i.test(color) ? color : "#2563EB";
};

const getProjectInitials = (project) =>
  String(project?.shortCode || project?.name || "PR")
    .split(/\s|-/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "PR";

const getProjectOwnerName = (project) => {
  const owner = project?.projectManager || project?.manager;
  return owner?.name || owner?.email || "Unassigned";
};

const ProjectsPage = () => {
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const workspaceScope = getWorkspaceScope(user);
  const [activeTab, setActiveTab] = useState("projects");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isCreateTeamDialogOpen, setIsCreateTeamDialogOpen] = useState(false);
  const [projectSearch, setProjectSearch] = useState("");
  const [projectStatusFilter, setProjectStatusFilter] = useState("all");
  const [projectTeamFilter, setProjectTeamFilter] = useState("all");
  const [projectSort, setProjectSort] = useState("name");
  const [projectView, setProjectView] = useState("grid");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [toast, setToast] = useState(null);

  const updateActiveTab = (tab) => {
    const nextTab = tab === "teams" ? "teams" : "projects";
    setActiveTab(nextTab);

    const params = new URLSearchParams(location.search);
    if (nextTab === "teams") {
      params.set("tab", "teams");
    } else {
      params.delete("tab");
    }

    navigate(`${location.pathname}${params.toString() ? `?${params}` : ""}`, {
      replace: true,
      state: location.state,
    });
  };

  useEffect(() => {
    const requestedTab = new URLSearchParams(location.search).get("tab");
    setActiveTab(requestedTab === "teams" ? "teams" : "projects");
  }, [location.search]);

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

  const canManageProjects = hasAdminPanelAccess(user?.role);

  const projectStats = useMemo(() => {
    const active = projects.filter((project) => getProjectStatus(project) === "Active").length;
    const completed = projects.filter(
      (project) => getProjectStatus(project) === "Completed"
    ).length;
    const onHold = projects.filter((project) => getProjectStatus(project) === "On Hold").length;
    const totalIssues = projects.reduce(
      (total, project) => total + (project.issueCount || 0),
      0
    );

    return {
      active,
      completed,
      onHold,
      totalIssues,
    };
  }, [projects]);

  const filteredProjects = useMemo(() => {
    const normalizedSearch = projectSearch.trim().toLowerCase();

    return [...projects]
      .filter((project) => {
        const projectTeams = getProjectTeams(project);

        if (projectStatusFilter !== "all" && getProjectStatus(project) !== projectStatusFilter) {
          return false;
        }

        if (
          projectTeamFilter !== "all" &&
          !projectTeams.some((team) => String(team?._id || team) === projectTeamFilter)
        ) {
          return false;
        }

        if (!normalizedSearch) {
          return true;
        }

        return [
          project.name,
          project.description,
          project.shortCode,
          getProjectOwnerName(project),
          ...projectTeams.map((team) => team?.name || team),
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(normalizedSearch));
      })
      .sort((left, right) => {
        if (projectSort === "issues") {
          return (right.issueCount || 0) - (left.issueCount || 0);
        }

        if (projectSort === "members") {
          return getProjectMemberCount(right) - getProjectMemberCount(left);
        }

        if (projectSort === "teams") {
          return getProjectTeams(right).length - getProjectTeams(left).length;
        }

        return String(left.name || "").localeCompare(String(right.name || ""));
      });
  }, [projectSearch, projectSort, projectStatusFilter, projectTeamFilter, projects]);

  const selectedProject = useMemo(
    () =>
      filteredProjects.find((project) => project._id === selectedProjectId) ||
      filteredProjects[0] ||
      null,
    [filteredProjects, selectedProjectId]
  );

  useEffect(() => {
    if (!filteredProjects.length) {
      setSelectedProjectId("");
      return;
    }

    if (!filteredProjects.some((project) => project._id === selectedProjectId)) {
      setSelectedProjectId(filteredProjects[0]._id);
    }
  }, [filteredProjects, selectedProjectId]);

  const handleCreateProject = async (payload) => {
    await createProjectMutation.mutateAsync(payload);
    setIsCreateDialogOpen(false);
  };

  const handleCreateTeam = async (payload) => {
    await createTeamMutation.mutateAsync(payload);
    setIsCreateTeamDialogOpen(false);
    showToast("success", "Team created successfully.");
  };

  const renderProjectCard = (project, index) => (
    <ProjectCard
      key={project._id}
      canManageProject={canManageProjects}
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
      onAttachTeam={(payload) => attachProjectTeamMutation.mutateAsync(payload)}
      onDetachTeam={(payload) => detachProjectTeamMutation.mutateAsync(payload)}
      onUpdateProject={(payload) => updateProjectMutation.mutateAsync(payload)}
      onUpdateStatus={(payload) => updateProjectStatusMutation.mutateAsync(payload)}
      onDeleteProject={(projectId) => deleteProjectMutation.mutateAsync(projectId)}
      onAddProjectMember={(payload) => addProjectMemberMutation.mutateAsync(payload)}
      onRemoveProjectMember={(payload) => removeProjectMemberMutation.mutateAsync(payload)}
      onCreateEpic={(payload) => createEpicMutation.mutateAsync(payload)}
      onUpdateEpic={(payload) => updateEpicMutation.mutateAsync(payload)}
      onDeleteEpic={(payload) => deleteEpicMutation.mutateAsync(payload)}
      onOpenTeamsComposer={() => showToast("success", "Opening Microsoft Teams...")}
      isDeletingProject={
        deleteProjectMutation.isPending && deleteProjectMutation.variables === project._id
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
      deletingEpicId={deleteEpicMutation.isPending ? deleteEpicMutation.variables?.id : ""}
      project={project}
      users={users}
      workspaceTeams={teams}
      teamsErrorMessage={isTeamsLoading ? "" : teamsErrorMessage}
      usersErrorMessage={isUsersLoading ? "" : usersErrorMessage}
    />
  );

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
    <div className="w-full">
      <ToastNotice toast={toast} onDismiss={() => setToast(null)} />

      <div className="grid w-full gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="min-w-0">
          <div className="sticky top-4 space-y-4 rounded-[24px] border border-slate-200/80 bg-white/90 p-3 shadow-[0_18px_48px_-40px_rgba(15,23,42,0.55)] backdrop-blur-xl">
            <div className="px-2 py-2">
              <p className="text-[11px] font-semibold uppercase text-slate-400">
                Project Center
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-950">
                {projects.length} projects
              </p>
            </div>

            <nav className="space-y-4" aria-label="Project page sidebar">
              <div className="space-y-1">
                <p className="px-2 text-[11px] font-semibold uppercase text-slate-400">
                  Projects
                </p>
                {[
                  {
                    label: "All Projects",
                    Icon: FolderKanban,
                    active: activeTab === "projects" && projectStatusFilter === "all",
                    action: () => {
                      updateActiveTab("projects");
                      setProjectSearch("");
                      setProjectStatusFilter("all");
                      setProjectTeamFilter("all");
                    },
                  },
                  {
                    label: "Active",
                    Icon: CheckCircle2,
                    active: activeTab === "projects" && projectStatusFilter === "Active",
                    action: () => {
                      updateActiveTab("projects");
                      setProjectStatusFilter("Active");
                    },
                  },
                  {
                    label: "On Hold",
                    Icon: Archive,
                    active: activeTab === "projects" && projectStatusFilter === "On Hold",
                    action: () => {
                      updateActiveTab("projects");
                      setProjectStatusFilter("On Hold");
                    },
                  },
                  {
                    label: "Completed",
                    Icon: ShieldCheck,
                    active: activeTab === "projects" && projectStatusFilter === "Completed",
                    action: () => {
                      updateActiveTab("projects");
                      setProjectStatusFilter("Completed");
                    },
                  },
                ].map(({ label, Icon, active, action }) => (
                  <button
                    key={label}
                    className={`flex h-10 w-full items-center gap-2 rounded-xl px-3 text-sm font-semibold transition ${
                      active
                        ? "bg-slate-950 text-white shadow-[0_14px_28px_-22px_rgba(15,23,42,0.9)]"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
                    }`}
                    type="button"
                    onClick={action}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </button>
                ))}
              </div>

              <div className="space-y-1">
                <p className="px-2 text-[11px] font-semibold uppercase text-slate-400">
                  Planning
                </p>
                <button
                  className="flex h-10 w-full items-center gap-2 rounded-xl px-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-slate-950"
                  type="button"
                  onClick={() =>
                    navigate(
                      selectedProject
                        ? `/backlog?projectId=${selectedProject._id}`
                        : "/backlog"
                    )
                  }
                >
                  <Route className="h-4 w-4" />
                  Backlog
                </button>
                <button
                  className="flex h-10 w-full items-center gap-2 rounded-xl px-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-slate-950"
                  type="button"
                  onClick={() =>
                    navigate(
                      selectedProject
                        ? `/issues?projectId=${selectedProject._id}`
                        : "/issues"
                    )
                  }
                >
                  <Bug className="h-4 w-4" />
                  Issues
                </button>
              </div>

              <div className="space-y-1">
                <p className="px-2 text-[11px] font-semibold uppercase text-slate-400">
                  Workspace
                </p>
                <button
                  className={`flex h-10 w-full items-center gap-2 rounded-xl px-3 text-sm font-semibold transition ${
                    activeTab === "teams"
                      ? "bg-slate-950 text-white shadow-[0_14px_28px_-22px_rgba(15,23,42,0.9)]"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
                  }`}
                  type="button"
                  onClick={() => updateActiveTab("teams")}
                >
                  <Users2 className="h-4 w-4" />
                  Teams
                </button>
                <button
                  className="flex h-10 w-full items-center gap-2 rounded-xl px-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-slate-950"
                  type="button"
                  onClick={() => navigate("/reports")}
                >
                  <BarChart3 className="h-4 w-4" />
                  Reports
                </button>
              </div>
            </nav>

            <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-3">
              <p className="text-sm font-semibold text-slate-950">Need a new lane?</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Create projects or teams without leaving this workspace.
              </p>
              <div className="mt-3 grid gap-2">
                <Button
                  className="h-9 rounded-xl"
                  type="button"
                  onClick={() => setIsCreateDialogOpen(true)}
                >
                  <Plus className="h-4 w-4" />
                  Project
                </Button>
                <Button
                  className="h-9 rounded-xl bg-white text-slate-700 hover:bg-slate-50"
                  type="button"
                  variant="outline"
                  onClick={() => setIsCreateTeamDialogOpen(true)}
                >
                  <Users2 className="h-4 w-4" />
                  Team
                </Button>
              </div>
            </div>
          </div>
        </aside>

        <main className="min-w-0 space-y-4">
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
                    onClick={() => updateActiveTab(id)}
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
          className="grid min-w-0 w-full gap-4 xl:grid-cols-[360px_minmax(0,1fr)]"
          id="projects-panel"
          role="tabpanel"
        >
          <aside className="min-w-0 space-y-3">
            <Card className="overflow-hidden border-slate-200/80 bg-white shadow-[0_18px_50px_-38px_rgba(15,23,42,0.45)]">
              <CardContent className="space-y-4 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h1 className="text-xl font-semibold tracking-tight text-slate-950">
                      Projects
                    </h1>
                    <p className="mt-1 text-sm text-slate-500">
                      {filteredProjects.length} of {projects.length} visible
                    </p>
                  </div>
                  <Button
                    className="interactive-button h-9 rounded-xl"
                    onClick={() => setIsCreateDialogOpen(true)}
                    type="button"
                  >
                    <Plus className="h-4 w-4" />
                    New
                  </Button>
                </div>

                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    className="h-11 w-full rounded-2xl border border-slate-200 bg-white pl-10 pr-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10"
                    placeholder="Search projects..."
                    value={projectSearch}
                    onChange={(event) => setProjectSearch(event.target.value)}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1.5">
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase text-slate-500">
                      <Filter className="h-3.5 w-3.5" />
                      Status
                    </span>
                    <select
                      className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10"
                      value={projectStatusFilter}
                      onChange={(event) => setProjectStatusFilter(event.target.value)}
                    >
                      {PROJECT_STATUS_FILTERS.map((status) => (
                        <option key={status} value={status}>
                          {status === "all" ? "All status" : status}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1.5">
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase text-slate-500">
                      <ArrowUpDown className="h-3.5 w-3.5" />
                      Sort
                    </span>
                    <select
                      className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10"
                      value={projectSort}
                      onChange={(event) => setProjectSort(event.target.value)}
                    >
                      {PROJECT_SORT_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <label className="space-y-1.5">
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase text-slate-500">
                    <Users2 className="h-3.5 w-3.5" />
                    Team
                  </span>
                  <select
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10"
                    value={projectTeamFilter}
                    onChange={(event) => setProjectTeamFilter(event.target.value)}
                  >
                    <option value="all">All teams</option>
                    {teams.map((team) => (
                      <option key={team._id} value={team._id}>
                        {team.name}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-1">
                  {[
                    { id: "grid", label: "Cards", Icon: LayoutGrid },
                    { id: "compact", label: "Compact", Icon: List },
                  ].map(({ id, label, Icon }) => (
                    <button
                      key={id}
                      className={`inline-flex h-9 items-center justify-center gap-2 rounded-xl text-sm font-semibold transition ${
                        projectView === id
                          ? "bg-white text-blue-700 shadow-sm"
                          : "text-slate-500 hover:text-slate-950"
                      }`}
                      type="button"
                      onClick={() => setProjectView(id)}
                    >
                      <Icon className="h-4 w-4" />
                      {label}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="max-h-[calc(100svh-21rem)] min-h-[280px] space-y-2 overflow-y-auto pr-1">
              {isProjectsLoading ? (
                Array.from({ length: 6 }).map((_, index) => (
                  <Skeleton
                    key={`project-list-skeleton-${index}`}
                    className="h-[74px] w-full rounded-2xl"
                  />
                ))
              ) : filteredProjects.length ? (
                filteredProjects.map((project) => {
                  const isSelected = selectedProject?._id === project._id;
                  const themeColor = getProjectThemeColor(project);

                  return (
                    <button
                      key={project._id}
                      className={`group flex w-full items-center gap-3 rounded-2xl border bg-white p-3 text-left shadow-[0_12px_30px_-28px_rgba(15,23,42,0.5)] transition hover:-translate-y-0.5 hover:shadow-[0_20px_42px_-32px_rgba(15,23,42,0.58)] ${
                        isSelected
                          ? "border-blue-300 ring-4 ring-blue-500/10"
                          : "border-slate-200 hover:border-slate-300"
                      }`}
                      type="button"
                      onClick={() => setSelectedProjectId(project._id)}
                    >
                      <span
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-xs font-bold"
                        style={{
                          backgroundColor: `${themeColor}18`,
                          color: themeColor,
                        }}
                      >
                        {getProjectInitials(project)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-slate-950">
                          {project.name}
                        </span>
                        <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          <span>{project.issueCount || 0} issues</span>
                          <span>{getProjectMemberCount(project)} members</span>
                          <span className="inline-flex items-center gap-1 text-emerald-600">
                            <span className="h-1.5 w-1.5 rounded-full bg-current" />
                            {getProjectStatus(project)}
                          </span>
                        </span>
                      </span>
                      <MoreHorizontal className="h-4 w-4 text-slate-400 opacity-0 transition group-hover:opacity-100" />
                    </button>
                  );
                })
              ) : (
                <Card>
                  <CardContent className="p-4 text-sm text-slate-500">
                    No projects match the current controls.
                  </CardContent>
                </Card>
              )}
            </div>
          </aside>

          <div className="min-w-0 space-y-4">
            {selectedProject ? (
              <>
                <Card className="overflow-hidden border-slate-200 bg-white shadow-[0_18px_52px_-40px_rgba(15,23,42,0.5)]">
                  <CardContent className="p-0">
                    <div
                      className="h-1.5"
                      style={{ backgroundColor: getProjectThemeColor(selectedProject) }}
                    />
                    <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-start lg:justify-between">
                      <div className="flex min-w-0 items-start gap-4">
                        <div
                          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-sm font-bold"
                          style={{
                            backgroundColor: `${getProjectThemeColor(selectedProject)}18`,
                            color: getProjectThemeColor(selectedProject),
                          }}
                        >
                          {getProjectInitials(selectedProject)}
                        </div>
                        <div className="min-w-0">
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <h2 className="truncate text-2xl font-semibold tracking-tight text-slate-950">
                              {selectedProject.name}
                            </h2>
                            <button
                              className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-50 hover:text-amber-500"
                              type="button"
                              title="Star project"
                            >
                              <Star className="h-4 w-4" />
                            </button>
                          </div>
                          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
                            {selectedProject.description || "No description added yet."}
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                              Owner: {getProjectOwnerName(selectedProject)}
                            </span>
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                              {getProjectTeams(selectedProject).length} teams
                            </span>
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                              {getProjectStatus(selectedProject)}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          className="h-10 rounded-xl"
                          type="button"
                          onClick={() => navigate(`/issues?projectId=${selectedProject._id}`)}
                        >
                          <Bug className="h-4 w-4" />
                          View Issues
                        </Button>
                        <Button
                          className="h-10 rounded-xl"
                          variant="outline"
                          type="button"
                          onClick={() => navigate(`/backlog?projectId=${selectedProject._id}`)}
                        >
                          <Layers3 className="h-4 w-4" />
                          Backlog
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <div className="grid gap-3 md:grid-cols-4">
                  {[
                    {
                      label: "Issues",
                      value: selectedProject.issueCount || 0,
                      Icon: Bug,
                    },
                    {
                      label: "Members",
                      value: getProjectMemberCount(selectedProject),
                      Icon: Users2,
                    },
                    {
                      label: "Teams",
                      value: getProjectTeams(selectedProject).length,
                      Icon: Layers3,
                    },
                    {
                      label: "Active Projects",
                      value: projectStats.active,
                      Icon: CheckCircle2,
                    },
                  ].map(({ label, value, Icon }) => (
                    <Card key={label} className="border-slate-200 bg-white">
                      <CardContent className="flex items-center justify-between p-4">
                        <div>
                          <p className="text-xs font-semibold uppercase text-slate-500">
                            {label}
                          </p>
                          <p className="mt-1 text-2xl font-semibold text-slate-950">
                            {value}
                          </p>
                        </div>
                        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
                          <Icon className="h-4 w-4" />
                        </span>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                <div className="space-y-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="text-base font-semibold text-slate-950">
                        Project Workbench
                      </h3>
                      <p className="mt-1 text-sm text-slate-500">
                        Control projects from the cards below.
                      </p>
                    </div>
                    <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500 shadow-sm">
                      <SlidersHorizontal className="h-4 w-4" />
                      {projectStats.totalIssues} total issues
                    </div>
                  </div>

                  {isProjectsLoading ? (
                    <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                      {Array.from({ length: PROJECT_GRID_SKELETON_COUNT }).map((_, index) => (
                        <Skeleton
                          key={`project-skeleton-${index}`}
                          className="h-[286px] w-full rounded-2xl"
                        />
                      ))}
                    </div>
                  ) : filteredProjects.length ? (
                    <div
                      className={
                        projectView === "grid"
                          ? "grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3"
                          : "grid min-w-0 grid-cols-1 gap-3 2xl:grid-cols-2"
                      }
                    >
                      {filteredProjects.map((project, index) =>
                        renderProjectCard(project, index)
                      )}
                    </div>
                  ) : (
                    <EmptyState
                      title="No projects match these controls"
                      description="Adjust search, status, or team filters to widen the project list."
                      icon={<FolderKanban className="h-5 w-5" />}
                    />
                  )}
                </div>
              </>
            ) : !isProjectsLoading ? (
              <EmptyState
                title="No projects yet"
                description="Create a project, attach a team, and start organizing work in a tighter project space."
                icon={<FolderKanban className="h-5 w-5" />}
              />
            ) : null}
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
        </main>
      </div>

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
            "!top-[1rem] max-h-[calc(100svh-2rem)] grid w-[96vw] max-w-[1280px] grid-rows-[auto_minmax(0,1fr)] rounded-[24px] sm:!top-[1.5rem] sm:max-h-[calc(100vh-3rem)]"
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
