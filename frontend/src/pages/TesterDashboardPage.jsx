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
  Database,
  Download,
  ExternalLink,
  FileText,
  FolderKanban,
  GaugeCircle,
  History,
  ListChecks,
  Megaphone,
  PauseCircle,
  PlayCircle,
  Plus,
  RefreshCcw,
  RotateCcw,
  Rocket,
  Search,
  Server,
  ShieldCheck,
  Sparkles,
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
import { getProjectTeams, resolveUserId } from "@/lib/project-teams";
import { hasTesterPanelAccess } from "@/lib/roles";
import { cn, formatDate, formatDateTime } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { readStoredSession } from "@/lib/session";
import { getChatSocket } from "@/lib/socket";
import EmptyState from "@/components/shared/EmptyState";
import NotificationCard from "@/components/dashboard/NotificationCard";
import GreetingBeachScene from "@/components/dashboard/GreetingBeachScene";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

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

const isTesterTeam = (team, testerId) =>
  (team?.members || []).some((member) => resolveUserId(member) === testerId);

const getAssignedTeamsForTester = (project, testerId) =>
  getProjectTeams(project).filter((team) => isTesterTeam(team, testerId));

const buildTesterProject = (project, testerId) => {
  const assignedTeams = getAssignedTeamsForTester(project, testerId);

  if (!assignedTeams.length) {
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
      "overflow-hidden rounded-[18px] border border-slate-200/80 bg-white/92 shadow-[0_18px_46px_-36px_rgba(15,23,42,0.36)] backdrop-blur-xl",
      className
    )}
  >
    <CardContent className="p-5">{children}</CardContent>
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
    <div className="group min-h-[118px] rounded-[18px] border border-slate-200/80 bg-white/90 p-4 shadow-[0_16px_38px_-34px_rgba(15,23,42,0.32)] transition duration-200 hover:-translate-y-1 hover:border-blue-200 hover:bg-blue-50/35 hover:shadow-[0_22px_48px_-34px_rgba(37,99,235,0.42)]">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
          {label}
        </p>
        <span className={cn("flex h-10 w-10 items-center justify-center rounded-2xl border", tones[tone])}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
        {value}
      </p>
      <p className="mt-1 text-sm leading-5 text-slate-600">{description}</p>
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

const getQaProjectStatusMeta = (project, projectIssues = []) => {
  const explicitStatus = String(project?.qaStatus || project?.testingStatus || project?.buildStatus || "").toLowerCase();
  const readyForQaCount = projectIssues.filter((issue) =>
    [ISSUE_STATUS.READY_FOR_QA, ISSUE_STATUS.QA, ISSUE_STATUS.FIXED, ISSUE_STATUS.TESTING].includes(getComparableStatus(issue))
  ).length;
  const hasBuild = Boolean(project?.currentBuild || project?.buildVersion || project?.version || project?.lastBuildVersion);

  if (readyForQaCount || explicitStatus.includes("verification")) {
    return {
      key: "verification",
      label: "Ready For Verification",
      action: "Open Verification",
      tone: "border-blue-200 bg-blue-50 text-blue-700",
      dot: "bg-blue-500",
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
      label: "Waiting For Build",
      action: "Waiting For Build",
      tone: "border-slate-200 bg-slate-50 text-slate-500",
      dot: "bg-slate-300",
      disabled: true,
    };
  }

  return {
    key: "ready",
    label: "Ready For Testing",
    action: "Start Testing",
    tone: "border-emerald-200 bg-emerald-50 text-emerald-700",
    dot: "bg-emerald-500",
  };
};

