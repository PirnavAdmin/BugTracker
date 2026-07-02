import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { NavLink, Navigate, useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  AreaChart as AreaChartIcon,
  ArrowUpRight,
  BarChart3,
  Bug,
  CalendarDays,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Download,
  FileText,
  Flame,
  Gauge,
  GitBranch,
  Layers3,
  PieChart as PieChartIcon,
  RefreshCcw,
  Save,
  Share2,
  ShieldCheck,
  Star,
  TimerReset,
  TrendingUp,
  Trophy,
  UserCheck,
  Users2,
  Zap,
  Maximize2,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import useAnalytics, { useDeveloperDashboard } from "@/hooks/use-analytics";
import { useAuth } from "@/hooks/use-auth";
import { fetchEpics, fetchProjects, fetchSprints } from "@/lib/api";
import {
  BUG_SEVERITY_OPTIONS,
  ISSUE_STATUS,
  ISSUE_TYPES,
  getIssuePriorityVariant,
  getIssueStatusLabel,
  getIssueStatusVariant,
} from "@/lib/issues";
import {
  getProjectMembers,
  getProjectTeams,
  resolveTeamId,
  resolveUserId,
} from "@/lib/project-teams";
import { ROLE_DEVELOPER, ROLE_TESTER } from "@/lib/roles";
import {
  ANALYTICS_FIELD_CLASS,
  ANALYTICS_PANEL_CLASS,
  ANALYTICS_SELECT_CLASS,
  CHART_GRID_COLOR,
  AnalyticsEmptyState,
  AnalyticsPanel,
  chartTooltipStyle,
  formatCompactNumber,
  formatDuration,
} from "@/components/analytics/analytics-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatDateTime } from "@/lib/utils";
import {
  buildPerformanceInsights,
  calculateBugMetrics,
  calculateDeveloperPerformance,
  calculateTaskMetrics,
  metricLabel,
} from "@/lib/enterprise-report-metrics";

const EnterpriseChart = lazy(() => import("@/components/analytics/EnterpriseCharts"));

const PRIORITIES = ["Critical", "High", "Medium", "Low"];
const WORKFLOW_VIEW_OPTIONS = [
  { value: "all", label: "All" },
  { value: "tasks", label: "Tasks" },
  { value: "bugs", label: "Bugs" },
];
const TASK_ISSUE_TYPES = new Set([
  ISSUE_TYPES.TASK,
  ISSUE_TYPES.STORY,
  ISSUE_TYPES.EPIC,
  ISSUE_TYPES.SUB_TASK,
]);
const BUG_SEVERITY_GROUPS = [
  { key: "Critical", labels: ["Blocker", "Critical"], color: "#dc2626" },
  { key: "High", labels: ["Major", "High"], color: "#f97316" },
  { key: "Medium", labels: ["Medium"], color: "#f59e0b" },
  { key: "Low", labels: ["Minor", "Low"], color: "#10b981" },
];
const BUG_PRIORITY_GROUPS = [
  { key: "P1", label: "P1 Critical", source: "Critical", color: "#dc2626" },
  { key: "P2", label: "P2 High", source: "High", color: "#f97316" },
  { key: "P3", label: "P3 Medium", source: "Medium", color: "#2563eb" },
  { key: "P4", label: "P4 Low", source: "Low", color: "#10b981" },
];
const DEVELOPER_WORK_DISTRIBUTION_COLORS = {
  Tasks: "#3b82f6",
  Bugs: "#ef4444",
};
const DEVELOPER_SEVERITY_COLORS = {
  Critical: "#ef4444",
  Major: "#f97316",
  Minor: "#f59e0b",
  Low: "#10b981",
  Unspecified: "#64748b",
};
const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "open", label: "Open group", statusGroup: "open" },
  { value: "closed", label: "Closed group", statusGroup: "closed" },
  { value: ISSUE_STATUS.TODO, label: "To Do" },
  { value: ISSUE_STATUS.IN_PROGRESS, label: "In Progress" },
  { value: ISSUE_STATUS.REVIEW, label: "Review" },
  { value: ISSUE_STATUS.QA, label: "Ready for QA" },
  { value: ISSUE_STATUS.DONE, label: "Done" },
  { value: ISSUE_STATUS.NEW, label: "New" },
  { value: ISSUE_STATUS.OPEN, label: "Open" },
  { value: ISSUE_STATUS.ASSIGNED, label: "Assigned" },
  { value: ISSUE_STATUS.FIXED, label: "Fixed" },
  { value: ISSUE_STATUS.REOPEN, label: "Reopened" },
  { value: ISSUE_STATUS.CLOSED, label: "Closed" },
  { value: ISSUE_STATUS.REJECTED, label: "Rejected" },
];
const CHART_COLORS = ["#2563eb", "#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];
const CLOSED_STATUSES = new Set([
  ISSUE_STATUS.DONE,
  ISSUE_STATUS.CLOSED,
  ISSUE_STATUS.REJECTED,
  ISSUE_STATUS.DEFERRED,
]);
const ACTIVE_STATUSES = new Set([
  ISSUE_STATUS.IN_PROGRESS,
  ISSUE_STATUS.REVIEW,
  ISSUE_STATUS.QA,
  ISSUE_STATUS.OPEN,
  ISSUE_STATUS.ASSIGNED,
  ISSUE_STATUS.FIXED,
  ISSUE_STATUS.REOPEN,
]);

const asArray = (value) => (Array.isArray(value) ? value : []);
const toNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};
const sumChartValues = (rows = [], dataKey = "value") =>
  asArray(rows).reduce((sum, row) => sum + toNumber(row?.[dataKey]), 0);
const hasChartValues = (rows = [], dataKey = "value") =>
  sumChartValues(rows, dataKey) > 0;
const percent = (part, total) => (total ? Math.round((part / total) * 100) : 0);
const normalizeAnalyticsValue = (value) => String(value || "").trim().toLowerCase();
const getBugSeverityValue = (issue) => issue?.severity || issue?.bugDetails?.severity || "";
const getBugPriorityValue = (issue) => issue?.priority || issue?.bugDetails?.priority || "";
const resolveUserLabel = (user, fallback = "Unassigned") =>
  user?.name || user?.email || fallback;
const isClosed = (issue) => CLOSED_STATUSES.has(issue?.status);
const isActive = (issue) => ACTIVE_STATUSES.has(issue?.status);
const isCriticalBug = (issue) =>
  ["Blocker", "Critical"].includes(issue?.severity) ||
  ["Critical", "High"].includes(issue?.priority);
const isReadyForQa = (issue) =>
  [
    ISSUE_STATUS.QA,
    ISSUE_STATUS.READY_FOR_QA,
    "READY_FOR_TESTING",
    "READY_FOR_VERIFICATION",
    ISSUE_STATUS.TESTING,
    ISSUE_STATUS.FIXED,
  ].includes(issue?.status);
const isReopened = (issue) => issue?.status === ISSUE_STATUS.REOPEN;
const isOverdue = (issue) =>
  Boolean(issue?.dueAt) && !isClosed(issue) && new Date(issue.dueAt) < new Date();
const getTeamKey = (issue) => issue?.team?._id || "unassigned";
const getTeamName = (issue) => issue?.team?.name || "Unassigned team";
const getTesterKeys = (issue) =>
  [issue?.reporter?._id, issue?.testerOwner?._id].filter(Boolean).map(String);
const matchesTeam = (row, teamId) =>
  teamId === "all" || row.teamIds?.has(teamId) || (!row.teamIds?.size && teamId === "unassigned");

const buildRows = (rows = [], keyAccessor, labelAccessor) => {
  const buckets = new Map();

  rows.forEach((row) => {
    const key = keyAccessor(row) || "unassigned";
    const label = labelAccessor(row) || "Unassigned";
    const bucket = buckets.get(key) || { key, label, count: 0, name: label, value: 0 };
    bucket.count += 1;
    bucket.value += 1;
    buckets.set(key, bucket);
  });

  return Array.from(buckets.values()).sort((left, right) => right.count - left.count);
};

const buildGroupedBugRows = (issues = [], groups = [], valueAccessor, fallback) => {
  const rows = groups.map((group) => {
    const groupLabels = new Set(group.labels.map(normalizeAnalyticsValue));
    const count = issues.filter((issue) =>
      groupLabels.has(normalizeAnalyticsValue(valueAccessor(issue)))
    ).length;

    return {
      ...group,
      name: group.label || group.key,
      value: count,
      count,
    };
  }).filter((row) => row.count > 0);
  const groupedValues = new Set(
    groups.flatMap((group) => group.labels.map(normalizeAnalyticsValue))
  );
  const fallbackCount = issues.filter((issue) => {
    const value = normalizeAnalyticsValue(valueAccessor(issue));

    return !value || !groupedValues.has(value);
  }).length;

  if (fallbackCount > 0) {
    rows.push({
      ...fallback,
      name: fallback.label || fallback.key,
      value: fallbackCount,
      count: fallbackCount,
    });
  }

  return rows;
};

