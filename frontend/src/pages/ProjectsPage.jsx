import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  Archive,
  BarChart3,
  Bug,
  CalendarClock,
  ChevronDown,
  CheckCircle2,
  ClipboardList,
  FolderKanban,
  GitBranch,
  GitCommit,
  HeartPulse,
  Layers3,
  Link2,
  LoaderCircle,
  MoreHorizontal,
  Plus,
  Route,
  Rocket,
  Search,
  Settings2,
  ShieldCheck,
  Star,
  Target,
  TimerReset,
  TrendingUp,
  Trash2,
  UserRoundPlus,
  Users2,
  WalletCards,
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
  syncProjectGitRepository,
  testProjectGitConnection,
  updateEpic,
  updateProject,
  updateProjectDeliveryWorkflow,
  updateProjectStatus,
} from "@/lib/api";
import ProjectComposer from "@/components/projects/ProjectComposer";
import ProjectManageDialog from "@/components/projects/ProjectManageDialog";
import ProjectDeliveryConfiguration, {
  normalizeProjectDeliveryConfiguration,
} from "@/components/projects/ProjectDeliveryConfiguration";
import {
  projectDialogBodyClass,
  projectDialogContentClass,
  projectDialogFooterClass,
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import EmptyState from "@/components/shared/EmptyState";
import ToastNotice from "@/components/shared/ToastNotice";
import { useAuth } from "@/hooks/use-auth";
import {
  ROLE_ADMIN,
  ROLE_MANAGER,
  ROLE_QA_LEAD,
  ROLE_TEAM_LEAD,
  ROLE_TESTER,
  hasAdminPanelAccess,
} from "@/lib/roles";
import { getWorkspaceScope } from "@/lib/workspace";
import { getProjectTeams, resolveUserId } from "@/lib/project-teams";
import { cn, getInitials } from "@/lib/utils";
import { ISSUE_TYPES, normalizeIssueType } from "@/lib/issues";
import {
  getLatestGitActivity,
  getRepositorySummary,
  normalizeDeliveryModules,
} from "@/lib/delivery-workflow";
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

const getCommitShortSha = (sha = "") => String(sha || "").slice(0, 7);

const hasRecordedGitActivity = (activity = {}) =>
  Boolean(
    activity.commitSha ||
      activity.pushedAt ||
      (activity.commitMessage && activity.commitMessage !== "No pushes recorded yet")
  );

const getGitActivityDateParts = (value) => {
  if (!value) {
    return { date: "Date not recorded", time: "" };
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return { date: "Date not recorded", time: "" };
  }

  return {
    date: date.toLocaleDateString(undefined, {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }),
    time: date.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    }),
  };
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

const getMetricTone = (tone = "blue") => {
  const tones = {
    blue: {
      card: "border-blue-200 from-white via-blue-50 to-sky-100",
      label: "text-blue-700",
      icon: "bg-blue-600 text-white shadow-blue-500/35",
      bar: "bg-blue-600",
      ring: "hover:ring-blue-300/60",
    },
    emerald: {
      card: "border-emerald-200 from-white via-emerald-50 to-teal-100",
      label: "text-emerald-700",
      icon: "bg-emerald-600 text-white shadow-emerald-500/35",
      bar: "bg-emerald-600",
      ring: "hover:ring-emerald-300/60",
    },
    amber: {
      card: "border-amber-200 from-white via-amber-50 to-orange-100",
      label: "text-amber-700",
      icon: "bg-amber-500 text-white shadow-amber-500/35",
      bar: "bg-amber-500",
      ring: "hover:ring-amber-300/60",
    },
    rose: {
      card: "border-rose-200 from-white via-rose-50 to-red-100",
      label: "text-rose-700",
      icon: "bg-rose-600 text-white shadow-rose-500/35",
      bar: "bg-rose-600",
      ring: "hover:ring-rose-300/60",
    },
    violet: {
      card: "border-violet-200 from-white via-violet-50 to-indigo-100",
      label: "text-violet-700",
      icon: "bg-violet-600 text-white shadow-violet-500/35",
      bar: "bg-violet-600",
      ring: "hover:ring-violet-300/60",
    },
    slate: {
      card: "border-slate-200 from-white via-slate-50 to-slate-100",
      label: "text-slate-600",
      icon: "bg-slate-100 text-slate-600 shadow-slate-300/30",
      bar: "bg-slate-500",
      ring: "hover:ring-slate-300/60",
    },
  };

  return tones[tone] || tones.blue;
};

const getProgressTone = (progress = 0) => {
  if (progress >= 80) return "emerald";
  if (progress >= 45) return "blue";
  if (progress >= 20) return "amber";
  return "rose";
};

const getTimelineTone = (project = {}) => {
  if (!project.startDate || !project.targetDate) return "slate";
  return getTimelineStatus(project).label === "Off track" ? "rose" : "blue";
};

