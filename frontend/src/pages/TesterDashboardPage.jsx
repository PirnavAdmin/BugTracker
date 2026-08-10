import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  Bell,
  Bug,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  ClipboardCheck,
  Eye,
  FolderKanban,
  PauseCircle,
  PlayCircle,
  Plus,
  RefreshCcw,
  RotateCcw,
  Rocket,
  Search,
  ShieldCheck,
  TimerReset,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import {
  fetchIssues,
  fetchMyReportedBugs,
  fetchProjects,
  fetchRecentTasks,
  fetchNotifications,
  fetchUnreadNotificationCount,
  markNotificationAsRead,
} from "@/lib/api";
import {
  ISSUE_STATUS,
  getIssueDisplayKey,
  getIssuePriorityVariant,
  getIssueStatusLabel,
  getIssueStatusVariant,
  isIssueOverdue,
  normalizeBugStatusForIssue,
  normalizeIssueStatus,
  resolveBugDetails,
  resolveIssueProjectId,
} from "@/lib/issues";
import { getProjectMembers, getProjectTeams, resolveUserId } from "@/lib/project-teams";
import { hasTesterPanelAccess } from "@/lib/roles";
import { cn, formatDate, formatDateTime } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { readStoredSession } from "@/lib/session";
import { getChatSocket } from "@/lib/socket";
import NotificationCard from "@/components/dashboard/NotificationCard";
import GreetingBeachScene from "@/components/dashboard/GreetingBeachScene";
import {
  QAGitActivityPanel,
} from "@/components/delivery/ProjectDeliveryWorkflowPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

const STATUS_BUCKETS = {
  open: [ISSUE_STATUS.NEW, ISSUE_STATUS.OPEN, ISSUE_STATUS.TODO],
  inProgress: [ISSUE_STATUS.ASSIGNED, ISSUE_STATUS.IN_PROGRESS, ISSUE_STATUS.BLOCKED],
  resolved: [ISSUE_STATUS.FIXED, ISSUE_STATUS.QA, ISSUE_STATUS.REVIEW],
  reopened: [ISSUE_STATUS.REOPEN],
  closed: [ISSUE_STATUS.CLOSED, ISSUE_STATUS.DONE],
  deferred: [ISSUE_STATUS.DEFERRED, ISSUE_STATUS.REJECTED],
};

const STATUS_CHART_META = [
  {
    key: "open",
    label: "Open",
    color: "#f59e0b",
    gradient: "from-amber-400 to-orange-500",
    Icon: Clock3,
    track: "bg-amber-100",
  },
  {
    key: "inProgress",
    label: "In Progress",
    color: "#6366f1",
    gradient: "from-indigo-500 to-violet-500",
    Icon: TimerReset,
    track: "bg-indigo-100",
  },
  {
    key: "resolved",
    label: "Resolved",
    color: "#10b981",
    gradient: "from-emerald-500 to-teal-400",
    Icon: CheckCircle2,
    track: "bg-emerald-100",
  },
  {
    key: "reopened",
    label: "Reopened",
    color: "#ec4899",
    gradient: "from-pink-500 to-rose-500",
    Icon: RotateCcw,
    track: "bg-pink-100",
  },
  {
    key: "closed",
    label: "Closed",
    color: "#64748b",
    gradient: "from-slate-500 to-slate-700",
    Icon: CheckCircle2,
    track: "bg-slate-200",
  },
  {
    key: "deferred",
    label: "Deferred",
    color: "#14b8a6",
    gradient: "from-cyan-500 to-teal-500",
    Icon: PauseCircle,
    track: "bg-cyan-100",
  },
];

const SUMMARY_CARDS = [
  {
    key: "total",
    label: "Total Bugs",
    Icon: Bug,
    className: "from-blue-500 to-indigo-500",
  },
  {
    key: "open",
    label: "Open Bugs",
    Icon: Clock3,
    className: "from-amber-400 to-orange-500",
  },
  {
    key: "inProgress",
    label: "In Progress",
    Icon: TimerReset,
    className: "from-indigo-500 to-violet-500",
  },
  {
    key: "resolved",
    label: "Resolved",
    Icon: CheckCircle2,
    className: "from-emerald-500 to-teal-400",
  },
  {
    key: "closed",
    label: "Closed",
    Icon: CheckCircle2,
    className: "from-slate-500 to-slate-700",
  },
];

const COMMON_TESTING_MODULES = ["Login", "Dashboard", "Reports", "API", "Payment", "Attendance"];
const BUILD_MODULE_FALLBACK = ["Login", "Dashboard", "Reports", "Payment", "Attendance"];

const createEmptyMetrics = () => ({
  total: 0,
  open: 0,
  inProgress: 0,
  resolved: 0,
  reopened: 0,
  closed: 0,
  deferred: 0,
});

const getReporterId = (issue) => resolveUserId(issue?.reporter);

const getComparableStatus = (issue) =>
  issue?.type === "Bug"
    ? normalizeBugStatusForIssue(issue)
    : normalizeIssueStatus(issue?.status);

const incrementMetrics = (metrics, issue) => {
  const status = getComparableStatus(issue);

  metrics.total += 1;

  Object.entries(STATUS_BUCKETS).forEach(([key, values]) => {
    if (values.includes(status)) {
      metrics[key] += 1;
    }
  });
};

const getIssueTesterOwnerId = (issue) => resolveUserId(resolveBugDetails(issue)?.testerOwner);

const isTesterTeam = (team, testerId) =>
  (team?.members || []).some((member) => resolveUserId(member) === testerId);

const getAssignedTeamsForTester = (project, testerId) =>
  getProjectTeams(project).filter((team) => isTesterTeam(team, testerId));

const isTesterProjectParticipant = (project, testerId) => {
  if (!testerId) {
    return false;
  }

  const leadershipUsers = [
    project?.projectManager,
    project?.manager,
    project?.teamLead,
    project?.qaLead,
  ];

  return [
    ...leadershipUsers,
    ...getProjectMembers(project),
    ...(project?.projectMembers || []).map((member) => member?.user || member?.userId || member),
  ].some((member) => resolveUserId(member) === testerId);
};

const buildTesterProject = (project, testerId, issues = []) => {
  const assignedTeams = getAssignedTeamsForTester(project, testerId);
  const projectId = String(project?._id || "");
  const hasOwnedBugInProject = issues.some(
    (issue) =>
      resolveIssueProjectId(issue) === projectId &&
      (getReporterId(issue) === testerId || getIssueTesterOwnerId(issue) === testerId)
  );

  if (!assignedTeams.length && !isTesterProjectParticipant(project, testerId) && !hasOwnedBugInProject) {
    return null;
  }

  return {
    ...project,
    teams: getProjectTeams(project),
  };
};

const getProjectName = (issue, projects = []) => {
  const projectId = resolveIssueProjectId(issue);
  const project = projects.find((item) => String(item._id) === projectId);

  return issue?.projectId?.name || project?.name || "Assigned project";
};

const getAssigneeName = (issue) => {
  const bugDetails = resolveBugDetails(issue);

  return bugDetails?.developerLead?.name || issue?.assignee?.name || "Unassigned";
};

const getBugUpdatedAt = (issue) =>
  issue?.updatedAt || issue?.lastUpdatedAt || issue?.createdAt || null;