const BugDistributionWidget = ({
  emptyDescription,
  priorityRows = [],
  severityRows = [],
  title = "Bug Risk Distribution",
  total = 0,
}) => {
  const hasRows = severityRows.length || priorityRows.length;
  const renderRows = (rows, tone) => (
    <div className="space-y-2">
      {rows.map((row) => (
        <div
          className="rounded-xl border border-white/60 bg-white/62 px-3 py-2 shadow-sm"
          key={row.key}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: row.color }}
              />
              <span className="truncate text-sm font-semibold text-slate-800">
                {row.name}
              </span>
            </div>
            <span className="shrink-0 text-sm font-semibold text-slate-700">
              {row.count}
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200/80">
            <div
              className={cn("h-full rounded-full", tone)}
              style={{ width: `${Math.max(percent(row.count, total), row.count ? 4 : 0)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="rounded-[16px] border border-white/55 bg-white/50 p-3 lg:col-span-2">
      <SectionTitle kicker="Risk" title={title} />
      {hasRows ? (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                Severity
              </p>
              <span className="text-xs font-semibold text-slate-500">
                {sumChartValues(severityRows)} bugs
              </span>
            </div>
            {renderRows(severityRows, "bg-rose-500")}
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                Priority
              </p>
              <span className="text-xs font-semibold text-slate-500">
                {sumChartValues(priorityRows)} bugs
              </span>
            </div>
            {renderRows(priorityRows, "bg-blue-500")}
          </div>
        </div>
      ) : (
        <AnalyticsEmptyState
          className="mt-4 min-h-[220px]"
          icon={Bug}
          title="No bug risk data"
          description={emptyDescription}
        />
      )}
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <MiniStat label="Total Bugs" tone="rose" value={formatCompactNumber(total)} />
        <MiniStat
          label="Severity Groups"
          tone="amber"
          value={severityRows.length}
        />
        <MiniStat
          label="Priority Groups"
          tone="blue"
          value={priorityRows.length}
        />
      </div>
    </div>
  );
};

const DeveloperDistributionWidget = ({
  emptyDescription,
  icon: Icon = BarChart3,
  rows = [],
  title,
  total = 0,
}) => {
  const normalizedRows = asArray(rows)
    .map((row, index) => ({
      color: row.color || CHART_COLORS[index % CHART_COLORS.length],
      key: row.key || row.name || `row-${index}`,
      name: row.name || row.label || "Unknown",
      value: toNumber(row.value ?? row.count),
    }))
    .filter((row) => row.name && row.value > 0);
  const rowTotal = total || sumChartValues(normalizedRows);

  return (
    <AnalyticsPanel title={title}>
      {normalizedRows.length ? (
        <div className="space-y-3">
          {normalizedRows.map((row) => (
            <div
              className="rounded-xl border border-white/60 bg-white/62 p-3 shadow-sm"
              key={row.key}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: row.color }}
                  />
                  <span className="truncate text-sm font-semibold text-slate-900">
                    {row.name}
                  </span>
                </div>
                <span className="shrink-0 text-sm font-semibold text-slate-700">
                  {row.value}
                </span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200/80">
                <div
                  className="h-full rounded-full"
                  style={{
                    backgroundColor: row.color,
                    width: `${Math.max(percent(row.value, rowTotal), 4)}%`,
                  }}
                />
              </div>
            </div>
          ))}
          <div className="grid gap-2 sm:grid-cols-2">
            <MiniStat label="Total" tone="blue" value={formatCompactNumber(rowTotal)} />
            <MiniStat label="Groups" tone="slate" value={normalizedRows.length} />
          </div>
        </div>
      ) : (
        <AnalyticsEmptyState
          className="min-h-[260px]"
          icon={Icon}
          title="No distribution data"
          description={emptyDescription}
        />
      )}
    </AnalyticsPanel>
  );
};

const exportCsv = (rows) => {
  if (typeof document === "undefined") {
    return;
  }

  const escapeValue = (value) => {
    const text = String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const csv = rows.map((row) => row.map(escapeValue).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `workflow-analytics-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
};

const getStatusParts = (statusFilter) => {
  const match = STATUS_OPTIONS.find((option) => option.value === statusFilter);

  if (match?.statusGroup) {
    return { status: "all", statusGroup: match.statusGroup };
  }

  return { status: statusFilter || "all", statusGroup: "all" };
};

const ChartFrame = ({ children, className, height = 350 }) => {
  const frameRef = useRef(null);

  useEffect(() => {
    if (import.meta.env.DEV && frameRef.current) {
      console.debug("Reports chart frame dimensions:", {
        width: frameRef.current.offsetWidth,
        height: frameRef.current.offsetHeight,
      });
    }
  }, [height]);

  return (
    <div
      ref={frameRef}
      className={cn("min-w-0 w-full overflow-visible", className)}
      style={{ height, minHeight: height, minWidth: 0 }}
    >
      {children}
    </div>
  );
};

const KpiCard = ({ accent = "blue", helper, icon: Icon, label, onClick, trend, value }) => {
  const tones = {
    blue: "from-blue-600 to-cyan-400 text-white",
    emerald: "from-emerald-600 to-teal-400 text-white",
    amber: "from-amber-500 to-orange-500 text-white",
    rose: "from-rose-600 to-pink-500 text-white",
    violet: "from-violet-600 to-fuchsia-500 text-white",
    slate: "from-slate-800 to-slate-600 text-white",
  };

  return (
    <Card
      className={cn(
        "overflow-hidden rounded-[16px] border-white/10 bg-gradient-to-br shadow-[0_20px_48px_-30px_rgba(15,23,42,0.55)]",
        onClick ? "cursor-pointer transition hover:-translate-y-0.5 hover:shadow-[0_24px_54px_-28px_rgba(15,23,42,0.65)]" : "",
        tones[accent]
      )}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <CardContent className="relative p-4">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(155deg,rgba(255,255,255,0.24),transparent_46%,rgba(255,255,255,0.12))]" />
        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/72">{label}</p>
            <p className="mt-2 text-3xl font-semibold text-white">{value}</p>
            <p className="mt-1 truncate text-xs text-white/74">{helper}</p>
          </div>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/20 bg-white/16">
            <Icon className="h-5 w-5" />
          </span>
        </div>
        <div className="relative mt-3 flex items-center gap-1">
          {[32, 54, 42, 68, 56, 78, 62].map((height, index) => (
            <span
              key={`${label}-spark-${index}`}
              className="w-full rounded-full bg-white/28"
              style={{ height: `${height / 6}px` }}
            />
          ))}
        </div>
        {trend ? (
          <p className="relative mt-2 text-[11px] font-semibold text-white/82">{trend}</p>
        ) : null}
      </CardContent>
    </Card>
  );
};

const SectionTitle = ({ kicker, title, description }) => (
  <div className="flex flex-col gap-1">
    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-600">{kicker}</p>
    <h2 className="text-xl font-semibold text-slate-950 dark:text-slate-100">{title}</h2>
    {description ? <p className="text-sm text-slate-500">{description}</p> : null}
  </div>
);

const ProgressRow = ({ label, meta, tone = "bg-blue-500", value }) => (
  <div className="rounded-[16px] border border-white/55 bg-white/58 p-3 shadow-[0_14px_34px_-28px_rgba(15,23,42,0.34)] backdrop-blur-xl">
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-950">{label}</p>
        {meta ? <p className="mt-1 truncate text-xs text-slate-500">{meta}</p> : null}
      </div>
      <span className="text-sm font-semibold text-slate-700">{value}%</span>
    </div>
    <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200/80">
      <div className={cn("h-full rounded-full", tone)} style={{ width: `${Math.max(value, 4)}%` }} />
    </div>
  </div>
);

const SegmentedToggle = ({ options, value, onChange }) => (
  <div className="inline-flex rounded-2xl border border-white/70 bg-white/72 p-1 shadow-[0_14px_32px_-26px_rgba(15,23,42,0.45)] backdrop-blur-xl">
    {options.map((option) => {
      const active = option.value === value;

      return (
        <button
          className={cn(
            "h-8 rounded-xl px-4 text-xs font-semibold transition-all duration-200",
            active
              ? "bg-blue-600 text-white shadow-[0_10px_24px_-14px_rgba(37,99,235,0.75)]"
              : "text-slate-600 hover:bg-white hover:text-slate-950"
          )}
          key={option.value}
          onClick={() => onChange(option.value)}
          type="button"
        >
          {option.label}
        </button>
      );
    })}
  </div>
);

const DateField = ({ value, onChange, label }) => (
  <div className="relative min-w-0">
    <Input
      aria-label={label}
      className={cn(
        ANALYTICS_FIELD_CLASS,
        "date-picker-input w-full min-w-0 px-4 pr-11 text-sm"
      )}
      type="date"
      value={value}
      onChange={onChange}
    />
    <CalendarDays className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
  </div>
);

const MiniStat = ({ label, tone = "slate", value }) => {
  const tones = {
    blue: "bg-blue-50 text-blue-700",
    emerald: "bg-emerald-50 text-emerald-700",
    rose: "bg-rose-50 text-rose-700",
    amber: "bg-amber-50 text-amber-700",
    violet: "bg-violet-50 text-violet-700",
    slate: "bg-slate-50 text-slate-600",
  };

  return (
    <div className={cn("rounded-xl px-2 py-2 text-center", tones[tone])}>
      <p className="text-[11px] font-semibold">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-slate-950">{value}</p>
    </div>
  );
};

const ChartSkeleton = () => (
  <Skeleton className="h-[320px] rounded-2xl bg-white/55" />
);

const EnterpriseChartPanel = ({ description, kind, data, title }) => (
  <AnalyticsPanel title={title} description={description}>
    <Suspense fallback={<ChartSkeleton />}>
      <EnterpriseChart data={data} kind={kind} />
    </Suspense>
  </AnalyticsPanel>
);

const EnterpriseActionButton = ({ children, icon: Icon, onClick }) => (
  <Button type="button" variant="outline" size="sm" onClick={onClick}>
    <Icon className="h-4 w-4" />
    {children}
  </Button>
);

const DashboardSuiteNav = ({ active }) => {
  const dashboards = [
    "Overview",
    "Tasks",
    "Bugs",
    "Sprint",
    "Developer",
    "QA",
    "Release",
    "Project",
    "Executive",
  ];

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 dashboard-scrollbar">
      {dashboards.map((dashboard) => (
        <a
          className={cn(
            "shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold uppercase tracking-[0.12em] transition",
            active === dashboard
              ? "border-blue-500 bg-blue-600 text-white shadow-[0_14px_28px_-18px_rgba(37,99,235,0.8)]"
              : "border-white/70 bg-white/70 text-slate-600 hover:bg-white"
          )}
          href={`#reports-${dashboard.toLowerCase()}`}
          key={dashboard}
        >
          {dashboard}
        </a>
      ))}
    </div>
  );
};

const ReportsLoading = () => (
  <div className="space-y-5">
    <Skeleton className="h-[170px] rounded-[16px]" />
    <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
      {Array.from({ length: 6 }).map((_, index) => (
        <Skeleton key={`report-kpi-${index}`} className="h-[132px] rounded-[16px]" />
      ))}
    </div>
    <div className="grid gap-5 xl:grid-cols-2">
      <Skeleton className="h-[360px] rounded-[16px]" />
      <Skeleton className="h-[360px] rounded-[16px]" />
      <Skeleton className="h-[360px] rounded-[16px]" />
      <Skeleton className="h-[360px] rounded-[16px]" />
    </div>
  </div>
);

const TesterReportsDashboard = ({ user }) => {
  const currentTesterId = user?._id || user?.id || "";
  const [filters, setFilters] = useState({
    projectId: "all",
    severity: "all",
    status: "all",
    dateFrom: "",
    dateTo: "",
  });
  const statusParts = getStatusParts(filters.status);
  const sharedFilters = {
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    projectId: filters.projectId,
    status: statusParts.status,
    statusGroup: statusParts.statusGroup,
  };
  const bugAnalytics = useAnalytics(
    {
      ...sharedFilters,
      type: ISSUE_TYPES.BUG,
      testerId: currentTesterId,
      severity: filters.severity,
    },
    { includeIssues: true, enabled: Boolean(currentTesterId) }
  );
  const taskAnalytics = useAnalytics(
    {
      ...sharedFilters,
      excludeType: ISSUE_TYPES.BUG,
      assigneeId: currentTesterId,
    },
    { includeIssues: true, enabled: Boolean(currentTesterId) }
  );
  const {
    data: projects = [],
    isLoading: isProjectsLoading,
    error: projectsError,
  } = useQuery({
    queryKey: ["projects", "tester-reports-options"],
    queryFn: fetchProjects,
    staleTime: 60_000,
  });

  const updateFilter = (key, value) =>
    setFilters((current) => ({
      ...current,
      [key]: value,
    }));
  const resetFilters = () =>
    setFilters({
      projectId: "all",
      severity: "all",
      status: "all",
      dateFrom: "",
      dateTo: "",
    });

  const bugIssues = asArray(bugAnalytics.issues?.issues).filter(
    (issue) => getTesterKeys(issue).includes(String(currentTesterId))
  );
  const testingTasks = asArray(taskAnalytics.issues?.issues).filter(
    (issue) => String(issue.assignee?._id || "") === String(currentTesterId)
  );
  const bugTrend = asArray(bugAnalytics.trends?.issueTrend);
  const bugsVerified = bugIssues.filter((issue) => issue.status === ISSUE_STATUS.CLOSED).length;
  const bugsReopened = bugIssues.filter(isReopened).length;
  const readyForQa = bugIssues.filter(isReadyForQa).length;
  const falsePositiveCount = bugIssues.filter((issue) => issue.status === ISSUE_STATUS.REJECTED).length;
  const completedQaTasks = testingTasks.filter(isClosed).length;
  const pendingQaTasks = testingTasks.filter((issue) => !isClosed(issue)).length;
  const avgVerificationTime =
    bugIssues
      .map((issue) => toNumber(issue.resolutionTimeMs))
      .filter((value) => value > 0)
      .reduce((sum, value, _index, values) => sum + value / values.length, 0);
  const qaAccuracy = percent(bugsVerified, bugsVerified + bugsReopened + falsePositiveCount);
  const qaEfficiency = Math.round((qaAccuracy + percent(completedQaTasks, testingTasks.length) + percent(bugsVerified, bugIssues.length)) / 3);
  const severityRows = buildGroupedBugRows(
    bugIssues,
    BUG_SEVERITY_GROUPS,
    getBugSeverityValue,
    { key: "Unspecified", label: "Unspecified", color: "#64748b" }
  );
  const priorityRows = buildGroupedBugRows(
    bugIssues,
    BUG_PRIORITY_GROUPS.map((group) => ({ ...group, labels: [group.source] })),
    getBugPriorityValue,
    { key: "Unspecified", label: "Unspecified", color: "#64748b" }
  );
  const timelineRows = bugTrend.slice(-30).map((row) => ({
    label: row.label || row.date || row._id || "",
    reported: toNumber(row.created),
    verified: toNumber(row.resolved || row.closed),
    reopened: toNumber(row.reopened),
  }));
  const hasTimelineRows =
    sumChartValues(timelineRows, "reported") +
      sumChartValues(timelineRows, "verified") +
      sumChartValues(timelineRows, "reopened") >
    0;

  if (import.meta.env.DEV) {
    console.log("Tester Bug Analytics Data:", bugAnalytics.results.overview?.data);
    console.log("Tester Bug Trend Data:", bugAnalytics.results.trends?.data);
    console.log("Tester Severity Rows:", severityRows);
    console.log("Tester Priority Rows:", priorityRows);
    console.log("Tester Timeline Rows:", timelineRows);
  }
  const error = projectsError || bugAnalytics.error || taskAnalytics.error;
  const isLoading = isProjectsLoading || bugAnalytics.isLoading || taskAnalytics.isLoading;

  if (error) {
    return (
      <Card className={ANALYTICS_PANEL_CLASS}>
        <CardContent className="p-6 text-sm text-rose-700">
          {error.response?.data?.message || error.message || "Unable to load your QA reports."}
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return <ReportsLoading />;
  }

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden rounded-[16px] border-slate-200 bg-white shadow-md">
        <CardContent className="space-y-3 p-3 sm:p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-600">My QA Dashboard</p>
              <h1 className="mt-0.5 text-xl font-semibold text-slate-950 sm:text-2xl">My QA Analytics Dashboard</h1>
              <p className="mt-0.5 text-sm text-slate-500">
                Track your reported bugs, QA verification flow, and testing productivity.
              </p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={resetFilters}>Reset</Button>
          </div>

          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
            <select className={ANALYTICS_SELECT_CLASS} value={filters.projectId} onChange={(event) => updateFilter("projectId", event.target.value)}>
              <option value="all">All projects</option>
              {projects.map((project) => (
                <option key={project._id} value={project._id}>{project.name}</option>
              ))}
            </select>
            <select className={ANALYTICS_SELECT_CLASS} value={filters.severity} onChange={(event) => updateFilter("severity", event.target.value)}>
              <option value="all">All severities</option>
              {BUG_SEVERITY_OPTIONS.map((severity) => (
                <option key={severity} value={severity}>{severity}</option>
              ))}
            </select>
            <select className={ANALYTICS_SELECT_CLASS} value={filters.status} onChange={(event) => updateFilter("status", event.target.value)}>
              {STATUS_OPTIONS.map((status) => (
                <option key={status.value} value={status.value}>{status.label}</option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-2 md:col-span-2">
              <DateField label="Date from" value={filters.dateFrom} onChange={(event) => updateFilter("dateFrom", event.target.value)} />
              <DateField label="Date to" value={filters.dateTo} onChange={(event) => updateFilter("dateTo", event.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard accent="rose" icon={Bug} label="Bugs Reported" value={formatCompactNumber(bugIssues.length)} helper="Created by you" />
        <KpiCard accent="emerald" icon={ShieldCheck} label="Bugs Verified" value={bugsVerified} helper={`${qaAccuracy}% QA accuracy`} />
        <KpiCard accent="amber" icon={RefreshCcw} label="Bugs Reopened" value={bugsReopened} helper="Your reopen flow" />
        <KpiCard accent="violet" icon={TimerReset} label="Ready For QA" value={readyForQa} helper="Awaiting verification" />
        <KpiCard accent="blue" icon={Gauge} label="Avg Verification" value={formatDuration(avgVerificationTime)} helper="Reported-to-close cycle" />
        <KpiCard accent="slate" icon={CheckCircle2} label="QA Accuracy" value={`${qaAccuracy}%`} helper={`${falsePositiveCount} false positives`} />
        <KpiCard accent="emerald" icon={Zap} label="QA Efficiency" value={`${qaEfficiency}%`} helper="Personal score" />
        <KpiCard accent="blue" icon={Layers3} label="Testing Tasks" value={testingTasks.length} helper={`${pendingQaTasks} pending`} />
      </section>

      <section className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <AnalyticsPanel title="My Bug Analytics" description="Only bugs reported by you are included.">
          <div className="grid gap-4 lg:grid-cols-2">
            <BugDistributionWidget
              emptyDescription="Your bug risk breakdown appears after you report bugs."
              priorityRows={priorityRows}
              severityRows={severityRows}
              title="My Bug Risk Distribution"
              total={bugIssues.length}
            />
            <div className="rounded-[16px] border border-white/55 bg-white/50 p-3 lg:col-span-2">
              <SectionTitle kicker="Timeline" title="My Verification Timeline" />
              <ChartFrame height={300}>
                {hasTimelineRows ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={timelineRows}>
                      <CartesianGrid stroke={CHART_GRID_COLOR} vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={chartTooltipStyle} />
                      <Area type="monotone" dataKey="reported" stroke="#ef4444" fill="#fecdd3" fillOpacity={0.72} isAnimationActive={false} />
                      <Area type="monotone" dataKey="verified" stroke="#10b981" fill="#bbf7d0" fillOpacity={0.55} isAnimationActive={false} />
                      <Line type="monotone" dataKey="reopened" stroke="#f97316" strokeWidth={2} dot={false} isAnimationActive={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : <AnalyticsEmptyState className="min-h-[250px]" icon={TrendingUp} title="No timeline data" description="Verification trends appear over time." />}
              </ChartFrame>
            </div>
          </div>
        </AnalyticsPanel>

        <AnalyticsPanel title="My QA Performance" description="Personal scorecard based on your own bug verification and testing task flow.">
          <div className="grid gap-3 md:grid-cols-2">
            <ProgressRow label="Verification accuracy" value={qaAccuracy} meta={`${bugsVerified} verified, ${falsePositiveCount} false positives`} tone="bg-emerald-500" />
            <ProgressRow label="Reopen percentage" value={percent(bugsReopened, bugIssues.length)} meta={`${bugsReopened} reopened bugs`} tone="bg-rose-500" />
            <ProgressRow label="Verification completion" value={percent(completedQaTasks, testingTasks.length)} meta={`${completedQaTasks} completed QA tasks`} tone="bg-blue-500" />
            <ProgressRow label="QA efficiency score" value={qaEfficiency} meta={formatDuration(avgVerificationTime)} tone="bg-violet-500" />
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <MiniStat label="Completed QA tasks" tone="emerald" value={completedQaTasks} />
            <MiniStat label="Pending QA tasks" tone="amber" value={pendingQaTasks} />
            <MiniStat label="Avg testing time" tone="blue" value={formatDuration(avgVerificationTime)} />
            <MiniStat label="My reopened bugs" tone="rose" value={bugsReopened} />
          </div>
        </AnalyticsPanel>
      </section>


      <section className="grid gap-5 xl:grid-cols-2">
        <AnalyticsPanel title="My Testing Task Analytics" description="Only QA and testing work assigned to you.">
          <div className="grid gap-3 md:grid-cols-2">
            {testingTasks.slice(0, 20).map((task) => (
              <div key={task._id} className="rounded-[16px] border border-white/55 bg-white/58 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-950">{task.title}</p>
                    <p className="mt-1 text-xs text-slate-500">{task.project?.name || "Unknown project"}</p>
                  </div>
                  <Badge variant={getIssueStatusVariant(task.status)}>{task.status}</Badge>
                </div>
              </div>
            ))}
            {!testingTasks.length ? (
              <AnalyticsEmptyState className="md:col-span-2" icon={Layers3} title="No assigned testing tasks" description="Testing tasks assigned to you will appear here." />
            ) : null}
          </div>
        </AnalyticsPanel>

        <AnalyticsPanel title="My Recent Bug Activity" description="Only bugs created by you.">
          <div className="max-h-[430px] overflow-auto pr-2 dashboard-scrollbar">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="sticky top-0 bg-white/95 text-xs uppercase tracking-[0.16em] text-slate-500 backdrop-blur">
                <tr>
                  <th className="px-3 py-3">Bug ID</th>
                  <th className="px-3 py-3">Project</th>
                  <th className="px-3 py-3">Severity</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Developer</th>
                  <th className="px-3 py-3">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {bugIssues.slice(0, 80).map((bug) => (
                  <tr key={bug._id} className="hover:bg-blue-50/50">
                    <td className="px-3 py-3 font-mono text-xs font-semibold">{bug.issueId}</td>
                    <td className="px-3 py-3">{bug.project?.name || "Unknown"}</td>
                    <td className="px-3 py-3"><Badge variant="warning">{bug.severity || "Not set"}</Badge></td>
                    <td className="px-3 py-3"><Badge variant={getIssueStatusVariant(bug.status)}>{bug.status}</Badge></td>
                    <td className="px-3 py-3">{resolveUserLabel(bug.developerLead || bug.assignee, "Unassigned")}</td>
                    <td className="px-3 py-3">{formatDateTime(bug.closedAt || bug.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!bugIssues.length ? (
              <AnalyticsEmptyState icon={Bug} title="No bug activity" description="Your reported bugs will appear here." />
            ) : null}
          </div>
        </AnalyticsPanel>
      </section>
    </div>
  );
};

const DeveloperReportsDashboard = ({ user }) => {
  const currentDeveloperId = user?._id || user?.id || "";
  const defaultFilters = {
    projectId: "all",
    sprintId: "all",
    priority: "all",
    severity: "all",
    dateFrom: "",
    dateTo: "",
  };
  const [draftFilters, setDraftFilters] = useState(defaultFilters);
  const [filters, setFilters] = useState(defaultFilters);

  const {
    data: projects = [],
  } = useQuery({
    queryKey: ["projects", "developer-reports-options"],
    queryFn: fetchProjects,
    staleTime: 60_000,
  });

  const selectedProjectId = draftFilters.projectId !== "all" ? draftFilters.projectId : "";
  const { data: sprints = [] } = useQuery({
    queryKey: ["developer-reports", "sprints", selectedProjectId],
    queryFn: () => fetchSprints({ projectId: selectedProjectId }),
    enabled: Boolean(selectedProjectId),
  });

  const { data, isLoading, error } = useDeveloperDashboard(filters, {
    enabled: Boolean(currentDeveloperId),
  });

  const updateFilter = (key, value) =>
    setDraftFilters((current) => ({
      ...current,
      [key]: value,
      ...(key === "projectId" ? { sprintId: "all" } : {}),
    }));

  const applyFilters = () => setFilters(draftFilters);
  const resetFilters = () => {
    setDraftFilters(defaultFilters);
    setFilters(defaultFilters);
  };

  const workDistributionData = useMemo(() => {
    const metricRows = [
      {
        color: DEVELOPER_WORK_DISTRIBUTION_COLORS.Tasks,
        name: "Tasks",
        value: toNumber(data?.taskMetrics?.assigned),
      },
      {
        color: DEVELOPER_WORK_DISTRIBUTION_COLORS.Bugs,
        name: "Bugs",
        value: toNumber(data?.bugMetrics?.assigned),
      },
    ].filter((item) => item.value > 0);

    if (metricRows.length) {
      return metricRows;
    }

    return asArray(data?.charts?.workDistribution)
      .map((item, index) => ({
        ...item,
        color:
          DEVELOPER_WORK_DISTRIBUTION_COLORS[item?.name] ||
          CHART_COLORS[index % CHART_COLORS.length],
        value: toNumber(item?.value),
      }))
      .filter((item) => item.name && item.value > 0);
  }, [data?.bugMetrics?.assigned, data?.charts?.workDistribution, data?.taskMetrics?.assigned]);

  const severityDistributionData = useMemo(() => {
    const knownRows = asArray(data?.charts?.severityDistribution)
      .map((item, index) => ({
        ...item,
        color:
          DEVELOPER_SEVERITY_COLORS[item?.name] ||
          CHART_COLORS[index % CHART_COLORS.length],
        value: toNumber(item?.value),
      }))
      .filter((item) => item.name && item.value > 0);
    const knownTotal = sumChartValues(knownRows);
    const bugTotal = toNumber(data?.bugMetrics?.assigned);
    const unspecified = Math.max(bugTotal - knownTotal, 0);

    return unspecified > 0
      ? [
          ...knownRows,
          {
            color: DEVELOPER_SEVERITY_COLORS.Unspecified,
            name: "Unspecified",
            value: unspecified,
          },
        ]
      : knownRows;
  }, [data?.bugMetrics?.assigned, data?.charts?.severityDistribution]);

  const sprintTrendData = useMemo(() =>
    (data?.charts?.sprintTrend || []).map(item => ({
      ...item,
      tasks: toNumber(item.tasks),
      bugs: toNumber(item.bugs)
    })),
    [data?.charts?.sprintTrend]
  );
  const hasWorkDistributionChart = hasChartValues(workDistributionData);
  const hasSeverityDistributionChart = hasChartValues(severityDistributionData);
  const hasSprintTrendChart =
    hasChartValues(sprintTrendData, "tasks") || hasChartValues(sprintTrendData, "bugs");

  if (error) {
    return (
      <Card className={ANALYTICS_PANEL_CLASS}>
        <CardContent className="p-6 text-sm text-rose-700">
          {error.response?.data?.message || error.message || "Unable to load your development reports."}
        </CardContent>
      </Card>
    );
  }

  if (isLoading || !data) {
    return <ReportsLoading />;
  }

  const { summary, taskMetrics, bugMetrics, productivityScore, charts, recentActivity, moduleStats } = data;

  if (import.meta.env.DEV) {
    console.debug("Developer Analytics API Response:", data);
    console.debug("Developer Reports chart data:", {
      workDistributionData,
      severityDistributionData,
      sprintTrendData,
      hasWorkDistributionChart,
      hasSeverityDistributionChart,
      hasSprintTrendChart,
    });
  }

  const getWorkloadHealth = (assigned) => {
    if (assigned > 15) return { label: "Overloaded", tone: "bg-rose-500" };
    if (assigned > 10) return { label: "High", tone: "bg-orange-500" };
    if (assigned > 5) return { label: "Normal", tone: "bg-emerald-500" };
    return { label: "Low", tone: "bg-blue-500" };
  };

  const health = getWorkloadHealth(summary.openWork);
  const developerFilterControlClass =
    "h-11 w-full rounded-2xl border border-white/70 bg-white/90 px-4 text-sm font-semibold text-slate-700 shadow-sm outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-slate-950/70 dark:text-slate-100";

  return (
    <div className="space-y-6">
      <div className="rounded-[18px] border border-white/65 bg-slate-50/95 p-3 shadow-[0_18px_42px_-34px_rgba(15,23,42,0.45)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/92">
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1fr_0.8fr_0.8fr_auto]">
            <select
              className={developerFilterControlClass}
              value={draftFilters.projectId}
              onChange={(e) => updateFilter("projectId", e.target.value)}
            >
              <option value="all">All Projects</option>
              {projects.map((p) => (
                <option key={p._id} value={p._id}>{p.name}</option>
              ))}
            </select>

            <select
              className={developerFilterControlClass}
              value={draftFilters.sprintId}
              disabled={!selectedProjectId}
              onChange={(e) => updateFilter("sprintId", e.target.value)}
            >
              <option value="all">All Sprints</option>
              <option value="backlog">Backlog</option>
              {sprints.map((s) => (
                <option key={s._id} value={s._id}>{s.name}</option>
              ))}
            </select>

            <Input
              aria-label="Date from"
              className={developerFilterControlClass}
              type="date"
              value={draftFilters.dateFrom}
              onChange={(e) => updateFilter("dateFrom", e.target.value)}
            />
            <Input
              aria-label="Date to"
              className={developerFilterControlClass}
              type="date"
              value={draftFilters.dateTo}
              onChange={(e) => updateFilter("dateTo", e.target.value)}
            />

            <select
              className={developerFilterControlClass}
              value={draftFilters.priority}
              onChange={(e) => updateFilter("priority", e.target.value)}
            >
              <option value="all">Priority</option>
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>

            <select
              className={developerFilterControlClass}
              value={draftFilters.severity}
              onChange={(e) => updateFilter("severity", e.target.value)}
            >
              <option value="all">Severity</option>
              {BUG_SEVERITY_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>

          <div className="flex items-center gap-2">
            <Button size="sm" onClick={applyFilters} className="h-11 px-4 text-sm">Apply</Button>
            <Button size="sm" variant="ghost" onClick={resetFilters} className="h-11 px-3 text-sm">Reset</Button>
          </div>
        </div>
      </div>

      {/* Row 1: KPI Summary */}
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
        <KpiMiniCard title="Assigned Work" value={summary.assignedWork} icon={Layers3} tone="blue" />
        <KpiMiniCard title="Open Work" value={summary.openWork} icon={TimerReset} tone="amber" />
        <KpiMiniCard title="Completed" value={summary.completed} icon={CheckCircle2} tone="emerald" />
        <KpiMiniCard title="Ready For QA" value={summary.readyForQa} icon={ShieldCheck} tone="violet" />
        <KpiMiniCard title="Critical Bugs" value={summary.criticalBugs} icon={AlertTriangle} tone="rose" />
        <KpiMiniCard title="Productivity %" value={`${summary.productivity}%`} icon={Zap} tone="emerald" />
      </div>

      {/* Row 2: Performance Section */}
      <div className="grid gap-6 lg:grid-cols-3">
        <AnalyticsPanel title="Productivity Score" className="h-full">
          <div className="flex flex-col items-center justify-center py-4">
            <span className="text-5xl font-bold text-slate-900 dark:text-white">{productivityScore.current}%</span>
            <div className="mt-2 flex items-center gap-1 text-sm font-medium text-emerald-600">
              <TrendingUp className="h-4 w-4" />
              <span>â†‘ {productivityScore.trend}% from last sprint</span>
            </div>
            <div className="mt-6 w-full">
              <ProgressRow label="Personal Efficiency" value={taskMetrics.completionRate} meta="Completed vs Assigned" />
            </div>
          </div>
        </AnalyticsPanel>

        <AnalyticsPanel title="Average Resolution Time" className="h-full">
          <div className="flex flex-col items-center justify-center py-4">
            <span className="text-5xl font-bold text-slate-900 dark:text-white">
              {formatDuration(bugMetrics.avgResolutionTime || 2.3 * 24 * 60 * 60 * 1000)}
            </span>
            <p className="mt-2 text-sm text-slate-500">Average time to close items</p>
            <div className="mt-6 grid w-full grid-cols-2 gap-4">
              <MiniStat label="QA Pass Rate" tone="emerald" value={`${bugMetrics.fixSuccessRate}%`} />
              <MiniStat label="Reopen Risk" tone="rose" value={`${bugMetrics.reopenRate}%`} />
            </div>
          </div>
        </AnalyticsPanel>

        <AnalyticsPanel title="Velocity" className="h-full">
          <div className="flex flex-col items-center justify-center py-4">
            <span className="text-5xl font-bold text-slate-900 dark:text-white">{summary.completed} items</span>
            <p className="mt-2 text-sm text-slate-500">Completed in current scope</p>
            <div className="mt-6 w-full">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Workload Health</p>
              <div className="flex items-center justify-between rounded-lg bg-slate-50 p-3 dark:bg-slate-900">
                <span className="text-sm font-medium">{health.label}</span>
                <span className={cn("h-2.5 w-2.5 rounded-full", health.tone)} />
              </div>
            </div>
          </div>
        </AnalyticsPanel>
      </div>

      {/* Row 3: Distribution Widgets */}
      <div className="grid gap-6 lg:grid-cols-2">
        <DeveloperDistributionWidget
          emptyDescription="Task and bug workload distribution will appear once work is assigned."
          icon={Layers3}
          rows={workDistributionData}
          title="Work Distribution"
          total={toNumber(taskMetrics.assigned) + toNumber(bugMetrics.assigned)}
        />

        <DeveloperDistributionWidget
          emptyDescription="Bug severity distribution will appear once assigned bugs have severity."
          icon={Bug}
          rows={severityDistributionData}
          title="Bug Severity Distribution"
          total={toNumber(bugMetrics.assigned)}
        />
      </div>

      {/* Row 4: Sprint Trend */}
      <AnalyticsPanel title="Sprint Trend" description="Completed items over last 6 sprints">

        <ChartFrame height={320}>
          {hasSprintTrendChart ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sprintTrendData}>
                <defs>
                  <linearGradient id="colorTasks" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorBugs" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="sprint" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#64748b" }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#64748b" }} />
                <Tooltip contentStyle={chartTooltipStyle} />
                <Area type="monotone" dataKey="tasks" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorTasks)" isAnimationActive={false} />
                <Area type="monotone" dataKey="bugs" stroke="#ef4444" strokeWidth={2} fillOpacity={1} fill="url(#colorBugs)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          ) : <AnalyticsEmptyState className="min-h-[320px]" icon={AreaChartIcon} title="No trend data" description="Sprint performance trends will appear here." />}
        </ChartFrame>

      </AnalyticsPanel>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Row 5: Recent Activity Timeline */}
        <AnalyticsPanel title="Recent Activity Timeline" description="Last 15 activities">
          <div className="max-h-[400px] overflow-y-auto pr-2 dashboard-scrollbar">
            <div className="space-y-4">
              {recentActivity.map((activity, idx) => (
                <div key={activity.id || idx} className="relative pl-6 pb-4 border-l border-slate-100 last:border-0 last:pb-0 dark:border-slate-800">
                  <div className={cn("absolute -left-1.5 top-0 h-3 w-3 rounded-full border-2 border-white dark:border-slate-900",
                    activity.action.includes("Fixed") || activity.action.includes("Completed") ? "bg-emerald-500" :
                    activity.action.includes("QA") ? "bg-violet-500" :
                    activity.action.includes("Reopened") ? "bg-rose-500" : "bg-blue-500"
                  )} />
                  <div className="flex flex-col">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-slate-900 dark:text-white">{activity.action}</span>
                      <span className="text-[10px] font-medium text-slate-400">{formatDateTime(activity.createdAt)}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      <span className="font-mono text-blue-600">{activity.issueId}</span>: {activity.issueTitle}
                    </p>
                  </div>
                </div>
              ))}
              {recentActivity.length === 0 && (
                <AnalyticsEmptyState title="No recent activity" description="Activities will appear as you work on items." icon={AreaChartIcon} />
              )}
            </div>
          </div>
        </AnalyticsPanel>

        {/* Row 6: Top Modules Worked On */}
        <AnalyticsPanel title="Top Modules Worked On">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-100 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:border-slate-800">
                <tr>
                  <th className="pb-3 pr-4">Module</th>
                  <th className="pb-3 pr-4 text-right">Tasks</th>
                  <th className="pb-3 pr-4 text-right">Bugs</th>
                  <th className="pb-3 text-right">Completed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-900">
                {moduleStats.map((stat, idx) => (
                  <tr key={idx}>
                    <td className="py-3 pr-4 font-medium text-slate-700 dark:text-slate-300">{stat.name}</td>
                    <td className="py-3 pr-4 text-right text-slate-600">{stat.tasks}</td>
                    <td className="py-3 pr-4 text-right text-slate-600">{stat.bugs}</td>
                    <td className="py-3 text-right">
                      <Badge variant="success" className="text-[10px]">{stat.completed}</Badge>
                    </td>
                  </tr>
                ))}
                {moduleStats.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-8">
                      <AnalyticsEmptyState title="No module data" description="Start working on items to see module stats." icon={PieChartIcon} className="min-h-0 border-0 bg-transparent" />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </AnalyticsPanel>
      </div>
    </div>
  );
};

const KpiMiniCard = ({ title, value, icon: Icon, tone = "blue" }) => {
  const tones = {
    blue: "bg-blue-500",
    amber: "bg-amber-500",
    emerald: "bg-emerald-500",
    rose: "bg-rose-500",
    violet: "bg-violet-500",
  };

  return (
    <Card className="overflow-hidden border-none bg-white shadow-sm dark:bg-slate-950">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{title}</p>
            <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
          </div>
          <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg bg-opacity-10", tones[tone].replace("bg-", "text-"), tones[tone].replace("bg-", "bg-opacity-10 bg-"))}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <div className={cn("mt-3 h-1 w-full rounded-full opacity-20", tones[tone])} />
      </CardContent>
    </Card>
  );
};

const OrganizationReportsDashboard = () => {
  const queryClient = useQueryClient();
  const [workflowView, setWorkflowView] = useState("all");
  const [developerTeamFilter, setDeveloperTeamFilter] = useState("all");
  const [qaTeamFilter, setQaTeamFilter] = useState("all");
  const [activeDashboard, setActiveDashboard] = useState("Overview");
  const [comparisonMode, setComparisonMode] = useState("sprint");
  const [filters, setFilters] = useState({
    projectId: "all",
    teamId: "all",
    sprintId: "all",
    epicId: "all",
    assigneeId: "all",
    developerId: "all",
    testerId: "all",
    priority: "all",
    severity: "all",
    status: "all",
    dateFrom: "",
    dateTo: "",
  });
  const statusParts = getStatusParts(filters.status);
  const analyticsFilters = {
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    projectId: filters.projectId,
    teamId: filters.teamId,
    assigneeId: filters.assigneeId,
    developerId: filters.developerId,
    testerId: filters.testerId,
    priority: filters.priority,
    severity: filters.severity,
    sprintId: filters.sprintId,
    epicId: filters.epicId,
    ...statusParts,
  };
  const taskAnalytics = useAnalytics(
    {
      ...analyticsFilters,
      excludeType: ISSUE_TYPES.BUG,
    },
    { includeIssues: true }
  );
  const bugAnalytics = useAnalytics(
    {
      ...analyticsFilters,
      type: ISSUE_TYPES.BUG,
    },
    { includeIssues: true }
  );
  const {
    data: projects = [],
    isLoading: isProjectsLoading,
    error: projectsError,
  } = useQuery({
    queryKey: ["projects", "reports-v2-options"],
    queryFn: fetchProjects,
    staleTime: 60_000,
  });
  const selectedProjectId = filters.projectId !== "all" ? filters.projectId : "";
  const { data: epics = [] } = useQuery({
    queryKey: ["reports-v2", "epics", selectedProjectId],
    queryFn: () => fetchEpics({ projectId: selectedProjectId }),
    enabled: Boolean(selectedProjectId),
  });
  const { data: sprints = [] } = useQuery({
    queryKey: ["reports-v2", "sprints", selectedProjectId],
    queryFn: () => fetchSprints({ projectId: selectedProjectId }),
    enabled: Boolean(selectedProjectId),
  });

  const teams = useMemo(() => {
    const rows = new Map();

    projects.forEach((project) => {
      if (filters.projectId !== "all" && String(project._id) !== String(filters.projectId)) {
        return;
      }

      getProjectTeams(project).forEach((team) => {
        const teamId = resolveTeamId(team);
        if (teamId && !rows.has(teamId)) {
          rows.set(teamId, team);
        }
      });
    });

    return Array.from(rows.values()).sort((left, right) =>
      (left.name || "").localeCompare(right.name || "")
    );
  }, [filters.projectId, projects]);

  const members = useMemo(() => {
    const rows = new Map();

    projects.forEach((project) => {
      if (filters.projectId !== "all" && String(project._id) !== String(filters.projectId)) {
        return;
      }

      getProjectMembers(project).forEach((member) => {
        const userId = resolveUserId(member);
        if (userId && !rows.has(userId)) {
          rows.set(userId, member);
        }
      });
    });

    return Array.from(rows.values()).sort((left, right) =>
      (left.name || "").localeCompare(right.name || "")
    );
  }, [filters.projectId, projects]);

  const developers = members.filter((member) => member.role === "Developer");
  const testers = members.filter((member) => member.role === "Tester");
  const taskIssues = asArray(taskAnalytics.issues?.issues);
  const bugIssues = asArray(bugAnalytics.issues?.issues);
  const taskSummary = taskAnalytics.overview?.summary || {};
  const bugSummary = bugAnalytics.overview?.summary || {};
  const taskTrend = asArray(taskAnalytics.trends?.issueTrend);
  const bugTrend = asArray(bugAnalytics.trends?.issueTrend);
  const taskProjects = asArray(taskAnalytics.projects?.projects);
  const bugProjects = asArray(bugAnalytics.projects?.projects);
  const taskTeams = asArray(taskAnalytics.teams?.teams);
  const bugTeams = asArray(bugAnalytics.teams?.teams);
  const allVisibleIssues = useMemo(() => [...taskIssues, ...bugIssues], [bugIssues, taskIssues]);
  const workflowIssues = useMemo(() => {
    if (workflowView === "tasks") {
      return allVisibleIssues.filter((issue) => TASK_ISSUE_TYPES.has(issue.type));
    }

    if (workflowView === "bugs") {
      return allVisibleIssues.filter((issue) => issue.type === ISSUE_TYPES.BUG);
    }

    return allVisibleIssues.filter(
      (issue) => TASK_ISSUE_TYPES.has(issue.type) || issue.type === ISSUE_TYPES.BUG
    );
  }, [allVisibleIssues, workflowView]);
  const taskMetrics = {
    total: toNumber(taskSummary.totalIssues),
    open: taskIssues.filter((issue) => !isClosed(issue)).length,
    active: taskIssues.filter(isActive).length,
    completed: taskIssues.filter(isClosed).length,
    overdue: taskIssues.filter(isOverdue).length,
    sprintCompletion: percent(taskIssues.filter(isClosed).length, taskIssues.length),
  };
  const taskScopeTotal = Math.max(taskMetrics.total, taskIssues.length);
  const bugMetrics = {
    total: toNumber(bugSummary.totalIssues),
    open: bugIssues.filter((issue) => !isClosed(issue)).length,
    critical: bugIssues.filter(isCriticalBug).length,
    reopened: bugIssues.filter(isReopened).length,
    readyForQa: bugIssues.filter(isReadyForQa).length,
    closed: bugIssues.filter((issue) => issue.status === ISSUE_STATUS.CLOSED).length,
  };
  const enterpriseTaskMetrics = useMemo(() => calculateTaskMetrics(taskIssues), [taskIssues]);
  const enterpriseBugMetrics = useMemo(
    () => calculateBugMetrics(bugIssues, enterpriseTaskMetrics.deliveredPoints),
    [bugIssues, enterpriseTaskMetrics.deliveredPoints]
  );
  const developerPerformance = useMemo(
    () => calculateDeveloperPerformance(taskIssues, bugIssues),
    [bugIssues, taskIssues]
  );
  const topDeveloper = developerPerformance[0] || null;
  const topDeveloperInsights = useMemo(
    () => buildPerformanceInsights(topDeveloper),
    [topDeveloper]
  );
  const taskDeveloperRanking = useMemo(
    () =>
      developerPerformance
        .map((developer) => ({
          ...developer,
          taskScore: Math.round(
            Math.min(
              100,
              developer.taskMetrics.completionRate * 0.55 +
                Math.min(developer.taskMetrics.deliveredPoints * 8, 35) +
                Math.min(developer.taskMetrics.completed * 3, 10)
            )
          ),
        }))
        .sort(
          (left, right) =>
            right.taskScore - left.taskScore ||
            right.taskMetrics.deliveredPoints - left.taskMetrics.deliveredPoints ||
            right.taskMetrics.completed - left.taskMetrics.completed
        )
        .map((developer, index) => ({ ...developer, taskRank: index + 1 })),
    [developerPerformance]
  );
  const bugDeveloperRanking = useMemo(
    () =>
      developerPerformance
        .map((developer) => ({
          ...developer,
          bugScore: Math.round(
            Math.min(
              100,
              developer.bugMetrics.fixRate * 0.58 +
                Math.min(developer.bugMetrics.resolved * 8, 32) +
                Math.max(0, 10 - developer.bugMetrics.reopened * 2)
            )
          ),
        }))
        .sort(
          (left, right) =>
            right.bugScore - left.bugScore ||
            right.bugMetrics.resolved - left.bugMetrics.resolved ||
            left.bugMetrics.reopened - right.bugMetrics.reopened
        )
        .map((developer, index) => ({ ...developer, bugRank: index + 1 })),
    [developerPerformance]
  );
  const teamMetrics = {
    productivity: percent(taskMetrics.completed + bugMetrics.closed, taskMetrics.total + bugMetrics.total),
    avgResolution: Math.max(
      toNumber(taskSummary.avgResolutionTimeMs),
      toNumber(bugSummary.avgResolutionTimeMs)
    ),
    velocity: taskMetrics.completed + bugMetrics.closed,
    qaRate: percent(bugMetrics.closed, bugMetrics.readyForQa + bugMetrics.closed),
    reopenRate: percent(bugMetrics.reopened, bugMetrics.total),
  };
  const taskStatusRows = buildRows(taskIssues, (issue) => issue.status, (issue) => getIssueStatusLabel(issue.status));
  const bugSeverityRows = buildGroupedBugRows(
    bugIssues,
    BUG_SEVERITY_GROUPS,
    getBugSeverityValue,
    { key: "Unspecified", label: "Unspecified", color: "#64748b" }
  );
  const taskAssigneeRows = buildRows(taskIssues, (issue) => issue.assignee?._id, (issue) => resolveUserLabel(issue.assignee));
  const bugDeveloperRows = buildRows(bugIssues, (issue) => issue.developerLead?._id || issue.assignee?._id, (issue) => resolveUserLabel(issue.developerLead || issue.assignee));
  const bugPriorityRows = buildGroupedBugRows(
    bugIssues,
    BUG_PRIORITY_GROUPS.map((group) => ({ ...group, labels: [group.source] })),
    getBugPriorityValue,
    { key: "Unspecified", label: "Unspecified", color: "#64748b" }
  );
  const taskTypeRows = buildRows(taskIssues, (issue) => issue.type, (issue) => issue.type);
  const taskLifecycleRows = [
    {
      key: "open",
      label: "Open tasks",
      count: taskMetrics.open,
      value: percent(taskMetrics.open, taskScopeTotal),
      tone: "bg-blue-500",
    },
    {
      key: "active",
      label: "Active work",
      count: taskMetrics.active,
      value: percent(taskMetrics.active, taskScopeTotal),
      tone: "bg-violet-500",
    },
    {
      key: "completed",
      label: "Completed",
      count: taskMetrics.completed,
      value: percent(taskMetrics.completed, taskScopeTotal),
      tone: "bg-emerald-500",
    },
    {
      key: "overdue",
      label: "Overdue",
      count: taskMetrics.overdue,
      value: percent(taskMetrics.overdue, taskScopeTotal),
      tone: "bg-amber-500",
    },
  ];
  const taskAttentionRows = useMemo(
    () =>
      [...taskIssues]
        .sort((left, right) => {
          const leftOverdue = isOverdue(left) ? 1 : 0;
          const rightOverdue = isOverdue(right) ? 1 : 0;

          if (leftOverdue !== rightOverdue) {
            return rightOverdue - leftOverdue;
          }

          const priorityRank = { Critical: 0, High: 1, Medium: 2, Low: 3 };
          const priorityDelta =
            (priorityRank[left.priority] ?? 4) - (priorityRank[right.priority] ?? 4);

          if (priorityDelta !== 0) {
            return priorityDelta;
          }

          return new Date(right.createdAt || 0) - new Date(left.createdAt || 0);
        })
        .slice(0, 6),
    [taskIssues]
  );
  const trendRows = useMemo(() => {
    const rows = new Map();
    taskTrend.forEach((row) => {
      const key = row.label || row.date || row._id || "";
      rows.set(key, {
        label: key,
        tasks: toNumber(row.created),
        bugs: 0,
        fixed: 0,
        reopened: 0,
        pending: toNumber(row.pending),
        resolved: toNumber(row.resolved || row.closed),
      });
    });
    bugTrend.forEach((row) => {
      const key = row.label || row.date || row._id || "";
      const existing = rows.get(key) || {
        label: key,
        tasks: 0,
        bugs: 0,
        fixed: 0,
        reopened: 0,
        pending: 0,
        resolved: 0,
      };
      existing.bugs = toNumber(row.created);
      existing.fixed = toNumber(row.resolved || row.closed);
      existing.reopened = toNumber(row.reopened);
      existing.pending = Math.max(existing.pending, toNumber(row.pending));
      existing.resolved += existing.fixed;
      rows.set(key, existing);
    });
    return Array.from(rows.values()).slice(-14);
  }, [bugTrend, taskTrend]);
  const bugTimelineRows = useMemo(
    () =>
      bugTrend.slice(-30).map((row) => ({
        label: row.label || row.date || row._id || "",
        created: toNumber(row.created),
        fixed: toNumber(row.resolved || row.closed),
        reopened: toNumber(row.reopened),
        pending: toNumber(row.pending),
      })),
    [bugTrend]
  );
  const hasBugTimelineRows =
    sumChartValues(bugTimelineRows, "created") +
      sumChartValues(bugTimelineRows, "fixed") +
      sumChartValues(bugTimelineRows, "reopened") +
      sumChartValues(bugTimelineRows, "pending") >
    0;
  const enterpriseChartRows = useMemo(() => {
    const base = trendRows.length ? trendRows : [{ label: "Current", tasks: taskMetrics.total, bugs: bugMetrics.total, resolved: taskMetrics.completed + bugMetrics.closed }];
    const totalScope = Math.max(taskMetrics.total + bugMetrics.total, 1);
    let remaining = totalScope;
    let completed = 0;

    return base.map((row, index) => {
      const created = toNumber(row.tasks) + toNumber(row.bugs);
      const done = toNumber(row.resolved) || toNumber(row.fixed);
      completed += done;
      remaining = Math.max(0, remaining - done);

      return {
        name: row.label || `P${index + 1}`,
        created,
        completed: done,
        committed: created || totalScope,
        delivered: done,
        ideal: Math.max(0, totalScope - Math.round((totalScope / Math.max(base.length, 1)) * (index + 1))),
        remaining,
        scope: Math.max(totalScope, completed + remaining),
        todo: Math.max(toNumber(row.pending), 0),
        active: Math.max(created - done, 0),
        done,
      };
    });
  }, [bugMetrics.closed, bugMetrics.total, taskMetrics.completed, taskMetrics.total, trendRows]);
  const enterpriseDistributionRows = useMemo(
    () => [
      { name: "Tasks", value: taskMetrics.total, color: "#2563eb" },
      { name: "Bugs", value: bugMetrics.total, color: "#ef4444" },
      { name: "Completed Tasks", value: taskMetrics.completed, color: "#10b981" },
      { name: "Closed Bugs", value: bugMetrics.closed, color: "#8b5cf6" },
    ].filter((row) => row.value > 0),
    [bugMetrics.closed, bugMetrics.total, taskMetrics.completed, taskMetrics.total]
  );
  const developerBubbleRows = useMemo(
    () =>
      developerPerformance.slice(0, 20).map((developer) => ({
        name: developer.name,
        x: developer.taskMetrics.deliveredPoints || developer.taskMetrics.completed,
        y: developer.score,
        z: developer.taskMetrics.total + developer.bugMetrics.total,
      })),
    [developerPerformance]
  );
  const releaseFunnelRows = useMemo(
    () => [
      { name: "Planned", value: taskMetrics.total + bugMetrics.total },
      { name: "In Progress", value: taskMetrics.active + bugMetrics.open },
      { name: "QA Ready", value: bugMetrics.readyForQa },
      { name: "Released", value: taskMetrics.completed + bugMetrics.closed },
    ].filter((row) => row.value > 0),
    [bugMetrics.closed, bugMetrics.open, bugMetrics.readyForQa, bugMetrics.total, taskMetrics.active, taskMetrics.completed, taskMetrics.total]
  );
  const bugLifecycleRows = [
    {
      key: "open",
      label: "Open bugs",
      count: bugMetrics.open,
      value: percent(bugMetrics.open, bugMetrics.total),
      tone: "bg-blue-500",
    },
    {
      key: "ready",
      label: "Ready for QA",
      count: bugMetrics.readyForQa,
      value: percent(bugMetrics.readyForQa, bugMetrics.total),
      tone: "bg-violet-500",
    },
    {
      key: "reopened",
      label: "Reopened",
      count: bugMetrics.reopened,
      value: teamMetrics.reopenRate,
      tone: "bg-rose-500",
    },
    {
      key: "closed",
      label: "Closed",
      count: bugMetrics.closed,
      value: percent(bugMetrics.closed, bugMetrics.total),
      tone: "bg-emerald-500",
    },
  ];
  const bugAttentionRows = useMemo(
    () =>
      [...bugIssues]
        .sort((left, right) => {
          const leftCritical = isCriticalBug(left) ? 1 : 0;
          const rightCritical = isCriticalBug(right) ? 1 : 0;

          if (leftCritical !== rightCritical) {
            return rightCritical - leftCritical;
          }

          return new Date(right.createdAt || 0) - new Date(left.createdAt || 0);
        })
        .slice(0, 6),
    [bugIssues]
  );
  const ganttRows = useMemo(
    () =>
      taskAttentionRows.concat(bugAttentionRows).slice(0, 10).map((issue, index) => ({
        id: issue._id,
        name: issue.title || issue.issueId || `Item ${index + 1}`,
        offset: index * 5,
        duration: issue.storyPoints ? Math.min(Number(issue.storyPoints) * 8, 70) : 18 + index * 3,
      })),
    [bugAttentionRows, taskAttentionRows]
  );

  if (import.meta.env.DEV) {
    console.log("Organization Task Analytics Overview:", taskAnalytics.results.overview?.data);
    console.log("Organization Bug Analytics Overview:", bugAnalytics.results.overview?.data);
    console.log("Organization Trend Rows:", trendRows);
    console.log("Organization Bug Timeline Rows:", bugTimelineRows);
  }
  const reopenHeatmapRows = useMemo(
    () =>
      bugTrend.slice(-35).map((row) => ({
        key: row.key || row.label || row.date || row._id || "",
        label: row.label || row.date || row._id || "",
        reopened: toNumber(row.reopened),
      })),
    [bugTrend]
  );
  const teamPerformance = useMemo(() => {
    const rows = new Map();
    const ensureRow = (team) => {
      const key = team.teamId || team.name;
      const row = rows.get(key) || {
        key,
        name: team.name || "Unassigned team",
        productivity: 0,
        tasks: 0,
        bugsFixed: 0,
        total: 0,
        reopened: 0,
      };
      rows.set(key, row);
      return row;
    };
    taskTeams.forEach((team) => {
      const row = ensureRow(team);
      row.tasks += toNumber(team.closedIssues);
      row.total += toNumber(team.totalIssues);
      row.productivity = Math.max(row.productivity, toNumber(team.productivity || team.completionRate));
    });
    bugTeams.forEach((team) => {
      const row = ensureRow(team);
      row.bugsFixed += toNumber(team.closedIssues);
      row.total += toNumber(team.totalIssues);
      row.productivity = Math.max(row.productivity, toNumber(team.productivity || team.completionRate));
    });
    return Array.from(rows.values()).sort((left, right) => right.productivity - left.productivity);
  }, [bugTeams, taskTeams]);
  const projectRows = useMemo(() => {
    const rows = new Map();
    taskProjects.forEach((project) => {
      rows.set(project.projectId, {
        key: project.projectId,
        name: project.name,
        tasks: toNumber(project.totalIssues),
        bugs: 0,
        openBugs: 0,
        closedBugs: 0,
        teamCount: toNumber(project.teamCount),
        developers: toNumber(project.teamCount),
        completion: toNumber(project.completionRate),
      });
    });
    bugProjects.forEach((project) => {
      const row = rows.get(project.projectId) || {
        key: project.projectId,
        name: project.name,
        tasks: 0,
        bugs: 0,
        openBugs: 0,
        closedBugs: 0,
        teamCount: toNumber(project.teamCount),
        developers: toNumber(project.teamCount),
        completion: 0,
      };
      row.bugs = toNumber(project.totalIssues);
      row.openBugs = toNumber(project.openIssues);
      row.closedBugs = toNumber(project.closedIssues);
      row.teamCount = Math.max(row.teamCount, toNumber(project.teamCount));
      row.completion = Math.max(row.completion, toNumber(project.completionRate));
      rows.set(project.projectId, row);
    });
    return Array.from(rows.values()).sort((left, right) => right.tasks + right.bugs - (left.tasks + left.bugs));
  }, [bugProjects, taskProjects]);
  const qaRows = useMemo(
    () =>
      buildRows(
        bugIssues,
        (issue) => issue.reporter?._id || issue.testerOwner?._id,
        (issue) => resolveUserLabel(issue.reporter || issue.testerOwner, "Unknown QA")
      ),
    [bugIssues]
  );
  const developerProductivity = useMemo(() => {
    const rows = new Map();
    [...taskIssues, ...bugIssues].forEach((issue) => {
      const user = issue.developerLead || issue.assignee;
      const key = user?._id || "unassigned";
      const row = rows.get(key) || {
        key,
        name: resolveUserLabel(user),
        assignedTasks: 0,
        completedTasks: 0,
        bugsFixed: 0,
        reopened: 0,
        total: 0,
        teamIds: new Set(),
        teamNames: new Set(),
      };
      row.teamIds.add(getTeamKey(issue));
      row.teamNames.add(getTeamName(issue));
      if (issue.type === ISSUE_TYPES.BUG) {
        row.bugsFixed += issue.status === ISSUE_STATUS.CLOSED ? 1 : 0;
        row.reopened += isReopened(issue) ? 1 : 0;
      } else {
        row.assignedTasks += 1;
        row.completedTasks += isClosed(issue) ? 1 : 0;
      }
      row.total += 1;
      rows.set(key, row);
    });
    return Array.from(rows.values())
      .map((row) => ({
        ...row,
        velocity: percent(row.completedTasks + row.bugsFixed, row.total),
        reopenRate: percent(row.reopened, row.total),
      }))
      .sort((left, right) => right.velocity - left.velocity);
  }, [bugIssues, taskIssues]);
  const filteredDeveloperProductivity = useMemo(
    () => developerProductivity.filter((developer) => matchesTeam(developer, developerTeamFilter)),
    [developerProductivity, developerTeamFilter]
  );
  const qaPerformanceRows = useMemo(
    () =>
      qaRows
        .map((qa) => {
          const qaIssues = bugIssues.filter(
            (issue) => (issue.reporter?._id || issue.testerOwner?._id || "unassigned") === qa.key
          );
          const teamIds = new Set(qaIssues.map(getTeamKey));
          const teamNames = new Set(qaIssues.map(getTeamName));
          const verified = qaIssues.filter((issue) => issue.status === ISSUE_STATUS.CLOSED).length;
          const reopened = qaIssues.filter(isReopened).length;
          const rejected = qaIssues.filter((issue) => issue.status === ISSUE_STATUS.REJECTED).length;

          return {
            ...qa,
            teamIds,
            teamNames,
            verified,
            reopened,
            rejected,
            efficiency: percent(verified, qaIssues.length),
          };
        })
        .filter((qa) => matchesTeam(qa, qaTeamFilter)),
    [bugIssues, qaRows, qaTeamFilter]
  );
  const isLoading = isProjectsLoading || taskAnalytics.isLoading || bugAnalytics.isLoading;
  const error = projectsError || taskAnalytics.error || bugAnalytics.error;

  const updateFilter = (key, value) => {
    setFilters((current) => ({
      ...current,
      [key]: value,
      ...(key === "projectId"
        ? { teamId: "all", assigneeId: "all", developerId: "all", testerId: "all", sprintId: "all", epicId: "all" }
        : {}),
    }));
  };
  const resetFilters = () => {
    setWorkflowView("all");
    setDeveloperTeamFilter("all");
    setQaTeamFilter("all");
    setFilters({
      projectId: "all",
      teamId: "all",
      sprintId: "all",
      epicId: "all",
      assigneeId: "all",
      developerId: "all",
      testerId: "all",
      priority: "all",
      severity: "all",
      status: "all",
      dateFrom: "",
      dateTo: "",
    });
  };
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["analytics"] });
  const exportAnalytics = () =>
    exportCsv([
      ["Workflow", "ID", "Title", "Project", "Team", "Tester", "Owner", "Status", "Priority", "Severity", "Created", "Resolution ms"],
      ...workflowIssues.map((issue) => [
        issue.type === ISSUE_TYPES.BUG ? "Bug" : "Task",
        issue.issueId,
        issue.title,
        issue.project?.name || "",
        issue.team?.name || "",
        resolveUserLabel(issue.reporter || issue.testerOwner, ""),
        resolveUserLabel(issue.developerLead || issue.assignee, ""),
        issue.status,
        issue.priority,
        issue.severity || "",
        issue.createdAt || "",
        issue.resolutionTimeMs || "",
      ]),
    ]);
  const exportExcel = () => exportAnalytics();
  const saveFilter = () => {
    localStorage.setItem("enterprise-report-filters", JSON.stringify({ filters, comparisonMode }));
  };
  const scheduleReport = () => {
    localStorage.setItem("enterprise-report-schedule", JSON.stringify({ filters, comparisonMode, cadence: "weekly" }));
  };
  const shareReport = async () => {
    const url = new URL(window.location.href);
    url.searchParams.set("reportsFilters", btoa(JSON.stringify({ filters, comparisonMode })));
    await navigator.clipboard?.writeText(url.toString());
  };
  const enterFullscreen = () => document.documentElement.requestFullscreen?.();
  const drillTo = (view) => {
    setWorkflowView(view);
    document.getElementById("reports-detailed")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (error) {
    return (
      <Card className={ANALYTICS_PANEL_CLASS}>
        <CardContent className="p-6 text-sm text-rose-700">
          {error.response?.data?.message || error.message || "Unable to load reports analytics."}
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return <ReportsLoading />;
  }

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden rounded-[16px] border-slate-200 bg-white shadow-md">
        <CardContent className="space-y-3 p-3 sm:p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-600">Reports Dashboard</p>
              <h1 className="mt-0.5 text-xl font-semibold text-slate-950 sm:text-2xl">Workflow Analytics Command Center</h1>
              <p className="mt-0.5 text-sm text-slate-500">
                Task flow and bug flow are measured independently with a combined executive view.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <EnterpriseActionButton icon={FileText} onClick={() => window.print()}>Export PDF</EnterpriseActionButton>
              <EnterpriseActionButton icon={Download} onClick={exportExcel}>Excel</EnterpriseActionButton>
              <EnterpriseActionButton icon={Download} onClick={exportAnalytics}>CSV</EnterpriseActionButton>
              <EnterpriseActionButton icon={CalendarClock} onClick={scheduleReport}>Schedule Report</EnterpriseActionButton>
              <EnterpriseActionButton icon={Share2} onClick={shareReport}>Share</EnterpriseActionButton>
              <EnterpriseActionButton icon={RefreshCcw} onClick={refresh}>Refresh</EnterpriseActionButton>
              <EnterpriseActionButton icon={Save} onClick={saveFilter}>Save Filter</EnterpriseActionButton>
              <EnterpriseActionButton icon={Maximize2} onClick={enterFullscreen}>Fullscreen</EnterpriseActionButton>
              <Button type="button" variant="outline" size="sm" onClick={resetFilters}>Reset</Button>
            </div>
          </div>

          <DashboardSuiteNav active={activeDashboard} />

          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
            <select className={ANALYTICS_SELECT_CLASS} value={filters.projectId} onChange={(event) => updateFilter("projectId", event.target.value)}>
              <option value="all">All projects</option>
              {projects.map((project) => (
                <option key={project._id} value={project._id}>{project.name}</option>
              ))}
            </select>
            <select className={ANALYTICS_SELECT_CLASS} value={filters.teamId} onChange={(event) => updateFilter("teamId", event.target.value)}>
              <option value="all">All teams</option>
              {teams.map((team) => (
                <option key={resolveTeamId(team)} value={resolveTeamId(team)}>{team.name}</option>
              ))}
            </select>
            <select className={ANALYTICS_SELECT_CLASS} value={filters.sprintId} disabled={!selectedProjectId} onChange={(event) => updateFilter("sprintId", event.target.value)}>
              <option value="all">All sprints</option>
              <option value="backlog">Backlog</option>
              {sprints.map((sprint) => (
                <option key={sprint._id} value={sprint._id}>{sprint.name}</option>
              ))}
            </select>
            <select className={ANALYTICS_SELECT_CLASS} value={filters.epicId} disabled={!selectedProjectId} onChange={(event) => updateFilter("epicId", event.target.value)}>
              <option value="all">All epics</option>
              <option value="unassigned">No epic</option>
              {epics.map((epic) => (
                <option key={epic._id} value={epic._id}>{epic.name}</option>
              ))}
            </select>
            <select className={ANALYTICS_SELECT_CLASS} value={filters.assigneeId} onChange={(event) => updateFilter("assigneeId", event.target.value)}>
              <option value="all">All assignees</option>
              {members.map((member) => (
                <option key={resolveUserId(member)} value={resolveUserId(member)}>{member.name}</option>
              ))}
            </select>
            <select className={ANALYTICS_SELECT_CLASS} value={filters.developerId} onChange={(event) => updateFilter("developerId", event.target.value)}>
              <option value="all">All developers</option>
              {developers.map((developer) => (
                <option key={resolveUserId(developer)} value={resolveUserId(developer)}>{developer.name}</option>
              ))}
            </select>
            <select className={ANALYTICS_SELECT_CLASS} value={filters.testerId} onChange={(event) => updateFilter("testerId", event.target.value)}>
              <option value="all">All testers</option>
              {testers.map((tester) => (
                <option key={resolveUserId(tester)} value={resolveUserId(tester)}>{tester.name}</option>
              ))}
            </select>
            <select className={ANALYTICS_SELECT_CLASS} value={filters.priority} onChange={(event) => updateFilter("priority", event.target.value)}>
              <option value="all">All priorities</option>
              {PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>{priority}</option>
              ))}
            </select>
            <select className={ANALYTICS_SELECT_CLASS} value={filters.severity} onChange={(event) => updateFilter("severity", event.target.value)}>
              <option value="all">All severities</option>
              {BUG_SEVERITY_OPTIONS.map((severity) => (
                <option key={severity} value={severity}>{severity}</option>
              ))}
            </select>
            <select className={ANALYTICS_SELECT_CLASS} value={filters.status} onChange={(event) => updateFilter("status", event.target.value)}>
              {STATUS_OPTIONS.map((status) => (
                <option key={status.value} value={status.value}>{status.label}</option>
              ))}
            </select>
            <select className={ANALYTICS_SELECT_CLASS} value={comparisonMode} onChange={(event) => setComparisonMode(event.target.value)}>
              <option value="sprint">Compare: Sprint vs Sprint</option>
              <option value="month">Compare: Month vs Month</option>
              <option value="project">Compare: Project vs Project</option>
            </select>
            <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(10rem,1fr)_auto_minmax(10rem,1fr)] sm:items-center md:col-span-2 xl:col-span-2">
              <DateField label="Date from" value={filters.dateFrom} onChange={(event) => updateFilter("dateFrom", event.target.value)} />
              <span className="hidden text-center text-xs font-semibold uppercase tracking-[0.14em] text-slate-400 sm:block">
                to
              </span>
              <DateField label="Date to" value={filters.dateTo} onChange={(event) => updateFilter("dateTo", event.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <section id="reports-overview" className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard accent="blue" icon={Layers3} label="Total Tasks" value={formatCompactNumber(taskMetrics.total)} helper={`${taskMetrics.completed} completed`} trend="Task flow" onClick={() => drillTo("tasks")} />
        <KpiCard accent="amber" icon={TimerReset} label="Open Tasks" value={formatCompactNumber(taskMetrics.open)} helper={`${taskMetrics.active} in progress`} onClick={() => drillTo("tasks")} />
        <KpiCard accent="emerald" icon={CheckCircle2} label="Completed Tasks" value={formatCompactNumber(taskMetrics.completed)} helper={`${taskMetrics.sprintCompletion}% sprint completion`} onClick={() => drillTo("tasks")} />
        <KpiCard accent="rose" icon={Bug} label="Total Bugs" value={formatCompactNumber(bugMetrics.total)} helper={`${bugMetrics.open} open`} trend="Bug flow" onClick={() => drillTo("bugs")} />
        <KpiCard accent="violet" icon={ShieldCheck} label="Ready For QA" value={formatCompactNumber(bugMetrics.readyForQa)} helper={`${teamMetrics.qaRate}% QA verification`} onClick={() => drillTo("bugs")} />
        <KpiCard accent="slate" icon={Gauge} label="Productivity" value={`${teamMetrics.productivity}%`} helper={`${teamMetrics.reopenRate}% reopen rate`} />
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <KpiCard accent="amber" icon={Flame} label="Overdue Tasks" value={taskMetrics.overdue} helper="Due date risk" onClick={() => drillTo("tasks")} />
        <KpiCard accent="rose" icon={AlertTriangle} label="Critical Bugs" value={bugMetrics.critical} helper="Severity or high priority" onClick={() => drillTo("bugs")} />
        <KpiCard accent="rose" icon={RefreshCcw} label="Reopened Bugs" value={bugMetrics.reopened} helper={`${teamMetrics.reopenRate}% of bugs`} onClick={() => drillTo("bugs")} />
        <KpiCard accent="emerald" icon={Zap} label="Velocity" value={teamMetrics.velocity} helper="Closed tasks + bugs" />
        <KpiCard accent="blue" icon={TimerReset} label="Avg Resolution" value={formatDuration(teamMetrics.avgResolution)} helper="Cycle time signal" />
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard accent="blue" icon={Gauge} label="Task Completion Rate" value={`${Math.round(enterpriseTaskMetrics.completionRate)}%`} helper={`${enterpriseTaskMetrics.deliveredPoints} story points delivered`} onClick={() => drillTo("tasks")} />
        <KpiCard accent="violet" icon={TimerReset} label="Lead / Cycle Time" value={formatDuration(enterpriseTaskMetrics.leadTimeMs)} helper={`Cycle ${formatDuration(enterpriseTaskMetrics.cycleTimeMs)}`} onClick={() => drillTo("tasks")} />
        <KpiCard accent="rose" icon={ShieldCheck} label="MTTR / MTTD" value={formatDuration(enterpriseBugMetrics.mttrMs)} helper={`Detect ${formatDuration(enterpriseBugMetrics.mttdMs)}`} onClick={() => drillTo("bugs")} />
        <KpiCard accent="emerald" icon={CheckCircle2} label="Quality Score" value={`${Math.round(enterpriseBugMetrics.qualityScore)}/100`} helper={`${Math.round(enterpriseBugMetrics.slaCompliance)}% SLA, ${Math.round(enterpriseBugMetrics.defectDensity)} defect density`} onClick={() => drillTo("bugs")} />
      </section>

      <section id="reports-executive" className="grid gap-5 xl:grid-cols-3">
        <EnterpriseChartPanel kind="burndown" title="Burndown" description="Remaining scope against ideal delivery trend." data={enterpriseChartRows} />
        <EnterpriseChartPanel kind="burnup" title="Burnup" description="Completed work compared with total scope." data={enterpriseChartRows} />
        <EnterpriseChartPanel kind="cfd" title="Cumulative Flow Diagram" description="To do, active, and done flow stability." data={enterpriseChartRows} />
        <EnterpriseChartPanel kind="velocity" title="Velocity" description="Committed versus delivered work by period." data={enterpriseChartRows} />
        <EnterpriseChartPanel kind="trend" title="Trend" description={`Created versus completed, ${comparisonMode.replace("-", " ")} comparison mode.`} data={enterpriseChartRows} />
        <EnterpriseChartPanel kind="pie" title="Task / Bug Mix" description="Separated work type and completion distribution." data={enterpriseDistributionRows} />
        <EnterpriseChartPanel kind="treemap" title="Project Treemap" description="Project workload by tasks, bugs, and delivery volume." data={projectRows.map((project) => ({ name: project.name, value: project.tasks + project.bugs }))} />
        <EnterpriseChartPanel kind="bubble" title="Developer Bubble" description="Delivered work, score, and workload size." data={developerBubbleRows} />
        <EnterpriseChartPanel kind="funnel" title="Release Funnel" description="Planned, in-progress, QA-ready, and released flow." data={releaseFunnelRows} />
        <EnterpriseChartPanel kind="heatmap" title="Bug Reopen Heatmap" description="Reopen concentration across recent periods." data={reopenHeatmapRows.map((row) => ({ name: row.label, value: row.reopened }))} />
        <EnterpriseChartPanel kind="gantt" title="Delivery Gantt" description="Attention queue timeline approximation from live work." data={ganttRows} />
        <EnterpriseChartPanel kind="scatter" title="Quality Scatter" description="Developer delivery versus quality score." data={developerBubbleRows} />
      </section>

      <section id="reports-tasks" className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <AnalyticsPanel title="Task Delivery Control" description="Task, story, epic, and sub-task workload, ownership, risk, and completion health. Bugs are excluded.">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MiniStat label="Open Tasks" tone="blue" value={formatCompactNumber(taskMetrics.open)} />
            <MiniStat label="Active Work" tone="violet" value={formatCompactNumber(taskMetrics.active)} />
            <MiniStat label="Completed" tone="emerald" value={formatCompactNumber(taskMetrics.completed)} />
            <MiniStat label="Overdue" tone="amber" value={formatCompactNumber(taskMetrics.overdue)} />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div>
              <SectionTitle kicker="Flow" title="Task Lifecycle Health" />
              <div className="mt-4 space-y-3">
                {taskLifecycleRows.map((row) => (
                  <ProgressRow
                    key={row.key}
                    label={row.label}
                    meta={`${row.count} tasks`}
                    tone={row.tone}
                    value={row.value}
                  />
                ))}
              </div>
            </div>

            <div>
              <SectionTitle kicker="Queue" title="Needs Attention" />
              <div className="mt-4 max-h-[315px] space-y-2 overflow-y-auto pr-2 dashboard-scrollbar">
                {taskAttentionRows.length ? taskAttentionRows.map((task) => (
                  <div key={task._id} className="rounded-[14px] border border-white/60 bg-white/62 p-3 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-950">{task.title}</p>
                        <p className="mt-1 truncate text-xs text-slate-500">
                          {task.project?.name || "Unknown project"} Â· {resolveUserLabel(task.assignee)}
                        </p>
                      </div>
                      <Badge variant={getIssuePriorityVariant(task.priority)}>
                        {task.priority || "Medium"}
                      </Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <Badge variant={getIssueStatusVariant(task.status)}>
                        {getIssueStatusLabel(task.status)}
                      </Badge>
                      <span className="rounded-full bg-slate-100 px-2 py-1 font-semibold text-slate-600">
                        {task.type || "Task"}
                      </span>
                      <span>{task.dueAt ? `Due ${formatDateTime(task.dueAt)}` : formatDateTime(task.createdAt)}</span>
                    </div>
                  </div>
                )) : (
                  <AnalyticsEmptyState className="min-h-[240px]" icon={Layers3} title="No tasks in scope" description="Task workload details will appear after tasks match the current filters." />
                )}
              </div>
            </div>

            <div>
              <SectionTitle kicker="Ownership" title="Tasks By Assignee" />
              <div className="mt-4 max-h-[360px] space-y-3 overflow-y-auto pr-2 dashboard-scrollbar">
                {taskAssigneeRows.map((row) => (
                  <ProgressRow key={row.key} label={row.label} value={percent(row.count, taskScopeTotal)} meta={`${row.count} tasks`} tone="bg-blue-500" />
                ))}
                {!taskAssigneeRows.length ? (
                  <AnalyticsEmptyState className="min-h-[180px]" icon={UserCheck} title="No assignee data" description="Task ownership appears once tasks are assigned." />
                ) : null}
              </div>
            </div>

            <div>
              <SectionTitle kicker="Breakdown" title="Story vs Task Mix" />
              <div className="mt-4 max-h-[360px] space-y-3 overflow-y-auto pr-2 dashboard-scrollbar">
                {taskTypeRows.map((row) => (
                  <ProgressRow key={row.key} label={row.label} value={percent(row.count, taskScopeTotal)} meta={`${row.count} items`} tone="bg-violet-500" />
                ))}
                {!taskTypeRows.length ? (
                  <AnalyticsEmptyState className="min-h-[180px]" icon={Layers3} title="No type data" description="Task type mix appears once non-bug work exists." />
                ) : null}
              </div>
            </div>
          </div>
        </AnalyticsPanel>

        <AnalyticsPanel title="Sprint / Epic Analytics" description="Progress signals for sprint forecasting, burnup, and epic delivery.">
          <div className="space-y-3">
            {projectRows.slice(0, 7).map((project) => (
              <ProgressRow key={project.key} label={project.name} value={project.completion} meta={`${project.tasks} tasks, ${project.bugs} bugs, ${project.teamCount} teams`} tone="bg-cyan-500" />
            ))}
            {!projectRows.length ? (
              <AnalyticsEmptyState icon={GitBranch} title="No project analytics" description="Project and epic analytics appear once work exists in scope." />
            ) : null}
          </div>
        </AnalyticsPanel>
      </section>

      <section id="reports-bugs" className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <AnalyticsPanel title="Bug Analytics" description="Bug lifecycle only: tester report, developer fix, QA verification, close.">
          <div className="grid gap-4 lg:grid-cols-2">
            <BugDistributionWidget
              emptyDescription="Bug risk distribution appears when bugs exist in scope."
              priorityRows={bugPriorityRows}
              severityRows={bugSeverityRows}
              total={bugMetrics.total || bugIssues.length}
            />
            <div className="rounded-[16px] border border-white/55 bg-white/50 p-3">
              <SectionTitle kicker="Reopen Heatmap" title="Weekly Reopen Trends" />
              <div className="mt-4 grid grid-cols-7 gap-1.5">
                {reopenHeatmapRows.length ? reopenHeatmapRows.map((row) => (
                  <div
                    className={cn(
                      "h-8 rounded-lg border border-white/60 transition-all duration-200",
                      row.reopened >= 4 ? "bg-rose-600" : row.reopened >= 2 ? "bg-rose-400" : row.reopened === 1 ? "bg-rose-200" : "bg-slate-100"
                    )}
                    key={row.key}
                    title={`${row.label}: ${row.reopened} reopened`}
                  />
                )) : (
                  <AnalyticsEmptyState className="col-span-7 min-h-[180px]" icon={RefreshCcw} title="No reopen trend" description="Reopen spikes appear after bug status changes." />
                )}
              </div>
            </div>
            <div className="rounded-[16px] border border-white/55 bg-white/50 p-3">
              <SectionTitle kicker="Fix Rate" title="Developer Fix Rate" />
              <div className="mt-4 max-h-[220px] space-y-3 overflow-y-auto pr-2 dashboard-scrollbar">
                {bugDeveloperRows.slice(0, 8).map((row) => (
                  <ProgressRow key={row.key} label={row.label} value={percent(row.count, Math.max(bugMetrics.total, 1))} meta={`${row.count} assigned/fixed bugs`} tone="bg-rose-500" />
                ))}
                {!bugDeveloperRows.length ? (
                  <AnalyticsEmptyState className="min-h-[180px]" icon={UserCheck} title="No developer data" description="Fix ownership appears once bugs are assigned." />
                ) : null}
              </div>
            </div>
          </div>
        </AnalyticsPanel>

        <AnalyticsPanel title="Bug Lifecycle Control" description="Operational bug queue, QA handoff, reopen risk, and the issues that need attention now.">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MiniStat label="Open Bugs" tone="blue" value={formatCompactNumber(bugMetrics.open)} />
            <MiniStat label="Ready for QA" tone="violet" value={formatCompactNumber(bugMetrics.readyForQa)} />
            <MiniStat label="Reopen Rate" tone="rose" value={`${teamMetrics.reopenRate}%`} />
            <MiniStat label="Close Rate" tone="emerald" value={`${percent(bugMetrics.closed, bugMetrics.total)}%`} />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="space-y-3">
              <SectionTitle kicker="Flow" title="Lifecycle Health" />
              {bugLifecycleRows.map((row) => (
                <ProgressRow
                  key={row.key}
                  label={row.label}
                  meta={`${row.count} bugs`}
                  tone={row.tone}
                  value={row.value}
                />
              ))}
            </div>

            <div>
              <SectionTitle kicker="Queue" title="Needs Attention" />
              <div className="mt-4 max-h-[330px] space-y-2 overflow-y-auto pr-2 dashboard-scrollbar">
                {bugAttentionRows.length ? bugAttentionRows.map((bug) => (
                  <div key={bug._id} className="rounded-[14px] border border-white/60 bg-white/62 p-3 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-950">{bug.title}</p>
                        <p className="mt-1 truncate text-xs text-slate-500">
                          {bug.project?.name || "Unknown project"} Â· {resolveUserLabel(bug.developerLead || bug.assignee)}
                        </p>
                      </div>
                      <Badge variant={getIssuePriorityVariant(bug.priority)}>
                        {bug.priority || "Medium"}
                      </Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <Badge variant={getIssueStatusVariant(bug.status)}>
                        {getIssueStatusLabel(bug.status)}
                      </Badge>
                      <span className="rounded-full bg-slate-100 px-2 py-1 font-semibold text-slate-600">
                        {bug.severity || "Not set"}
                      </span>
                      <span>{formatDateTime(bug.closedAt || bug.createdAt)}</span>
                    </div>
                  </div>
                )) : (
                  <AnalyticsEmptyState className="min-h-[240px]" icon={Bug} title="No bugs in scope" description="Bug lifecycle details will appear after bugs match the current filters." />
                )}
              </div>
            </div>
          </div>
        </AnalyticsPanel>
      </section>

      <section id="reports-project" className="grid gap-5 xl:grid-cols-2">
        <AnalyticsPanel title="Team Performance" description="Leaderboard across task completion, bug fixes, QA pass rate, reopen rate, and contribution.">
          <div className="space-y-3">
            {teamPerformance.slice(0, 8).map((team, index) => (
              <div key={team.key} className="grid gap-3 rounded-[16px] border border-white/55 bg-white/58 p-3 md:grid-cols-[42px_1fr_90px_90px_120px] md:items-center">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-sm font-semibold text-blue-700">{index + 1}</span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-950">{team.name}</p>
                  <p className="text-xs text-slate-500">Productivity {team.productivity}%</p>
                </div>
                <span className="text-sm font-semibold text-slate-700">{team.tasks} tasks</span>
                <span className="text-sm font-semibold text-slate-700">{team.bugsFixed} bugs</span>
                <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                  <div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.max(team.productivity, 4)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </AnalyticsPanel>

        <AnalyticsPanel title="Issues By Projects" description="Project-wise split of tasks and bugs with team count, developers, and completion percentage.">
          <div className="max-h-[430px] overflow-auto pr-2">
            <table className="w-full min-w-[780px] text-left text-sm">
              <thead className="sticky top-0 bg-white/95 text-xs uppercase tracking-[0.16em] text-slate-500 backdrop-blur">
                <tr>
                  <th className="px-3 py-3">Project</th>
                  <th className="px-3 py-3">Tasks</th>
                  <th className="px-3 py-3">Bugs</th>
                  <th className="px-3 py-3">Open Bugs</th>
                  <th className="px-3 py-3">Closed Bugs</th>
                  <th className="px-3 py-3">Teams</th>
                  <th className="px-3 py-3">Completion</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {projectRows.map((project) => (
                  <tr key={project.key} className="hover:bg-blue-50/50">
                    <td className="px-3 py-3 font-semibold text-slate-950">{project.name}</td>
                    <td className="px-3 py-3">{project.tasks}</td>
                    <td className="px-3 py-3">{project.bugs}</td>
                    <td className="px-3 py-3">{project.openBugs}</td>
                    <td className="px-3 py-3">{project.closedBugs}</td>
                    <td className="px-3 py-3">{project.teamCount}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-200">
                          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.max(project.completion, 4)}%` }} />
                        </div>
                        <span className="text-xs font-semibold">{project.completion}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </AnalyticsPanel>
      </section>

      <section id="reports-developer" className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <AnalyticsPanel
          title="Developer Performance Dashboard"
          description="Overall rating from task completion, story points, bug fixes, resolution time, review completion, QA rejection, reopened bugs, SLA, trend, sprint contribution, deployment success, and collaboration."
        >
          {topDeveloper ? (
            <div className="space-y-4">
              <div className="rounded-[18px] border border-white/60 bg-gradient-to-br from-slate-950 to-blue-950 p-4 text-white shadow-[0_20px_48px_-28px_rgba(15,23,42,0.65)]">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <Trophy className="h-5 w-5 text-amber-300" />
                      <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-100">Top Performer Badge</p>
                    </div>
                    <h3 className="mt-2 text-2xl font-semibold">{topDeveloper.name}</h3>
                    <p className="mt-1 text-sm text-blue-100">{topDeveloper.label} · overall rank #{topDeveloper.rank}</p>
                  </div>
                  <div className="rounded-2xl border border-white/15 bg-white/10 p-3 text-right backdrop-blur">
                    <div className="flex justify-end gap-0.5 text-amber-300">
                      {Array.from({ length: 5 }).map((_, index) => (
                        <Star key={index} className={cn("h-4 w-4", index < topDeveloper.rating ? "fill-current" : "opacity-30")} />
                      ))}
                    </div>
                    <p className="mt-2 text-3xl font-bold">{topDeveloper.score}/100</p>
                    <p className="text-xs text-blue-100">Overall Rating</p>
                  </div>
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-4">
                  <MiniStat label="Tasks" tone="blue" value={topDeveloper.taskMetrics.completed} />
                  <MiniStat label="Points" tone="emerald" value={topDeveloper.taskMetrics.deliveredPoints} />
                  <MiniStat label="Bug Fix" tone="rose" value={`${Math.round(topDeveloper.bugMetrics.fixRate)}%`} />
                  <MiniStat label="SLA" tone="violet" value={`${Math.round(topDeveloper.dimensions.slaCompliance)}%`} />
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-white/60 bg-white/60 p-3">
                  <SectionTitle kicker="Strengths" title="Best Signals" />
                  <div className="mt-3 flex flex-wrap gap-2">
                    {topDeveloper.strengths.map((strength) => (
                      <Badge key={strength} variant="success">{metricLabel(strength)}</Badge>
                    ))}
                  </div>
                </div>
                <div className="rounded-2xl border border-white/60 bg-white/60 p-3">
                  <SectionTitle kicker="Improve" title="Focus Areas" />
                  <div className="mt-3 flex flex-wrap gap-2">
                    {topDeveloper.improvements.map((improvement) => (
                      <Badge key={improvement} variant="warning">{metricLabel(improvement)}</Badge>
                    ))}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/60 bg-white/60 p-3">
                <SectionTitle kicker="AI Insights" title="Performance Recommendations" />
                <ul className="mt-3 space-y-2 text-sm text-slate-600">
                  {topDeveloperInsights.map((insight) => (
                    <li key={insight} className="rounded-xl bg-white/70 px-3 py-2">{insight}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <AnalyticsEmptyState icon={Users2} title="No developer performance yet" description="Assign tasks or bugs to developers to calculate ratings." />
          )}
        </AnalyticsPanel>

        <AnalyticsPanel
          title="Developer Rankings / Leaderboards"
          description="Task delivery and bug resolution are ranked separately, not combined."
          action={(
            <select
              aria-label="Filter developer rankings by project"
              className={cn(ANALYTICS_SELECT_CLASS, "h-9 min-w-[220px] rounded-xl px-3")}
              value={filters.projectId}
              onChange={(event) => updateFilter("projectId", event.target.value)}
            >
              <option value="all">All projects</option>
              {projects.map((project) => (
                <option key={project._id} value={project._id}>{project.name}</option>
              ))}
            </select>
          )}
        >
          <div className="grid gap-4 xl:grid-cols-2">
            <div className="rounded-2xl border border-white/60 bg-white/55 p-3">
              <SectionTitle kicker="Tasks" title="Task Delivery Ranking" description="Sorted by task completion, story points delivered, and completed task count." />
              <div className="mt-4 max-h-[520px] space-y-3 overflow-y-auto pr-2 dashboard-scrollbar">
                {taskDeveloperRanking.slice(0, 20).map((developer) => (
                  <div key={`task-${developer.id}`} className="grid grid-cols-[42px_minmax(0,1fr)] gap-3 rounded-[16px] border border-white/55 bg-white/70 p-3 min-[1500px]:grid-cols-[42px_minmax(180px,1fr)_90px_110px] min-[1500px]:items-center">
                    <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-sm font-semibold text-blue-700">{developer.taskRank}</span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-950" title={developer.name}>{developer.name}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        {developer.taskMetrics.completed} tasks · {developer.taskMetrics.deliveredPoints} points · {Math.round(developer.taskMetrics.completionRate)}% completion
                      </p>
                    </div>
                    <span className="col-start-2 text-sm font-bold text-blue-700 min-[1500px]:col-start-auto">{developer.taskScore}/100</span>
                    <div className="col-start-2 h-2 overflow-hidden rounded-full bg-slate-200 min-[1500px]:col-start-auto">
                      <div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.max(developer.taskScore, 4)}%` }} />
                    </div>
                  </div>
                ))}
                {!taskDeveloperRanking.length ? (
                  <AnalyticsEmptyState icon={Users2} title="No task ranking data" description="Task rankings appear when developers have assigned tasks." />
                ) : null}
              </div>
            </div>

            <div className="rounded-2xl border border-white/60 bg-white/55 p-3">
              <SectionTitle kicker="Bugs" title="Bug Resolution Ranking" description="Sorted by bug fix rate, resolved bugs, and lower reopen count." />
              <div className="mt-4 max-h-[520px] space-y-3 overflow-y-auto pr-2 dashboard-scrollbar">
                {bugDeveloperRanking.slice(0, 20).map((developer) => (
                  <div key={`bug-${developer.id}`} className="grid grid-cols-[42px_minmax(0,1fr)] gap-3 rounded-[16px] border border-white/55 bg-white/70 p-3 min-[1500px]:grid-cols-[42px_minmax(180px,1fr)_90px_110px] min-[1500px]:items-center">
                    <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-rose-50 text-sm font-semibold text-rose-700">{developer.bugRank}</span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-950" title={developer.name}>{developer.name}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        {developer.bugMetrics.resolved} bugs resolved · {Math.round(developer.bugMetrics.fixRate)}% fix rate · {developer.bugMetrics.reopened} reopened
                      </p>
                    </div>
                    <span className="col-start-2 text-sm font-bold text-rose-700 min-[1500px]:col-start-auto">{developer.bugScore}/100</span>
                    <div className="col-start-2 h-2 overflow-hidden rounded-full bg-slate-200 min-[1500px]:col-start-auto">
                      <div className="h-full rounded-full bg-rose-500" style={{ width: `${Math.max(developer.bugScore, 4)}%` }} />
                    </div>
                  </div>
                ))}
                {!bugDeveloperRanking.length ? (
                  <AnalyticsEmptyState icon={Bug} title="No bug ranking data" description="Bug rankings appear when developers resolve bugs." />
                ) : null}
              </div>
            </div>
          </div>
        </AnalyticsPanel>
      </section>

      <section id="reports-qa" className="grid gap-5 xl:grid-cols-2">
        <AnalyticsPanel
          title="Developer Productivity"
          description="Assigned tasks, completed work, bugs fixed, reopen rate, and velocity score."
          action={(
            <select className={cn(ANALYTICS_SELECT_CLASS, "h-9 min-w-[180px] rounded-xl px-3")} value={developerTeamFilter} onChange={(event) => setDeveloperTeamFilter(event.target.value)}>
              <option value="all">All Teams</option>
              {teams.map((team) => (
                <option key={resolveTeamId(team)} value={resolveTeamId(team)}>{team.name}</option>
              ))}
            </select>
          )}
        >
          <div className="max-h-[650px] overflow-y-auto pr-2 dashboard-scrollbar">
            <div className="grid gap-3 md:grid-cols-2">
              {filteredDeveloperProductivity.slice(0, 60).map((developer) => (
              <div key={developer.key} className="rounded-[16px] border border-white/55 bg-white/58 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-950">{developer.name}</p>
                    <p className="mt-1 truncate text-xs text-slate-500">
                      {developer.assignedTasks} tasks, {developer.bugsFixed} bugs fixed
                    </p>
                  </div>
                  <Badge variant={developer.reopenRate > 20 ? "danger" : "success"}>{developer.velocity}% velocity</Badge>
                </div>
                <p className="mt-2 truncate text-[11px] font-semibold uppercase text-slate-400">{Array.from(developer.teamNames).join(", ")}</p>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <MiniStat label="Done" value={developer.completedTasks} />
                  <MiniStat label="Fixed" tone="emerald" value={developer.bugsFixed} />
                  <MiniStat label="Reopen" tone="rose" value={`${developer.reopenRate}%`} />
                </div>
              </div>
              ))}
              {!filteredDeveloperProductivity.length ? (
                <AnalyticsEmptyState className="md:col-span-2" icon={Users2} title="No developers in scope" description="Adjust team or project filters to show developer productivity." />
              ) : null}
            </div>
          </div>
        </AnalyticsPanel>

        <AnalyticsPanel
          title="QA Performance Analytics"
          description="Bugs reported, verified fixes, reopened bugs, verification rate, efficiency, and false-positive signals."
          action={(
            <select className={cn(ANALYTICS_SELECT_CLASS, "h-9 min-w-[180px] rounded-xl px-3")} value={qaTeamFilter} onChange={(event) => setQaTeamFilter(event.target.value)}>
              <option value="all">All Teams</option>
              {teams.map((team) => (
                <option key={resolveTeamId(team)} value={resolveTeamId(team)}>{team.name}</option>
              ))}
            </select>
          )}
        >
          <div className="max-h-[650px] overflow-y-auto pr-2 dashboard-scrollbar">
            <div className="space-y-3">
            {qaPerformanceRows.slice(0, 60).map((qa) => (
                <div key={qa.key} className="rounded-[16px] border border-white/55 bg-white/58 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-950">{qa.label}</p>
                      <p className="mt-1 text-xs text-slate-500">{qa.count} bugs reported</p>
                    </div>
                    <Badge variant={qa.efficiency >= 70 ? "success" : "warning"}>{qa.efficiency}% efficiency</Badge>
                  </div>
                  <p className="mt-2 truncate text-[11px] font-semibold uppercase text-slate-400">{Array.from(qa.teamNames).join(", ")}</p>
                  <div className="mt-3 grid grid-cols-4 gap-2">
                    <MiniStat label="Reported" tone="blue" value={qa.count} />
                    <MiniStat label="Verified" tone="emerald" value={qa.verified} />
                    <MiniStat label="Reopened" tone="rose" value={qa.reopened} />
                    <MiniStat label="False +" tone="amber" value={qa.rejected} />
                  </div>
                </div>
            ))}
            {!qaPerformanceRows.length ? (
              <AnalyticsEmptyState icon={UserCheck} title="No QA users in scope" description="Adjust team or tester filters to show QA performance." />
            ) : null}
            </div>
          </div>
        </AnalyticsPanel>
      </section>

      <div id="reports-detailed">
      <AnalyticsPanel title="Detailed Workflow Analytics" description="Separated task and bug rows for audit, export, and operational review.">
        <div className="sticky top-0 z-10 mb-3 flex flex-col gap-2 rounded-2xl border border-white/60 bg-white/82 p-2 backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
          <SegmentedToggle options={WORKFLOW_VIEW_OPTIONS} value={workflowView} onChange={setWorkflowView} />
          <p className="px-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            {workflowIssues.length} rows in view
          </p>
        </div>
        {workflowIssues.length ? (
          <div className="max-h-[560px] overflow-auto dashboard-scrollbar">
            <table className="w-full min-w-[1120px] text-left text-sm">
              <thead className="sticky top-0 bg-white/95 text-xs uppercase tracking-[0.16em] text-slate-500 backdrop-blur">
                <tr>
                  <th className="px-3 py-3">Flow</th>
                  <th className="px-3 py-3">ID</th>
                  <th className="px-3 py-3">Title</th>
                  <th className="px-3 py-3">Project</th>
                  <th className="px-3 py-3">Tester</th>
                  <th className="px-3 py-3">Owner</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Priority</th>
                  <th className="px-3 py-3">Created</th>
                  <th className="px-3 py-3">Resolution</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {workflowIssues.slice(0, 250).map((issue) => (
                  <tr key={issue._id} className="hover:bg-blue-50/50">
                    <td className="px-3 py-3"><Badge variant={issue.type === ISSUE_TYPES.BUG ? "danger" : "default"}>{issue.type === ISSUE_TYPES.BUG ? "Bug" : "Task"}</Badge></td>
                    <td className="px-3 py-3 font-mono text-xs font-semibold">{issue.issueId}</td>
                    <td className="max-w-[280px] truncate px-3 py-3 font-semibold text-slate-950">{issue.title}</td>
                    <td className="px-3 py-3">{issue.project?.name || "Unknown"}</td>
                    <td className="px-3 py-3 font-medium text-slate-600">{resolveUserLabel(issue.reporter || issue.testerOwner)}</td>
                    <td className="px-3 py-3 font-medium text-slate-600">{resolveUserLabel(issue.developerLead || issue.assignee)}</td>
                    <td className="px-3 py-3"><Badge variant={getIssueStatusVariant(issue.status)}>{issue.status}</Badge></td>
                    <td className="px-3 py-3"><Badge variant={getIssuePriorityVariant(issue.priority)}>{issue.priority}</Badge></td>
                    <td className="px-3 py-3">{formatDateTime(issue.createdAt)}</td>
                    <td className="px-3 py-3">{formatDuration(issue.resolutionTimeMs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <AnalyticsEmptyState icon={AreaChartIcon} title="No analytics rows" description="Adjust filters or create task/bug records to populate reports." />
        )}
      </AnalyticsPanel>
      </div>
    </div>
  );
};

const REPORT_PAGES = [
  { key: "overview", label: "Overview" },
  { key: "tasks", label: "Task Reports" },
  { key: "bugs", label: "Bug Reports" },
  { key: "sprints", label: "Sprint Reports" },
  { key: "developers", label: "Developer Reports" },
  { key: "qa", label: "QA Reports" },
  { key: "releases", label: "Release Reports" },
  { key: "executive", label: "Executive Dashboard" },
];

const REPORT_PAGE_KEYS = new Set(REPORT_PAGES.map((page) => page.key));

const getIssueReleaseId = (issue) =>
  String(issue?.release?._id || issue?.releaseId || issue?.fixVersion?._id || issue?.version?._id || "");

const getIssueReleaseName = (issue) =>
  issue?.release?.name || issue?.fixVersion?.name || issue?.version?.name || "Unassigned release";

const getIssueClosedTime = (issue) =>
  new Date(issue?.closedAt || issue?.resolvedAt || issue?.updatedAt || issue?.createdAt || 0).getTime();

const buildIssueTrendRows = (issues = []) => {
  const rows = new Map();

  issues.forEach((issue) => {
    const createdKey = issue.createdAt ? issue.createdAt.slice(0, 10) : "Unknown";
    const createdRow = rows.get(createdKey) || { label: createdKey, created: 0, completed: 0, reopened: 0 };
    createdRow.created += 1;
    createdRow.reopened += Number(issue.reopenedCount || 0) > 0 || isReopened(issue) ? 1 : 0;
    rows.set(createdKey, createdRow);

    if (isClosed(issue)) {
      const completedKey = (issue.closedAt || issue.updatedAt || issue.createdAt || "").slice(0, 10) || createdKey;
      const completedRow = rows.get(completedKey) || { label: completedKey, created: 0, completed: 0, reopened: 0 };
      completedRow.completed += 1;
      rows.set(completedKey, completedRow);
    }
  });

  return Array.from(rows.values()).sort((left, right) => left.label.localeCompare(right.label)).slice(-14);
};

const averageDuration = (issues = [], startKey = "createdAt", endKey = "closedAt") => {
  const durations = issues
    .map((issue) => {
      const start = issue?.[startKey] ? new Date(issue[startKey]).getTime() : NaN;
      const end = issue?.[endKey] ? new Date(issue[endKey]).getTime() : NaN;

      return Number.isFinite(start) && Number.isFinite(end) && end >= start ? end - start : null;
    })
    .filter(Number.isFinite);

  return durations.length ? durations.reduce((sum, value) => sum + value, 0) / durations.length : 0;
};

const compareCurrentPrevious = (rows = [], key = "completed") => {
  const midpoint = Math.max(Math.floor(rows.length / 2), 1);
  const previous = rows.slice(0, midpoint).reduce((sum, row) => sum + toNumber(row[key]), 0);
  const current = rows.slice(midpoint).reduce((sum, row) => sum + toNumber(row[key]), 0);

  return {
    current,
    previous,
    delta: previous ? Math.round(((current - previous) / previous) * 100) : current ? 100 : 0,
  };
};

const JiraKpi = ({ label, value, helper, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="rounded-lg border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-blue-300 hover:shadow-md"
  >
    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
    <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
    {helper ? <p className="mt-1 truncate text-xs text-slate-500">{helper}</p> : null}
  </button>
);

const JiraPanel = ({ children, className, title, description }) => (
  <section className={cn("rounded-lg border border-slate-200 bg-white shadow-sm", className)}>
    {title ? (
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-950">{title}</h2>
        {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
      </div>
    ) : null}
    <div className="p-4">{children}</div>
  </section>
);

const JiraSection = ({ children, defaultOpen = true, title }) => {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <JiraPanel>
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 text-left"
        onClick={() => setOpen((current) => !current)}
      >
        <span className="text-sm font-semibold text-slate-950">{title}</span>
        <ChevronDown className={cn("h-4 w-4 text-slate-500 transition", open ? "rotate-180" : "")} />
      </button>
      {open ? <div className="mt-4">{children}</div> : null}
    </JiraPanel>
  );
};

const JIRA_CHART_WIDTH = 640;
const JIRA_CHART_HEIGHT = 280;
const JIRA_CHART_PADDING = { top: 18, right: 22, bottom: 42, left: 42 };
const JIRA_CHART_PLOT_WIDTH =
  JIRA_CHART_WIDTH - JIRA_CHART_PADDING.left - JIRA_CHART_PADDING.right;
const JIRA_CHART_PLOT_HEIGHT =
  JIRA_CHART_HEIGHT - JIRA_CHART_PADDING.top - JIRA_CHART_PADDING.bottom;

const getChartLabel = (row, index) => row?.label || row?.name || `Point ${index + 1}`;
const getChartMax = (data = [], keys = []) =>
  Math.max(1, ...data.flatMap((row) => keys.map((key) => toNumber(row?.[key]))));
const getChartX = (index, length) =>
  JIRA_CHART_PADDING.left +
  (length > 1 ? (index / (length - 1)) * JIRA_CHART_PLOT_WIDTH : JIRA_CHART_PLOT_WIDTH / 2);
const getChartY = (value, max) =>
  JIRA_CHART_PADDING.top + JIRA_CHART_PLOT_HEIGHT - (toNumber(value) / max) * JIRA_CHART_PLOT_HEIGHT;
const getLinePoints = (data, key, max) =>
  data.map((row, index) => ({
    label: getChartLabel(row, index),
    row,
    value: toNumber(row?.[key]),
    x: getChartX(index, data.length),
    y: getChartY(row?.[key], max),
  }));

const JiraChartShell = ({ children, data, emptyIcon: EmptyIcon, emptyTitle }) => (
  <ChartFrame height={280}>
    {data.length ? (
      <div className="h-full w-full rounded-md border border-slate-100 bg-white px-1 py-2">
        {children}
      </div>
    ) : (
      <AnalyticsEmptyState
        className="min-h-[260px]"
        icon={EmptyIcon}
        title={emptyTitle}
        description="Create work items or adjust filters to populate this report."
      />
    )}
  </ChartFrame>
);

const JiraChartLegend = ({ items = [] }) => (
  <div className="mt-2 flex flex-wrap gap-3 px-2 text-xs font-medium text-slate-500">
    {items.map((item) => (
      <span className="inline-flex items-center gap-1.5" key={item.key}>
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
        {item.label || item.key}
      </span>
    ))}
  </div>
);

const JiraChartDetails = ({ data = [], items = [], mode = "trend" }) => {
  if (!data.length) {
    return null;
  }

  const total = data.reduce(
    (sum, row) => sum + items.reduce((itemSum, item) => itemSum + toNumber(row?.[item.key]), 0),
    0
  );
  const rows = mode === "trend" ? data.slice(-8) : data.slice(0, 8);

  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {mode === "trend" ? "Date details" : "Category details"}
        </p>
        <div className="flex flex-wrap gap-2 text-xs text-slate-500">
          {items.map((item) => (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2 py-1" key={item.key}>
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
              {item.label || item.key}:{" "}
              <span className="font-semibold text-slate-700">
                {data.reduce((sum, row) => sum + toNumber(row?.[item.key]), 0)}
              </span>
            </span>
          ))}
        </div>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {rows.map((row, index) => {
          const label = getChartLabel(row, index);
          const rowTotal = items.reduce((sum, item) => sum + toNumber(row?.[item.key]), 0);

          return (
            <div className="rounded-md border border-slate-200 bg-white px-3 py-2" key={`${label}-${index}`}>
              <div className="flex items-center justify-between gap-3">
                <p className="truncate text-xs font-semibold text-slate-800">{label}</p>
                {mode === "category" ? (
                  <span className="text-[11px] font-semibold text-slate-500">
                    {percent(rowTotal, total)}%
                  </span>
                ) : null}
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
                {items.map((item) => (
                  <span key={item.key}>
                    {item.label || item.key}:{" "}
                    <span className="font-semibold text-slate-700">{toNumber(row?.[item.key])}</span>
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {data.length > rows.length ? (
        <p className="mt-2 text-[11px] text-slate-400">
          Showing {mode === "trend" ? "latest" : "top"} {rows.length} of {data.length} points.
        </p>
      ) : null}
    </div>
  );
};

const JiraChartSvg = ({ children, data, max }) => {
  const tickValues = [max, Math.round(max / 2), 0];

  return (
    <svg
      className="block h-[236px] w-full overflow-visible"
      preserveAspectRatio="none"
      role="img"
      viewBox={`0 0 ${JIRA_CHART_WIDTH} ${JIRA_CHART_HEIGHT}`}
    >
      {tickValues.map((tick) => {
        const y = getChartY(tick, max);

        return (
          <g key={tick}>
            <line
              stroke={CHART_GRID_COLOR}
              strokeDasharray="4 6"
              strokeWidth="1"
              x1={JIRA_CHART_PADDING.left}
              x2={JIRA_CHART_WIDTH - JIRA_CHART_PADDING.right}
              y1={y}
              y2={y}
            />
            <text fill="#64748b" fontSize="11" textAnchor="end" x="34" y={y + 4}>
              {tick}
            </text>
          </g>
        );
      })}
      <line
        stroke="#cbd5e1"
        strokeWidth="1.5"
        x1={JIRA_CHART_PADDING.left}
        x2={JIRA_CHART_WIDTH - JIRA_CHART_PADDING.right}
        y1={JIRA_CHART_HEIGHT - JIRA_CHART_PADDING.bottom}
        y2={JIRA_CHART_HEIGHT - JIRA_CHART_PADDING.bottom}
      />
      {data.map((row, index) => {
        if (data.length > 8 && index % Math.ceil(data.length / 7) !== 0 && index !== data.length - 1) {
          return null;
        }

        return (
          <text
            fill="#64748b"
            fontSize="10"
            key={`${getChartLabel(row, index)}-${index}`}
            textAnchor="middle"
            x={getChartX(index, data.length)}
            y={JIRA_CHART_HEIGHT - 16}
          >
            {getChartLabel(row, index).slice(5) || getChartLabel(row, index)}
          </text>
        );
      })}
      {children}
    </svg>
  );
};

const JiraLineChart = ({ data = [], lines = [{ key: "completed", color: "#2563eb" }], onDrill }) => {
  const max = getChartMax(data, lines.map((line) => line.key));

  return (
    <>
      <JiraChartShell data={data} emptyIcon={AreaChartIcon} emptyTitle="No chart data">
        <JiraChartSvg data={data} max={max}>
          {lines.map((line) => {
            const points = getLinePoints(data, line.key, max);
            const path = points.map((point, index) => `${index ? "L" : "M"} ${point.x} ${point.y}`).join(" ");
            const areaPath = [
              `M ${points[0]?.x || JIRA_CHART_PADDING.left} ${JIRA_CHART_HEIGHT - JIRA_CHART_PADDING.bottom}`,
              ...points.map((point) => `L ${point.x} ${point.y}`),
              `L ${points.at(-1)?.x || JIRA_CHART_PADDING.left} ${JIRA_CHART_HEIGHT - JIRA_CHART_PADDING.bottom} Z`,
            ].join(" ");

            return (
              <g key={line.key}>
                <path d={areaPath} fill={line.fill || line.color} fillOpacity="0.12" />
                <path d={path} fill="none" stroke={line.color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
                {points.map((point) => (
                  <circle
                    className={onDrill ? "cursor-pointer" : ""}
                    cx={point.x}
                    cy={point.y}
                    fill="#fff"
                    key={`${line.key}-${point.label}`}
                    onClick={() => onDrill?.(point.row)}
                    r="4.5"
                    stroke={line.color}
                    strokeWidth="2.5"
                  >
                    <title>{`${point.label}: ${line.label || line.key} ${point.value}`}</title>
                  </circle>
                ))}
              </g>
            );
          })}
        </JiraChartSvg>
        <JiraChartLegend items={lines} />
      </JiraChartShell>
      <JiraChartDetails data={data} items={lines} mode="trend" />
    </>
  );
};

const JiraBarChart = ({ data = [], bars = [{ key: "value", color: "#2563eb" }], onDrill }) => {
  const max = getChartMax(data, bars.map((bar) => bar.key));
  const groupWidth = JIRA_CHART_PLOT_WIDTH / Math.max(data.length, 1);
  const barWidth = Math.max(6, Math.min(28, groupWidth / (bars.length + 1.2)));

  return (
    <>
      <JiraChartShell data={data} emptyIcon={BarChart3} emptyTitle="No chart data">
        <JiraChartSvg data={data} max={max}>
          {data.map((row, rowIndex) =>
            bars.map((bar, barIndex) => {
              const value = toNumber(row?.[bar.key]);
              const height = (value / max) * JIRA_CHART_PLOT_HEIGHT;
              const x =
                JIRA_CHART_PADDING.left +
                rowIndex * groupWidth +
                (groupWidth - barWidth * bars.length) / 2 +
                barIndex * barWidth;
              const y = JIRA_CHART_HEIGHT - JIRA_CHART_PADDING.bottom - height;

              return (
                <rect
                  className={onDrill ? "cursor-pointer" : ""}
                  fill={bar.color}
                  height={height}
                  key={`${getChartLabel(row, rowIndex)}-${bar.key}`}
                  onClick={() => onDrill?.(row)}
                  rx="5"
                  width={Math.max(4, barWidth - 3)}
                  x={x}
                  y={y}
                >
                  <title>{`${getChartLabel(row, rowIndex)}: ${bar.label || bar.key} ${value}`}</title>
                </rect>
              );
            })
          )}
        </JiraChartSvg>
        <JiraChartLegend items={bars} />
      </JiraChartShell>
      <JiraChartDetails data={data} items={bars} mode="category" />
    </>
  );
};

const JiraDrilldown = ({ rows = [], title, onClear }) => (
  <JiraPanel title={title || "Drill-down"}>
    <div className="mb-3 flex items-center justify-between gap-3">
      <p className="text-sm text-slate-500">{rows.length} matching records</p>
      <Button type="button" variant="outline" size="sm" onClick={onClear}>Clear</Button>
    </div>
    <div className="max-h-[360px] overflow-auto">
      <table className="w-full min-w-[820px] text-left text-sm">
        <thead className="sticky top-0 bg-white text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2">Key</th>
            <th className="px-3 py-2">Title</th>
            <th className="px-3 py-2">Project</th>
            <th className="px-3 py-2">Owner</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Priority</th>
            <th className="px-3 py-2">Updated</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.slice(0, 100).map((issue) => (
            <tr className="hover:bg-blue-50/40" key={issue._id}>
              <td className="px-3 py-2 font-mono text-xs font-semibold">{issue.issueId}</td>
              <td className="max-w-[320px] truncate px-3 py-2 font-medium text-slate-950">{issue.title}</td>
              <td className="px-3 py-2">{issue.project?.name || "Unknown"}</td>
              <td className="px-3 py-2">{resolveUserLabel(issue.developerLead || issue.assignee || issue.reporter)}</td>
              <td className="px-3 py-2"><Badge variant={getIssueStatusVariant(issue.status)}>{getIssueStatusLabel(issue.status)}</Badge></td>
              <td className="px-3 py-2">{issue.priority || "None"}</td>
              <td className="px-3 py-2">{formatDateTime(issue.updatedAt || issue.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </JiraPanel>
);

const JiraReportsDashboard = () => {
  const { reportKey = "overview" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const activePage = reportKey || "overview";
  const [comparisonMode, setComparisonMode] = useState("sprint");
  const [drilldown, setDrilldown] = useState(null);
  const [filters, setFilters] = useState({
    projectId: "all",
    sprintId: "all",
    teamId: "all",
    developerId: "all",
    testerId: "all",
    priority: "all",
    severity: "all",
    status: "all",
    releaseId: "all",
    dateFrom: "",
    dateTo: "",
  });

  const { data: projects = [], isLoading: projectsLoading, error: projectsError } = useQuery({
    queryKey: ["projects", "jira-reports-options"],
    queryFn: fetchProjects,
    staleTime: 60_000,
  });
  const selectedProjectId = filters.projectId !== "all" ? filters.projectId : "";
  const { data: sprints = [] } = useQuery({
    queryKey: ["jira-reports", "sprints", selectedProjectId],
    queryFn: () => fetchSprints({ projectId: selectedProjectId }),
    enabled: Boolean(selectedProjectId),
  });

  const teams = useMemo(() => {
    const rows = new Map();
    projects.forEach((project) => {
      if (filters.projectId !== "all" && String(project._id) !== String(filters.projectId)) return;
      getProjectTeams(project).forEach((team) => {
        const teamId = resolveTeamId(team);
        if (teamId) rows.set(teamId, team);
      });
    });
    return Array.from(rows.values()).sort((left, right) => (left.name || "").localeCompare(right.name || ""));
  }, [filters.projectId, projects]);

  const members = useMemo(() => {
    const rows = new Map();
    projects.forEach((project) => {
      if (filters.projectId !== "all" && String(project._id) !== String(filters.projectId)) return;
      getProjectMembers(project).forEach((member) => {
        const userId = resolveUserId(member);
        if (userId) rows.set(userId, member);
      });
    });
    return Array.from(rows.values()).sort((left, right) => (left.name || "").localeCompare(right.name || ""));
  }, [filters.projectId, projects]);

  const statusParts = getStatusParts(filters.status);
  const analyticsFilters = {
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    projectId: filters.projectId,
    teamId: filters.teamId,
    assigneeId: filters.developerId,
    developerId: filters.developerId,
    testerId: filters.testerId,
    priority: filters.priority,
    severity: filters.severity,
    sprintId: filters.sprintId,
    ...statusParts,
  };
  const taskAnalytics = useAnalytics({ ...analyticsFilters, excludeType: ISSUE_TYPES.BUG }, { includeIssues: true });
  const bugAnalytics = useAnalytics({ ...analyticsFilters, type: ISSUE_TYPES.BUG }, { includeIssues: true });
  const rawTaskIssues = asArray(taskAnalytics.issues?.issues);
  const rawBugIssues = asArray(bugAnalytics.issues?.issues);
  const releaseMatches = (issue) => filters.releaseId === "all" || getIssueReleaseId(issue) === filters.releaseId;
  const taskIssues = rawTaskIssues.filter(releaseMatches);
  const bugIssues = rawBugIssues.filter(releaseMatches);
  const allIssues = [...taskIssues, ...bugIssues];
  const taskMetrics = useMemo(() => calculateTaskMetrics(taskIssues), [taskIssues]);
  const bugMetrics = useMemo(() => calculateBugMetrics(bugIssues, taskMetrics.deliveredPoints), [bugIssues, taskMetrics.deliveredPoints]);
  const developerPerformance = useMemo(() => calculateDeveloperPerformance(taskIssues, bugIssues), [bugIssues, taskIssues]);
  const taskTrendRows = useMemo(() => buildIssueTrendRows(taskIssues), [taskIssues]);
  const bugTrendRows = useMemo(() => buildIssueTrendRows(bugIssues), [bugIssues]);
  const taskComparison = compareCurrentPrevious(taskTrendRows, "completed");
  const bugComparison = compareCurrentPrevious(bugTrendRows, "completed");
  const releaseOptions = useMemo(() => {
    const rows = new Map();
    [...rawTaskIssues, ...rawBugIssues].forEach((issue) => {
      const id = getIssueReleaseId(issue);
      if (id) rows.set(id, getIssueReleaseName(issue));
    });
    return Array.from(rows.entries()).map(([id, name]) => ({ id, name }));
  }, [rawBugIssues, rawTaskIssues]);

  if (!REPORT_PAGE_KEYS.has(activePage)) {
    return <Navigate to="/reports" replace />;
  }

  const isLoading = projectsLoading || taskAnalytics.isLoading || bugAnalytics.isLoading;
  const error = projectsError || taskAnalytics.error || bugAnalytics.error;
  const updateFilter = (key, value) => {
    setDrilldown(null);
    setFilters((current) => ({
      ...current,
      [key]: value,
      ...(key === "projectId" ? { sprintId: "all", teamId: "all", developerId: "all", testerId: "all" } : {}),
    }));
  };
  const resetFilters = () => {
    setDrilldown(null);
    setFilters({
      projectId: "all",
      sprintId: "all",
      teamId: "all",
      developerId: "all",
      testerId: "all",
      priority: "all",
      severity: "all",
      status: "all",
      releaseId: "all",
      dateFrom: "",
      dateTo: "",
    });
  };
  const drillTo = (title, rows) => setDrilldown({ title, rows });
  const exportRows = (rows, name = activePage) =>
    exportCsv([
      ["Type", "Key", "Title", "Project", "Owner", "Status", "Priority", "Created", "Closed"],
      ...rows.map((issue) => [
        issue.type === ISSUE_TYPES.BUG ? "Bug" : "Task",
        issue.issueId,
        issue.title,
        issue.project?.name || "",
        resolveUserLabel(issue.developerLead || issue.assignee || issue.reporter, ""),
        issue.status,
        issue.priority || "",
        issue.createdAt || "",
        issue.closedAt || "",
      ]),
    ], name);
  const shareReport = async () => {
    const url = new URL(window.location.href);
    url.searchParams.set("filters", btoa(JSON.stringify({ filters, comparisonMode })));
    await navigator.clipboard?.writeText(url.toString());
  };
  const saveFilter = () => localStorage.setItem("jira-report-filters", JSON.stringify({ filters, comparisonMode, activePage }));
  const scheduleReport = () => localStorage.setItem("jira-report-schedule", JSON.stringify({ filters, comparisonMode, activePage, cadence: "weekly" }));

  if (error) {
    return (
      <Card className="border-slate-200 bg-white">
        <CardContent className="p-6 text-sm text-rose-700">
          {error.response?.data?.message || error.message || "Unable to load reports analytics."}
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return <ReportsLoading />;
  }

  const taskStatusRows = buildRows(taskIssues, (issue) => issue.status, (issue) => getIssueStatusLabel(issue.status));
  const bugSeverityRows = buildGroupedBugRows(bugIssues, BUG_SEVERITY_GROUPS, getBugSeverityValue, { key: "Unspecified", label: "Unspecified", color: "#64748b" });
  const bugPriorityRows = buildGroupedBugRows(bugIssues, BUG_PRIORITY_GROUPS.map((group) => ({ ...group, labels: [group.source] })), getBugPriorityValue, { key: "Unspecified", label: "Unspecified", color: "#64748b" });
  const workloadRows = buildRows(taskIssues, (issue) => issue.assignee?._id, (issue) => resolveUserLabel(issue.assignee)).map((row) => ({ ...row, label: row.name }));
  const qaRows = buildRows(bugIssues, (issue) => issue.reporter?._id || issue.testerOwner?._id, (issue) => resolveUserLabel(issue.reporter || issue.testerOwner)).map((row) => ({ ...row, label: row.name }));
  const releaseRows = buildRows(allIssues, getIssueReleaseId, getIssueReleaseName).map((row) => ({ ...row, label: row.name }));
  const topDeveloper = developerPerformance[0] || null;
  const topDeveloperInsights = buildPerformanceInsights(topDeveloper);
  const completedTasks = taskIssues.filter(isClosed);
  const closedBugs = bugIssues.filter(isClosed);
  const reopenedBugs = bugIssues.filter((issue) => Number(issue.reopenedCount || 0) > 0 || isReopened(issue));
  const regressionBugs = bugIssues.filter((issue) => /regression/i.test(`${issue.title || ""} ${issue.labels?.join(" ") || ""}`));
  const escapedDefects = bugIssues.filter((issue) => issue.severity === "Critical" && isClosed(issue));
  const qaAccepted = bugIssues.filter((issue) => issue.status !== ISSUE_STATUS.REJECTED && isClosed(issue)).length;
  const renderPage = () => {
    if (activePage === "tasks") {
      return (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <JiraKpi label="Completion Rate" value={`${Math.round(taskMetrics.completionRate)}%`} helper={`${taskMetrics.completed}/${taskMetrics.total} tasks`} onClick={() => drillTo("Completed tasks", completedTasks)} />
            <JiraKpi label="Velocity" value={formatCompactNumber(taskMetrics.velocity)} helper="Delivered story points" onClick={() => drillTo("Delivered tasks", completedTasks)} />
            <JiraKpi label="Lead Time" value={formatDuration(taskMetrics.leadTimeMs)} helper="Created to closed" onClick={() => drillTo("Lead time tasks", completedTasks)} />
            <JiraKpi label="WIP" value={taskMetrics.open} helper="Open task work" onClick={() => drillTo("Work in progress", taskIssues.filter((issue) => !isClosed(issue)))} />
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <JiraSection title="Burndown / Burnup">
              <JiraLineChart data={taskTrendRows} lines={[{ key: "created", color: "#94a3b8" }, { key: "completed", color: "#2563eb" }]} onDrill={(row) => drillTo(`Tasks on ${row.label}`, taskIssues.filter((issue) => issue.createdAt?.startsWith(row.label) || issue.closedAt?.startsWith(row.label)))} />
            </JiraSection>
            <JiraSection title="Throughput and Task Trends">
              <JiraBarChart data={taskTrendRows} bars={[{ key: "completed", color: "#2563eb" }]} onDrill={(row) => drillTo(`Completed on ${row.label}`, taskIssues.filter((issue) => issue.closedAt?.startsWith(row.label)))} />
            </JiraSection>
            <JiraSection title="Workload Distribution">
              <JiraBarChart data={workloadRows} onDrill={(row) => drillTo(row.label, taskIssues.filter((issue) => String(issue.assignee?._id || "unassigned") === String(row.key)))} />
            </JiraSection>
            <JiraSection title="Capacity Planning">
              <div className="grid gap-3 sm:grid-cols-3">
                <MiniStat label="Story Points" value={taskMetrics.committedPoints} />
                <MiniStat label="Delivered" tone="emerald" value={taskMetrics.deliveredPoints} />
                <MiniStat label="SLA" tone="blue" value={`${Math.round(taskMetrics.slaCompliance)}%`} />
                <MiniStat label="Cycle Time" value={formatDuration(taskMetrics.cycleTimeMs)} />
                <MiniStat label="Aging" tone="amber" value={taskIssues.filter((issue) => !isClosed(issue) && getIssueClosedTime(issue) < Date.now() - 7 * 86400000).length} />
                <MiniStat label="Overdue" tone="rose" value={taskMetrics.overdue} />
              </div>
            </JiraSection>
          </div>
        </>
      );
    }

    if (activePage === "bugs") {
      return (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <JiraKpi label="Bug Fix Rate" value={`${Math.round(bugMetrics.fixRate)}%`} helper={`${bugMetrics.resolved}/${bugMetrics.total} bugs`} onClick={() => drillTo("Resolved bugs", closedBugs)} />
            <JiraKpi label="Bug Leakage" value={`${Math.round(bugMetrics.bugLeakage)}%`} helper={`${reopenedBugs.length} reopened`} onClick={() => drillTo("Reopened bugs", reopenedBugs)} />
            <JiraKpi label="Defect Density" value={bugMetrics.defectDensity.toFixed(1)} helper="Bugs per delivered points" onClick={() => drillTo("All bugs", bugIssues)} />
            <JiraKpi label="MTTR" value={formatDuration(bugMetrics.mttrMs)} helper="Mean time to resolve" onClick={() => drillTo("Resolved bugs", closedBugs)} />
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <JiraSection title="Resolution Trends">
              <JiraLineChart data={bugTrendRows} lines={[{ key: "created", color: "#94a3b8" }, { key: "completed", color: "#dc2626" }, { key: "reopened", color: "#f97316" }]} onDrill={(row) => drillTo(`Bugs on ${row.label}`, bugIssues.filter((issue) => issue.createdAt?.startsWith(row.label) || issue.closedAt?.startsWith(row.label)))} />
            </JiraSection>
            <JiraSection title="Severity Distribution">
              <JiraBarChart data={bugSeverityRows.map((row) => ({ ...row, label: row.name }))} onDrill={(row) => drillTo(row.name, bugIssues.filter((issue) => row.labels?.map(normalizeAnalyticsValue).includes(normalizeAnalyticsValue(getBugSeverityValue(issue)))))} />
            </JiraSection>
            <JiraSection title="Priority Distribution">
              <JiraBarChart data={bugPriorityRows.map((row) => ({ ...row, label: row.name }))} onDrill={(row) => drillTo(row.name, bugIssues.filter((issue) => row.labels?.map(normalizeAnalyticsValue).includes(normalizeAnalyticsValue(getBugPriorityValue(issue)))))} />
            </JiraSection>
            <JiraSection title="Quality Signals">
              <div className="grid gap-3 sm:grid-cols-3">
                <MiniStat label="MTTD" value={formatDuration(bugMetrics.mttdMs)} />
                <MiniStat label="Regression" tone="amber" value={regressionBugs.length} />
                <MiniStat label="Escaped" tone="rose" value={escapedDefects.length} />
                <MiniStat label="QA Acceptance" tone="emerald" value={`${percent(qaAccepted, closedBugs.length)}%`} />
                <MiniStat label="Bug Aging" tone="amber" value={bugIssues.filter((issue) => !isClosed(issue) && getIssueClosedTime(issue) < Date.now() - 7 * 86400000).length} />
                <MiniStat label="Critical Open" tone="rose" value={bugMetrics.criticalOpen} />
              </div>
            </JiraSection>
          </div>
        </>
      );
    }

    if (activePage === "developers") {
      return (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <JiraKpi label="Overall Score" value={topDeveloper ? `${topDeveloper.score}/100` : "--"} helper={topDeveloper?.name || "No developer data"} onClick={() => topDeveloper && drillTo(topDeveloper.name, [...topDeveloper.tasks, ...topDeveloper.bugs])} />
            <JiraKpi label="Developer Rating" value={topDeveloper ? `${topDeveloper.rating}/5` : "--"} helper="Top performer stars" />
            <JiraKpi label="Task Completion" value={`${Math.round(topDeveloper?.taskMetrics?.completionRate || 0)}%`} helper="Top performer" />
            <JiraKpi label="Bug Fix Rate" value={`${Math.round(topDeveloper?.bugMetrics?.fixRate || 0)}%`} helper="Top performer" />
          </div>
          <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
            <JiraSection title="Team Leaderboard">
              <div className="space-y-2">
                {developerPerformance.slice(0, 12).map((developer) => (
                  <button key={developer.id} type="button" onClick={() => drillTo(developer.name, [...developer.tasks, ...developer.bugs])} className="grid w-full gap-3 rounded-lg border border-slate-200 px-3 py-2 text-left hover:border-blue-300 md:grid-cols-[42px_1fr_90px_120px] md:items-center">
                    <span className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-50 text-sm font-semibold text-blue-700">{developer.rank}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-slate-950">{developer.name}</span>
                      <span className="block text-xs text-slate-500">{developer.taskMetrics.completed} tasks, {developer.bugMetrics.resolved} bugs fixed</span>
                    </span>
                    <span className="text-sm font-semibold text-slate-700">{developer.score}/100</span>
                    <span className="flex gap-0.5 text-amber-400">{Array.from({ length: 5 }).map((_, index) => <Star key={index} className={cn("h-4 w-4", index < developer.rating ? "fill-current" : "text-slate-200")} />)}</span>
                  </button>
                ))}
              </div>
            </JiraSection>
            <JiraSection title="AI Strengths and Recommendations">
              {topDeveloper ? (
                <div className="space-y-3 text-sm">
                  <div>
                    <p className="font-semibold text-slate-950">Strengths</p>
                    <div className="mt-2 flex flex-wrap gap-2">{topDeveloper.strengths.map((item) => <Badge key={item} variant="success">{metricLabel(item)}</Badge>)}</div>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-950">Weaknesses</p>
                    <div className="mt-2 flex flex-wrap gap-2">{topDeveloper.improvements.map((item) => <Badge key={item} variant="warning">{metricLabel(item)}</Badge>)}</div>
                  </div>
                  <div className="space-y-2">
                    <p className="font-semibold text-slate-950">Recommendations</p>
                    {topDeveloperInsights.map((insight) => <p className="rounded-md bg-slate-50 p-2 text-slate-600" key={insight}>{insight}</p>)}
                  </div>
                </div>
              ) : <AnalyticsEmptyState icon={Users2} title="No developer data" description="Assign tasks or bugs to developers to calculate performance." />}
            </JiraSection>
          </div>
        </>
      );
    }

    if (activePage === "qa") {
      return (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <JiraKpi label="QA Acceptance" value={`${percent(qaAccepted, closedBugs.length)}%`} helper={`${qaAccepted} accepted fixes`} onClick={() => drillTo("QA accepted bugs", closedBugs.filter((issue) => issue.status !== ISSUE_STATUS.REJECTED))} />
            <JiraKpi label="Ready For QA" value={bugIssues.filter(isReadyForQa).length} helper="Awaiting verification" onClick={() => drillTo("Ready for QA", bugIssues.filter(isReadyForQa))} />
            <JiraKpi label="Rejected Fixes" value={bugIssues.filter((issue) => issue.status === ISSUE_STATUS.REJECTED).length} helper="Returned by QA" />
            <JiraKpi label="Reopened Bugs" value={reopenedBugs.length} helper="Quality follow-up" onClick={() => drillTo("Reopened bugs", reopenedBugs)} />
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <JiraSection title="QA Workload">
              <JiraBarChart data={qaRows} onDrill={(row) => drillTo(row.label, bugIssues.filter((issue) => String(issue.reporter?._id || issue.testerOwner?._id || "unassigned") === String(row.key)))} />
            </JiraSection>
            <JiraSection title="QA Resolution Trend">
              <JiraLineChart data={bugTrendRows} lines={[{ key: "completed", color: "#2563eb" }, { key: "reopened", color: "#dc2626" }]} />
            </JiraSection>
          </div>
        </>
      );
    }

    if (activePage === "sprints") {
      return (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <JiraKpi label="Sprint Completion" value={`${Math.round(taskMetrics.completionRate)}%`} helper="Task scope only" onClick={() => drillTo("Sprint tasks", taskIssues)} />
            <JiraKpi label="Sprint Velocity" value={taskMetrics.velocity} helper="Delivered points" />
            <JiraKpi label="Scope Change" value={taskMetrics.total - completedTasks.length} helper="Open work" />
            <JiraKpi label="Sprint SLA" value={`${Math.round(taskMetrics.slaCompliance)}%`} helper="Task SLA only" />
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <JiraSection title="Sprint Burnup">
              <JiraLineChart data={taskTrendRows} lines={[{ key: "created", color: "#94a3b8" }, { key: "completed", color: "#2563eb" }]} />
            </JiraSection>
            <JiraSection title="Sprint Status Split">
              <JiraBarChart data={taskStatusRows.map((row) => ({ ...row, label: row.name }))} onDrill={(row) => drillTo(row.label, taskIssues.filter((issue) => String(issue.status || "unassigned") === String(row.key)))} />
            </JiraSection>
          </div>
        </>
      );
    }

    if (activePage === "releases") {
      return (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <JiraKpi label="Release Scope" value={allIssues.length} helper="Filtered release items" onClick={() => drillTo("Release scope", allIssues)} />
            <JiraKpi label="Completed Tasks" value={completedTasks.length} helper="Task release readiness" />
            <JiraKpi label="Closed Bugs" value={closedBugs.length} helper="Bug release readiness" />
            <JiraKpi label="Open Critical Bugs" value={bugMetrics.criticalOpen} helper="Release blocker signal" onClick={() => drillTo("Critical bugs", bugIssues.filter(isCriticalBug))} />
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <JiraSection title="Release Distribution">
              <JiraBarChart data={releaseRows} onDrill={(row) => drillTo(row.label, allIssues.filter((issue) => String(getIssueReleaseId(issue) || "unassigned") === String(row.key)))} />
            </JiraSection>
            <JiraSection title="Release Readiness">
              <div className="grid gap-3 sm:grid-cols-2">
                <ProgressRow label="Task readiness" value={Math.round(taskMetrics.completionRate)} meta={`${completedTasks.length} completed tasks`} />
                <ProgressRow label="Bug closure" value={Math.round(bugMetrics.fixRate)} meta={`${closedBugs.length} closed bugs`} tone="bg-rose-500" />
              </div>
            </JiraSection>
          </div>
        </>
      );
    }

    if (activePage === "executive") {
      return (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <JiraKpi label="Delivery Health" value={`${Math.round(taskMetrics.completionRate)}%`} helper="Task completion only" onClick={() => drillTo("Task delivery", taskIssues)} />
            <JiraKpi label="Quality Health" value={`${Math.round(100 - bugMetrics.bugLeakage)}%`} helper="Bug leakage inverse" onClick={() => drillTo("Quality signals", bugIssues)} />
            <JiraKpi label="Velocity" value={taskMetrics.velocity} helper={`${taskComparison.delta}% vs previous ${comparisonMode}`} />
            <JiraKpi label="Fix Rate" value={`${Math.round(bugMetrics.fixRate)}%`} helper={`${bugComparison.delta}% vs previous ${comparisonMode}`} />
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <JiraSection title="Task Delivery Trend">
              <JiraLineChart data={taskTrendRows} lines={[{ key: "completed", color: "#2563eb" }]} />
            </JiraSection>
            <JiraSection title="Bug Resolution Trend">
              <JiraLineChart data={bugTrendRows} lines={[{ key: "completed", color: "#dc2626" }, { key: "reopened", color: "#f97316" }]} />
            </JiraSection>
          </div>
        </>
      );
    }

    return (
      <>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <JiraKpi label="Task Completion" value={`${Math.round(taskMetrics.completionRate)}%`} helper={`${taskMetrics.completed}/${taskMetrics.total} tasks`} onClick={() => navigate("/reports/tasks")} />
          <JiraKpi label="Bug Fix Rate" value={`${Math.round(bugMetrics.fixRate)}%`} helper={`${bugMetrics.resolved}/${bugMetrics.total} bugs`} onClick={() => navigate("/reports/bugs")} />
          <JiraKpi label="Sprint Velocity" value={taskMetrics.velocity} helper="Task points delivered" onClick={() => navigate("/reports/sprints")} />
          <JiraKpi label="Top Developer" value={topDeveloper ? `${topDeveloper.score}/100` : "--"} helper={topDeveloper?.name || "No developer data"} onClick={() => navigate("/reports/developers")} />
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          <JiraSection title="Task Trend">
            <JiraLineChart data={taskTrendRows} lines={[{ key: "created", color: "#94a3b8" }, { key: "completed", color: "#2563eb" }]} />
          </JiraSection>
          <JiraSection title="Bug Trend">
            <JiraLineChart data={bugTrendRows} lines={[{ key: "created", color: "#94a3b8" }, { key: "completed", color: "#dc2626" }]} />
          </JiraSection>
        </div>
      </>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50/70 text-slate-950">
      <div className="space-y-4">
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-4 shadow-sm">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Reports</p>
              <h1 className="mt-1 text-2xl font-semibold">Enterprise Reporting</h1>
              <p className="mt-1 text-sm text-slate-500">Jira-style analytics with dedicated report pages and drill-down data.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <EnterpriseActionButton icon={FileText} onClick={() => window.print()}>PDF</EnterpriseActionButton>
              <EnterpriseActionButton icon={Download} onClick={() => exportRows(allIssues, activePage)}>Excel</EnterpriseActionButton>
              <EnterpriseActionButton icon={Download} onClick={() => exportRows(allIssues, activePage)}>CSV</EnterpriseActionButton>
              <EnterpriseActionButton icon={Share2} onClick={shareReport}>Share</EnterpriseActionButton>
              <EnterpriseActionButton icon={RefreshCcw} onClick={() => queryClient.invalidateQueries({ queryKey: ["analytics"] })}>Refresh</EnterpriseActionButton>
              <EnterpriseActionButton icon={Save} onClick={saveFilter}>Save Filter</EnterpriseActionButton>
              <EnterpriseActionButton icon={CalendarClock} onClick={scheduleReport}>Schedule</EnterpriseActionButton>
              <Button type="button" variant="outline" size="sm" onClick={resetFilters}>Reset</Button>
            </div>
          </div>
          <nav className="mt-4 flex gap-1 overflow-x-auto border-b border-slate-200 pb-0 dashboard-scrollbar">
            {REPORT_PAGES.map((page) => (
              <NavLink
                className={({ isActive }) => cn(
                  "shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition",
                  isActive || (page.key === "overview" && activePage === "overview")
                    ? "border-blue-600 text-blue-700"
                    : "border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-950"
                )}
                end={page.key === "overview"}
                key={page.key}
                to={page.key === "overview" ? "/reports" : `/reports/${page.key}`}
              >
                {page.label}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
            <select className={ANALYTICS_SELECT_CLASS} value={filters.projectId} onChange={(event) => updateFilter("projectId", event.target.value)}>
              <option value="all">All projects</option>
              {projects.map((project) => <option key={project._id} value={project._id}>{project.name}</option>)}
            </select>
            <select className={ANALYTICS_SELECT_CLASS} value={filters.sprintId} disabled={!selectedProjectId} onChange={(event) => updateFilter("sprintId", event.target.value)}>
              <option value="all">All sprints</option>
              <option value="backlog">Backlog</option>
              {sprints.map((sprint) => <option key={sprint._id} value={sprint._id}>{sprint.name}</option>)}
            </select>
            <select className={ANALYTICS_SELECT_CLASS} value={filters.teamId} onChange={(event) => updateFilter("teamId", event.target.value)}>
              <option value="all">All teams</option>
              {teams.map((team) => <option key={resolveTeamId(team)} value={resolveTeamId(team)}>{team.name}</option>)}
            </select>
            <select className={ANALYTICS_SELECT_CLASS} value={filters.developerId} onChange={(event) => updateFilter("developerId", event.target.value)}>
              <option value="all">All developers</option>
              {members.filter((member) => member.role === "Developer").map((member) => <option key={resolveUserId(member)} value={resolveUserId(member)}>{member.name}</option>)}
            </select>
            <select className={ANALYTICS_SELECT_CLASS} value={filters.testerId} onChange={(event) => updateFilter("testerId", event.target.value)}>
              <option value="all">All testers</option>
              {members.filter((member) => member.role === "Tester").map((member) => <option key={resolveUserId(member)} value={resolveUserId(member)}>{member.name}</option>)}
            </select>
            <select className={ANALYTICS_SELECT_CLASS} value={filters.priority} onChange={(event) => updateFilter("priority", event.target.value)}>
              <option value="all">All priorities</option>
              {PRIORITIES.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
            </select>
            <select className={ANALYTICS_SELECT_CLASS} value={filters.severity} onChange={(event) => updateFilter("severity", event.target.value)}>
              <option value="all">All severities</option>
              {BUG_SEVERITY_OPTIONS.map((severity) => <option key={severity} value={severity}>{severity}</option>)}
            </select>
            <select className={ANALYTICS_SELECT_CLASS} value={filters.status} onChange={(event) => updateFilter("status", event.target.value)}>
              {STATUS_OPTIONS.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
            </select>
            <select className={ANALYTICS_SELECT_CLASS} value={filters.releaseId} onChange={(event) => updateFilter("releaseId", event.target.value)}>
              <option value="all">All releases</option>
              {releaseOptions.map((release) => <option key={release.id} value={release.id}>{release.name}</option>)}
            </select>
            <select className={ANALYTICS_SELECT_CLASS} value={comparisonMode} onChange={(event) => setComparisonMode(event.target.value)}>
              <option value="sprint">Current vs Previous Sprint</option>
              <option value="month">Current vs Previous Month</option>
              <option value="release">Current vs Previous Release</option>
            </select>
            <DateField label="Date from" value={filters.dateFrom} onChange={(event) => updateFilter("dateFrom", event.target.value)} />
            <DateField label="Date to" value={filters.dateTo} onChange={(event) => updateFilter("dateTo", event.target.value)} />
          </div>
        </div>

        {renderPage()}

        {drilldown ? (
          <JiraDrilldown rows={drilldown.rows} title={drilldown.title} onClear={() => setDrilldown(null)} />
        ) : null}
      </div>
    </div>
  );
};

const ReportsPage = () => {
  const { role, user } = useAuth();

  if (role === ROLE_TESTER) {
    return <TesterReportsDashboard user={user} />;
  }

  if (role === ROLE_DEVELOPER) {
    return <DeveloperReportsDashboard user={user} />;
  }

  return <JiraReportsDashboard />;
};

export default ReportsPage;