const getDaysRemainingMeta = (targetDate) => {
  if (!targetDate) {
    return { label: "-", tone: "slate", helper: "-" };
  }

  const end = new Date(targetDate);

  if (Number.isNaN(end.getTime())) {
    return { label: "-", tone: "slate", helper: "-" };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  const days = Math.ceil((end.getTime() - today.getTime()) / 86400000);

  if (days < 0) {
    return {
      label: `${Math.abs(days)} overdue`,
      tone: "rose",
      helper: "Past project deadline",
    };
  }

  if (days <= 7) {
    return {
      label: days === 1 ? "1 day" : `${days} days`,
      tone: "amber",
      helper: "Deadline is close",
    };
  }

  return {
    label: days === 1 ? "1 day" : `${days} days`,
    tone: "emerald",
    helper: "Time remaining",
  };
};

const getHealthTone = (statusLabel = "", progress = 0) => {
  if (statusLabel === "Off track") return "rose";
  if (statusLabel === "Due soon") return progress >= 70 ? "amber" : "rose";
  if (statusLabel === "No deadline") return "slate";
  if (progress >= 80) return "emerald";
  if (progress >= 45) return "blue";
  return "amber";
};

const getPeriodLabel = (startDate, targetDate) => {
  if (!startDate || !targetDate) {
    return "-";
  }

  const start = new Date(startDate);
  const end = new Date(targetDate);
  const days = Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1;

  return Number.isFinite(days) && days > 0 ? `${days} days` : "-";
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
    return "-";
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

const getBudgetTone = (project = {}) =>
  project.budget || project.projectBudget || project.estimatedBudget ? "violet" : "slate";

const getProjectListProgress = (project = {}) => {
  const progress = Number(project?.metrics?.progress ?? project?.progress);

  if (Number.isFinite(progress)) {
    return Math.max(0, Math.min(100, Math.round(progress)));
  }

  const status = getProjectStatus(project);

  if (status === "Completed") return 100;
  if (status === "On Hold") return 35;
  return project?.issueCount ? 68 : 0;
};

const getStatusChipClassName = (status = "Active") => {
  const normalizedStatus = String(status || "Active").toLowerCase();

  if (normalizedStatus.includes("hold")) {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  if (normalizedStatus.includes("complete")) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (normalizedStatus.includes("delay")) {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }

  if (normalizedStatus.includes("archive")) {
    return "border-slate-200 bg-slate-100 text-slate-600";
  }

  if (normalizedStatus.includes("plan")) {
    return "border-blue-200 bg-blue-50 text-blue-700";
  }

  return "border-emerald-200 bg-emerald-50 text-emerald-700";
};

const getKpiIconClassName = (label = "") => {
  const iconClasses = {
    Timeline: "bg-[#EFF6FF] text-blue-600",
    Progress: "bg-[#ECFDF5] text-emerald-600",
    "Days Remaining": "bg-[#FFF7ED] text-orange-600",
    Health: "bg-[#FEF2F2] text-red-600",
    Budget: "bg-[#F5F3FF] text-violet-600",
    Tasks: "bg-[#EFF6FF] text-blue-600",
    Bugs: "bg-[#FEF2F2] text-red-600",
    Members: "bg-[#EFF6FF] text-blue-600",
    Teams: "bg-[#F5F3FF] text-indigo-600",
  };

  return iconClasses[label] || "bg-slate-100 text-slate-600";
};

const CompletionRing = ({ value = 0 }) => {
  const progress = Math.max(0, Math.min(100, Number(value) || 0));
  const circumference = 2 * Math.PI * 17;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <span className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center">
      <svg className="h-11 w-11 -rotate-90" viewBox="0 0 44 44" aria-hidden="true">
        <circle
          cx="22"
          cy="22"
          fill="none"
          r="17"
          stroke="#E5E7EB"
          strokeWidth="5"
        />
        <circle
          cx="22"
          cy="22"
          fill="none"
          r="17"
          stroke="#22C55E"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          strokeWidth="5"
        />
      </svg>
      <span className="absolute text-[10px] font-bold text-slate-950">{progress}%</span>
    </span>
  );
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
  const [projectPanelView, setProjectPanelView] = useState("details");
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [isSelectedProjectDeleteOpen, setIsSelectedProjectDeleteOpen] = useState(false);
  const [selectedProjectDeleteConfirmation, setSelectedProjectDeleteConfirmation] = useState("");
  const [projectSettings, setProjectSettings] = useState({
    name: "",
    description: "",
    status: "Active",
    priority: "Medium",
    themeColor: "#2563EB",
    projectManager: "",
    teamLead: "",
    qaLead: "",
  });
  const [settingsTeamId, setSettingsTeamId] = useState("");
  const [settingsError, setSettingsError] = useState("");
  const [gitConfigError, setGitConfigError] = useState("");
  const [gitTestResult, setGitTestResult] = useState(null);
  const [gitSyncResult, setGitSyncResult] = useState(null);
  const [projectDeliveryConfig, setProjectDeliveryConfig] = useState(() =>
    normalizeProjectDeliveryConfiguration()
  );
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

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const requestedProjectId =
      params.get("projectId") || location.state?.selectedProjectId || "";
    const requestedView = params.get("view") || location.state?.projectPanelView || "";

    if (requestedProjectId) {
      setActiveTab("projects");
      setSelectedProjectId(requestedProjectId);
    }

    if (requestedView === "git-activity") {
      setActiveTab("projects");
      setProjectMode("overview");
      setProjectPanelView("git-activity");
    }
  }, [location.search, location.state?.projectPanelView, location.state?.selectedProjectId]);

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
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["project-teams"] });
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
      showToast("success", response?.message || "Team detached from project.");
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

  const updateProjectDeliveryWorkflowMutation = useMutation({
    mutationFn: updateProjectDeliveryWorkflow,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      showToast("success", "Project delivery setup updated.");
    },
    onError: (error) => {
      showToast(
        "error",
        error.response?.data?.message || "Unable to update project delivery setup."
      );
    },
  });

  const testProjectGitConnectionMutation = useMutation({
    mutationFn: testProjectGitConnection,
    onSuccess: (response) => {
      setGitTestResult({
        type: "success",
        message: response?.message || "GitHub connection verified successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (error) => {
      setGitTestResult({
        type: "error",
        message: error.response?.data?.message || "GitHub connection test failed.",
      });
    },
  });

  const syncProjectGitRepositoryMutation = useMutation({
    mutationFn: syncProjectGitRepository,
    onSuccess: (response) => {
      setGitSyncResult({
        type: "success",
        message: response?.lastSyncTime
          ? `Repository synchronized successfully at ${new Date(response.lastSyncTime).toLocaleString()}.`
          : response?.message || "Repository synchronized successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (error) => {
      setGitSyncResult({
        type: "error",
        message: error.response?.data?.message || "Unable to synchronize repository.",
      });
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
  const canManageGitConfiguration = [ROLE_ADMIN, ROLE_MANAGER].includes(user?.role);

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

        if (
          projectStatusFilter === "favorites" &&
          !(project.isFavorite || project.isStarred || project.favorite)
        ) {
          return false;
        }

        if (
          projectStatusFilter !== "all" &&
          projectStatusFilter !== "favorites" &&
          getProjectStatus(project) !== projectStatusFilter
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

  const isSelectedProjectDeleteConfirmationValid =
    Boolean(selectedProject?.name) &&
    selectedProjectDeleteConfirmation === selectedProject.name;

  const selectedProjectTeams = useMemo(
    () => (selectedProject ? getProjectTeams(selectedProject) : []),
    [selectedProject]
  );

  const settingsAvailableTeams = useMemo(() => {
    const attachedTeamIds = new Set(
      selectedProjectTeams.map((team) => String(team?._id || team))
    );

    return [...teams]
      .filter((team) => !attachedTeamIds.has(String(team._id)))
      .sort((left, right) => (left.name || "").localeCompare(right.name || ""));
  }, [selectedProjectTeams, teams]);
  const projectManagerOptions = useMemo(
    () =>
      users
        .filter((workspaceUser) =>
          [ROLE_ADMIN, ROLE_MANAGER].includes(workspaceUser.role)
        )
        .sort((left, right) =>
          (left.name || left.email || "").localeCompare(right.name || right.email || "")
        ),
    [users]
  );
  const teamLeadOptions = useMemo(
    () =>
      users
        .filter((workspaceUser) => workspaceUser.role === ROLE_TEAM_LEAD)
        .sort((left, right) =>
          (left.name || left.email || "").localeCompare(right.name || right.email || "")
        ),
    [users]
  );
  const qaLeadOptions = useMemo(
    () =>
      users
        .filter((workspaceUser) =>
          [ROLE_QA_LEAD, ROLE_TESTER].includes(workspaceUser.role)
        )
        .sort((left, right) =>
          (left.name || left.email || "").localeCompare(right.name || right.email || "")
        ),
    [users]
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
  const selectedProjectDaysRemainingMeta = useMemo(
    () => getDaysRemainingMeta(selectedProject?.targetDate),
    [selectedProject?.targetDate]
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

  const selectedProjectGitActivityRows = useMemo(() => {
    if (!selectedProject) {
      return [];
    }

    const repository = getRepositorySummary(selectedProject);
    const activitySources = [
      selectedProject.gitActivity,
      selectedProject.gitActivities,
      selectedProject.gitActivityHistory,
      selectedProject.gitHistory,
      selectedProject.commitHistory,
      selectedProject.commits,
    ];
    const historicalActivities = activitySources.flatMap((source) =>
      Array.isArray(source) ? source : []
    );
    const latestActivity = selectedProject.latestGitActivity || {};
    const rows = historicalActivities
      .map((activity, index) => ({
        ...getLatestGitActivity({
          ...selectedProject,
          latestGitActivity: activity,
        }),
        id: activity._id || activity.id || activity.commitSha || `${activity.pushedAt || "activity"}-${index}`,
        source: activity,
      }))
      .filter((row) => hasRecordedGitActivity(row.source || row));

    if (hasRecordedGitActivity(latestActivity)) {
      const latestSha = String(latestActivity.commitSha || "");
      const latestPushedAt = latestActivity.pushedAt ? new Date(latestActivity.pushedAt).getTime() : 0;
      const alreadyIncluded = rows.some((row) => {
        const rowPushedAt = row.pushedAt ? new Date(row.pushedAt).getTime() : 0;
        return latestSha && row.commitSha === latestSha && rowPushedAt === latestPushedAt;
      });

      if (!alreadyIncluded) {
        rows.unshift({
          ...getLatestGitActivity(selectedProject),
          id: latestActivity.commitSha || latestActivity.pushedAt || "latest-git-activity",
          source: latestActivity,
        });
      }
    }

    const seenActivityKeys = new Set();

    return rows
      .map((row) => ({
        ...row,
        branch: row.branch || repository.defaultBranch,
        modulesChanged: row.modulesChanged?.length ? row.modulesChanged : normalizeDeliveryModules(selectedProject),
        repository,
      }))
      .filter((row) => {
        const key = [
          row.commitSha || "",
          row.pushedAt ? new Date(row.pushedAt).getTime() : "",
        ]
          .filter(Boolean)
          .join(":");

        if (!key) {
          return true;
        }

        if (seenActivityKeys.has(key)) {
          return false;
        }

        seenActivityKeys.add(key);
        return true;
      })
      .sort(
        (left, right) =>
          new Date(right.pushedAt || 0).getTime() - new Date(left.pushedAt || 0).getTime()
      );
  }, [selectedProject]);

  const selectedProjectProgress = useMemo(() => {
    const epicProgressValues = selectedProjectEpics
      .map((epic) => Number(epic?.metrics?.progress))
      .filter((progress) => Number.isFinite(progress));

    if (epicProgressValues.length) {
      return Math.round(
        epicProgressValues.reduce((total, progress) => total + progress, 0) /
          epicProgressValues.length
      );
    }

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
  }, [selectedProjectEpics, selectedProjectIssues]);

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

  const selectedProjectWidgetStats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const twoWeeksFromNow = new Date(today);
    twoWeeksFromNow.setDate(today.getDate() + 14);

    const parseDate = (value) => {
      if (!value) return null;
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return null;
      date.setHours(0, 0, 0, 0);
      return date;
    };

    const activeEpics = selectedProjectEpics.filter(
      (epic) => String(epic?.status || "").toUpperCase() !== "DONE"
    );
    const upcomingEpics = activeEpics.filter((epic) => {
      const deadline = parseDate(epic?.targetDate);
      return deadline && deadline >= today && deadline <= twoWeeksFromNow;
    });
    const overdueEpics = activeEpics.filter((epic) => {
      const deadline = parseDate(epic?.targetDate);
      return deadline && deadline < today;
    });
    const projectDeadline = parseDate(selectedProject?.targetDate);
    const hasUpcomingProjectDeadline =
      projectDeadline && projectDeadline >= today && projectDeadline <= twoWeeksFromNow;

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

    const blockedIssues = selectedProjectIssues.filter((issue) => {
      const status = String(issue?.status || issue?.workflowStatus || "").toUpperCase();
      return (
        status.includes("BLOCK") ||
        Boolean(issue?.isBlocked || issue?.blockedBy || issue?.blocker)
      );
    }).length;

    const criticalBugs = selectedProjectBugs.filter((bugIssue) => {
      const severity = String(
        bugIssue?.severity || bugIssue?.priority || bugIssue?.bugDetails?.severity || ""
      ).toUpperCase();
      return severity.includes("CRITICAL") || severity.includes("BLOCKER");
    }).length;

    const completedTasks = selectedProjectTasks.filter(
      (issue) => getTaskBoardStatus(issue) === "DONE"
    ).length;
    const closedBugs = selectedProjectBugs.filter(
      (issue) => getBugColumnKey(issue, DEVELOPER_BUG_COLUMNS) === "closed"
    ).length;
    const releaseReady =
      selectedProjectProgress >= 80 && !blockedIssues && !criticalBugs && !overdueEpics.length;

    return {
      blockedIssues,
      closedBugs,
      completedIssues,
      completedTasks,
      criticalBugs,
      overdueEpics: overdueEpics.length,
      releaseReadiness: releaseReady ? "Ready" : "Needs work",
      upcomingDeadlines: upcomingEpics.length + (hasUpcomingProjectDeadline ? 1 : 0),
      velocityLabel: selectedProjectIssues.length
        ? `${completedIssues} closed`
        : "No issues",
    };
  }, [
    selectedProject?.targetDate,
    selectedProjectBugs,
    selectedProjectEpics,
    selectedProjectIssues,
    selectedProjectProgress,
    selectedProjectTasks,
  ]);

  const selectedProjectWidgets = useMemo(
    () => [
      {
        label: "Upcoming Deadlines",
        value: selectedProjectWidgetStats.upcomingDeadlines,
        helper: "Due in the next 14 days",
        Icon: CalendarClock,
        tone: selectedProjectWidgetStats.upcomingDeadlines ? "amber" : "emerald",
      },
      {
        label: "Overdue Epics",
        value: selectedProjectWidgetStats.overdueEpics,
        helper: "Epic deadlines already missed",
        Icon: AlertTriangle,
        tone: selectedProjectWidgetStats.overdueEpics ? "rose" : "emerald",
      },
      {
        label: "Project Health",
        value: selectedProjectTimelineStatus.label,
        helper: `${selectedProjectProgress}% complete`,
        Icon: HeartPulse,
        tone: getHealthTone(selectedProjectTimelineStatus.label, selectedProjectProgress),
      },
      {
        label: "Roadmap Progress",
        value: `${selectedProjectProgress}%`,
        helper: `${selectedProjectEpics.length} epics tracked`,
        Icon: Route,
        tone: getProgressTone(selectedProjectProgress),
      },
      {
        label: "Milestones",
        value: selectedProjectEpics.length,
        helper: "Planning workstreams",
        Icon: Target,
        tone: selectedProjectEpics.length ? "violet" : "slate",
      },
      {
        label: "Sprint Burndown",
        value: `${selectedProjectWidgetStats.completedTasks}/${selectedProjectTasks.length}`,
        helper: "Tasks completed",
        Icon: TrendingUp,
        tone: getProgressTone(
          selectedProjectTasks.length
            ? Math.round(
                (selectedProjectWidgetStats.completedTasks / selectedProjectTasks.length) *
                  100
              )
            : 0
        ),
      },
      {
        label: "Team Workload",
        value: selectedProjectMembers.length,
        helper: `${selectedProjectTeams.length} attached teams`,
        Icon: Users2,
        tone: selectedProjectMembers.length ? "blue" : "slate",
      },
      {
        label: "Blocked Issues",
        value: selectedProjectWidgetStats.blockedIssues,
        helper: "Needs attention",
        Icon: Link2,
        tone: selectedProjectWidgetStats.blockedIssues ? "rose" : "emerald",
      },
      {
        label: "Critical Bugs",
        value: selectedProjectWidgetStats.criticalBugs,
        helper: "Highest severity bugs",
        Icon: Bug,
        tone: selectedProjectWidgetStats.criticalBugs ? "rose" : "emerald",
      },
      {
        label: "Velocity",
        value: selectedProjectWidgetStats.velocityLabel,
        helper: "Closed work items",
        Icon: Activity,
        tone: selectedProjectWidgetStats.completedIssues ? "blue" : "slate",
      },
      {
        label: "Release Readiness",
        value: selectedProjectWidgetStats.releaseReadiness,
        helper: "Progress, blockers, and bugs",
        Icon: Rocket,
        tone:
          selectedProjectWidgetStats.releaseReadiness === "Ready" ? "emerald" : "amber",
      },
    ],
    [
      selectedProjectEpics.length,
      selectedProjectMembers.length,
      selectedProjectProgress,
      selectedProjectTasks.length,
      selectedProjectTeams.length,
      selectedProjectTimelineStatus.label,
      selectedProjectWidgetStats,
    ]
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
    setProjectPanelView("details");
    setSettingsTeamId("");
    setSettingsError("");
    setGitConfigError("");
    setGitTestResult(null);
    setGitSyncResult(null);
    setSelectedProjectDeleteConfirmation("");
    setIsSelectedProjectDeleteOpen(false);
  }, [selectedProject?._id]);

  useEffect(() => {
    if (!selectedProject) {
      return;
    }

    setProjectSettings({
      name: selectedProject.name || "",
      description: selectedProject.description || "",
      status: getProjectStatus(selectedProject),
      priority: selectedProject.priority || "Medium",
      themeColor: getProjectThemeColor(selectedProject),
      projectManager: resolveUserId(selectedProject.projectManager || selectedProject.manager),
      teamLead: resolveUserId(selectedProject.teamLead),
      qaLead: resolveUserId(selectedProject.qaLead),
    });
    setProjectDeliveryConfig(normalizeProjectDeliveryConfiguration(selectedProject));
  }, [selectedProject]);

  const handleCreateProject = async (payload) => {
    await createProjectMutation.mutateAsync(payload);
    setIsCreateDialogOpen(false);
  };

  const handleCreateTeam = async (payload) => {
    await createTeamMutation.mutateAsync(payload);
    setIsCreateTeamDialogOpen(false);
    showToast("success", "Team created successfully.");
  };

  const handleSettingsChange = (field, value) => {
    setProjectSettings((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleSaveProjectSettings = async () => {
    if (!selectedProject) {
      return;
    }

    if (!projectSettings.name.trim()) {
      setSettingsError("Project name is required.");
      return;
    }

    try {
      setSettingsError("");
      await updateProjectMutation.mutateAsync({
        projectId: selectedProject._id,
        payload: {
          name: projectSettings.name.trim(),
          description: projectSettings.description.trim(),
          status: projectSettings.status,
          priority: projectSettings.priority,
          themeColor: projectSettings.themeColor,
          projectManager: projectSettings.projectManager || null,
          teamLead: projectSettings.teamLead || null,
          qaLead: projectSettings.qaLead || null,
        },
      });
    } catch (error) {
      setSettingsError(error.response?.data?.message || "Unable to update project.");
    }
  };

  const handleHoldSelectedProject = async () => {
    if (!selectedProject) {
      return;
    }

    try {
      await updateProjectMutation.mutateAsync({
        projectId: selectedProject._id,
        payload: {
          status: "On Hold",
        },
      });
    } catch (error) {
      showToast(
        "error",
        error.response?.data?.message || "Unable to put this project on hold."
      );
    }
  };

  const handleCompleteSelectedProject = async () => {
    if (!selectedProject) {
      return;
    }

    try {
      await updateProjectStatusMutation.mutateAsync({
        projectId: selectedProject._id,
        isCompleted: true,
      });
      showToast("success", "Project marked as completed.");
    } catch (error) {
      showToast(
        "error",
        error.response?.data?.message || "Unable to mark this project as completed."
      );
    }
  };

  const handleSaveGitConfiguration = async () => {
    if (!selectedProject) {
      return;
    }

    if (!canManageGitConfiguration) {
      setGitConfigError("Only Admins and Managers can save Git configuration.");
      return;
    }
    if (!projectDeliveryConfig.git.repositoryOwner.trim()) {
      setGitConfigError("Repository owner is required.");
      return;
    }
    if (!projectDeliveryConfig.git.repositoryName.trim()) {
      setGitConfigError("Repository name is required.");
      return;
    }
    if (!projectDeliveryConfig.git.repositoryUrl.trim()) {
      setGitConfigError("Repository URL is required.");
      return;
    }
    if (!projectDeliveryConfig.git.defaultBranch.trim()) {
      setGitConfigError("Default branch is required.");
      return;
    }
    if (!projectDeliveryConfig.git.tokenConfigured && !projectDeliveryConfig.git.token?.trim()) {
      setGitConfigError("GitHub Personal Access Token is required before saving.");
      return;
    }
    if (!projectDeliveryConfig.deliveryModules.some((module) => module.name.trim())) {
      setGitConfigError("At least one module is required.");
      return;
    }

    try {
      setGitConfigError("");
      await updateProjectDeliveryWorkflowMutation.mutateAsync({
        projectId: selectedProject._id,
        payload: {
          git: projectDeliveryConfig.git,
          repository: projectDeliveryConfig.repository,
          deliveryWorkflow: projectDeliveryConfig.deliveryWorkflow,
          deliveryModules: projectDeliveryConfig.deliveryModules,
          defaultTestSuites: projectDeliveryConfig.defaultTestSuites,
          testCases: projectDeliveryConfig.testCases,
        },
      });
    } catch (error) {
      setGitConfigError(
        error.response?.data?.message || "Unable to update Git configuration."
      );
    }
  };

  const handleTestGitConnection = async (config = projectDeliveryConfig) => {
    if (!selectedProject) {
      return;
    }

    if (!canManageGitConfiguration) {
      setGitTestResult({ type: "error", message: "Only Admins and Managers can test Git configuration." });
      return;
    }

    try {
      setGitTestResult(null);
      await testProjectGitConnectionMutation.mutateAsync({
        projectId: selectedProject._id,
        payload: { git: config.git },
      });
    } catch {
      // The mutation owns the visible error state.
    }
  };

  const handleSyncGitRepository = async () => {
    if (!selectedProject) {
      return;
    }

    if (!canManageGitConfiguration) {
      setGitSyncResult({ type: "error", message: "Only Admins and Managers can synchronize Git configuration." });
      return;
    }

    try {
      setGitSyncResult(null);
      await syncProjectGitRepositoryMutation.mutateAsync({
        projectId: selectedProject._id,
      });
    } catch {
      // The mutation owns the visible error state.
    }
  };

  const handleAttachSettingsTeam = async () => {
    if (!selectedProject || !settingsTeamId) {
      setSettingsError("Select a team to attach.");
      return;
    }

    try {
      setSettingsError("");
      await attachProjectTeamMutation.mutateAsync({
        projectId: selectedProject._id,
        teamId: settingsTeamId,
      });
      setSettingsTeamId("");
    } catch (error) {
      setSettingsError(error.response?.data?.message || "Unable to attach team.");
    }
  };

  const handleDetachSettingsTeam = async (team) => {
    if (!selectedProject || !team?._id) {
      return;
    }

    try {
      setSettingsError("");
      await detachProjectTeamMutation.mutateAsync({
        projectId: selectedProject._id,
        teamId: team._id,
      });
    } catch (error) {
      setSettingsError(error.response?.data?.message || "Unable to detach team.");
    }
  };

  const handleSelectedProjectDeleteDialogChange = (open) => {
    setIsSelectedProjectDeleteOpen(open);

    if (!open) {
      setSelectedProjectDeleteConfirmation("");
    }
  };

  const handleDeleteSelectedProject = async () => {
    if (!selectedProject || !isSelectedProjectDeleteConfirmationValid) {
      return;
    }

    await deleteProjectMutation.mutateAsync(selectedProject._id);
    handleSelectedProjectDeleteDialogChange(false);
    setSelectedProjectId("");
    showToast("success", "Project deleted successfully.");
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
    <div className="h-full min-h-0 w-full overflow-hidden">
      <ToastNotice toast={toast} onDismiss={() => setToast(null)} />

      <div className="grid h-full min-h-0 w-full gap-4 lg:grid-cols-[200px_minmax(0,1fr)]">
        <aside className="min-h-0 min-w-0 border-r border-[#EEF2F7] bg-white/72 pr-3">
          <div className="sticky top-0 flex h-full min-h-0 flex-col gap-4 py-3">
            <nav className="space-y-1" aria-label="Project page sidebar">
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
                {
                  label: "Project Planning",
                  Icon: ClipboardList,
                  active: activeTab === "projects" && projectMode === "planning",
                  action: () => {
                    updateActiveTab("projects");
                    setProjectMode("planning");
                  },
                },
                {
                  label: "Backlog",
                  Icon: Route,
                  active: false,
                  action: () =>
                    navigate(
                      selectedProject
                        ? `/backlog?projectId=${selectedProject._id}`
                        : "/backlog"
                    ),
                },
                {
                  label: "Reports",
                  Icon: BarChart3,
                  active: false,
                  action: () => navigate("/reports"),
                },
                {
                  label: "Teams",
                  Icon: Users2,
                  active: activeTab === "teams",
                  action: () => updateActiveTab("teams"),
                },
              ].map(({ label, Icon, active, action }) => (
                <button
                  key={label}
                  className={`flex h-9 w-full items-center gap-2 rounded-lg border px-3 text-sm font-semibold transition ${
                    active
                      ? "border-[#B6D4FE] bg-[#E9F2FF] text-[#0C66E4]"
                      : "border-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-950"
                  }`}
                  type="button"
                  onClick={action}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </nav>

            <div className="mx-2 rounded-xl border border-[#EEF2F7] bg-blue-50/55 p-3 shadow-[0_2px_12px_rgba(0,0,0,.04)]">
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
          className="grid h-full min-h-0 min-w-0 w-full gap-4 xl:grid-cols-[320px_minmax(0,1fr)]"
          id="projects-panel"
          role="tabpanel"
        >
          <aside className="flex min-h-0 min-w-0 flex-col gap-2">
            <Card className="shrink-0 overflow-hidden rounded-[18px] border-[#EEF2F7] bg-white shadow-[0_2px_12px_rgba(0,0,0,.04)]">
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

                <div className="flex gap-1 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {[
                    { label: "All", value: "all" },
                    { label: "Active", value: "Active" },
                    { label: "On Hold", value: "On Hold" },
                    { label: "Completed", value: "Completed" },
                    { label: "Favorites", value: "favorites" },
                  ].map((filter) => {
                    const isActive = projectStatusFilter === filter.value;

                    return (
                      <button
                        key={filter.value}
                        className={`h-7 shrink-0 rounded-full border px-2.5 text-[11px] font-semibold transition ${
                          isActive
                            ? "border-[#B6D4FE] bg-[#E9F2FF] text-[#0C66E4]"
                            : "border-[#EEF2F7] bg-white text-slate-500 hover:text-slate-950"
                        }`}
                        type="button"
                        onClick={() => setProjectStatusFilter(filter.value)}
                      >
                        {filter.label}
                      </button>
                    );
                  })}
                </div>

              </CardContent>
            </Card>

            <div className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain pr-1 [scrollbar-color:rgba(148,163,184,.28)_transparent] [scrollbar-width:thin]">
              {isProjectsLoading ? (
                Array.from({ length: 6 }).map((_, index) => (
                  <Skeleton
                    key={`project-list-skeleton-${index}`}
                    className="h-[50px] w-full rounded-xl"
                  />
                ))
              ) : filteredProjects.length ? (
                filteredProjects.map((project) => {
                  const isSelected = selectedProject?._id === project._id;
                  const themeColor = getProjectThemeColor(project);
                  const listProgress = getProjectListProgress(project);

                  return (
                    <button
                      key={project._id}
                      className={`group relative flex h-[60px] w-full items-center gap-2 rounded-xl border px-2.5 text-left transition ${
                        isSelected
                          ? "border-[#B6D4FE] bg-[#E9F2FF]"
                          : "border-transparent bg-white hover:border-[#EEF2F7] hover:bg-white"
                      }`}
                      type="button"
                      onClick={() => setSelectedProjectId(project._id)}
                    >
                      <span
                        className="absolute inset-y-2 left-0 w-1 rounded-full opacity-0 transition group-hover:opacity-100"
                        style={{
                          backgroundColor: themeColor,
                          opacity: isSelected ? 1 : undefined,
                        }}
                      />
                      <span
                        className="ml-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold"
                        style={{
                          backgroundColor: `${themeColor}18`,
                          color: themeColor,
                        }}
                      >
                        {getProjectInitials(project)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex min-w-0 items-center justify-between gap-2">
                          <span className="block truncate text-sm font-semibold text-slate-950">
                            {project.name}
                          </span>
                          <span className="shrink-0 text-[11px] font-semibold text-slate-500">
                            {listProgress}%
                          </span>
                        </span>
                        <span className="mt-1 block h-1 overflow-hidden rounded-full bg-slate-100">
                          <span
                            className="block h-full rounded-full bg-[#0C66E4]"
                            style={{ width: `${listProgress}%` }}
                          />
                        </span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                          <span>{project.issueCount || 0} issues</span>
                          <span>/</span>
                          <span>{getProjectMemberCount(project)} members</span>
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

          <div className="min-h-0 min-w-0 space-y-4 overflow-y-auto overscroll-contain pb-10 pr-1">
            {selectedProject ? (
              <>
                <Card className="overflow-hidden rounded-[18px] border-[#EEF2F7] bg-white shadow-[0_2px_12px_rgba(0,0,0,.04)]">
                  <CardContent className="p-0">
                    <div
                      className="h-1.5"
                      style={{ backgroundColor: getProjectThemeColor(selectedProject) }}
                    />
                    <div className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="flex min-w-0 items-start gap-4">
                        <div className="min-w-0">
                          <p className="mb-1 text-xs font-medium text-slate-500">
                            Projects / {selectedProject.name}
                          </p>
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
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                            <span>
                              Owner: {getProjectOwnerName(selectedProject)}
                            </span>
                            <span className="text-slate-300">/</span>
                            <span>
                              Members: {selectedProjectMembers.length || getProjectMemberCount(selectedProject)}
                            </span>
                            <span className="text-slate-300">/</span>
                            <span className={`rounded-full border px-2.5 py-1 ${getStatusChipClassName(getProjectStatus(selectedProject))}`}>
                              {getProjectStatus(selectedProject)}
                            </span>
                            <span className="text-slate-300">/</span>
                            <span>
                              Deadline: {selectedProject.targetDate ? formatShortDate(selectedProject.targetDate) : "No deadline set"}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-start gap-2">
                        <Button
                          className="h-10 w-10 rounded-xl px-0"
                          variant="outline"
                          type="button"
                          title="Project settings"
                          onClick={() => setProjectPanelView("settings")}
                          disabled={!canManageProjects}
                        >
                          <Settings2 className="h-4 w-4" />
                        </Button>
                        <div className="relative">
                          <Button
                            className="h-10 rounded-xl"
                            type="button"
                            onClick={() => setIsQuickAddOpen((current) => !current)}
                          >
                            <Plus className="h-4 w-4" />
                            Create
                            <ChevronDown className="h-3.5 w-3.5" />
                          </Button>
                          {isQuickAddOpen ? (
                            <div className="absolute right-0 top-11 z-20 w-44 overflow-hidden rounded-xl border border-[#EEF2F7] bg-white p-1 shadow-[0_18px_46px_-28px_rgba(15,23,42,0.35)]">
                              {[
                                { label: "Story", path: `/stories?projectId=${selectedProject._id}` },
                                { label: "Task", path: `/tasks?projectId=${selectedProject._id}` },
                                { label: "Bug", path: `/issues?projectId=${selectedProject._id}` },
                                { label: "Epic", action: () => setProjectMode("planning") },
                                { label: "Sprint", path: `/backlog?projectId=${selectedProject._id}` },
                              ].map((item) => (
                                <button
                                  key={item.label}
                                  className="flex h-9 w-full items-center gap-2 rounded-lg px-3 text-sm font-medium text-slate-700 hover:bg-[#E9F2FF] hover:text-[#0C66E4]"
                                  type="button"
                                  onClick={() => {
                                    setIsQuickAddOpen(false);
                                    item.path ? navigate(item.path) : item.action?.();
                                  }}
                                >
                                  <Plus className="h-3.5 w-3.5" />
                                  {item.label}
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                        <Button
                          className="h-10 rounded-xl"
                          variant="outline"
                          type="button"
                          disabled={
                            !canManageProjects ||
                            updateProjectMutation.isPending ||
                            getProjectStatus(selectedProject) === "On Hold" ||
                            getProjectStatus(selectedProject) === "Completed"
                          }
                          onClick={handleHoldSelectedProject}
                        >
                          <Archive className="h-4 w-4" />
                          Hold
                        </Button>
                        <Button
                          className="h-10 rounded-xl"
                          variant="outline"
                          type="button"
                          disabled={
                            !canManageProjects ||
                            updateProjectStatusMutation.isPending ||
                            getProjectStatus(selectedProject) === "Completed"
                          }
                          onClick={handleCompleteSelectedProject}
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          Mark Completed
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
                        <Button
                          className="h-10 w-10 rounded-xl border-rose-200 px-0 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                          variant="outline"
                          type="button"
                          title="Delete project"
                          aria-label="Delete project"
                          disabled={!canManageProjects || deleteProjectMutation.isPending}
                          onClick={() => handleSelectedProjectDeleteDialogChange(true)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <section className="rounded-[18px] border border-[#EEF2F7] bg-white px-4 py-3 shadow-[0_2px_12px_rgba(0,0,0,.04)]">
                  <div className="grid gap-0 divide-y divide-[#EEF2F7] md:grid-cols-4 md:divide-x md:divide-y-0 xl:grid-cols-7">
                    {[
                      {
                        label: "Progress",
                        value: `${selectedProjectProgress}%`,
                        helper: `${selectedProjectIssues.length} work items`,
                        content: <CompletionRing value={selectedProjectProgress} />,
                      },
                      {
                        label: "Deadline",
                        value: selectedProject.targetDate
                          ? formatShortDate(selectedProject.targetDate)
                          : "No deadline set",
                        helper: selectedProject.targetDate
                          ? selectedProjectDaysRemainingMeta.label
                          : "Set project deadline",
                      },
                      {
                        label: "Health",
                        value:
                          selectedProjectTimelineStatus.label === "No deadline"
                            ? "Awaiting milestones"
                            : selectedProjectTimelineStatus.label,
                        helper: "Delivery signal",
                      },
                      {
                        label: "Issues",
                        value: selectedProjectIssues.length || selectedProject.issueCount || 0,
                        helper: `${selectedProjectTasks.length} tasks / ${selectedProjectBugs.length} bugs`,
                      },
                      {
                        label: "Members",
                        value:
                          selectedProjectMembers.length || getProjectMemberCount(selectedProject),
                        helper: "Assigned people",
                      },
                      {
                        label: "Teams",
                        value: selectedProjectTeams.length,
                        helper: "Attached teams",
                      },
                      {
                        label: "Budget",
                        value:
                          formatBudget(selectedProject) === "-"
                            ? "Not configured"
                            : formatBudget(selectedProject),
                        helper: "Planned spend",
                      },
                    ].map((metric) => (
                      <div key={metric.label} className="flex min-h-[76px] items-center justify-between gap-3 px-3 py-2 first:pl-0 last:pr-0">
                        <div className="min-w-0">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            {metric.label}
                          </p>
                          <p className="mt-1 truncate text-lg font-semibold text-slate-950">
                            {metric.value}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-slate-500">
                            {metric.helper}
                          </p>
                        </div>
                        {metric.content || null}
                      </div>
                    ))}
                  </div>
                </section>

                <div className="border-b border-slate-200">
                  <nav className="-mb-px flex gap-8 overflow-x-auto" aria-label="Project sections">
                  {[
                    { id: "details", label: "Overview", detail: "overview" },
                    { id: "roadmap", label: "Roadmap" },
                    { id: "epics", label: "Epics", action: () => setProjectMode("planning") },
                    { id: "tasks", label: "Tasks", detail: "tasks" },
                    { id: "bugs", label: "Bugs", detail: "bugs" },
                    { id: "reports", label: "Reports", path: "/reports" },
                    { id: "git-activity", label: "Git Activity" },
                    { id: "git", label: "Git Configuration" },
                    { id: "settings", label: "Settings" },
                  ].map(({ id, label, detail, path, action }) => {
                    const isActive = projectPanelView === id;

                    return (
                      <button
                        key={id}
                        className={`relative h-11 whitespace-nowrap px-0 text-sm font-semibold transition ${
                          isActive
                            ? "text-[#0C66E4] after:absolute after:inset-x-0 after:-bottom-px after:h-[3px] after:rounded-full after:bg-[#0C66E4]"
                            : "text-slate-500 hover:text-slate-950"
                        }`}
                        type="button"
                        onClick={() => {
                          if (path) {
                            navigate(path);
                            return;
                          }

                          if (action) {
                            action();
                            return;
                          }

                          setProjectPanelView(id);
                          if (detail) {
                            setProjectDetailView(detail);
                          }
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                  </nav>
                </div>

                {projectPanelView === "roadmap" ? (
                <section className="rounded-[18px] border border-[#EEF2F7] bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,.04)]">
                  <div className="flex flex-col gap-3 border-b border-[#EEF2F7] pb-3 sm:flex-row sm:items-start sm:justify-between">
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
                            className="grid gap-3 rounded-xl border border-[#EEF2F7] bg-slate-50 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto]"
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
                        <div className="mx-auto flex max-w-sm flex-col items-center text-center">
                          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#F5F3FF] text-indigo-600">
                            <Layers3 className="h-5 w-5" />
                          </span>
                          <p className="mt-3 text-sm font-semibold text-slate-950">
                            No roadmap yet
                          </p>
                          <p className="mt-1 text-xs leading-5 text-slate-500">
                            Create your first epic to start tracking delivery phases.
                          </p>
                          <Button
                            className="mt-3 h-8 rounded-lg px-3 text-xs"
                            type="button"
                            onClick={() => setProjectMode("planning")}
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Create Epic
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </section>
                ) : null}

                {["details", "tasks", "bugs"].includes(projectPanelView) ? (
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
                          className={`rounded-2xl border p-4 ${row.borderClassName || "border-[#EEF2F7]"} ${row.surfaceClassName || "bg-white"}`}
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
                          className={`rounded-2xl border p-4 ${row.borderClassName || "border-[#EEF2F7]"} ${row.surfaceClassName || "bg-white"}`}
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
                ) : null}

                {projectPanelView === "activity" ? (
                  <section className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-3">
                      <div>
                        <h3 className="text-base font-semibold text-slate-950">
                          Activity
                        </h3>
                        <p className="mt-1 text-sm text-slate-500">
                          Recent project movement and status signals.
                        </p>
                      </div>
                      <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
                        <Activity className="h-4 w-4" />
                      </span>
                    </div>
                    <div className="mt-3 space-y-2">
                      {selectedProjectIssues.length ? (
                        selectedProjectIssues.slice(0, 6).map((issue) => (
                          <div
                            key={issue._id}
                            className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-950">
                                {issue.title || issue.summary || "Untitled work item"}
                              </p>
                              <p className="mt-1 text-xs text-slate-500">
                                {normalizeIssueType(issue?.type, ISSUE_TYPES.TASK)} /{" "}
                                {issue.status || "Open"}
                              </p>
                            </div>
                            <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-500">
                              {issue.priority || "Normal"}
                            </span>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                          No activity yet.
                        </div>
                      )}
                    </div>
                  </section>
                ) : null}

                {projectPanelView === "git-activity" ? (
                  <section className="space-y-4">
                    <div className="flex flex-col gap-3 border-b border-[#EEF2F7] pb-4 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h3 className="text-base font-semibold text-slate-950">
                          Git Activity
                        </h3>
                        <p className="mt-1 text-sm text-slate-500">
                          Commit history captured for this project's connected repository.
                        </p>
                      </div>
                      <span className="inline-flex h-9 w-fit items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 text-sm font-semibold text-blue-700">
                        <GitBranch className="h-4 w-4" />
                        {selectedProjectGitActivityRows.length}{" "}
                        {selectedProjectGitActivityRows.length === 1 ? "commit" : "commits"}
                      </span>
                    </div>

                    {selectedProjectGitActivityRows.length ? (
                      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                        <div className="hidden border-b border-slate-200 bg-slate-50 px-4 py-3 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500 md:grid md:grid-cols-[170px_120px_minmax(0,1fr)_140px] md:gap-4">
                          <span>Date</span>
                          <span>Time</span>
                          <span>Commit Message</span>
                          <span>Commit</span>
                        </div>
                        <div className="divide-y divide-slate-200">
                          {selectedProjectGitActivityRows.map((activity) => {
                            const { date, time } = getGitActivityDateParts(activity.pushedAt);
                            const shortSha = getCommitShortSha(activity.commitSha);

                            return (
                              <div
                                className="grid gap-3 px-4 py-4 md:grid-cols-[170px_120px_minmax(0,1fr)_140px] md:items-center md:gap-4"
                                key={activity.id}
                              >
                                <div className="min-w-0">
                                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400 md:hidden">
                                    Date
                                  </p>
                                  <p className="text-sm font-semibold text-slate-950">{date}</p>
                                </div>
                                <div className="min-w-0">
                                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400 md:hidden">
                                    Time
                                  </p>
                                  <p className="text-sm font-semibold text-slate-700">{time || "-"}</p>
                                </div>
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                                      <GitCommit className="h-3.5 w-3.5" />
                                      {activity.branch || "main"}
                                    </span>
                                    {activity.pushedByName ? (
                                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                                        {activity.pushedByName}
                                      </span>
                                    ) : null}
                                  </div>
                                  <p className="mt-2 break-words text-sm font-semibold text-slate-950">
                                    {activity.commitMessage || "No commit message recorded"}
                                  </p>
                                  {activity.modulesChanged?.length ? (
                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                      {activity.modulesChanged.slice(0, 4).map((module) => (
                                        <span
                                          className="rounded-full bg-cyan-50 px-2 py-1 text-xs font-semibold text-cyan-700"
                                          key={module}
                                        >
                                          {module}
                                        </span>
                                      ))}
                                    </div>
                                  ) : null}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400 md:hidden">
                                    Commit
                                  </p>
                                  <p
                                    className={cn(
                                      "truncate text-sm font-semibold",
                                      shortSha ? "font-mono text-slate-800" : "text-slate-400"
                                    )}
                                  >
                                    {shortSha || "No SHA"}
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-blue-200 bg-blue-50/40 px-4 py-8 text-center">
                        <GitBranch className="mx-auto h-8 w-8 text-blue-500" />
                        <p className="mt-3 text-sm font-semibold text-slate-950">
                          No Git activity history yet
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          Push history will appear here after the connected repository receives commits.
                        </p>
                      </div>
                    )}
                  </section>
                ) : null}

                {projectPanelView === "git" ? (
                  <section className="space-y-4">
                    <div className="flex flex-col gap-3 border-b border-[#EEF2F7] pb-4 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h3 className="text-base font-semibold text-slate-950">
                          Git Configuration
                        </h3>
                        <p className="mt-1 text-sm text-slate-500">
                          Configure repository, webhooks, branch strategy, modules, and QA defaults.
                        </p>
                      </div>
                      <Button
                        className="h-9 rounded-lg"
                        type="button"
                        disabled={
                          !canManageGitConfiguration ||
                          updateProjectDeliveryWorkflowMutation.isPending
                        }
                        onClick={handleSaveGitConfiguration}
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        Save Git Configuration
                      </Button>
                    </div>

                    {gitConfigError ? (
                      <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                        {gitConfigError}
                      </div>
                    ) : null}

                    <ProjectDeliveryConfiguration
                      value={projectDeliveryConfig}
                      onChange={setProjectDeliveryConfig}
                      readOnly={!canManageGitConfiguration}
                      mode="settings"
                      onTestConnection={handleTestGitConnection}
                      onSyncNow={handleSyncGitRepository}
                      isTestingConnection={testProjectGitConnectionMutation.isPending}
                      isSyncing={syncProjectGitRepositoryMutation.isPending}
                      testResult={gitTestResult}
                      syncResult={gitSyncResult}
                    />
                  </section>
                ) : null}

                {projectPanelView === "settings" ? (
                  <section className="space-y-4">
                    <div className="flex flex-col gap-3 border-b border-[#EEF2F7] pb-4 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h3 className="text-base font-semibold text-slate-950">
                          Project Settings
                        </h3>
                        <p className="mt-1 text-sm text-slate-500">
                          Edit project details, ownership, theme, and attached teams.
                        </p>
                      </div>
                      <Button
                        className="h-9 rounded-lg"
                        type="button"
                        disabled={!canManageProjects || updateProjectMutation.isPending}
                        onClick={handleSaveProjectSettings}
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        Save Changes
                      </Button>
                    </div>

                    {settingsError ? (
                      <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                        {settingsError}
                      </div>
                    ) : null}

                    <div className="mt-4 space-y-5">
                      <div className="space-y-4">
                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(280px,1fr)_180px_180px_160px]">
                          <label className="space-y-1.5">
                            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                              Name
                            </span>
                            <input
                              className="h-10 w-full rounded-xl border border-[#DDE5F0] bg-white px-3 text-sm text-slate-950 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10"
                              value={projectSettings.name}
                              disabled={!canManageProjects}
                              onChange={(event) =>
                                handleSettingsChange("name", event.target.value)
                              }
                            />
                          </label>
                          <label className="space-y-1.5">
                            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                              Status
                            </span>
                            <select
                              className="h-10 w-full rounded-xl border border-[#DDE5F0] bg-white px-3 text-sm text-slate-950 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10"
                              value={projectSettings.status}
                              disabled={!canManageProjects}
                              onChange={(event) =>
                                handleSettingsChange("status", event.target.value)
                              }
                            >
                              {["Active", "Planning", "On Hold", "Completed", "Delayed", "Archived"].map((status) => (
                                <option key={status} value={status}>
                                  {status}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="space-y-1.5">
                            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                              Priority
                            </span>
                            <select
                              className="h-10 w-full rounded-xl border border-[#DDE5F0] bg-white px-3 text-sm text-slate-950 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10"
                              value={projectSettings.priority}
                              disabled={!canManageProjects}
                              onChange={(event) =>
                                handleSettingsChange("priority", event.target.value)
                              }
                            >
                              {["Low", "Medium", "High", "Critical"].map((priority) => (
                                <option key={priority} value={priority}>
                                  {priority}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="space-y-1.5">
                            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                              Theme
                            </span>
                            <input
                              className="h-10 w-full rounded-xl border border-[#DDE5F0] bg-white px-3"
                              type="color"
                              value={projectSettings.themeColor}
                              disabled={!canManageProjects}
                              onChange={(event) =>
                                handleSettingsChange("themeColor", event.target.value)
                              }
                            />
                          </label>
                        </div>

                        <label className="block space-y-1.5">
                          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Description
                          </span>
                          <textarea
                            className="min-h-[112px] w-full resize-y rounded-xl border border-[#DDE5F0] bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10"
                            value={projectSettings.description}
                            disabled={!canManageProjects}
                            onChange={(event) =>
                              handleSettingsChange("description", event.target.value)
                            }
                          />
                        </label>

                        <div className="grid gap-3 lg:grid-cols-3">
                          <div className="rounded-2xl border border-[#EEF2F7] bg-white/80 p-4">
                            <label className="space-y-1.5">
                              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                Project Manager
                              </span>
                              <select
                                className="h-10 w-full rounded-xl border border-[#DDE5F0] bg-white px-3 text-sm text-slate-950 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10"
                                value={projectSettings.projectManager}
                                disabled={!canManageProjects || isUsersLoading}
                                onChange={(event) =>
                                  handleSettingsChange("projectManager", event.target.value)
                                }
                              >
                                <option value="">Unassigned</option>
                                {projectManagerOptions.map((workspaceUser) => (
                                  <option key={workspaceUser._id} value={workspaceUser._id}>
                                    {workspaceUser.name || workspaceUser.email}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <p className="mt-2 text-xs text-slate-500">
                              Managers own project settings and delivery decisions.
                            </p>
                          </div>

                          <div className="rounded-2xl border border-[#B6D4FE] bg-[#F4F8FF] p-4">
                            <label className="space-y-1.5">
                              <span className="text-xs font-semibold uppercase tracking-wide text-blue-600">
                                Team Lead
                              </span>
                              <select
                                className="h-10 w-full rounded-xl border border-[#B6D4FE] bg-white px-3 text-sm text-slate-950 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10"
                                value={projectSettings.teamLead}
                                disabled={!canManageProjects || isUsersLoading}
                                onChange={(event) =>
                                  handleSettingsChange("teamLead", event.target.value)
                                }
                              >
                                <option value="">Unassigned</option>
                                {teamLeadOptions.map((workspaceUser) => (
                                  <option key={workspaceUser._id} value={workspaceUser._id}>
                                    {workspaceUser.name || workspaceUser.email}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <p className="mt-2 text-xs text-slate-500">
                              Only users with the Team Lead role are listed here.
                            </p>
                          </div>

                          <div className="rounded-2xl border border-[#EEF2F7] bg-white/80 p-4">
                            <label className="space-y-1.5">
                              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                QA Lead
                              </span>
                              <select
                                className="h-10 w-full rounded-xl border border-[#DDE5F0] bg-white px-3 text-sm text-slate-950 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10"
                                value={projectSettings.qaLead}
                                disabled={!canManageProjects || isUsersLoading}
                                onChange={(event) =>
                                  handleSettingsChange("qaLead", event.target.value)
                                }
                              >
                                <option value="">Unassigned</option>
                                {qaLeadOptions.map((workspaceUser) => (
                                  <option key={workspaceUser._id} value={workspaceUser._id}>
                                    {workspaceUser.name || workspaceUser.email}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <p className="mt-2 text-xs text-slate-500">
                              QA Leads coordinate test ownership and verification.
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="border-t border-[#EEF2F7] pt-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <h4 className="text-sm font-semibold text-slate-950">
                              Teams
                            </h4>
                            <p className="mt-1 text-xs text-slate-500">
                              Attach or remove teams from this project.
                            </p>
                          </div>
                          <span className="rounded-full border border-[#B6D4FE] bg-[#E9F2FF] px-2.5 py-1 text-xs font-semibold text-[#0C66E4]">
                            {selectedProjectTeams.length}
                          </span>
                        </div>

                        <div className="mt-3 flex max-w-2xl gap-2">
                          <select
                            className="h-10 min-w-0 flex-1 rounded-xl border border-[#DDE5F0] bg-white px-3 text-sm text-slate-950 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10"
                            value={settingsTeamId}
                            disabled={!canManageProjects || isTeamsLoading}
                            onChange={(event) => setSettingsTeamId(event.target.value)}
                          >
                            <option value="">Select team</option>
                            {settingsAvailableTeams.map((team) => (
                              <option key={team._id} value={team._id}>
                                {team.name}
                              </option>
                            ))}
                          </select>
                          <Button
                            className="h-10 rounded-xl"
                            type="button"
                            disabled={!canManageProjects || !settingsTeamId || attachProjectTeamMutation.isPending}
                            onClick={handleAttachSettingsTeam}
                          >
                            Attach
                          </Button>
                        </div>

                        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                          {selectedProjectTeams.length ? (
                            selectedProjectTeams.map((team) => (
                              <div
                                key={team._id || team.name}
                                className="flex items-center justify-between gap-3 rounded-xl border border-[#EEF2F7] bg-white/70 px-3 py-2"
                              >
                                <span className="min-w-0 truncate text-sm font-semibold text-slate-800">
                                  {team.name || "Untitled team"}
                                </span>
                                <button
                                  className="text-xs font-semibold text-rose-600 hover:text-rose-700 disabled:text-slate-400"
                                  type="button"
                                  disabled={!canManageProjects || detachProjectTeamMutation.isPending}
                                  onClick={() => handleDetachSettingsTeam(team)}
                                >
                                  Remove
                                </button>
                              </div>
                            ))
                          ) : (
                            <div className="rounded-xl border border-dashed border-[#DDE5F0] bg-white/70 px-3 py-4 text-sm text-slate-500 md:col-span-2 xl:col-span-3">
                              No teams attached.
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </section>
                ) : null}

                {projectPanelView === "widgets" ? (
                  <section className="rounded-2xl border border-slate-200 bg-white/92 p-4 shadow-[0_18px_46px_-36px_rgba(15,23,42,0.55)]">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-base font-semibold text-slate-950">
                          Project Widgets
                        </h3>
                        <p className="mt-1 text-xs text-slate-500">
                          Live planning signals for this project.
                        </p>
                      </div>
                      <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
                        <BarChart3 className="h-4 w-4" />
                      </span>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                      {selectedProjectWidgets.map((widget) => {
                        const tone = getMetricTone(widget.tone);
                        const Icon = widget.Icon;

                        return (
                          <div
                            key={widget.label}
                            className={`group relative overflow-hidden rounded-2xl border bg-gradient-to-br p-3.5 shadow-[0_14px_34px_-30px_rgba(15,23,42,0.65)] ring-0 transition duration-200 hover:-translate-y-1 hover:scale-[1.015] hover:shadow-[0_22px_46px_-30px_rgba(15,23,42,0.7)] hover:ring-4 ${tone.card} ${tone.ring}`}
                          >
                            <div className="pointer-events-none absolute -right-7 -top-8 h-20 w-20 rounded-full bg-white/45" />
                            <div className="relative flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p
                                  className={`truncate text-[11px] font-bold uppercase ${tone.label}`}
                                >
                                  {widget.label}
                                </p>
                                <p className="mt-1 truncate text-xl font-semibold text-slate-950">
                                  {isSelectedProjectIssuesLoading &&
                                  ["Critical Bugs", "Blocked Issues", "Velocity"].includes(
                                    widget.label
                                  )
                                    ? "..."
                                    : widget.value}
                                </p>
                              </div>
                              <span
                                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl shadow-lg transition group-hover:rotate-3 group-hover:scale-110 ${tone.icon}`}
                              >
                                <Icon className="h-4 w-4" />
                              </span>
                            </div>
                            <p className="relative mt-2 text-xs leading-4 text-slate-600">
                              {widget.helper}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ) : null}
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
          onUpdateDeliveryWorkflow={(payload) =>
            updateProjectDeliveryWorkflowMutation.mutateAsync(payload)
          }
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

      <Dialog
        open={isSelectedProjectDeleteOpen && Boolean(selectedProject)}
        onOpenChange={handleSelectedProjectDeleteDialogChange}
      >
        <DialogContent
          className={projectDialogContentClass(
            "grid max-h-[calc(100svh-6.25rem)] w-[calc(100%-2rem)] max-w-lg grid-rows-[auto_minmax(0,1fr)_auto] rounded-[26px] sm:max-h-[calc(100vh-7.5rem)]"
          )}
        >
          <DialogHeader className={projectDialogHeaderClass("space-y-4")}>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 text-rose-600 shadow-sm">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="space-y-2">
              <DialogTitle>Delete Project</DialogTitle>
              <DialogDescription>
                This action will permanently delete the project and all associated
                data.
              </DialogDescription>
            </div>
          </DialogHeader>

          <div className={projectDialogBodyClass("space-y-4")}>
            <div className="rounded-[24px] border border-rose-200 bg-[linear-gradient(145deg,rgba(255,241,242,0.96),rgba(255,255,255,0.98))] p-4 text-sm text-rose-900 shadow-sm">
              <p className="font-semibold">This action cannot be undone.</p>
              <p className="mt-2 leading-6 text-rose-700">
                Type the project name exactly as shown to confirm the deletion.
              </p>
            </div>

            <div className="rounded-[24px] border border-slate-200 bg-slate-50/85 p-4 shadow-sm">
              <p className="text-[11px] font-semibold uppercase text-slate-500">
                Project Name
              </p>
              <p className="mt-2 break-words text-lg font-semibold text-slate-950">
                {selectedProject?.name}
              </p>
            </div>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">
                Confirmation
              </span>
              <Input
                autoComplete="off"
                className="rounded-[20px] border-slate-300"
                disabled={deleteProjectMutation.isPending}
                placeholder={`Type "${selectedProject?.name || "project name"}"`}
                value={selectedProjectDeleteConfirmation}
                onChange={(event) =>
                  setSelectedProjectDeleteConfirmation(event.target.value)
                }
              />
            </label>
          </div>

          <DialogFooter className={projectDialogFooterClass()}>
            <Button
              variant="ghost"
              type="button"
              onClick={() => handleSelectedProjectDeleteDialogChange(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={
                !isSelectedProjectDeleteConfirmationValid ||
                deleteProjectMutation.isPending
              }
              type="button"
              onClick={handleDeleteSelectedProject}
            >
              {deleteProjectMutation.isPending ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              {deleteProjectMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              canManageGitConfiguration={canManageGitConfiguration}
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
