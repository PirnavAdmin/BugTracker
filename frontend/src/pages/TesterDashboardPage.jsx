import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Bell,
  Bug,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FolderKanban,
  PauseCircle,
  Plus,
  RefreshCcw,
  RotateCcw,
  Search,
  TimerReset,
  Trophy,
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
  normalizeBugStatusForIssue,
  normalizeIssueStatus,
  resolveBugDetails,
  resolveIssueProjectId,
} from "@/lib/issues";
import { getProjectTeams, resolveUserId } from "@/lib/project-teams";
import { ROLE_TESTER } from "@/lib/roles";
import { cn, formatDate, formatDateTime } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { readStoredSession } from "@/lib/session";
import { getChatSocket } from "@/lib/socket";
import EmptyState from "@/components/shared/EmptyState";
import NotificationCard from "@/components/dashboard/NotificationCard";
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

const PROJECT_CHIP_ACCENTS = [
  {
    dot: "bg-blue-500",
    className: "border-blue-200/70 bg-blue-50/82 text-blue-700 hover:bg-blue-100/82",
  },
  {
    dot: "bg-emerald-500",
    className:
      "border-emerald-200/70 bg-emerald-50/82 text-emerald-700 hover:bg-emerald-100/82",
  },
  {
    dot: "bg-violet-500",
    className:
      "border-violet-200/70 bg-violet-50/82 text-violet-700 hover:bg-violet-100/82",
  },
  {
    dot: "bg-amber-500",
    className:
      "border-amber-200/70 bg-amber-50/82 text-amber-700 hover:bg-amber-100/82",
  },
  {
    dot: "bg-cyan-500",
    className: "border-cyan-200/70 bg-cyan-50/82 text-cyan-700 hover:bg-cyan-100/82",
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

const AttachedProjectsTile = ({ projects = [] }) => (
  <div className="flex min-h-11 min-w-0 flex-1 items-center gap-2 overflow-hidden rounded-2xl border border-white/70 bg-white/78 px-3 shadow-sm backdrop-blur-xl max-sm:w-full max-sm:flex-wrap sm:h-11">
    <span className="shrink-0 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
      Attached Projects :
    </span>

    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 overflow-x-auto py-1 sm:flex-nowrap">
      {projects.map((project, index) => {
        const accent = PROJECT_CHIP_ACCENTS[index % PROJECT_CHIP_ACCENTS.length];

        return (
          <span
            className={cn(
              "inline-flex h-7 max-w-[150px] shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_24px_-18px_rgba(15,23,42,0.42)]",
              accent.className
            )}
            key={project._id}
            title={project.name}
          >
            <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", accent.dot)} />
            <span className="truncate">{project.name || "Project"}</span>
          </span>
        );
      })}
    </div>
  </div>
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

const QaMetricsCard = ({ metrics }) => (
  <div className="flex min-h-20 min-w-[260px] flex-1 items-center gap-3 rounded-2xl border border-white/70 bg-[linear-gradient(135deg,rgba(15,23,42,0.96),rgba(79,70,229,0.9),rgba(14,165,233,0.82))] px-4 py-3 text-white shadow-[0_18px_42px_-28px_rgba(79,70,229,0.88)] backdrop-blur-xl max-sm:w-full lg:max-w-[430px]">
    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/20 bg-white/12 text-amber-300">
      <Trophy className="h-5 w-5" />
    </div>
    <div className="grid min-w-0 flex-1 grid-cols-3 gap-2 text-center text-xs">
      {metrics.items.map((item) => (
        <div className="px-2 py-1.5" key={item.label}>
          <p className="text-base font-bold text-white">{item.value}</p>
          <p className="truncate text-blue-100">{item.label}</p>
        </div>
      ))}
    </div>
  </div>
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

const TesterDashboardPage = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const testerId = String(user?._id || user?.id || "");
  const isTester = user?.role === ROLE_TESTER;
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
  const qaMetrics = useMemo(() => {
    const verified = dashboardMetrics.closed + dashboardMetrics.resolved;
    const verificationRate = dashboardMetrics.total
      ? Math.round((verified / dashboardMetrics.total) * 100)
      : 100;
    const reopenRate = dashboardMetrics.total
      ? Math.round((dashboardMetrics.reopened / dashboardMetrics.total) * 100)
      : 0;
    const completedRecentTasks = recentTasks.filter((task) =>
      [ISSUE_STATUS.DONE, ISSUE_STATUS.CLOSED].includes(normalizeIssueStatus(task.status))
    ).length;
    const taskCompletionRate = recentTasks.length
      ? Math.round((completedRecentTasks / recentTasks.length) * 100)
      : 100;
    return {
      items: [
        { label: "Verified", value: `${verificationRate}%` },
        { label: "Reopen", value: `${reopenRate}%` },
        { label: "QA Tasks", value: `${taskCompletionRate}%` },
      ],
    };
  }, [dashboardMetrics, recentTasks]);

  const statusChartData = useMemo(
    () =>
      STATUS_CHART_META.map((item) => ({
        ...item,
        value: dashboardMetrics[item.key],
        percentage: dashboardMetrics.total
          ? Math.round((dashboardMetrics[item.key] / dashboardMetrics.total) * 100)
          : 0,
      })),
    [dashboardMetrics]
  );
  const visibleStatusChartData = useMemo(
    () => statusChartData.filter((item) => item.value > 0),
    [statusChartData]
  );

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
      <section className="flex flex-wrap items-center gap-3 rounded-[28px] border border-white/70 bg-white/82 p-3 shadow-[0_22px_58px_-38px_rgba(15,23,42,0.36)] backdrop-blur-xl lg:flex-nowrap">
        <div className="relative w-full min-w-0 shrink-0 sm:flex-1 lg:w-[420px] lg:flex-none xl:w-[460px]">
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
          className="interactive-button h-11 w-full shrink-0 rounded-2xl border border-indigo-300/30 bg-[linear-gradient(90deg,#2563EB_0%,#6366F1_55%,#8B5CF6_100%)] px-4 text-white shadow-[0_14px_28px_-18px_rgba(99,102,241,0.82)] hover:brightness-105 sm:w-auto sm:px-5"
          onClick={() => navigate("/bugs?view=report")}
          type="button"
        >
          <Plus className="h-4 w-4" />
          New Bug
        </Button>

        <AttachedProjectsTile projects={assignedProjects} />

        <QaMetricsCard metrics={qaMetrics} />
      </section>

      <section className="flex snap-x gap-3 overflow-x-auto pb-2 md:grid md:grid-cols-2 md:gap-4 md:overflow-visible md:pb-0 xl:grid-cols-5 [&>*]:min-w-[220px] [&>*]:snap-start md:[&>*]:min-w-0">
        {SUMMARY_CARDS.map((item) => (
          <SummaryCard
            key={item.key}
            Icon={item.Icon}
            className={item.className}
            label={item.label}
            value={dashboardMetrics[item.key]}
          />
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-[0.86fr_1.14fr]">
        <ChartCard title="Bug Status">
          {dashboardMetrics.total ? (
            <div className="space-y-6">
              {/* Large Horizontal Segmented Bar */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Status Distribution</p>
                  <span className="text-xs font-medium text-slate-400">{dashboardMetrics.total} Total</span>
                </div>
                <div className="flex h-3 gap-0.5 overflow-hidden rounded-full bg-slate-100 p-0.5">
                  {visibleStatusChartData.map((item, idx) => (
                    <div
                      key={item.key}
                      className={cn(
                        "transition-all duration-500 ease-out",
                        idx === 0 ? "rounded-l-full" : "",
                        idx === visibleStatusChartData.length - 1 ? "rounded-r-full" : ""
                      )}
                      style={{
                        flex: item.percentage,
                        backgroundColor: item.color,
                        minWidth: item.percentage > 3 ? "auto" : "2px",
                      }}
                      title={`${item.label}: ${item.value} (${item.percentage}%)`}
                    />
                  ))}
                </div>
              </div>

              {/* Status Cards Grid */}
              <div className="grid gap-2 sm:grid-cols-2">
                {visibleStatusChartData.map((item) => {
                  const StatusIcon = item.Icon;

                  return (
                    <div
                      key={item.key}
                      className="group rounded-xl border border-slate-200/60 bg-gradient-to-br from-white/95 to-slate-50/70 p-3 shadow-sm transition duration-200 hover:border-blue-200/80 hover:shadow-md"
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white shadow-sm"
                            style={{ backgroundColor: item.color }}
                          >
                            <StatusIcon className="h-3.5 w-3.5" />
                          </div>
                          <p className="text-xs font-semibold text-slate-600 truncate">{item.label}</p>
                        </div>
                        <div className="flex items-baseline gap-1 shrink-0">
                          <span className="text-base font-bold text-slate-950">{item.value}</span>
                          <span className="text-[10px] font-semibold text-slate-400">{item.percentage}%</span>
                        </div>
                      </div>

                      {/* Mini Progress Bar */}
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full transition-all duration-700 ease-out"
                          style={{
                            width: `${item.percentage}%`,
                            backgroundColor: item.color,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Legend for statuses with 0 bugs */}
              {statusChartData.length > visibleStatusChartData.length && (
                <div className="pt-2 border-t border-slate-100">
                  <p className="text-[10px] font-medium text-slate-400 mb-2">Other statuses</p>
                  <div className="flex flex-wrap gap-1.5">
                    {statusChartData
                      .filter((item) => item.value === 0)
                      .map((item) => (
                        <div
                          key={item.key}
                          className="flex items-center gap-1.5 rounded-lg bg-slate-50 px-2 py-1 text-[10px] font-medium text-slate-600"
                        >
                          <div
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: item.color }}
                          />
                          {item.label}
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <EmptyChartState>No bug status data yet.</EmptyChartState>
          )}
        </ChartCard>

        <RecentTasksPanel
          error={recentTasksError}
          isLoading={isRecentTasksLoading}
          onOpenTask={(taskId) => navigate(`/issues/${taskId}`)}
          tasks={recentTasks}
        />
      </section>

      <Card className="overflow-hidden border-white/70 bg-white/90 shadow-[0_20px_56px_-36px_rgba(15,23,42,0.38)] backdrop-blur-xl">
        <CardContent className="p-0">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200/80 px-4 py-4 sm:px-5">
            <h2 className="text-base font-semibold tracking-tight text-slate-950">
              My Reported Bugs
            </h2>
            <Button type="button" size="sm" variant="outline" onClick={() => navigate("/bugs")}>
              View All Bugs
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="space-y-3 p-4 md:hidden">
            {isReportedBugsLoading ? (
              Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={`reported-mobile-skeleton-${index}`} className="h-44 rounded-[20px]" />
              ))
            ) : myReportedBugs.length ? (
              myReportedBugs.map((issue) => {
                const updatedAt = getBugUpdatedAt(issue);

                return (
                  <article
                    className="cursor-pointer rounded-[20px] border border-slate-200/80 bg-white/78 p-4 shadow-sm transition hover:border-blue-200 hover:bg-blue-50/42 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                    key={issue._id}
                    onClick={() => handleOpenReportedBug(issue._id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        handleOpenReportedBug(issue._id);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs font-semibold text-slate-500">
                            {getIssueDisplayKey(issue)}
                          </span>
                          <TableBadge variant={getIssueStatusVariant(issue.status)}>
                            {getIssueStatusLabel(issue.status)}
                          </TableBadge>
                        </div>
                        <h3 className="mt-2 break-words text-sm font-semibold text-slate-950">
                          {issue.title || "Untitled bug"}
                        </h3>
                    </div>

                    <div className="mt-4 grid gap-2 text-sm text-slate-600">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                          Project
                        </span>
                        <span className="min-w-0 truncate text-right font-medium">
                          {getProjectName(issue, assignedProjects)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                          Priority
                        </span>
                        <TableBadge variant={getIssuePriorityVariant(issue.priority)}>
                          {issue.priority || "Not set"}
                        </TableBadge>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                          Assignee
                        </span>
                        <span className="min-w-0 truncate text-right font-medium">
                          {getAssigneeName(issue)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                          Updated
                        </span>
                        <span className="text-right font-medium">
                          {updatedAt ? formatDateTime(updatedAt) : "Unknown"}
                        </span>
                      </div>
                    </div>
                  </article>
                );
              })
            ) : (
              <p className="rounded-[20px] border border-dashed border-slate-200 bg-slate-50/80 px-4 py-8 text-center text-sm text-slate-500">
                No reported bugs yet
              </p>
            )}
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[880px] table-fixed text-left text-sm">
              <thead className="bg-slate-50/90 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                <tr>
                  <th className="w-[10%] px-5 py-3">ID</th>
                  <th className="w-[28%] px-4 py-3">Title</th>
                  <th className="w-[16%] px-4 py-3">Project</th>
                  <th className="w-[12%] px-4 py-3">Status</th>
                  <th className="w-[11%] px-4 py-3">Priority</th>
                  <th className="w-[13%] px-4 py-3">Assignee</th>
                  <th className="w-[10%] px-4 py-3">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/80">
                {isReportedBugsLoading ? (
                  Array.from({ length: 5 }).map((_, index) => (
                    <tr key={`reported-row-skeleton-${index}`}>
                      <td className="px-5 py-4" colSpan={7}>
                        <Skeleton className="h-8 w-full rounded-xl" />
                      </td>
                    </tr>
                  ))
                ) : myReportedBugs.length ? (
                  myReportedBugs.map((issue) => {
                    const updatedAt = getBugUpdatedAt(issue);

                    return (
                      <tr
                        className="cursor-pointer bg-white/64 transition hover:bg-blue-50/60"
                        key={issue._id}
                        onClick={() => handleOpenReportedBug(issue._id)}
                      >
                        <td className="whitespace-nowrap px-5 py-4 align-middle font-mono text-xs font-semibold text-slate-500">
                          {getIssueDisplayKey(issue)}
                        </td>
                        <td className="px-4 py-4 align-middle">
                          <p className="truncate font-semibold text-slate-950">
                            {issue.title || "Untitled bug"}
                          </p>
                        </td>
                        <td className="px-4 py-4 align-middle">
                          <p className="truncate text-slate-600">
                            {getProjectName(issue, assignedProjects)}
                          </p>
                        </td>
                        <td className="px-4 py-4 align-middle">
                          <TableBadge variant={getIssueStatusVariant(issue.status)}>
                            {getIssueStatusLabel(issue.status)}
                          </TableBadge>
                        </td>
                        <td className="px-4 py-4 align-middle">
                          <TableBadge variant={getIssuePriorityVariant(issue.priority)}>
                            {issue.priority || "Not set"}
                          </TableBadge>
                        </td>
                        <td className="px-4 py-4 align-middle">
                          <p className="truncate text-slate-600">
                            {getAssigneeName(issue)}
                          </p>
                        </td>
                        <td className="whitespace-nowrap px-4 py-4 align-middle text-slate-500">
                          {updatedAt ? formatDateTime(updatedAt) : "Unknown"}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td
                      className="px-5 py-12 text-center text-sm text-slate-500"
                      colSpan={7}
                    >
                      No reported bugs yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <section className="flex flex-col gap-3 rounded-[24px] border border-white/70 bg-white/78 p-3 shadow-[0_16px_42px_-34px_rgba(15,23,42,0.32)] backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
        <label className="flex w-full items-center gap-3 sm:w-auto">
          <span className="sr-only">Project filter</span>
          <select
            className="h-11 w-full rounded-2xl border border-slate-200/90 bg-white/86 px-4 text-sm font-semibold text-slate-700 shadow-sm outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-500/25 sm:w-auto"
            onChange={(event) => setProjectFilter(event.target.value)}
            value={projectFilter}
          >
            <option value="all">All projects</option>
            {assignedProjects.map((project) => (
              <option key={project._id} value={String(project._id)}>
                {project.name}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
          <p className="text-sm text-slate-500">
            Last refreshed {formatDateTime(lastRefreshedAt)}
          </p>
          <DashboardIconButton
            aria-label="Refresh dashboard"
            className={isIssuesFetching || isReportedBugsFetching || isRecentTasksFetching ? "animate-pulse" : ""}
            onClick={handleRefresh}
          >
            <RefreshCcw
              className={cn(
                "h-4 w-4",
                (isIssuesFetching || isReportedBugsFetching || isRecentTasksFetching) && "animate-spin"
              )}
            />
          </DashboardIconButton>
        </div>
      </section>
    </div>
  );
};

export default TesterDashboardPage;
