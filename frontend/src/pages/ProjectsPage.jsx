import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  BarChart3,
  Bug,
  CheckCircle2,
  ClipboardList,
  FolderKanban,
  Layers3,
  MoreHorizontal,
  Plus,
  Route,
  Search,
  Settings2,
  ShieldCheck,
  Star,
  Target,
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
  fetchEpics,
  fetchProjects,
  fetchIssues,
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
import ProjectManageDialog from "@/components/projects/ProjectManageDialog";
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
import { getProjectTeams, resolveUserId } from "@/lib/project-teams";
import { getInitials } from "@/lib/utils";
import { ISSUE_TYPES, normalizeIssueType } from "@/lib/issues";
import {
  TASK_BOARD_COLUMNS,
  getTaskBoardStatus,
} from "@/components/tasks/taskBoardStatus";
import {
  DEVELOPER_BUG_COLUMNS,
  getBugColumnKey,
} from "@/components/bugs/bugBoardConfig";

const TEAM_PANEL_SKELETON_COUNT = 3;

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

const formatShortDate = (value) => {
  if (!value) {
    return "Not set";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not set";
  }

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const getTimelineStatus = (item = {}) => {
  const targetDate = item.targetDate ? new Date(item.targetDate) : null;

  if (String(item.status || "").toUpperCase() === "DONE") {
    return { label: "Done", className: "bg-emerald-50 text-emerald-700" };
  }

  if (!targetDate || Number.isNaN(targetDate.getTime())) {
    return { label: "No deadline", className: "bg-slate-100 text-slate-600" };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  targetDate.setHours(0, 0, 0, 0);

  if (targetDate < today) {
    return { label: "Off track", className: "bg-rose-50 text-rose-700" };
  }

  const daysLeft = Math.ceil((targetDate.getTime() - today.getTime()) / 86400000);

  return daysLeft <= 7
    ? { label: "Due soon", className: "bg-amber-50 text-amber-700" }
    : { label: "On track", className: "bg-emerald-50 text-emerald-700" };
};

const getPeriodLabel = (startDate, targetDate) => {
  if (!startDate || !targetDate) {
    return "Period not set";
  }

  const start = new Date(startDate);
  const end = new Date(targetDate);
  const days = Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1;

  return Number.isFinite(days) && days > 0 ? `${days} days` : "Period not set";
};

const getDaysRemainingLabel = (targetDate) => {
  if (!targetDate) {
    return "Not set";
  }

  const end = new Date(targetDate);

  if (Number.isNaN(end.getTime())) {
    return "Not set";
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  const days = Math.ceil((end.getTime() - today.getTime()) / 86400000);

  if (days < 0) {
    return `${Math.abs(days)} overdue`;
  }

  return days === 1 ? "1 day" : `${days} days`;
};

const formatBudget = (project = {}) => {
  const budget = project.budget ?? project.projectBudget ?? project.estimatedBudget;

  if (budget === null || typeof budget === "undefined" || budget === "") {
    return "Not set";
  }

  const numericBudget = Number(budget);

  if (!Number.isFinite(numericBudget)) {
    return String(budget);
  }

  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(numericBudget);
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
  const [projectMode, setProjectMode] = useState("overview");
  const [projectDetailView, setProjectDetailView] = useState("overview");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [isSelectedProjectManageOpen, setIsSelectedProjectManageOpen] = useState(false);
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
      .sort((left, right) =>
        String(left.name || "").localeCompare(String(right.name || ""))
      );
  }, [projectSearch, projectStatusFilter, projects]);

  const selectedProject = useMemo(
    () =>
      filteredProjects.find((project) => project._id === selectedProjectId) ||
      filteredProjects[0] ||
      null,
    [filteredProjects, selectedProjectId]
  );

  const selectedProjectTeams = useMemo(
    () => (selectedProject ? getProjectTeams(selectedProject) : []),
    [selectedProject]
  );

  const selectedProjectMembers = useMemo(() => {
    if (!selectedProject) {
      return [];
    }

    const uniqueMembers = new Map();
    const addMember = (member, source = "") => {
      const user = member?.user || member?.userId || member;
      const memberId = resolveUserId(user);

      if (!memberId || uniqueMembers.has(memberId)) {
        return;
      }

      uniqueMembers.set(memberId, {
        ...user,
        projectRole: member?.role || user?.projectRole || user?.role || "",
        membershipSource: source,
      });
    };

    (selectedProject.members || []).forEach((member) => addMember(member, "Project"));
    (selectedProject.projectMembers || []).forEach((member) =>
      addMember(member, "Project")
    );
    [
      selectedProject.projectManager || selectedProject.manager,
      selectedProject.teamLead,
      selectedProject.qaLead,
    ].forEach((member) => addMember(member, "Leadership"));
    selectedProjectTeams.forEach((team) =>
      (team?.members || []).forEach((member) => addMember(member, team.name || "Team"))
    );

    return Array.from(uniqueMembers.values()).sort((left, right) =>
      (left.name || left.email || "").localeCompare(right.name || right.email || "")
    );
  }, [selectedProject, selectedProjectTeams]);

  const { data: selectedProjectEpicData = [] } = useQuery({
    queryKey: ["project-epics", selectedProject?._id],
    queryFn: () => fetchEpics({ projectId: selectedProject._id }),
    enabled: Boolean(selectedProject?._id),
  });

  const selectedProjectEpics = useMemo(() => {
    if (Array.isArray(selectedProjectEpicData) && selectedProjectEpicData.length) {
      return selectedProjectEpicData.filter((epic) => epic?.name);
    }

    if (!Array.isArray(selectedProject?.epics)) {
      return [];
    }

    return selectedProject.epics
      .map((epic, index) =>
        typeof epic === "string"
          ? {
              _id: `${epic}-${index}`,
              name: epic,
              description: "",
              color: getProjectThemeColor(selectedProject),
            }
          : epic
      )
      .filter((epic) => epic?.name);
  }, [selectedProject, selectedProjectEpicData]);

  const selectedProjectTimelineStatus = useMemo(
    () => getTimelineStatus(selectedProject || {}),
    [selectedProject]
  );

  const {
    data: selectedProjectIssuesData = [],
    isLoading: isSelectedProjectIssuesLoading,
  } = useQuery({
    queryKey: ["issues", "project-overview", selectedProject?._id],
    queryFn: () => fetchIssues({ projectId: selectedProject._id }),
    enabled: Boolean(selectedProject?._id),
  });

  const selectedProjectIssues = useMemo(
    () => (Array.isArray(selectedProjectIssuesData) ? selectedProjectIssuesData : []),
    [selectedProjectIssuesData]
  );

  const selectedProjectProgress = useMemo(() => {
    if (!selectedProjectIssues.length) {
      return 0;
    }

    const completedIssues = selectedProjectIssues.filter((issue) => {
      const issueType = normalizeIssueType(issue?.type, ISSUE_TYPES.TASK);

      if ([ISSUE_TYPES.TASK, ISSUE_TYPES.SUB_TASK].includes(issueType)) {
        return getTaskBoardStatus(issue) === "DONE";
      }

      if (issueType === ISSUE_TYPES.BUG) {
        return getBugColumnKey(issue, DEVELOPER_BUG_COLUMNS) === "closed";
      }

      return ["DONE", "CLOSED"].includes(String(issue?.status || "").toUpperCase());
    }).length;

    return Math.round((completedIssues / selectedProjectIssues.length) * 100);
  }, [selectedProjectIssues]);

  const selectedProjectTasks = useMemo(
    () =>
      selectedProjectIssues.filter((issue) =>
        [ISSUE_TYPES.TASK, ISSUE_TYPES.SUB_TASK].includes(
          normalizeIssueType(issue?.type, ISSUE_TYPES.TASK)
        )
      ),
    [selectedProjectIssues]
  );

  const selectedProjectBugs = useMemo(
    () =>
      selectedProjectIssues.filter(
        (issue) => normalizeIssueType(issue?.type, ISSUE_TYPES.TASK) === ISSUE_TYPES.BUG
      ),
    [selectedProjectIssues]
  );

  const taskStatusRows = useMemo(
    () =>
      TASK_BOARD_COLUMNS.map((column) => ({
        ...column,
        count: selectedProjectTasks.filter(
          (issue) => getTaskBoardStatus(issue) === column.key
        ).length,
      })),
    [selectedProjectTasks]
  );

  const bugStatusRows = useMemo(
    () =>
      DEVELOPER_BUG_COLUMNS.map((column) => ({
        ...column,
        count: selectedProjectBugs.filter(
          (issue) => getBugColumnKey(issue, DEVELOPER_BUG_COLUMNS) === column.key
        ).length,
      })),
    [selectedProjectBugs]
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

  useEffect(() => {
    setProjectDetailView("overview");
  }, [selectedProject?._id]);

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
    <div className="h-[calc(100svh-4.5rem)] w-full overflow-hidden">
      <ToastNotice toast={toast} onDismiss={() => setToast(null)} />

      <div className="grid h-full min-h-0 w-full gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="min-h-0 min-w-0 border-r border-slate-200/80 bg-white/72 pr-3">
          <div className="sticky top-0 flex h-full min-h-0 flex-col gap-4 py-3">
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
                      setProjectMode("overview");
                      setProjectSearch("");
                      setProjectStatusFilter("all");
                    },
                  },
                  {
                    label: "Active",
                    Icon: CheckCircle2,
                    active: activeTab === "projects" && projectStatusFilter === "Active",
                    action: () => {
                      updateActiveTab("projects");
                      setProjectMode("overview");
                      setProjectStatusFilter("Active");
                    },
                  },
                  {
                    label: "On Hold",
                    Icon: Archive,
                    active: activeTab === "projects" && projectStatusFilter === "On Hold",
                    action: () => {
                      updateActiveTab("projects");
                      setProjectMode("overview");
                      setProjectStatusFilter("On Hold");
                    },
                  },
                  {
                    label: "Completed",
                    Icon: ShieldCheck,
                    active: activeTab === "projects" && projectStatusFilter === "Completed",
                    action: () => {
                      updateActiveTab("projects");
                      setProjectMode("overview");
                      setProjectStatusFilter("Completed");
                    },
                  },
                ].map(({ label, Icon, active, action }) => (
                  <button
                    key={label}
                    className={`flex h-9 w-full items-center gap-2 rounded-lg px-3 text-sm font-semibold transition ${
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
                  className={`flex h-9 w-full items-center gap-2 rounded-lg px-3 text-sm font-semibold transition ${
                    activeTab === "projects" && projectMode === "planning"
                      ? "bg-slate-950 text-white shadow-[0_14px_28px_-22px_rgba(15,23,42,0.9)]"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
                  }`}
                  type="button"
                  onClick={() => {
                    updateActiveTab("projects");
                    setProjectMode("planning");
                  }}
                >
                  <ClipboardList className="h-4 w-4" />
                  Project Planning
                </button>
                <button
                  className="flex h-9 w-full items-center gap-2 rounded-lg px-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-slate-950"
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
                  className="flex h-9 w-full items-center gap-2 rounded-lg px-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-slate-950"
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
                  className={`flex h-9 w-full items-center gap-2 rounded-lg px-3 text-sm font-semibold transition ${
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
                  className="flex h-9 w-full items-center gap-2 rounded-lg px-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-slate-950"
                  type="button"
                  onClick={() => navigate("/reports")}
                >
                  <BarChart3 className="h-4 w-4" />
                  Reports
                </button>
              </div>
            </nav>

            <div className="mx-2 rounded-xl border border-blue-100 bg-blue-50/70 p-3">
              <p className="text-sm font-semibold text-slate-950">Need a new lane?</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
              
              </p>
              <div className="mt-3 grid gap-2">
                <Button
                  className="h-9 rounded-lg"
                  type="button"
                  onClick={() => setIsCreateDialogOpen(true)}
                >
                  <Plus className="h-4 w-4" />
                  Project
                </Button>
                <Button
                  className="h-9 rounded-lg bg-white text-slate-700 hover:bg-slate-50"
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

        <main className="min-h-0 min-w-0 overflow-hidden">

      {activeTab === "projects" && projectMode === "overview" ? (
        <section
          aria-labelledby="projects-tab"
          className="grid h-full min-h-0 min-w-0 w-full gap-4 xl:grid-cols-[360px_minmax(0,1fr)]"
          id="projects-panel"
          role="tabpanel"
        >
          <aside className="flex min-h-0 min-w-0 flex-col gap-2">
            <Card className="shrink-0 overflow-hidden rounded-[20px] border-slate-200/80 bg-white shadow-[0_12px_34px_-30px_rgba(15,23,42,0.45)]">
              <CardContent className="space-y-3 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h1 className="text-lg font-semibold tracking-tight text-slate-950">
                      Projects
                    </h1>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {filteredProjects.length} of {projects.length} visible
                    </p>
                  </div>
                  <Button
                    className="interactive-button h-8 rounded-lg px-3 text-xs"
                    onClick={() => setIsCreateDialogOpen(true)}
                    type="button"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    New
                  </Button>
                </div>

                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10"
                    placeholder="Search projects..."
                    value={projectSearch}
                    onChange={(event) => setProjectSearch(event.target.value)}
                  />
                </div>

              </CardContent>
            </Card>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
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

          <div className="min-h-0 min-w-0 space-y-4 overflow-y-auto pr-1">
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
                          className="h-10 w-10 rounded-xl px-0"
                          variant="outline"
                          type="button"
                          title="Project settings"
                          onClick={() => setIsSelectedProjectManageOpen(true)}
                          disabled={!canManageProjects}
                        >
                          <Settings2 className="h-4 w-4" />
                        </Button>
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

                <div className="grid gap-3 md:grid-cols-5">
                  {[
                    {
                      label: "Timeline",
                      value: getPeriodLabel(
                        selectedProject.startDate,
                        selectedProject.targetDate
                      ),
                      helper: `${formatShortDate(selectedProject.startDate)} - ${formatShortDate(
                        selectedProject.targetDate
                      )}`,
                    },
                    {
                      label: "Progress",
                      value: `${selectedProjectProgress}%`,
                      helper: `${selectedProjectIssues.length} total work items`,
                    },
                    {
                      label: "Days Remaining",
                      value: getDaysRemainingLabel(selectedProject.targetDate),
                      helper: "Until project deadline",
                    },
                    {
                      label: "Health",
                      value: selectedProjectTimelineStatus.label,
                      helper: "Based on deadline status",
                    },
                    {
                      label: "Budget",
                      value: formatBudget(selectedProject),
                      helper: "Planned project budget",
                    },
                  ].map((metric) => (
                    <div
                      key={metric.label}
                      className="rounded-2xl border border-blue-200 bg-[linear-gradient(135deg,#ffffff_0%,#eff6ff_100%)] p-4 shadow-[0_18px_44px_-34px_rgba(37,99,235,0.6)]"
                    >
                      <p className="text-xs font-semibold uppercase text-blue-700">
                        {metric.label}
                      </p>
                      <p className="mt-2 truncate text-xl font-semibold text-slate-950">
                        {metric.value}
                      </p>
                      <p className="mt-2 min-h-8 text-xs leading-4 text-slate-500">
                        {metric.helper}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="grid gap-3 md:grid-cols-4">
                  {[
                    {
                      id: "tasks",
                      label: "Tasks",
                      value: selectedProjectTasks.length,
                      helper: "To do, in progress, done",
                      Icon: ClipboardList,
                    },
                    {
                      id: "bugs",
                      label: "Bugs",
                      value: selectedProjectBugs.length,
                      helper: "Reported through closed",
                      Icon: Bug,
                    },
                    {
                      id: "members",
                      label: "Members",
                      value: selectedProjectMembers.length || getProjectMemberCount(selectedProject),
                      helper: "People on this project",
                      Icon: Users2,
                    },
                    {
                      id: "teams",
                      label: "Teams",
                      value: selectedProjectTeams.length,
                      helper: "Attached teams",
                      Icon: Layers3,
                    },
                  ].map(({ id, label, value, helper, Icon }) => {
                    const isActive = projectDetailView === id;

                    return (
                      <button
                        key={label}
                        className={`rounded-2xl border bg-white p-4 text-left transition hover:border-blue-200 hover:bg-blue-50/50 ${
                          isActive
                            ? "border-blue-300 ring-4 ring-blue-500/10"
                            : "border-slate-200"
                        }`}
                        type="button"
                        onClick={() => setProjectDetailView(id)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs font-semibold uppercase text-slate-500">
                              {label}
                            </p>
                            <p className="mt-1 text-2xl font-semibold text-slate-950">
                              {isSelectedProjectIssuesLoading &&
                              ["Tasks", "Bugs"].includes(label)
                                ? "..."
                                : value}
                            </p>
                          </div>
                          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
                            <Icon className="h-4 w-4" />
                          </span>
                        </div>
                        <p className="mt-3 text-sm text-slate-500">{helper}</p>
                      </button>
                    );
                  })}
                </div>

                <section className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-col gap-3 border-b border-slate-200 pb-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="text-base font-semibold text-slate-950">
                        Roadmap
                      </h3>
                      <p className="mt-1 text-sm text-slate-500">
                        {formatShortDate(selectedProject.startDate)} to{" "}
                        {formatShortDate(selectedProject.targetDate)} /{" "}
                        {getPeriodLabel(
                          selectedProject.startDate,
                          selectedProject.targetDate
                        )}
                      </p>
                    </div>
                    <span
                      className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${selectedProjectTimelineStatus.className}`}
                    >
                      {selectedProjectTimelineStatus.label}
                    </span>
                  </div>

                  <div className="mt-3 space-y-2">
                    {selectedProjectEpics.length ? (
                      selectedProjectEpics.map((epic) => {
                        const epicStatus = getTimelineStatus(epic);

                        return (
                          <div
                            key={epic._id || epic.name}
                            className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto]"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-950">
                                {epic.name}
                              </p>
                              <p className="mt-1 text-xs text-slate-500">
                                {formatShortDate(epic.startDate)} to{" "}
                                {formatShortDate(epic.targetDate)}
                              </p>
                            </div>
                            <span
                              className={`h-fit w-fit rounded-full px-3 py-1 text-xs font-semibold ${epicStatus.className}`}
                            >
                              {epicStatus.label}
                            </span>
                          </div>
                        );
                      })
                    ) : (
                      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                        No epic roadmap yet.
                      </div>
                    )}
                  </div>
                </section>

                <section className="space-y-3">
                  <div>
                    <h3 className="text-base font-semibold text-slate-950">
                      {projectDetailView === "tasks"
                        ? "Task Overview"
                        : projectDetailView === "bugs"
                          ? "Bug Overview"
                          : projectDetailView === "members"
                            ? "Project Members"
                            : projectDetailView === "teams"
                              ? "Attached Teams"
                              : "Project Details"}
                    </h3>
                    <p className="mt-1 text-sm text-slate-500">
                      {projectDetailView === "tasks"
                        ? "Tasks are separated into To Do, In Progress, and Done."
                        : projectDetailView === "bugs"
                          ? "Bugs are separated by the bug workflow stages."
                          : projectDetailView === "members"
                            ? "All people available through project ownership and attached teams."
                            : projectDetailView === "teams"
                              ? "Workspace teams attached to this project."
                              : "Selected project summary, ownership, teams, and epics."}
                    </p>
                  </div>

                  {projectDetailView === "tasks" ? (
                    <div className="grid gap-3 md:grid-cols-3">
                      {taskStatusRows.map((row) => (
                        <div
                          key={row.key}
                          className="rounded-2xl border border-slate-200 bg-white p-4"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className={`h-2.5 w-2.5 rounded-full ${row.accentClassName}`} />
                            <span className="text-2xl font-semibold text-slate-950">
                              {row.count}
                            </span>
                          </div>
                          <h4 className="mt-3 text-sm font-semibold text-slate-950">
                            {row.label === "Open" ? "To Do" : row.label}
                          </h4>
                          <p className="mt-1 text-sm text-slate-500">{row.helper}</p>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {projectDetailView === "bugs" ? (
                    <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
                      {bugStatusRows.map((row) => (
                        <div
                          key={row.key}
                          className="rounded-2xl border border-slate-200 bg-white p-4"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className={`h-2.5 w-2.5 rounded-full ${row.accentClassName}`} />
                            <span className="text-2xl font-semibold text-slate-950">
                              {row.count}
                            </span>
                          </div>
                          <h4 className="mt-3 text-sm font-semibold text-slate-950">
                            {row.label}
                          </h4>
                          <p className="mt-1 text-sm text-slate-500">{row.helper}</p>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {projectDetailView === "members" ? (
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {selectedProjectMembers.length ? (
                        selectedProjectMembers.map((member) => (
                          <div
                            key={resolveUserId(member)}
                            className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4"
                          >
                            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-sm font-semibold text-blue-700">
                              {getInitials(member.name || member.email || "User")}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-semibold text-slate-950">
                                {member.name || member.email || "Unnamed member"}
                              </span>
                              <span className="mt-1 block truncate text-xs text-slate-500">
                                {[member.projectRole || member.role, member.membershipSource]
                                  .filter(Boolean)
                                  .join(" / ") || "Project member"}
                              </span>
                            </span>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-5 text-sm text-slate-500 md:col-span-2 xl:col-span-3">
                          No members are attached to this project yet.
                        </div>
                      )}
                    </div>
                  ) : null}

                  {projectDetailView === "teams" ? (
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {selectedProjectTeams.length ? (
                        selectedProjectTeams.map((team) => (
                          <div
                            key={team._id || team.name}
                            className="rounded-2xl border border-slate-200 bg-white p-4"
                          >
                            <div className="flex items-center gap-3">
                              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-sm font-semibold text-indigo-700">
                                {getInitials(team.name || "Team")}
                              </span>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-slate-950">
                                  {team.name || "Untitled team"}
                                </p>
                                <p className="mt-1 text-xs text-slate-500">
                                  {team.memberCount || team.members?.length || 0} members
                                </p>
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-5 text-sm text-slate-500 md:col-span-2 xl:col-span-3">
                          No teams are attached to this project yet.
                        </div>
                      )}
                    </div>
                  ) : null}

                  {projectDetailView === "overview" ? (
                    <div className="grid gap-3 lg:grid-cols-3">
                      <div className="rounded-2xl border border-slate-200 bg-white p-4">
                        <p className="text-xs font-semibold uppercase text-slate-500">
                          Ownership
                        </p>
                        <p className="mt-2 text-base font-semibold text-slate-950">
                          {getProjectOwnerName(selectedProject)}
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          Project manager responsible for planning and delivery.
                        </p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-white p-4">
                        <p className="text-xs font-semibold uppercase text-slate-500">
                          Team Coverage
                        </p>
                        <p className="mt-2 text-base font-semibold text-slate-950">
                          {selectedProjectTeams.length
                            ? selectedProjectTeams.map((team) => team.name).join(", ")
                            : "No teams attached"}
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          Workspace teams connected to this project.
                        </p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-white p-4">
                        <p className="text-xs font-semibold uppercase text-slate-500">
                          Epics
                        </p>
                        <p className="mt-2 text-base font-semibold text-slate-950">
                          {selectedProjectEpics.length} workstreams
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          Larger planning streams currently attached.
                        </p>
                      </div>
                    </div>
                  ) : null}
                </section>
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

      {activeTab === "projects" && projectMode === "planning" ? (
        <section
          aria-label="Project planning"
          className="h-full min-h-0 min-w-0 space-y-5 overflow-y-auto pr-1"
        >
          <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase text-blue-600">
                Project Planning
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
                Plan setup, teams, epics, and delivery from one flow
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                Start with the project shell, attach the right team, define epics,
                then move into backlog and issue planning for execution.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                className="h-10 rounded-xl"
                type="button"
                onClick={() => setIsCreateDialogOpen(true)}
              >
                <Plus className="h-4 w-4" />
                Create Project
              </Button>
              <Button
                className="h-10 rounded-xl"
                type="button"
                variant="outline"
                onClick={() => setIsCreateTeamDialogOpen(true)}
              >
                <Users2 className="h-4 w-4" />
                Create Team
              </Button>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
            <aside className="min-w-0 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-slate-950">
                    Select Project
                  </h2>
                  <p className="text-xs text-slate-500">
                    Planning follows the selected project.
                  </p>
                </div>
                <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-500">
                  {filteredProjects.length}
                </span>
              </div>

              <div className="max-h-[calc(100svh-18rem)] space-y-2 overflow-y-auto pr-1">
                {isProjectsLoading ? (
                  Array.from({ length: 5 }).map((_, index) => (
                    <Skeleton
                      key={`planning-project-skeleton-${index}`}
                      className="h-[70px] w-full rounded-xl"
                    />
                  ))
                ) : filteredProjects.length ? (
                  filteredProjects.map((project) => {
                    const isSelected = selectedProject?._id === project._id;
                    const themeColor = getProjectThemeColor(project);

                    return (
                      <button
                        key={project._id}
                        className={`flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition ${
                          isSelected
                            ? "border-blue-300 bg-blue-50/70"
                            : "border-slate-200 bg-white hover:border-slate-300"
                        }`}
                        type="button"
                        onClick={() => setSelectedProjectId(project._id)}
                      >
                        <span
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xs font-bold"
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
                          <span className="mt-1 block truncate text-xs text-slate-500">
                            {getProjectTeams(project).length} teams / {project.issueCount || 0} issues
                          </span>
                        </span>
                      </button>
                    );
                  })
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
                    No projects available for planning.
                  </div>
                )}
              </div>
            </aside>

            <div className="min-w-0 space-y-5">
              {selectedProject ? (
                <>
                  <div className="rounded-[22px] border border-slate-200 bg-white p-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="flex min-w-0 gap-3">
                        <span
                          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-sm font-bold"
                          style={{
                            backgroundColor: `${getProjectThemeColor(selectedProject)}18`,
                            color: getProjectThemeColor(selectedProject),
                          }}
                        >
                          {getProjectInitials(selectedProject)}
                        </span>
                        <div className="min-w-0">
                          <h2 className="truncate text-xl font-semibold text-slate-950">
                            {selectedProject.name}
                          </h2>
                          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
                            {selectedProject.description || "No description added yet."}
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                              Owner: {getProjectOwnerName(selectedProject)}
                            </span>
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                              {selectedProjectTeams.length} teams
                            </span>
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                              {selectedProjectEpics.length} epics
                            </span>
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                              {selectedProject.issueCount || 0} issues
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button
                          className="h-10 rounded-xl"
                          type="button"
                          onClick={() => navigate(`/backlog?projectId=${selectedProject._id}`)}
                        >
                          <Route className="h-4 w-4" />
                          Open Backlog
                        </Button>
                        <Button
                          className="h-10 rounded-xl"
                          type="button"
                          variant="outline"
                          onClick={() =>
                            navigate(`/issues?projectId=${selectedProject._id}&compose=1`)
                          }
                        >
                          <Bug className="h-4 w-4" />
                          Add Issue
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-4">
                    {[
                      {
                        label: "Project shell",
                        done: true,
                        helper: "Name, owner, status, and theme are set.",
                        action: "Manage",
                      },
                      {
                        label: "Team coverage",
                        done: selectedProjectTeams.length > 0,
                        helper: selectedProjectTeams.length
                          ? `${selectedProjectTeams.length} team attached`
                          : "Attach a workspace team.",
                        action: "Teams",
                      },
                      {
                        label: "Epic map",
                        done: selectedProjectEpics.length > 0,
                        helper: selectedProjectEpics.length
                          ? `${selectedProjectEpics.length} epic${selectedProjectEpics.length === 1 ? "" : "s"} ready`
                          : "Create epics for workstreams.",
                        action: "Backlog",
                      },
                      {
                        label: "Execution queue",
                        done: (selectedProject.issueCount || 0) > 0,
                        helper: `${selectedProject.issueCount || 0} issue${(selectedProject.issueCount || 0) === 1 ? "" : "s"} created`,
                        action: "Issues",
                      },
                    ].map((step) => (
                      <div
                        key={step.label}
                        className="rounded-2xl border border-slate-200 bg-white p-4"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span
                            className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                              step.done
                                ? "bg-emerald-50 text-emerald-600"
                                : "bg-amber-50 text-amber-600"
                            }`}
                          >
                            {step.done ? (
                              <CheckCircle2 className="h-4 w-4" />
                            ) : (
                              <Target className="h-4 w-4" />
                            )}
                          </span>
                          <span
                            className={`rounded-full px-2 py-1 text-[11px] font-semibold ${
                              step.done
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-amber-50 text-amber-700"
                            }`}
                          >
                            {step.done ? "Ready" : "Needed"}
                          </span>
                        </div>
                        <h3 className="mt-3 text-sm font-semibold text-slate-950">
                          {step.label}
                        </h3>
                        <p className="mt-1 min-h-10 text-sm leading-5 text-slate-500">
                          {step.helper}
                        </p>
                        <p className="mt-3 text-xs font-semibold uppercase text-slate-400">
                          {step.action}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="grid gap-4 xl:grid-cols-2">
                    <section className="rounded-[22px] border border-slate-200 bg-white p-4">
                      <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-3">
                        <div>
                          <h3 className="text-base font-semibold text-slate-950">
                            Epic Plan
                          </h3>
                          <p className="mt-1 text-sm text-slate-500">
                            Workstreams created during project setup.
                          </p>
                        </div>
                        <Button
                          className="h-9 rounded-lg"
                          type="button"
                          variant="outline"
                          onClick={() => navigate(`/backlog?projectId=${selectedProject._id}`)}
                        >
                          <Plus className="h-4 w-4" />
                          Epic
                        </Button>
                      </div>

                      <div className="mt-3 space-y-2">
                        {selectedProjectEpics.length ? (
                          selectedProjectEpics.map((epic, index) => (
                            <div
                              key={epic._id || epic.name}
                              className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5"
                            >
                              <span
                                className="h-2.5 w-2.5 rounded-full"
                                style={{
                                  backgroundColor:
                                    epic.color || getProjectThemeColor(selectedProject),
                                }}
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-semibold text-slate-950">
                                  {epic.name}
                                </span>
                                <span className="text-xs text-slate-500">
                                  Planning order {epic.planningOrder || index + 1}
                                </span>
                              </span>
                            </div>
                          ))
                        ) : (
                          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                            No epics yet. Use Backlog planning to create the first
                            workstream.
                          </div>
                        )}
                      </div>
                    </section>

                    <section className="rounded-[22px] border border-slate-200 bg-white p-4">
                      <div className="border-b border-slate-200 pb-3">
                        <h3 className="text-base font-semibold text-slate-950">
                          Creation Flow
                        </h3>
                        <p className="mt-1 text-sm text-slate-500">
                          Use these actions in order when planning a new project.
                        </p>
                      </div>
                      <div className="mt-3 grid gap-2">
                        {[
                          {
                            label: "Create the project shell",
                            action: "Create Project",
                            onClick: () => setIsCreateDialogOpen(true),
                          },
                          {
                            label: "Create or reuse a team",
                            action: "Create Team",
                            onClick: () => setIsCreateTeamDialogOpen(true),
                          },
                          {
                            label: "Build epics and sprint scope",
                            action: "Open Backlog",
                            onClick: () =>
                              navigate(`/backlog?projectId=${selectedProject._id}`),
                          },
                          {
                            label: "Add initial stories, tasks, and bugs",
                            action: "Add Issue",
                            onClick: () =>
                              navigate(`/issues?projectId=${selectedProject._id}&compose=1`),
                          },
                        ].map((item, index) => (
                          <button
                            key={item.label}
                            className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left transition hover:border-blue-200 hover:bg-blue-50/60"
                            type="button"
                            onClick={item.onClick}
                          >
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-semibold text-slate-700">
                              {index + 1}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-semibold text-slate-950">
                                {item.label}
                              </span>
                              <span className="text-xs text-blue-600">
                                {item.action}
                              </span>
                            </span>
                          </button>
                        ))}
                      </div>
                    </section>
                  </div>
                </>
              ) : (
                <EmptyState
                  title="No project selected"
                  description="Create or select a project to begin planning."
                  icon={<ClipboardList className="h-5 w-5" />}
                  action={
                    <Button type="button" onClick={() => setIsCreateDialogOpen(true)}>
                      <Plus className="h-4 w-4" />
                      Create Project
                    </Button>
                  }
                />
              )}
            </div>
          </div>
        </section>
      ) : null}

      {activeTab === "teams" ? (
        <section
          aria-labelledby="teams-tab"
          className="h-full min-h-0 min-w-0 w-full space-y-3 overflow-y-auto pr-1"
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

      {selectedProject ? (
        <ProjectManageDialog
          open={isSelectedProjectManageOpen}
          onOpenChange={setIsSelectedProjectManageOpen}
          project={selectedProject}
          users={users}
          workspaceTeams={teams}
          epics={selectedProjectEpics}
          canManageProject={canManageProjects}
          onUpdateProject={(payload) => updateProjectMutation.mutateAsync(payload)}
          onAttachTeam={(payload) => attachProjectTeamMutation.mutateAsync(payload)}
          onDetachTeam={(payload) => detachProjectTeamMutation.mutateAsync(payload)}
          onCreateEpic={(payload) => createEpicMutation.mutateAsync(payload)}
          onUpdateEpic={(payload) => updateEpicMutation.mutateAsync(payload)}
          onDeleteEpic={(payload) => deleteEpicMutation.mutateAsync(payload)}
          onEpicClick={(epic) =>
            navigate(
              `/backlog?projectId=${selectedProject._id}${
                epic?._id ? `&epicId=${epic._id}` : ""
              }`
            )
          }
          isUpdatingProject={
            updateProjectMutation.isPending &&
            updateProjectMutation.variables?.projectId === selectedProject._id
          }
          isAttachingTeam={
            attachProjectTeamMutation.isPending &&
            attachProjectTeamMutation.variables?.projectId === selectedProject._id
          }
          detachingTeamId={
            detachProjectTeamMutation.isPending &&
            detachProjectTeamMutation.variables?.projectId === selectedProject._id
              ? detachProjectTeamMutation.variables?.teamId
              : ""
          }
          isSavingEpic={createEpicMutation.isPending || updateEpicMutation.isPending}
          deletingEpicId={deleteEpicMutation.isPending ? deleteEpicMutation.variables?.id : ""}
          teamsErrorMessage={isTeamsLoading ? "" : teamsErrorMessage}
          usersErrorMessage={isUsersLoading ? "" : usersErrorMessage}
        />
      ) : null}

      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent
          className={projectDialogContentClass(
            "grid max-h-[calc(100svh-2rem)] w-[96vw] max-w-[1280px] grid-rows-[auto_minmax(0,1fr)] rounded-[30px] !top-4 sm:!top-4 sm:max-h-[calc(100vh-2rem)]"
          )}
        >
          <DialogHeader
            className={projectDialogHeaderClass(
              "bg-[linear-gradient(135deg,rgba(239,246,255,0.98),rgba(255,255,255,0.98))] px-6 py-5 sm:px-7"
            )}
          >
            <div className="flex flex-col gap-4 pr-12 sm:flex-row sm:items-start sm:justify-between">
              <div className="max-w-3xl">
                <DialogTitle className="text-2xl font-semibold tracking-tight text-slate-950">
                  Create Project
                </DialogTitle>
                <DialogDescription className="mt-2 max-w-[46rem] text-sm leading-6 text-slate-600">
                  Set ownership, planning defaults, theme, and launch context in one
                  clean setup flow.
                </DialogDescription>
              </div>
              <Button
                className="h-11 shrink-0 rounded-xl border border-blue-500/20 bg-[linear-gradient(90deg,#2563EB_0%,#4F46E5_100%)] px-5 text-white shadow-[0_16px_30px_-20px_rgba(37,99,235,0.82)] transition hover:-translate-y-0.5 hover:brightness-105"
                disabled={createProjectMutation.isPending}
                form="create-project-form"
                type="submit"
              >
                {createProjectMutation.isPending ? "Creating..." : "Create Project"}
              </Button>
            </div>
          </DialogHeader>

          <div className={projectDialogBodyClass("px-6 py-5 sm:px-7")}>
            <ProjectComposer
              onSubmit={handleCreateProject}
              isPending={createProjectMutation.isPending}
              users={users}
              teams={teams}
              formId="create-project-form"
              usersErrorMessage={isUsersLoading ? "" : usersErrorMessage}
              teamsErrorMessage={isTeamsLoading ? "" : teamsErrorMessage}
            />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isCreateTeamDialogOpen} onOpenChange={setIsCreateTeamDialogOpen}>
        <DialogContent
          className={projectDialogContentClass(
            "grid max-h-[calc(100svh-2rem)] w-[96vw] max-w-[1280px] grid-rows-[auto_minmax(0,1fr)] rounded-[30px] !top-4 sm:!top-4 sm:max-h-[calc(100vh-2rem)]"
          )}
        >
          <DialogHeader
            className={projectDialogHeaderClass(
              "bg-[linear-gradient(135deg,rgba(236,253,245,0.98),rgba(255,255,255,0.98))] px-6 py-5 sm:px-7"
            )}
          >
            <DialogTitle className="pr-10 text-2xl font-semibold tracking-tight text-slate-950">
              Create Team
            </DialogTitle>
            <DialogDescription className="mt-2 max-w-[46rem] pr-10 text-sm leading-6 text-slate-600">
              Build a workspace squad, select members, and prepare it for project
              ownership.
            </DialogDescription>
          </DialogHeader>

          <div className={projectDialogBodyClass("overflow-visible px-6 py-5 sm:px-7")}>
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
                onCancel={() => setIsCreateTeamDialogOpen(false)}
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