const QaProjectCard = ({ onCreateBug, onOpen, onReleaseNotes, onStart, project }) => {
  const Icon = project.status.key === "verification" ? ShieldCheck : project.status.key === "waiting" ? Clock3 : PlayCircle;

  return (
    <article className="group rounded-[20px] border border-slate-200/80 bg-white/92 p-5 shadow-[0_18px_44px_-36px_rgba(15,23,42,0.36)] transition duration-200 hover:-translate-y-1 hover:border-blue-200 hover:bg-blue-50/35 hover:shadow-[0_24px_54px_-34px_rgba(37,99,235,0.42)]">
      <div className="flex items-start gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[18px] bg-gradient-to-br from-blue-50 to-violet-50 text-base font-bold text-blue-700">
          {project.key.slice(0, 2)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <h3 className="line-clamp-1 text-lg font-semibold tracking-tight text-slate-950">
              {project.name}
            </h3>
            <span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold", project.status.tone)}>
              <span className={cn("h-2 w-2 rounded-full", project.status.dot)} />
              {project.status.label}
            </span>
          </div>
          <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
            <span className="truncate">Build: <strong className="font-semibold text-slate-900">{project.buildVersion}</strong></span>
            <span className="truncate">Env: <strong className="font-semibold text-slate-900">{project.environment}</strong></span>
            <span className="truncate sm:col-span-2">Uploaded: <strong className="font-semibold text-slate-900">{project.uploadedTime}</strong></span>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {project.modules.map((module) => (
          <span className="rounded-full border border-blue-100 bg-blue-50/55 px-3 py-1 text-xs font-semibold text-slate-600" key={module}>
            {module}
          </span>
        ))}
      </div>

      <div className="mt-5">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
          <span>Progress</span>
          <span>{project.progress}%</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-[linear-gradient(90deg,#2563EB,#8B5CF6)] transition-all" style={{ width: `${project.progress}%` }} />
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <Button
          className="h-10 rounded-2xl bg-blue-600 px-4 text-white hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-500"
          disabled={project.status.disabled}
          onClick={() => onStart(project)}
          type="button"
        >
          <Icon className="h-4 w-4" />
          {project.status.action}
        </Button>
        {project.status.key === "progress" ? (
          <>
            <Button className="h-10 rounded-2xl" variant="outline" onClick={() => onCreateBug(project)} type="button">
              <Bug className="h-4 w-4" />
              Create Bug
            </Button>
            <Button className="h-10 rounded-2xl" variant="outline" onClick={() => onStart(project)} type="button">
              Finish Testing
            </Button>
          </>
        ) : (
          <>
            <Button className="h-10 rounded-2xl" variant="outline" onClick={() => onOpen(project)} type="button">
              View Build
            </Button>
            <Button className="h-10 rounded-2xl" variant="ghost" onClick={() => onReleaseNotes(project)} type="button">
              Release Notes
            </Button>
          </>
        )}
      </div>
    </article>
  );
};

const QuickActionButton = ({ children, Icon, onClick, primary = false }) => (
  <Button
    className={cn(
      "h-11 rounded-2xl px-4 shadow-sm transition hover:-translate-y-0.5",
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
  const isTester = hasTesterPanelAccess(user?.role);
  const [searchTerm, setSearchTerm] = useState("");
  const [projectFilter, setProjectFilter] = useState("all");
  const [lastRefreshedAt, setLastRefreshedAt] = useState(() => new Date());

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

  const assignedProjects = useMemo(
    () =>
      projects
        .map((project) => buildTesterProject(project, testerId))
        .filter(Boolean),
    [projects, testerId]
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
  const qaProjects = useMemo(
    () =>
      assignedProjects.map((project) => {
        const projectId = String(project._id);
        const projectIssues = issues.filter((issue) => resolveIssueProjectId(issue) === projectId);
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
      { key: "waiting", title: "Waiting For Build", projects: qaProjects.filter((project) => project.status.key === "waiting") },
      { key: "completed", title: "Testing Completed", projects: qaProjects.filter((project) => project.status.key === "completed") },
    ].filter((group) => group.projects.length),
    [qaProjects]
  );

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

  const testingModules = ["Login", "Dashboard", "Reports", "Payment", "Attendance"];
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

  const qaEnvironments = [
    { name: "QA", status: "Healthy", tone: "bg-emerald-500" },
    { name: "UAT", status: "Maintenance", tone: "bg-amber-500" },
    { name: "Staging", status: "Healthy", tone: "bg-emerald-500" },
    { name: "API", status: issuesError ? "Offline" : "Healthy", tone: issuesError ? "bg-rose-500" : "bg-emerald-500" },
    { name: "Database", status: "Healthy", tone: "bg-emerald-500" },
  ];

  const weekStats = [
    { label: "Testing Sessions", value: Math.max(1, assignedProjects.length) },
    { label: "Bugs Created", value: myReportedBugs.length },
    { label: "Verified", value: verifiedToday },
    { label: "Avg Testing Time", value: "2h 15m" },
  ];

  const handleStartTesting = (project) => {
    const session = {
      testerId,
      testerName,
      projectId: project.id,
      projectName: project.name,
      buildVersion: project.buildVersion,
      environment: project.environment,
      startedAt: new Date().toISOString(),
      modules: project.modules,
      status: "In Progress",
    };

    window.localStorage.setItem("curecode_active_testing_session", JSON.stringify(session));
    navigate(`/tester/testing/${encodeURIComponent(project.id)}`, { state: { session } });
  };

  const handleOpenBuild = (project) => {
    navigate(`/tester/testing/${encodeURIComponent(project.id)}`, {
      state: {
        session: {
          projectId: project.id,
          projectName: project.name,
          buildVersion: project.buildVersion,
          environment: project.environment,
          modules: project.modules,
          status: project.status.label,
        },
      },
    });
  };

  const handleCreateBugForProject = (project) => {
    navigate(`/bugs?view=report&projectId=${encodeURIComponent(project.id)}`);
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

  if (!assignedProjects.length) {
    return (
      <EmptyState
        title="No assigned projects yet"
        description="Once an admin adds you to a project team, your tester dashboard metrics will appear here."
        icon={<FolderKanban className="h-5 w-5" />}
      />
    );
  }

  return (
    <div className="space-y-5">
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
          onClick={() => navigate("/bugs?view=report")}
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

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          <WorkspaceCard className="border-blue-100 bg-[linear-gradient(135deg,#ffffff_0%,#f7fbff_52%,#f4f0ff_100%)]">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <Badge className="border-blue-200 bg-blue-50 text-blue-700" variant="outline">
                  My QA Projects
                </Badge>
                <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
                  Choose a project to test
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                  Start a build session, continue active testing, or open the verification queue for developer fixes.
                </p>
              </div>
              <div className="rounded-2xl border border-blue-100 bg-white/72 px-4 py-3 text-right shadow-sm">
                <p className="text-2xl font-semibold text-slate-950">{qaProjects.length}</p>
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">Projects</p>
              </div>
            </div>

            {qaProjectGroups.length ? (
              <div className="mt-6 space-y-7">
                {qaProjectGroups.map((group) => (
                  <section key={group.key}>
                    <div className="mb-3 flex items-center gap-3">
                      <h3 className="text-sm font-bold uppercase tracking-[0.12em] text-slate-500">
                        {group.title}
                      </h3>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">
                        {group.projects.length}
                      </span>
                    </div>
                    <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
                      {group.projects.map((project) => (
                        <QaProjectCard
                          key={project.id}
                          onCreateBug={handleCreateBugForProject}
                          onOpen={handleOpenBuild}
                          onReleaseNotes={handleOpenBuild}
                          onStart={handleStartTesting}
                          project={project}
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <div className="mt-6 flex min-h-[220px] flex-col items-center justify-center rounded-[18px] border border-dashed border-blue-200 bg-blue-50/50 px-6 text-center">
                <Rocket className="h-10 w-10 text-blue-400" />
                <h2 className="mt-4 text-xl font-semibold text-slate-950">No Active Testing</h2>
                <p className="mt-2 text-sm text-slate-600">Click Start Testing Session to begin.</p>
              </div>
            )}
          </WorkspaceCard>

          <section className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            <WorkspaceKpiCard
              Icon={PlayCircle}
              description="Active tester sessions"
              label="Testing Sessions"
              tone="blue"
              value={Math.max(1, assignedProjects.length)}
            />
            <WorkspaceKpiCard
              Icon={Clock3}
              description="Focused testing time"
              label="Testing Duration"
              tone="purple"
              value="2h 15m"
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

          <section className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
            <WorkspaceCard>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold tracking-tight text-slate-950">Ready For Verification</h2>
                  <p className="mt-1 text-sm text-slate-600">Developer fixes waiting for QA sign-off.</p>
                </div>
                <Button className="rounded-2xl" size="sm" variant="outline" onClick={() => navigate("/bugs")}>
                  View All
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              <div className="mt-5 space-y-3">
                {isReportedBugsLoading ? (
                  Array.from({ length: 3 }).map((_, index) => (
                    <Skeleton className="h-20 rounded-2xl" key={`verification-skeleton-${index}`} />
                  ))
                ) : readyForVerificationBugs.length ? (
                  readyForVerificationBugs.map((issue) => (
                    <div
                      className="rounded-2xl border border-slate-200/80 bg-white/86 p-4 transition hover:border-blue-200 hover:bg-blue-50/45"
                      key={issue._id}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xs font-bold text-blue-700">{getIssueDisplayKey(issue)}</span>
                            <TableBadge variant={getIssuePriorityVariant(issue.priority)}>
                              {issue.priority || "Medium"}
                            </TableBadge>
                          </div>
                          <h3 className="mt-2 line-clamp-1 text-sm font-semibold text-slate-950">
                            {issue.title || "Untitled bug"}
                          </h3>
                          <p className="mt-1 text-xs text-slate-500">
                            {getProjectName(issue, assignedProjects)} - {getAssigneeName(issue)} - {getBugUpdatedAt(issue) ? formatDateTime(getBugUpdatedAt(issue)) : "Recently fixed"}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button className="h-9 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700" size="sm" onClick={() => handleOpenReportedBug(issue._id)}>
                            Verify
                          </Button>
                          <Button className="h-9 rounded-xl" size="sm" variant="outline" onClick={() => handleOpenReportedBug(issue._id)}>
                            Reopen
                          </Button>
                          <Button className="h-9 rounded-xl" size="sm" variant="ghost" onClick={() => handleOpenReportedBug(issue._id)}>
                            View
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-[18px] border border-dashed border-emerald-200 bg-emerald-50/60 p-8 text-center">
                    <CheckCircle2 className="mx-auto h-9 w-9 text-emerald-500" />
                    <p className="mt-3 text-sm font-semibold text-slate-800">Everything has been verified.</p>
                  </div>
                )}
              </div>
            </WorkspaceCard>
          </section>

          <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
            <WorkspaceCard>
              <h2 className="text-lg font-semibold tracking-tight text-slate-950">Recent Testing Activity</h2>
              <div className="mt-5 space-y-4">
                {testingActivity.map((item, index) => {
                  const ItemIcon = item.Icon;

                  return (
                    <div className="relative flex gap-3" key={`${item.label}-${index}`}>
                      {index < testingActivity.length - 1 && (
                        <span className="absolute left-5 top-10 h-[calc(100%+8px)] w-px bg-blue-100" />
                      )}
                      <span className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
                        <ItemIcon className="h-5 w-5" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-950">{item.label}</p>
                        <p className="mt-1 line-clamp-1 text-sm text-slate-500">{item.meta}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </WorkspaceCard>

            <WorkspaceCard>
              <h2 className="text-lg font-semibold tracking-tight text-slate-950">Quick Navigation</h2>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {[
                  ["Open Bug Board", Bug, "/bugs"],
                  ["Testing History", History, "/reports"],
                  ["Verification Queue", ShieldCheck, "/bugs"],
                  ["Reports", GaugeCircle, "/reports"],
                  ["Recent Builds", Rocket, "/backlog"],
                ].map(([label, Icon, path]) => (
                  <button
                    className="group flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white/82 p-4 text-left transition hover:-translate-y-0.5 hover:border-blue-200 hover:bg-blue-50/55"
                    key={label}
                    onClick={() => navigate(path)}
                    type="button"
                  >
                    <span className="flex items-center gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-700">
                        <Icon className="h-5 w-5" />
                      </span>
                      <span className="font-semibold text-slate-800">{label}</span>
                    </span>
                    <ChevronRight className="h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-blue-600" />
                  </button>
                ))}
              </div>
            </WorkspaceCard>
          </section>
        </div>

        <aside className="space-y-6">
          <WorkspaceCard>
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
                <Server className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-semibold text-slate-950">QA Environment</h2>
                <p className="text-sm text-slate-500">Live test lane health.</p>
              </div>
            </div>
            <div className="mt-5 space-y-3">
              {qaEnvironments.map((environment) => (
                <div className="flex items-center justify-between rounded-2xl bg-slate-50/90 px-4 py-3" key={environment.name}>
                  <span className="flex items-center gap-3 font-semibold text-slate-800">
                    <span className={cn("h-2.5 w-2.5 rounded-full", environment.tone)} />
                    {environment.name}
                  </span>
                  <span className="text-sm text-slate-500">{environment.status}</span>
                </div>
              ))}
            </div>
          </WorkspaceCard>

          <WorkspaceCard>
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
                <Megaphone className="h-5 w-5" />
              </span>
              <h2 className="text-lg font-semibold text-slate-950">QA Lead Announcements</h2>
            </div>
            <div className="mt-5 space-y-3">
              {["Regression testing starts tomorrow", "Payment module ready", "Release scheduled Friday", "OTP verification mandatory"].map((announcement) => (
                <div className="rounded-2xl border border-blue-100 bg-blue-50/55 px-4 py-3 text-sm font-medium text-slate-700" key={announcement}>
                  {announcement}
                </div>
              ))}
            </div>
          </WorkspaceCard>

          <WorkspaceCard>
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-50 text-violet-700">
                <CalendarDays className="h-5 w-5" />
              </span>
              <h2 className="text-lg font-semibold text-slate-950">Upcoming Releases</h2>
            </div>
            <div className="mt-5 space-y-3">
              {[
                ["Smoke Release", qaProjects[0]?.buildVersion || "QA-2026.08", "Friday", "Ready"],
                ["Regression Pack", "REG-2026.08", "Next week", "Planned"],
              ].map(([name, version, date, status]) => (
                <div className="rounded-2xl border border-slate-200/80 bg-white/84 p-4" key={name}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-slate-900">{name}</p>
                    <Badge className="border-blue-200 bg-blue-50 text-blue-700" variant="outline">{status}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">{version} - {date}</p>
                </div>
              ))}
            </div>
          </WorkspaceCard>

          <WorkspaceCard>
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-50 text-orange-700">
                <ClipboardCheck className="h-5 w-5" />
              </span>
              <h2 className="text-lg font-semibold text-slate-950">My Week</h2>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              {weekStats.map((item) => (
                <div className="rounded-2xl bg-slate-50/90 p-4" key={item.label}>
                  <p className="text-2xl font-semibold text-slate-950">{item.value}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">{item.label}</p>
                </div>
              ))}
            </div>
          </WorkspaceCard>
        </aside>
      </section>

      <div className="fixed bottom-5 right-5 z-30 flex flex-col items-end gap-2">
        <div className="hidden flex-col gap-2 rounded-[18px] border border-blue-100 bg-white/92 p-2 shadow-[0_18px_48px_-24px_rgba(15,23,42,0.34)] backdrop-blur-xl md:flex">
          <QuickActionButton Icon={Bug} onClick={() => navigate("/bugs?view=report")}>Create Bug</QuickActionButton>
          <QuickActionButton Icon={PlayCircle} onClick={() => navigate("/bugs?view=report")}>Continue Testing</QuickActionButton>
          <QuickActionButton Icon={ShieldCheck} onClick={() => navigate("/bugs")}>Verification Queue</QuickActionButton>
          <QuickActionButton Icon={ListChecks} onClick={() => navigate("/bugs")}>Bug Board</QuickActionButton>
          <QuickActionButton Icon={History} onClick={() => navigate("/reports")}>Testing History</QuickActionButton>
        </div>
        <Button
          aria-label="Create bug"
          className="h-14 w-14 rounded-full bg-[linear-gradient(135deg,#2563EB,#8B5CF6)] p-0 text-white shadow-[0_20px_42px_-18px_rgba(37,99,235,0.8)] hover:brightness-105 md:hidden"
          onClick={() => navigate("/bugs?view=report")}
          type="button"
        >
          <Plus className="h-6 w-6" />
        </Button>
      </div>
    </div>
  );
};

export default TesterDashboardPage;