const getLocalDateKey = (date = new Date()) => {
  const value = date instanceof Date ? date : new Date(date);

  if (Number.isNaN(value.getTime())) {
    return "";
  }

  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const filterBugs = ({ issues, projects, projectId, searchTerm }) => {
  const normalizedSearch = searchTerm.trim().toLowerCase();

  return issues.filter((issue) => {
    if (projectId !== "all" && resolveIssueProjectId(issue) !== projectId) {
      return false;
    }

    if (!normalizedSearch) {
      return true;
    }

    return [
      getIssueDisplayKey(issue),
      issue.title,
      getProjectName(issue, projects),
      getIssueStatusLabel(issue.status),
      issue.priority,
      getAssigneeName(issue),
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(normalizedSearch));
  });
};

const DashboardIconButton = ({ children, className, ...props }) => (
  <Button
    className={cn(
      "h-11 w-11 rounded-2xl border border-slate-200/80 bg-white/78 p-0 text-slate-600 shadow-sm hover:bg-white hover:text-slate-950",
      className
    )}
    size="icon"
    type="button"
    variant="outline"
    {...props}
  >
    {children}
  </Button>
);

const SummaryCard = ({ Icon, className, label, value }) => (
  <Card className="group overflow-hidden border-white/70 bg-white/86 shadow-[0_18px_48px_-34px_rgba(15,23,42,0.34)] backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:border-blue-100 hover:shadow-[0_24px_54px_-30px_rgba(37,99,235,0.32)]">
    <CardContent className="relative overflow-hidden p-4">
      <div className={cn("absolute -right-8 -top-8 h-24 w-24 rounded-full bg-gradient-to-br opacity-10 blur-2xl transition group-hover:opacity-20", className)} />
      <div className="flex items-center justify-between gap-3">
        <div
          className={cn(
            "flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-[0_14px_26px_-18px_rgba(37,99,235,0.75)]",
            className
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
        <p className="text-3xl font-semibold tracking-tight text-slate-950">
          {value}
        </p>
      </div>
      <div className="mt-4 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-600">{label}</p>
        <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Live</span>
      </div>
    </CardContent>
  </Card>
);

const ChartCard = ({ children, title }) => (
  <Card className="min-w-0 overflow-hidden rounded-2xl border-white/70 bg-white/88 shadow-[0_20px_56px_-36px_rgba(15,23,42,0.38)] backdrop-blur-xl">
    <CardContent className="p-5">
      <h2 className="text-base font-semibold tracking-tight text-slate-950">
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </CardContent>
  </Card>
);

const EmptyChartState = ({ children }) => (
  <div className="flex min-h-[156px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-6 py-6 text-center text-sm text-slate-500">
    <Activity className="mb-3 h-8 w-8 text-slate-300" />
    <span>{children}</span>
  </div>
);

const TableBadge = ({ children, variant }) => (
  <Badge className="justify-center whitespace-nowrap px-2.5 py-1" variant={variant}>
    {children}
  </Badge>
);

const RecentTasksPanel = ({
  error,
  isLoading,
  onOpenTask,
  tasks = [],
}) => (
  <ChartCard title="Recent Tasks">
    {isLoading ? (
      <div className="max-h-[300px] space-y-2 overflow-y-auto pr-1">
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            className="rounded-[20px] border border-slate-200/80 bg-white/70 p-4"
            key={`recent-task-skeleton-${index}`}
          >
            <div className="flex items-center justify-between gap-3">
              <Skeleton className="h-5 w-24 rounded-full" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
            <Skeleton className="mt-3 h-5 w-3/4 rounded-full" />
            <Skeleton className="mt-3 h-4 w-1/2 rounded-full" />
          </div>
        ))}
      </div>
    ) : error ? (
      <div
        className="flex h-[260px] items-center justify-center rounded-[24px] border border-rose-100 bg-rose-50/70 px-6 text-center text-sm font-medium text-rose-700"
        role="alert"
      >
        {error.response?.data?.message || "Unable to load recent tasks."}
      </div>
    ) : tasks.length ? (
      <div className="space-y-3">
        {tasks.slice(0, 5).map((task) => {
          const assignedAt = task.createdAt || task.updatedAt || "";

          return (
            <button
              className="group relative w-full rounded-2xl border border-slate-200/80 bg-white/74 p-3 pl-5 text-left shadow-sm transition duration-200 ease-out hover:-translate-y-0.5 hover:border-blue-200 hover:bg-blue-50/46 hover:shadow-[0_18px_44px_-32px_rgba(37,99,235,0.42)] focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              key={task._id}
              onClick={() => onOpenTask(task._id)}
              type="button"
            >
              <span className="absolute bottom-3 left-2 top-3 w-1 rounded-full bg-gradient-to-b from-blue-500 to-cyan-400" />
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <TableBadge variant={getIssuePriorityVariant(task.priority)}>
                      {task.priority ? String(task.priority).toUpperCase() : "MEDIUM"}
                    </TableBadge>
                    <TableBadge variant={getIssueStatusVariant(task.status)}>
                      {getIssueStatusLabel(task.status)}
                    </TableBadge>
                  </div>

                  <h3 className="mt-2 line-clamp-1 text-sm font-semibold leading-5 text-slate-950 transition group-hover:text-blue-700">
                    {task.title || "Untitled task"}
                  </h3>
                </div>

                <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white/82 text-slate-400 transition group-hover:border-blue-200 group-hover:text-blue-600">
                  <ChevronRight className="h-4 w-4" />
                </span>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs font-medium text-slate-500">
                <span className="min-w-0 max-w-full truncate text-slate-700">
                  {getProjectName(task)}
                </span>
                <span className="hidden h-1 w-1 rounded-full bg-slate-300 sm:inline-flex" />
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5 text-slate-400" />
                  {assignedAt ? formatDate(assignedAt) : "Unknown date"}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    ) : (
      <EmptyChartState>No recent activity yet</EmptyChartState>
    )}
  </ChartCard>
);

const WorkspaceCard = ({ children, className }) => (
  <Card
    className={cn(
      "overflow-hidden rounded-[18px] border border-slate-200/80 bg-white/92 shadow-[0_14px_34px_-30px_rgba(15,23,42,0.34)] backdrop-blur-xl",
      className
    )}
  >
    <CardContent className="p-4">{children}</CardContent>
  </Card>
);

const WorkspaceKpiCard = ({ description, Icon, label, tone = "blue", value }) => {
  const tones = {
    blue: "border-blue-100 bg-blue-50/70 text-blue-700",
    green: "border-emerald-100 bg-emerald-50/70 text-emerald-700",
    orange: "border-orange-100 bg-orange-50/70 text-orange-700",
    red: "border-rose-100 bg-rose-50/70 text-rose-700",
    purple: "border-violet-100 bg-violet-50/70 text-violet-700",
    indigo: "border-indigo-100 bg-indigo-50/70 text-indigo-700",
  };

  return (
    <div className="group min-h-[88px] rounded-2xl border border-slate-200/80 bg-white/90 p-3 shadow-[0_12px_28px_-28px_rgba(15,23,42,0.3)] transition duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:bg-blue-50/35">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500">
          {label}
        </p>
        <span className={cn("flex h-8 w-8 items-center justify-center rounded-xl border", tones[tone])}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-1.5 text-2xl font-semibold tracking-tight text-slate-950">
        {value}
      </p>
      <p className="mt-0.5 line-clamp-1 text-xs leading-4 text-slate-600">{description}</p>
    </div>
  );
};

const getProjectKey = (project) =>
  project?.key || project?.projectKey || project?.code || project?.name?.slice(0, 3)?.toUpperCase() || "QA";

const getProjectModules = (project) => {
  const rawModules = project?.modules || project?.testedModules || project?.moduleNames;

  if (Array.isArray(rawModules) && rawModules.length) {
    return rawModules.map((module) => String(module?.name || module)).filter(Boolean).slice(0, 4);
  }

  return ["Login", "Dashboard", "Reports", "API"];
};

const formatSessionDuration = (milliseconds = 0) => {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours) {
    return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  }

  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
};

const getQaProjectStatusMeta = (project, projectIssues = []) => {
  const explicitStatus = String(project?.qaStatus || project?.testingStatus || project?.buildStatus || "").toLowerCase();
  const readyForQaCount = projectIssues.filter((issue) =>
    [ISSUE_STATUS.READY_FOR_QA, ISSUE_STATUS.QA, ISSUE_STATUS.FIXED, ISSUE_STATUS.TESTING].includes(getComparableStatus(issue))
  ).length;
  const hasBuild = Boolean(project?.currentBuild || project?.buildVersion || project?.version || project?.lastBuildVersion);

  if (readyForQaCount || explicitStatus.includes("verification")) {
    return {
      key: "verification",
      label: "Ready For Q/A",
      action: "Start Session",
      tone: "border-rose-200 bg-rose-50 text-rose-700",
      dot: "bg-rose-500",
    };
  }

  if (explicitStatus.includes("progress") || explicitStatus.includes("testing")) {
    return {
      key: "progress",
      label: "Testing In Progress",
      action: "Continue Testing",
      tone: "border-amber-200 bg-amber-50 text-amber-700",
      dot: "bg-amber-500",
    };
  }

  if (explicitStatus.includes("complete") || explicitStatus.includes("done")) {
    return {
      key: "completed",
      label: "Testing Completed",
      action: "View Summary",
      tone: "border-emerald-200 bg-emerald-50 text-emerald-700",
      dot: "bg-emerald-500",
    };
  }

  if (!hasBuild || explicitStatus.includes("waiting")) {
    return {
      key: "waiting",
      label: "Start Session",
      action: "Start Session",
      tone: "border-blue-200 bg-blue-50 text-blue-700",
      dot: "bg-blue-500",
    };
  }

  return {
    key: "ready",
    label: "Ready For Testing",
    action: "Start Session",
    tone: "border-emerald-200 bg-emerald-50 text-emerald-700",
    dot: "bg-emerald-500",
  };
};

const QaProjectCard = ({ onCreateBug, onOpen, onReleaseNotes, onStart, project }) => {
  const Icon = project.status.key === "verification" ? ShieldCheck : project.status.key === "waiting" ? Clock3 : PlayCircle;

  return (
    <article
      className={cn(
        "group relative min-h-[208px] rounded-[18px] border bg-white/92 p-4 shadow-[0_14px_34px_-30px_rgba(15,23,42,0.34)] transition duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:bg-blue-50/35",
        project.readyForQaCount > 0 ? "border-rose-200 bg-rose-50/55" : "border-slate-200/80"
      )}
    >
      <button
        aria-label="More project actions"
        className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        onClick={() => onReleaseNotes(project)}
        type="button"
      >
        ...
      </button>
      <div className="flex items-start gap-3 pr-8">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-50 to-violet-50 text-sm font-bold text-blue-700">
          {project.key.slice(0, 2)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="line-clamp-1 text-base font-semibold tracking-tight text-slate-950">
              {project.name}
            </h3>
            <span className={cn("inline-flex max-w-[136px] shrink-0 items-center gap-1.5 truncate rounded-full border px-2 py-0.5 text-[10px] font-bold", project.status.tone)}>
              <span className={cn("h-2 w-2 rounded-full", project.status.dot)} />
              {project.readyForQaCount > 0 ? `${project.readyForQaCount} Ready For Q/A` : project.status.label}
            </span>
          </div>
          <div className="mt-2 grid gap-1 text-xs text-slate-600 sm:grid-cols-2">
            <span className="truncate">Build: <strong className="font-semibold text-slate-900">{project.buildVersion}</strong></span>
            <span className="truncate">Env: <strong className="font-semibold text-slate-900">{project.environment}</strong></span>
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {project.modules.map((module) => (
          <span className="rounded-full border border-blue-100 bg-blue-50/55 px-2.5 py-1 text-[11px] font-semibold text-slate-600" key={module}>
            {module}
          </span>
        ))}
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
          <span>Progress</span>
          <span>{project.progress}%</span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-[linear-gradient(90deg,#2563EB,#8B5CF6)] transition-all" style={{ width: `${project.progress}%` }} />
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-2">
        <Button
          className={cn(
            "h-9 min-w-0 flex-1 rounded-xl px-3 text-sm text-white",
            project.readyForQaCount > 0 ? "bg-rose-600 hover:bg-rose-700" : "bg-blue-600 hover:bg-blue-700"
          )}
          onClick={() => onStart(project)}
          type="button"
        >
          <Icon className="h-4 w-4" />
          Start Session
        </Button>
        {project.status.key === "progress" ? (
          <Button className="h-9 rounded-xl px-3" variant="outline" onClick={() => onCreateBug(project)} type="button">
              <Bug className="h-4 w-4" />
          </Button>
        ) : (
          <Button className="h-9 rounded-xl px-3" variant="outline" onClick={() => onOpen(project)} type="button">
            View
          </Button>
        )}
      </div>
    </article>
  );
};

const QuickActionButton = ({ children, Icon, onClick, primary = false }) => (
  <Button
    className={cn(
      "h-9 rounded-xl px-3 text-sm shadow-sm transition hover:-translate-y-0.5",
      primary
        ? "bg-[linear-gradient(90deg,#2563EB_0%,#6366F1_55%,#8B5CF6_100%)] text-white hover:brightness-105"
        : "border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:bg-blue-50"
    )}
    onClick={onClick}
    type="button"
    variant={primary ? "default" : "outline"}
  >
    <Icon className="h-4 w-4" />
    {children}
  </Button>
);

const TesterDashboardPage = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const currentHour = new Date().getHours();
  const greeting = currentHour < 12
    ? "Good morning"
    : currentHour < 17
      ? "Good afternoon"
      : "Good evening";
  const timeOfDay = currentHour < 12 ? "morning" : currentHour < 17 ? "afternoon" : "evening";
  const testerName = String(user?.name || "Tester").trim().split(/\s+/)[0];
  const testerId = String(user?._id || user?.id || "");
  const dailyNoteDateKey = getLocalDateKey();
  const isTester = hasTesterPanelAccess(user?.role);
  const [searchTerm, setSearchTerm] = useState("");
  const [projectFilter, setProjectFilter] = useState("all");
  const [selectedQaProjectId, setSelectedQaProjectId] = useState(() => {
    try {
      return window.localStorage.getItem("curecode_selected_qa_project") || "";
    } catch {
      return "";
    }
  });
  const [selectedTestingModule, setSelectedTestingModule] = useState(() => {
    try {
      return window.localStorage.getItem(`curecode_selected_testing_module_${testerId}`) || "";
    } catch {
      return "";
    }
  });
  const [testingModuleDetails, setTestingModuleDetails] = useState(() => {
    try {
      return window.localStorage.getItem(`curecode_testing_module_details_${testerId}`) || "";
    } catch {
      return "";
    }
  });
  const [isQaProjectDropdownOpen, setIsQaProjectDropdownOpen] = useState(false);
  const [testingSession, setTestingSession] = useState(() => {
    try {
      const rawSession = window.localStorage.getItem("curecode_active_testing_session");
      return rawSession ? JSON.parse(rawSession) : null;
    } catch {
      return null;
    }
  });
  const [customBuildModules, setCustomBuildModules] = useState(() => {
    try {
      const rawModules = window.localStorage.getItem(`curecode_custom_build_modules_${testerId}`);
      return rawModules ? JSON.parse(rawModules) : {};
    } catch {
      return {};
    }
  });
  const [buildModuleStatuses, setBuildModuleStatuses] = useState(() => {
    try {
      const rawStatuses = window.localStorage.getItem(`curecode_build_module_statuses_${testerId}`);
      return rawStatuses ? JSON.parse(rawStatuses) : {};
    } catch {
      return {};
    }
  });
  const [newBuildModule, setNewBuildModule] = useState("");
  const [sessionNow, setSessionNow] = useState(() => Date.now());
  const [lastRefreshedAt, setLastRefreshedAt] = useState(() => new Date());
  const [dailyNote, setDailyNote] = useState(() => {
    try {
      return window.localStorage.getItem(`curecode_daily_note_${testerId}_${dailyNoteDateKey}`) || "";
    } catch {
      return "";
    }
  });

  const {
    data: projects = [],
    isLoading: isProjectsLoading,
    error: projectsError,
    refetch: refetchProjects,
  } = useQuery({
    queryKey: ["projects"],
    queryFn: fetchProjects,
  });

  const {
    data: issues = [],
    isLoading: isIssuesLoading,
    error: issuesError,
    refetch: refetchIssues,
    isFetching: isIssuesFetching,
  } = useQuery({
    queryKey: ["issues", "tester-dashboard", testerId],
    queryFn: () => fetchIssues({ type: "Bug" }),
    enabled: Boolean(testerId),
  });

  const {
    data: recentTasks = [],
    isLoading: isRecentTasksLoading,
    error: recentTasksError,
    refetch: refetchRecentTasks,
    isFetching: isRecentTasksFetching,
  } = useQuery({
    queryKey: ["tasks", "recent", "tester-dashboard", testerId],
    queryFn: fetchRecentTasks,
    enabled: Boolean(testerId && isTester),
  });

  const {
    data: latestReportedBugs = [],
    isLoading: isReportedBugsLoading,
    error: reportedBugsError,
    refetch: refetchReportedBugs,
    isFetching: isReportedBugsFetching,
  } = useQuery({
    queryKey: ["issues", "reported", "me", testerId],
    queryFn: fetchMyReportedBugs,
    enabled: Boolean(testerId && isTester),
  });

  const {
    data: notifications = [],
    isLoading: isNotificationsLoading,
  } = useQuery({
    queryKey: ["issues", "notifications", testerId],
    queryFn: fetchNotifications,
    enabled: Boolean(testerId),
  });

  const {
    data: unreadCount = 0,
  } = useQuery({
    queryKey: ["issues", "notifications", "unread-count", testerId],
    queryFn: fetchUnreadNotificationCount,
    enabled: Boolean(testerId),
  });

  useEffect(() => {
    try {
      setDailyNote(
        window.localStorage.getItem(`curecode_daily_note_${testerId}_${dailyNoteDateKey}`) || ""
      );
    } catch {
      setDailyNote("");
    }
  }, [dailyNoteDateKey, testerId]);

  useEffect(() => {
    if (!testerId) {
      return;
    }

    try {
      window.localStorage.setItem(
        `curecode_daily_note_${testerId}_${dailyNoteDateKey}`,
        dailyNote
      );
    } catch {
      // Ignore local storage write failures; the note remains editable in-session.
    }
  }, [dailyNote, dailyNoteDateKey, testerId]);

  useEffect(() => {
    if (!testerId) {
      return;
    }

    try {
      window.localStorage.setItem(
        `curecode_selected_testing_module_${testerId}`,
        selectedTestingModule
      );
    } catch {
      // Ignore storage failures.
    }
  }, [selectedTestingModule, testerId]);

  useEffect(() => {
    if (!testerId) {
      return;
    }

    try {
      window.localStorage.setItem(
        `curecode_testing_module_details_${testerId}`,
        testingModuleDetails
      );
    } catch {
      // Ignore storage failures.
    }
  }, [testingModuleDetails, testerId]);

  useEffect(() => {
    if (!testerId) {
      return;
    }

    try {
      window.localStorage.setItem(`curecode_custom_build_modules_${testerId}`, JSON.stringify(customBuildModules));
    } catch {
      // Ignore storage failures.
    }
  }, [customBuildModules, testerId]);

  useEffect(() => {
    if (!testerId) {
      return;
    }

    try {
      window.localStorage.setItem(`curecode_build_module_statuses_${testerId}`, JSON.stringify(buildModuleStatuses));
    } catch {
      // Ignore storage failures.
    }
  }, [buildModuleStatuses, testerId]);

  useEffect(() => {
    const session = readStoredSession();
    const token = session?.token;
    const socket = getChatSocket(token);

    if (!socket || !testerId) return;

    if (!socket.connected) {
      socket.connect();
    }

    const handleNewNotification = (notification) => {
      queryClient.setQueryData(["issues", "notifications", testerId], (old = []) => {
        return [notification, ...old].slice(0, 20);
      });
      queryClient.invalidateQueries({
        queryKey: ["issues", "notifications", "unread-count", testerId],
      });
    };

    socket.on("notification_received", handleNewNotification);

    return () => {
      socket.off("notification_received", handleNewNotification);
    };
  }, [testerId, queryClient]);

  useEffect(() => {
    if (testingSession?.status !== "In Progress") {
      return undefined;
    }

    const intervalId = window.setInterval(() => setSessionNow(Date.now()), 1000);

    return () => window.clearInterval(intervalId);
  }, [testingSession?.status]);

  const assignedProjects = useMemo(
    () =>
      projects
        .map((project) => buildTesterProject(project, testerId, issues))
        .filter(Boolean),
    [issues, projects, testerId]
  );

  const reportedIssues = useMemo(
    () => issues.filter((issue) => getReporterId(issue) === testerId),
    [issues, testerId]
  );

  const visibleIssues = useMemo(
    () =>
      filterBugs({
        issues: reportedIssues,
        projects: assignedProjects,
        projectId: projectFilter,
        searchTerm,
      }),
    [assignedProjects, projectFilter, reportedIssues, searchTerm]
  );

  const myReportedBugs = useMemo(
    () =>
      filterBugs({
        issues: latestReportedBugs,
        projects: assignedProjects,
        projectId: projectFilter,
        searchTerm,
      }),
    [assignedProjects, latestReportedBugs, projectFilter, searchTerm]
  );

  const dashboardMetrics = useMemo(() => {
    const metrics = createEmptyMetrics();

    visibleIssues.forEach((issue) => incrementMetrics(metrics, issue));

    return metrics;
  }, [visibleIssues]);
  const todayKey = useMemo(() => new Date().toDateString(), []);
  const todaysAssignedTasks = useMemo(
    () =>
      recentTasks.filter((task) => {
        const taskDates = [
          task?.dueAt,
          task?.dueDate,
          task?.targetDate,
          task?.createdAt,
          task?.updatedAt,
        ];

        return taskDates.some((value) => value && getLocalDateKey(value) === dailyNoteDateKey);
      }),
    [dailyNoteDateKey, recentTasks]
  );
  const qaProjects = useMemo(
    () =>
      assignedProjects.map((project) => {
        const projectId = String(project._id);
        const projectIssues = issues.filter((issue) => resolveIssueProjectId(issue) === projectId);
        const readyForQaCount = projectIssues.filter((issue) =>
          [ISSUE_STATUS.READY_FOR_QA, ISSUE_STATUS.QA, ISSUE_STATUS.FIXED, ISSUE_STATUS.TESTING].includes(getComparableStatus(issue))
        ).length;
        const totalWork = projectIssues.length;
        const completedWork = projectIssues.filter((issue) =>
          [ISSUE_STATUS.CLOSED, ISSUE_STATUS.DONE].includes(getComparableStatus(issue))
        ).length;
        const progress = totalWork ? Math.round((completedWork / totalWork) * 100) : 0;
        const projectKey = getProjectKey(project);
        const buildVersion = project.currentBuild || project.buildVersion || project.version || project.lastBuildVersion || "-";
        const status = getQaProjectStatusMeta(project, projectIssues);

        return {
          id: projectId,
          raw: project,
          name: project.name || "Assigned project",
          key: projectKey,
          buildVersion,
          environment: project.environment || project.qaEnvironment || "QA",
          uploadedTime: project.updatedAt ? formatDateTime(project.updatedAt) : "Waiting for upload",
          modules: getProjectModules(project),
          progress,
          readyForQaCount,
          status,
        };
      }),
    [assignedProjects, issues]
  );

  const qaProjectGroups = useMemo(
    () => [
      { key: "ready", title: "Ready For Testing", projects: qaProjects.filter((project) => project.status.key === "ready") },
      { key: "progress", title: "Testing In Progress", projects: qaProjects.filter((project) => project.status.key === "progress") },
      { key: "verification", title: "Ready For Verification", projects: qaProjects.filter((project) => project.status.key === "verification") },
      { key: "waiting", title: "Start Session", projects: qaProjects.filter((project) => project.status.key === "waiting") },
      { key: "completed", title: "Testing Completed", projects: qaProjects.filter((project) => project.status.key === "completed") },
    ].filter((group) => group.projects.length),
    [qaProjects]
  );
  const selectedQaProject = useMemo(
    () => qaProjects.find((project) => project.id === selectedQaProjectId) || null,
    [qaProjects, selectedQaProjectId]
  );
  const testingModuleOptions = useMemo(
    () =>
      Array.from(
        new Set([
          ...COMMON_TESTING_MODULES,
          ...(selectedQaProject?.modules || []),
        ].filter(Boolean))
      ),
    [selectedQaProject?.modules]
  );

  useEffect(() => {
    if (
      !selectedQaProjectId &&
      testingSession?.projectId &&
      qaProjects.some((project) => project.id === testingSession.projectId)
    ) {
      setSelectedQaProjectId(testingSession.projectId);
      window.localStorage.setItem("curecode_selected_qa_project", testingSession.projectId);
    }
  }, [qaProjects, selectedQaProjectId, testingSession?.projectId]);

  useEffect(() => {
    if (!qaProjects.length) {
      return;
    }

    const hasValidSelection = qaProjects.some((project) => project.id === selectedQaProjectId);

    if (hasValidSelection) {
      return;
    }

    const nextProjectId = qaProjects[0].id;
    setSelectedQaProjectId(nextProjectId);
    window.localStorage.setItem("curecode_selected_qa_project", nextProjectId);
  }, [qaProjects, selectedQaProjectId]);

  const activeSelectedSession = selectedQaProject && testingSession?.projectId === selectedQaProject.id
    ? testingSession
    : null;
  const activeTestingSession = testingSession && ["In Progress", "Stopped"].includes(testingSession.status)
    ? testingSession
    : null;
  const sessionStartedAtMs = activeTestingSession?.startedAt
    ? new Date(activeTestingSession.startedAt).getTime()
    : 0;
  const sessionStoppedAtMs = activeTestingSession?.stoppedAt
    ? new Date(activeTestingSession.stoppedAt).getTime()
    : 0;
  const sessionElapsedMs = activeTestingSession
    ? (activeTestingSession.totalMs || ((sessionStoppedAtMs || sessionNow) - sessionStartedAtMs))
    : 0;
  const sessionReportedBugsCount = useMemo(
    () =>
      activeTestingSession && sessionStartedAtMs
        ? reportedIssues.filter((issue) => {
            const createdAt = issue?.createdAt ? new Date(issue.createdAt).getTime() : 0;
            return (
              resolveIssueProjectId(issue) === activeTestingSession.projectId &&
              createdAt >= sessionStartedAtMs &&
              (!sessionStoppedAtMs || createdAt <= sessionStoppedAtMs)
            );
          }).length
        : 0,
    [activeTestingSession, reportedIssues, sessionStartedAtMs, sessionStoppedAtMs]
  );
  const selectedProjectBugBoardIssues = useMemo(
    () =>
      selectedQaProject
        ? issues.filter((issue) => resolveIssueProjectId(issue) === selectedQaProject.id)
        : [],
    [issues, selectedQaProject]
  );
  const currentBuildModules = useMemo(() => {
    const configKey = activeTestingSession?.projectId || selectedQaProject?.id;
    const sessionModules = activeTestingSession?.configuredModules || [];
    const projectModules = activeTestingSession
      ? sessionModules
      : selectedQaProject?.modules?.length
        ? selectedQaProject.modules
        : BUILD_MODULE_FALLBACK;
    const userModules = configKey ? customBuildModules[configKey] || [] : [];

    return Array.from(new Set([...projectModules, ...userModules].filter(Boolean)));
  }, [activeTestingSession, customBuildModules, selectedQaProject]);
  const getModuleStatus = (module, index) =>
    activeTestingSession || selectedQaProject
      ? buildModuleStatuses[activeTestingSession?.projectId || selectedQaProject?.id]?.[module] || (index === 0 ? "progress" : "pending")
      : "pending";
  const completedModuleCount = currentBuildModules.filter((module, index) => getModuleStatus(module, index) === "done").length;
  const moduleProgress = currentBuildModules.length
    ? Math.round((completedModuleCount / currentBuildModules.length) * 100)
    : 0;
  const buildTestCaseStats = useMemo(() => {
    const executed = selectedProjectBugBoardIssues.length;
    const passed = selectedProjectBugBoardIssues.filter((issue) =>
      [ISSUE_STATUS.CLOSED, ISSUE_STATUS.DONE].includes(getComparableStatus(issue))
    ).length;
    const failed = selectedProjectBugBoardIssues.filter((issue) =>
      [ISSUE_STATUS.REJECTED, ISSUE_STATUS.REOPEN].includes(getComparableStatus(issue))
    ).length;
    const blocked = selectedProjectBugBoardIssues.filter((issue) =>
      getComparableStatus(issue) === ISSUE_STATUS.BLOCKED
    ).length;
    const coverage = executed ? Math.round((passed / executed) * 100) : 0;

    return { executed, passed, failed, blocked, coverage };
  }, [selectedProjectBugBoardIssues]);

  const readyForVerificationBugs = useMemo(
    () =>
      visibleIssues
        .filter((issue) => {
          const status = getComparableStatus(issue);
          return [ISSUE_STATUS.READY_FOR_QA, ISSUE_STATUS.QA, ISSUE_STATUS.FIXED, ISSUE_STATUS.TESTING].includes(status);
        })
        .slice(0, 5),
    [visibleIssues]
  );

  const bugsCreatedToday = useMemo(
    () =>
      myReportedBugs.filter((issue) => {
        const createdAt = issue?.createdAt ? new Date(issue.createdAt) : null;
        return createdAt && createdAt.toDateString() === todayKey;
      }).length,
    [myReportedBugs, todayKey]
  );

  const verifiedToday = useMemo(
    () =>
      visibleIssues.filter((issue) => {
        const status = getComparableStatus(issue);
        const updatedAt = issue?.updatedAt ? new Date(issue.updatedAt) : null;
        return (
          updatedAt &&
          updatedAt.toDateString() === todayKey &&
          [ISSUE_STATUS.CLOSED, ISSUE_STATUS.DONE].includes(status)
        );
      }).length,
    [todayKey, visibleIssues]
  );

  const criticalBugsFound = useMemo(
    () => visibleIssues.filter((issue) => String(issue?.priority || "").toLowerCase() === "critical").length,
    [visibleIssues]
  );
  const rejectedBugsCount = useMemo(
    () => visibleIssues.filter((issue) => getComparableStatus(issue) === ISSUE_STATUS.REJECTED).length,
    [visibleIssues]
  );
  const readyForQaCount = useMemo(
    () =>
      visibleIssues.filter((issue) =>
        [ISSUE_STATUS.READY_FOR_QA, ISSUE_STATUS.QA, ISSUE_STATUS.FIXED, ISSUE_STATUS.TESTING].includes(getComparableStatus(issue))
      ).length,
    [visibleIssues]
  );
  const bugSummaryStats = useMemo(
    () => [
      { label: "Total Bugs", value: reportedIssues.length, tone: "bg-blue-50 text-blue-700" },
      { label: "In Progress", value: dashboardMetrics.inProgress, tone: "bg-indigo-50 text-indigo-700" },
      { label: "Critical", value: criticalBugsFound, tone: "bg-rose-50 text-rose-700" },
      { label: "Rejected", value: rejectedBugsCount, tone: "bg-orange-50 text-orange-700" },
      { label: "Ready For Q/A", value: readyForQaCount, tone: "bg-emerald-50 text-emerald-700" },
      { label: "Closed", value: dashboardMetrics.closed, tone: "bg-slate-100 text-slate-700" },
    ],
    [criticalBugsFound, dashboardMetrics.closed, dashboardMetrics.inProgress, readyForQaCount, rejectedBugsCount, reportedIssues.length]
  );

  const testingActivity = useMemo(() => {
    const recentBugItems = myReportedBugs.slice(0, 2).map((issue) => ({
      label: `Created ${getIssueDisplayKey(issue)}`,
      meta: issue.title || "Bug reported during testing",
      Icon: Bug,
    }));

    return [
      { label: "Reviewed project testing queue", meta: `${qaProjects.length} QA projects available`, Icon: PlayCircle },
      ...recentBugItems,
      { label: readyForVerificationBugs[0] ? `Verified ${getIssueDisplayKey(readyForVerificationBugs[0])}` : "Verification queue reviewed", meta: "Ready for QA checked", Icon: ShieldCheck },
      { label: "Completed smoke testing", meta: "Core flows covered", Icon: CheckCircle2 },
    ];
  }, [myReportedBugs, qaProjects.length, readyForVerificationBugs]);

  const weekStats = [
    { label: "Testing Sessions", value: Math.max(1, assignedProjects.length) },
    { label: "Bugs Created", value: myReportedBugs.length },
    { label: "Verified", value: verifiedToday },
    { label: "Rejected Bugs", value: rejectedBugsCount },
  ];

  const handleStartTesting = (project) => {
    const configuredModules = Array.from(
      new Set([
        ...(customBuildModules[project.id] || []),
        ...(selectedTestingModule.trim() ? [selectedTestingModule.trim()] : []),
      ].filter(Boolean))
    );
    const session = {
      testerId,
      testerName,
      projectId: project.id,
      projectName: project.name,
      buildVersion: project.buildVersion,
      environment: project.environment,
      module: selectedTestingModule.trim() || "General",
      moduleDetails: testingModuleDetails.trim(),
      startedAt: new Date().toISOString(),
      modules: configuredModules,
      configuredModules,
      status: "In Progress",
    };

    window.localStorage.setItem("curecode_active_testing_session", JSON.stringify(session));
    window.localStorage.setItem("curecode_selected_qa_project", project.id);
    setSelectedQaProjectId(project.id);
    setTestingSession(session);
    setSessionNow(Date.now());
  };

  const handleSelectQaProject = (projectId) => {
    setSelectedQaProjectId(projectId);

    if (projectId) {
      window.localStorage.setItem("curecode_selected_qa_project", projectId);
    } else {
      window.localStorage.removeItem("curecode_selected_qa_project");
    }
  };

  const handleCreateBugForProject = (project) => {
    const projectId = activeSelectedSession?.status === "In Progress"
      ? activeSelectedSession.projectId
      : project.id;
    navigate(`/bugs?view=report&projectId=${encodeURIComponent(projectId)}`);
  };

  const handleStopTesting = () => {
    if (!activeSelectedSession || !sessionStartedAtMs) return;

    const stoppedAt = new Date().toISOString();
    const stoppedSession = {
      ...activeSelectedSession,
      stoppedAt,
      status: "Stopped",
      totalMs: Date.now() - sessionStartedAtMs,
    };

    window.localStorage.setItem("curecode_active_testing_session", JSON.stringify(stoppedSession));
    setTestingSession(stoppedSession);
    setSessionNow(Date.now());
  };

  const handleCycleBuildModuleStatus = (module, index) => {
    const configKey = activeTestingSession?.projectId || selectedQaProject?.id;

    if (!configKey) {
      return;
    }

    const currentStatus = getModuleStatus(module, index);
    const nextStatus = currentStatus === "pending" ? "progress" : currentStatus === "progress" ? "done" : "pending";

    setBuildModuleStatuses((statuses) => ({
      ...statuses,
      [configKey]: {
        ...(statuses[configKey] || {}),
        [module]: nextStatus,
      },
    }));
  };

  const handleAddBuildModule = () => {
    const configKey = activeTestingSession?.projectId || selectedQaProject?.id;

    if (!configKey) {
      return;
    }

    const module = (newBuildModule || selectedTestingModule).trim();

    if (!module) {
      return;
    }

    setCustomBuildModules((modulesByProject) => {
      const projectModules = modulesByProject[configKey] || [];

      if (projectModules.some((item) => item.toLowerCase() === module.toLowerCase())) {
        return modulesByProject;
      }

      return {
        ...modulesByProject,
        [configKey]: [...projectModules, module],
      };
    });
    setBuildModuleStatuses((statuses) => ({
      ...statuses,
      [configKey]: {
        ...(statuses[configKey] || {}),
        [module]: "pending",
      },
    }));
    setNewBuildModule("");
    setSelectedTestingModule(module);
  };

  const handleDeleteBuildModule = (module) => {
    const configKey = activeTestingSession?.projectId || selectedQaProject?.id;

    if (!configKey) {
      return;
    }

    setCustomBuildModules((modulesByProject) => ({
      ...modulesByProject,
      [configKey]: (modulesByProject[configKey] || []).filter((item) => item !== module),
    }));
    setBuildModuleStatuses((statuses) => {
      const nextProjectStatuses = { ...(statuses[configKey] || {}) };
      delete nextProjectStatuses[module];

      return {
        ...statuses,
        [configKey]: nextProjectStatuses,
      };
    });
  };

  const handleRefresh = async () => {
    await Promise.all([
      refetchProjects(),
      refetchIssues(),
      refetchReportedBugs(),
      refetchRecentTasks(),
    ]);
    setLastRefreshedAt(new Date());
  };

  const handleOpenReportedBug = (issueId) => {
    navigate(`/bugs?bug=${encodeURIComponent(issueId)}`);
  };

  const handleOpenNotification = async (notification) => {
    const notificationId = notification.id || notification._id;
    if (!notification.isRead) {
      try {
        await markNotificationAsRead(notificationId);
        queryClient.invalidateQueries({
          queryKey: ["issues", "notifications", testerId],
        });
        queryClient.invalidateQueries({
          queryKey: ["issues", "notifications", "unread-count", testerId],
        });
      } catch (error) {
        console.error("Failed to mark notification as read:", error);
      }
    }

    if (notification.link) {
      navigate(notification.link);
    }
  };

  const error = projectsError || issuesError || reportedBugsError;
  const isLoading = isProjectsLoading || isIssuesLoading;

  if (error) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-rose-700">
          {error.response?.data?.message || "Unable to load tester dashboard data."}
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-20 w-full rounded-[28px]" />
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={`tester-stat-${index}`} className="h-32 w-full" />
          ))}
        </section>
        <section className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
          <Skeleton className="h-[320px] w-full rounded-[28px]" />
          <Skeleton className="h-[320px] w-full rounded-[28px]" />
        </section>
        <Skeleton className="h-[430px] w-full rounded-[28px]" />
      </div>
    );
  }

  const todayQaMetricPanel = (
    <div>
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
          <TimerReset className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-base font-semibold text-slate-950">Today&apos;s Q/A Metric</h2>
          <p className="text-xs text-slate-500">
            {activeTestingSession?.projectName || selectedQaProject?.name || "Select a project to start tracking."}
          </p>
        </div>
      </div>

      {activeTestingSession || selectedQaProject ? (
        <div className="mt-3 space-y-2">
          <div className="flex items-center justify-between rounded-xl bg-slate-50/90 px-3 py-2">
            <span className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">Environment</span>
            <span className="text-sm font-semibold text-slate-900">{activeTestingSession?.environment || selectedQaProject?.environment}</span>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl bg-blue-50/70 px-3 py-2">
            <span className="text-xs font-bold uppercase tracking-[0.1em] text-blue-700">Module</span>
            <span className="min-w-0 truncate text-sm font-semibold text-slate-900">
              {activeTestingSession?.module || selectedTestingModule.trim() || "Not selected"}
            </span>
          </div>
          {(activeTestingSession?.moduleDetails || testingModuleDetails.trim()) && (
            <div className="rounded-xl bg-white/80 px-3 py-2">
              <span className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">Details</span>
              <p className="mt-1 line-clamp-3 text-xs leading-5 text-slate-600">
                {activeTestingSession?.moduleDetails || testingModuleDetails.trim()}
              </p>
            </div>
          )}
          <div className="flex items-center justify-between rounded-xl bg-slate-50/90 px-3 py-2">
            <span className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">Session</span>
            <span className={cn(
              "rounded-full px-2 py-0.5 text-xs font-bold",
              activeTestingSession?.status === "In Progress"
                ? "bg-emerald-50 text-emerald-700"
                : activeTestingSession?.status === "Stopped"
                  ? "bg-slate-100 text-slate-700"
                  : "bg-amber-50 text-amber-700"
            )}>
              {activeTestingSession?.status || "Not Started"}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-blue-50/70 p-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-blue-700">Start Time</p>
              <p className="mt-1 text-sm font-semibold text-slate-950">
                {activeTestingSession?.startedAt ? formatDateTime(activeTestingSession.startedAt) : "-"}
              </p>
            </div>
            <div className="rounded-xl bg-violet-50/70 p-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-violet-700">
                {activeTestingSession?.status === "Stopped" ? "Total Time" : "Live Time"}
              </p>
              <p className="mt-1 text-lg font-semibold text-slate-950">
                {activeTestingSession ? formatSessionDuration(sessionElapsedMs) : "-"}
              </p>
            </div>
          </div>
          <div className="rounded-xl bg-rose-50/70 p-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-rose-700">Reported Bugs In Session</p>
            <p className="mt-1 text-2xl font-semibold text-slate-950">{sessionReportedBugsCount}</p>
          </div>
          {activeTestingSession?.status === "In Progress" && (
            <Button
              className="mt-1 h-9 w-full rounded-xl bg-rose-600 text-white hover:bg-rose-700"
              onClick={handleStopTesting}
              type="button"
            >
              Stop Testing
            </Button>
          )}
        </div>
      ) : (
        <div className="mt-3 rounded-xl border border-dashed border-blue-200 bg-blue-50/50 px-3 py-5 text-center text-sm font-medium text-slate-500">
          Select a QA project to see live metrics.
        </div>
      )}
    </div>
  );

  const currentBuildPanel = (
    <WorkspaceCard>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-950">Current Build</h2>
          <p className="mt-0.5 text-xs text-slate-500">{activeTestingSession?.projectName || selectedQaProject?.name || "School Management"}</p>
        </div>
        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">
          {activeTestingSession?.buildVersion || selectedQaProject?.buildVersion || "Build"}
        </span>
      </div>

      <div className="mt-3 rounded-2xl border border-slate-200 bg-white/90 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Modules</p>
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">{moduleProgress}%</span>
        </div>
        <div className="mt-3 space-y-2">
          {currentBuildModules.length ? currentBuildModules.map((module, index) => {
            const status = getModuleStatus(module, index);
            const canDeleteModule = Boolean(customBuildModules[activeTestingSession?.projectId || selectedQaProject?.id]?.includes(module));

            return (
              <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50/90 px-3 py-2" key={module}>
                <span className="min-w-0 truncate text-sm font-semibold text-slate-800">{module}</span>
                <span className="flex shrink-0 items-center gap-1.5">
                  {canDeleteModule && (
                    <button
                      aria-label={`Delete ${module}`}
                      className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                      onClick={() => handleDeleteBuildModule(module)}
                      type="button"
                    >
                      x
                    </button>
                  )}
                  <button
                    aria-label={`Mark ${module} module status`}
                    className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full border text-xs font-bold",
                    status === "done" && "border-emerald-100 bg-emerald-50 text-emerald-600",
                    status === "progress" && "border-amber-100 bg-amber-50 text-amber-600",
                    status === "pending" && "border-slate-200 bg-white text-slate-400"
                    )}
                    onClick={() => handleCycleBuildModuleStatus(module, index)}
                    type="button"
                  >
                    {status === "done" ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : status === "progress" ? (
                      <Clock3 className="h-4 w-4" />
                    ) : (
                      <span className="h-3 w-3 rounded-full border border-current" />
                    )}
                  </button>
                </span>
              </div>
            );
          }) : (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-3 py-4 text-center text-xs font-medium text-slate-500">
              No modules configured for this session.
            </div>
          )}
        </div>
        <div className="mt-3 flex gap-2">
          <Input
            className="h-9 rounded-xl border-slate-200 bg-white text-sm"
            onChange={(event) => setNewBuildModule(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                handleAddBuildModule();
              }
            }}
            placeholder="Add module"
            value={newBuildModule}
          />
          <Button className="h-9 rounded-xl px-3" onClick={handleAddBuildModule} type="button">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Module Progress</span>
            <span>{moduleProgress}%</span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-[linear-gradient(90deg,#22C55E,#38BDF8)]" style={{ width: `${moduleProgress}%` }} />
          </div>
        </div>
      </div>
    </WorkspaceCard>
  );

  const readyForQaPanel = (
    <section>
      <WorkspaceCard>
        <div className="flex items-start justify-between gap-3 px-1">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-slate-950">Ready For QA</h2>
            <p className="mt-0.5 text-xs text-slate-600">Developer fixes waiting for QA sign-off.</p>
          </div>
          <Button className="h-8 rounded-xl border-0 bg-transparent px-2 text-blue-600 shadow-none hover:bg-blue-50 hover:text-blue-700" size="sm" variant="ghost" onClick={() => navigate("/bugs")}>
            View All
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90">
          <div className="overflow-x-auto">
            <table className="min-w-[860px] w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-100 text-[11px] font-bold text-slate-500">
                  <th className="w-[116px] px-4 py-3">Bug ID</th>
                  <th className="px-4 py-3">Title</th>
                  <th className="w-[160px] px-4 py-3">Developer</th>
                  <th className="w-[180px] px-4 py-3">Fixed Time</th>
                  <th className="w-[116px] px-4 py-3">Priority</th>
                  <th className="w-[134px] px-4 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isReportedBugsLoading ? (
                  Array.from({ length: 4 }).map((_, index) => (
                    <tr key={`verification-row-skeleton-${index}`}>
                      <td className="px-4 py-3"><Skeleton className="h-4 w-20 rounded-full" /></td>
                      <td className="px-4 py-3"><Skeleton className="h-4 w-full max-w-[320px] rounded-full" /></td>
                      <td className="px-4 py-3"><Skeleton className="h-4 w-24 rounded-full" /></td>
                      <td className="px-4 py-3"><Skeleton className="h-4 w-32 rounded-full" /></td>
                      <td className="px-4 py-3"><Skeleton className="h-6 w-16 rounded-full" /></td>
                      <td className="px-4 py-3"><Skeleton className="mx-auto h-8 w-24 rounded-full" /></td>
                    </tr>
                  ))
                ) : readyForVerificationBugs.length ? (
                  readyForVerificationBugs.slice(0, 4).map((issue) => (
                    <tr className="text-xs transition hover:bg-blue-50/35" key={issue._id}>
                      <td className="px-4 py-3 align-middle">
                        <button
                          className="font-mono font-bold text-blue-700 hover:text-blue-800"
                          onClick={() => handleOpenReportedBug(issue._id)}
                          type="button"
                        >
                          {getIssueDisplayKey(issue)}
                        </button>
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <p className="line-clamp-2 max-w-[360px] font-semibold leading-5 text-slate-950">
                          {issue.title || "Untitled bug"}
                        </p>
                      </td>
                      <td className="px-4 py-3 align-middle font-medium leading-5 text-slate-700">
                        {getAssigneeName(issue)}
                      </td>
                      <td className="px-4 py-3 align-middle font-medium text-slate-700">
                        {formatDateTime(getBugUpdatedAt(issue))}
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <TableBadge variant={getIssuePriorityVariant(issue.priority)}>
                          {issue.priority || "Medium"}
                        </TableBadge>
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <div className="flex items-center justify-center gap-2">
                          <Button
                            aria-label="Verify bug"
                            className="h-8 w-8 rounded-full border-emerald-100 bg-emerald-50 p-0 text-emerald-600 hover:bg-emerald-100"
                            size="icon"
                            variant="outline"
                            onClick={() => handleOpenReportedBug(issue._id)}
                          >
                            <CheckCircle2 className="h-4 w-4" />
                          </Button>
                          <Button
                            aria-label="Reopen bug"
                            className="h-8 w-8 rounded-full border-rose-100 bg-rose-50 p-0 text-rose-600 hover:bg-rose-100"
                            size="icon"
                            variant="outline"
                            onClick={() => handleOpenReportedBug(issue._id)}
                          >
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                          <Button
                            aria-label="View bug"
                            className="h-8 w-8 rounded-full border-slate-200 bg-white p-0 text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                            size="icon"
                            variant="outline"
                            onClick={() => handleOpenReportedBug(issue._id)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-4 py-8 text-center" colSpan={6}>
                      <CheckCircle2 className="mx-auto h-7 w-7 text-emerald-500" />
                      <p className="mt-2 text-sm font-semibold text-slate-800">Everything has been verified.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </WorkspaceCard>
    </section>
  );

  return (
    <div className="space-y-4">
      <section className="relative isolate flex flex-wrap items-center gap-3 overflow-hidden rounded-[28px] border border-blue-100/80 bg-white p-3 shadow-[0_24px_65px_-42px_rgba(37,99,235,0.65)] lg:flex-nowrap">
        <GreetingBeachScene timeOfDay={timeOfDay} />
        <div className="relative z-10 w-full min-w-0 shrink-0 sm:flex-1 lg:w-[420px] lg:flex-none xl:w-[460px]">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            aria-label="Search bugs"
            className="h-11 rounded-2xl border-slate-200/90 bg-white/86 pl-10 shadow-sm"
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search bugs"
            value={searchTerm}
          />
        </div>

        <Button
          className="interactive-button relative z-10 h-11 w-full shrink-0 rounded-2xl border border-indigo-300/30 bg-[linear-gradient(90deg,#2563EB_0%,#6366F1_55%,#8B5CF6_100%)] px-4 text-white shadow-[0_14px_28px_-18px_rgba(99,102,241,0.82)] hover:brightness-105 sm:w-auto sm:px-5"
          onClick={() =>
            selectedQaProject
              ? handleCreateBugForProject(selectedQaProject)
              : navigate("/bugs?view=report")
          }
          type="button"
        >
          <Plus className="h-4 w-4" />
          New Bug
        </Button>

        <div className="relative z-10 min-w-[240px] flex-1 px-3 py-1 [text-shadow:0_1px_12px_rgba(255,255,255,0.9)] lg:text-right">
          <p className="text-xl font-semibold tracking-tight text-slate-950">
            {greeting},{" "}
            <span className="inline-flex rounded-lg bg-gradient-to-r from-indigo-600 to-violet-500 px-2.5 py-0.5 text-white shadow-[0_8px_20px_-10px_rgba(99,102,241,0.9)]">
              {testerName}
            </span>
          </p>
          <p className="mt-1 text-sm font-medium text-slate-700">
            Welcome back. Here’s what’s happening with your QA work today.
          </p>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_306px]">
        <div className="min-w-0 space-y-4">
          <WorkspaceCard className="border-blue-100 bg-[linear-gradient(135deg,#ffffff_0%,#f7fbff_52%,#f4f0ff_100%)]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <Badge className="border-blue-200 bg-blue-50 text-blue-700" variant="outline">
                  My QA Projects
                </Badge>
              </div>
              <div className="rounded-2xl border border-blue-100 bg-white/72 px-3 py-2 text-right shadow-sm">
                <p className="text-xl font-semibold text-slate-950">{qaProjects.length}</p>
                <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400">Projects</p>
              </div>
            </div>

            {qaProjects.length ? (
              <div className="mt-4">
                <section className="rounded-[18px] border border-blue-100 bg-white/78 p-4 shadow-sm">
                  <div className="relative">
                    <span className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                      QA Project
                    </span>
                    <button
                      aria-expanded={isQaProjectDropdownOpen}
                      aria-haspopup="listbox"
                      className="mt-2 flex h-11 w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-3 text-left text-sm font-semibold text-slate-800 shadow-sm outline-none transition hover:border-blue-200 focus:border-blue-300 focus:ring-2 focus:ring-blue-500/20"
                      onClick={() => setIsQaProjectDropdownOpen((open) => !open)}
                      type="button"
                    >
                      <span className={cn("min-w-0 truncate", !selectedQaProject && "text-slate-400")}>
                        {selectedQaProject
                          ? selectedQaProject.name
                          : "Select a QA project"}
                      </span>
                      <ChevronRight
                        className={cn(
                          "h-4 w-4 shrink-0 text-slate-400 transition",
                          isQaProjectDropdownOpen && "rotate-90 text-blue-600"
                        )}
                      />
                    </button>

                    {isQaProjectDropdownOpen && (
                      <div
                        className="absolute left-0 right-0 top-[calc(100%+8px)] z-50 overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-[0_24px_54px_-28px_rgba(15,23,42,0.34)]"
                        role="listbox"
                      >
                        <button
                          className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm font-semibold text-slate-500 transition hover:bg-blue-50"
                          onClick={() => {
                            handleSelectQaProject("");
                            setIsQaProjectDropdownOpen(false);
                          }}
                          role="option"
                          type="button"
                        >
                          Select a QA project
                        </button>
                        <div className="max-h-[292px] overflow-y-auto p-1">
                          {qaProjects.map((project) => (
                            <button
                              className={cn(
                                "flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-blue-50",
                                project.readyForQaCount > 0 && "border border-rose-200 bg-rose-50/70 hover:bg-rose-50",
                                selectedQaProjectId === project.id && (project.readyForQaCount > 0 ? "bg-rose-50 ring-1 ring-rose-200" : "bg-blue-50")
                              )}
                              key={project.id}
                              onClick={() => {
                                handleSelectQaProject(project.id);
                                setIsQaProjectDropdownOpen(false);
                              }}
                              role="option"
                              type="button"
                            >
                              <span className="min-w-0">
                                <span className="block truncate text-sm font-semibold text-slate-900">
                                  {project.name}
                                </span>
                                <span className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                                  <span>{project.buildVersion}</span>
                                  <span className="h-1 w-1 rounded-full bg-slate-300" />
                                  <span>{project.environment}</span>
                                </span>
                              </span>
                              <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold", project.status.tone)}>
                                {project.readyForQaCount > 0 ? `${project.readyForQaCount} Ready Q/A` : project.status.label}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {selectedQaProject ? (
                    <div
                      className={cn(
                        "mt-4 rounded-[18px] border bg-slate-50/72 p-4",
                        selectedQaProject.readyForQaCount > 0
                          ? "border-rose-200 bg-rose-50/55 shadow-[0_18px_40px_-34px_rgba(225,29,72,0.5)]"
                          : "border-slate-200/80"
                      )}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-3">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-50 to-violet-50 text-sm font-bold text-blue-700">
                            {selectedQaProject.key.slice(0, 2)}
                          </div>
                          <div className="min-w-0">
                            <h3 className="truncate text-lg font-semibold text-slate-950">
                              {selectedQaProject.name}
                            </h3>
                            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                              <span>Build: <strong className="text-slate-900">{selectedQaProject.buildVersion}</strong></span>
                              <span>Env: <strong className="text-slate-900">{selectedQaProject.environment}</strong></span>
                              <span>Uploaded: <strong className="text-slate-900">{selectedQaProject.uploadedTime}</strong></span>
                            </div>
                          </div>
                        </div>
                        <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold", selectedQaProject.status.tone)}>
                          <span className={cn("h-2 w-2 rounded-full", selectedQaProject.status.dot)} />
                          {selectedQaProject.readyForQaCount > 0
                            ? `${selectedQaProject.readyForQaCount} Ready For Q/A`
                            : selectedQaProject.status.label}
                        </span>
                      </div>

                      <div className="mt-4 rounded-2xl border border-slate-200/80 bg-white/82 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <label className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500" htmlFor="qa-testing-module">
                            Module Configuration
                          </label>
                          <span className="text-[11px] font-semibold text-slate-400">Manual setup</span>
                        </div>
                        <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                          <Input
                            className="h-10 rounded-xl border-slate-200 bg-white"
                            id="qa-testing-module"
                            list="qa-testing-module-options"
                            onChange={(event) => setSelectedTestingModule(event.target.value)}
                            placeholder="Module name"
                            value={selectedTestingModule}
                          />
                          <Button className="h-10 rounded-xl px-3" onClick={handleAddBuildModule} type="button">
                            <Plus className="h-4 w-4" />
                            Add
                          </Button>
                        </div>
                        <datalist id="qa-testing-module-options">
                          {testingModuleOptions.map((module) => (
                            <option key={module} value={module} />
                          ))}
                        </datalist>
                        <Textarea
                          className="mt-2 min-h-[78px] resize-none rounded-xl border-slate-200 bg-white text-sm shadow-none"
                          onChange={(event) => setTestingModuleDetails(event.target.value)}
                          placeholder="Add module details, scope, device/browser notes, or test focus"
                          value={testingModuleDetails}
                        />
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {((customBuildModules[selectedQaProject.id] || []).length
                            ? customBuildModules[selectedQaProject.id]
                            : ["No modules configured yet"]).map((module) => (
                            <span className="inline-flex items-center gap-1 rounded-full border border-blue-100 bg-blue-50/70 px-2.5 py-1 text-[11px] font-semibold text-slate-600" key={module}>
                              {module}
                              {module !== "No modules configured yet" && (
                                <button
                                  aria-label={`Delete ${module}`}
                                  className="ml-1 text-slate-400 hover:text-rose-600"
                                  onClick={() => handleDeleteBuildModule(module)}
                                  type="button"
                                >
                                  x
                                </button>
                              )}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="mt-4">
                        <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                          <span>Progress</span>
                          <span>{selectedQaProject.progress}%</span>
                        </div>
                        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white">
                          <div className="h-full rounded-full bg-[linear-gradient(90deg,#2563EB,#8B5CF6)]" style={{ width: `${selectedQaProject.progress}%` }} />
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button
                          className={cn(
                            "h-9 rounded-xl px-4 text-white",
                            selectedQaProject.readyForQaCount > 0
                              ? "bg-rose-600 hover:bg-rose-700"
                              : "bg-blue-600 hover:bg-blue-700"
                          )}
                          onClick={() => handleStartTesting(selectedQaProject)}
                          type="button"
                        >
                          <PlayCircle className="h-4 w-4" />
                          Configure
                        </Button>
                        <Button className="h-9 rounded-xl px-3" variant="ghost" onClick={() => document.getElementById("qa-testing-module")?.focus()} type="button">
                          Edit
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 flex min-h-[150px] flex-col items-center justify-center rounded-[18px] border border-dashed border-blue-200 bg-blue-50/45 px-4 text-center">
                      <FolderKanban className="h-8 w-8 text-blue-400" />
                      <p className="mt-3 text-sm font-semibold text-slate-800">Select a project to view testing controls.</p>
                      <p className="mt-1 text-xs text-slate-500">Assigned project details are listed on the right.</p>
                    </div>
                  )}
                </section>
              </div>
            ) : (
              <div className="mt-6 flex min-h-[220px] flex-col items-center justify-center rounded-[18px] border border-dashed border-blue-200 bg-blue-50/50 px-6 text-center">
                <Rocket className="h-10 w-10 text-blue-400" />
                <h2 className="mt-4 text-xl font-semibold text-slate-950">No Active Testing</h2>
                <p className="mt-2 text-sm text-slate-600">Click Start Session to begin.</p>
              </div>
            )}
          </WorkspaceCard>

          {selectedQaProject && (
            <QAGitActivityPanel
              projects={qaProjects}
              selectedProject={selectedQaProject}
              onSelectProject={(projectId) => {
                if (projectId) {
                  setSelectedQaProjectId(projectId);
                }
              }}
              onStartTesting={(project) => {
                const projectModel = project?.raw ? project : qaProjects.find((item) => item.id === project?.id) || selectedQaProject;
                handleStartTesting(projectModel);
                document.getElementById("qa-testing-module")?.focus();
              }}
            />
          )}

          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
            <WorkspaceKpiCard
              Icon={PlayCircle}
              description="Active tester sessions"
              label="Testing Sessions"
              tone="blue"
              value={Math.max(1, assignedProjects.length)}
            />
            <WorkspaceKpiCard
              Icon={RotateCcw}
              description="Returned for developer fixes"
              label="Rejected Bugs"
              tone="orange"
              value={rejectedBugsCount}
            />
            <WorkspaceKpiCard
              Icon={Bug}
              description="Created during today's testing"
              label="Bugs Created Today"
              tone="red"
              value={bugsCreatedToday}
            />
            <WorkspaceKpiCard
              Icon={ShieldCheck}
              description="Waiting for QA verification"
              label="Ready For Verification"
              tone="orange"
              value={readyForVerificationBugs.length}
            />
            <WorkspaceKpiCard
              Icon={CheckCircle2}
              description="Closed or done today"
              label="Verified Today"
              tone="green"
              value={verifiedToday}
            />
            <WorkspaceKpiCard
              Icon={AlertTriangle}
              description="Critical issues found"
              label="Critical Bugs Found"
              tone="red"
              value={criticalBugsFound}
            />
          </section>

          {readyForQaPanel}

          <section className="grid items-start gap-4 xl:grid-cols-[0.9fr_1.1fr]">
            <WorkspaceCard>
              <h2 className="text-base font-semibold tracking-tight text-slate-950">Recent Testing Activity</h2>
              <div className="mt-3 space-y-2">
                {testingActivity.map((item, index) => {
                  const ItemIcon = item.Icon;

                  return (
                    <div className="relative flex min-h-[50px] gap-3" key={`${item.label}-${index}`}>
                      {index < testingActivity.length - 1 && (
                        <span className="absolute left-4 top-9 h-[calc(100%+4px)] w-px bg-blue-100" />
                      )}
                      <span className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                        <ItemIcon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-950">{item.label}</p>
                        <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{item.meta}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </WorkspaceCard>

            <WorkspaceCard>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold tracking-tight text-slate-950">Bug Summary</h2>
                  <p className="mt-0.5 text-xs text-slate-500">Reported bug flow at a glance.</p>
                </div>
                <Button className="h-8 rounded-xl" size="sm" variant="outline" onClick={() => navigate("/bugs")}>
                  Open Board
                </Button>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {bugSummaryStats.map((item) => (
                  <div className="min-h-[88px] rounded-2xl border border-slate-200/80 bg-white/82 p-3" key={item.label}>
                    <div className={cn("inline-flex rounded-xl px-2 py-1 text-[11px] font-bold", item.tone)}>
                      {item.label}
                    </div>
                    <p className="mt-1.5 text-2xl font-semibold tracking-tight text-slate-950">{item.value}</p>
                  </div>
                ))}
              </div>
            </WorkspaceCard>
          </section>
        </div>

        <aside className="space-y-4">
          <WorkspaceCard>
            {todayQaMetricPanel}
          </WorkspaceCard>

          {currentBuildPanel}

          <WorkspaceCard>
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                <ClipboardCheck className="h-4 w-4" />
              </span>
              <div>
                <h2 className="text-base font-semibold text-slate-950">Daily Notes</h2>
                <p className="text-xs text-slate-500">Capture important QA notes for today.</p>
              </div>
            </div>
            <Textarea
              className="mt-3 min-h-[132px] resize-none rounded-xl border-blue-100 bg-blue-50/45 text-sm leading-6 shadow-none focus-visible:border-blue-300 focus-visible:ring-4 focus-visible:ring-blue-500/10"
              value={dailyNote}
              onChange={(event) => setDailyNote(event.target.value)}
              placeholder="Write testing blockers, handoff notes, environment issues, or anything important..."
            />
            <p className="mt-2 text-[11px] font-medium text-slate-500">
              Saved for {formatDate(new Date())}
            </p>
          </WorkspaceCard>

          <WorkspaceCard>
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50 text-violet-700">
                <CalendarDays className="h-4 w-4" />
              </span>
              <div>
                <h2 className="text-base font-semibold text-slate-950">Today&apos;s Assigned Tasks</h2>
                <p className="text-xs text-slate-500">Tasks assigned to you for today.</p>
              </div>
            </div>
            <div className="mt-3 space-y-2">
              {isRecentTasksLoading ? (
                Array.from({ length: 2 }).map((_, index) => (
                  <Skeleton className="h-[86px] rounded-xl" key={`today-task-skeleton-${index}`} />
                ))
              ) : recentTasksError ? (
                <div className="rounded-xl border border-rose-100 bg-rose-50/70 px-3 py-3 text-xs font-medium leading-5 text-rose-700">
                  Unable to load today&apos;s assigned tasks.
                </div>
              ) : todaysAssignedTasks.length ? (
                todaysAssignedTasks.slice(0, 4).map((task) => (
                  <button
                    className="w-full rounded-xl border border-slate-200/80 bg-white/84 p-3 text-left transition hover:border-blue-200 hover:bg-blue-50/45"
                    key={task._id}
                    onClick={() => navigate(`/tasks?taskId=${encodeURIComponent(task._id)}`)}
                    type="button"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="line-clamp-1 text-sm font-semibold text-slate-900">
                        {task.title || "Untitled task"}
                      </p>
                      <Badge className="shrink-0" variant={getIssuePriorityVariant(task.priority)}>
                        {task.priority || "Medium"}
                      </Badge>
                    </div>
                    <p className="mt-1 line-clamp-1 text-xs text-slate-500">
                      {getProjectName(task, assignedProjects)} / {getIssueStatusLabel(task.status)}
                    </p>
                  </button>
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-violet-200 bg-violet-50/45 px-3 py-5 text-center text-xs font-medium leading-5 text-slate-500">
                  No assigned tasks for today.
                </div>
              )}
            </div>
          </WorkspaceCard>

          <WorkspaceCard>
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-50 text-orange-700">
                <ClipboardCheck className="h-4 w-4" />
              </span>
              <h2 className="text-base font-semibold text-slate-950">My Week</h2>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {weekStats.map((item) => (
                <div className="rounded-xl bg-slate-50/90 p-3" key={item.label}>
                  <p className="text-xl font-semibold text-slate-950">{item.value}</p>
                  <p className="mt-0.5 text-[11px] font-semibold leading-4 text-slate-500">{item.label}</p>
                </div>
              ))}
            </div>
          </WorkspaceCard>
        </aside>
      </section>

    </div>
  );
};

export default TesterDashboardPage;
