import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  ArrowUpDown,
  BarChart3,
  Bell,
  Bug,
  CalendarClock,
  CheckCircle2,
  CircleDotDashed,
  ClipboardList,
  Flame,
  FolderKanban,
  ListTodo,
  PauseCircle,
  RefreshCcw,
  Search,
  Star,
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
import { motion, AnimatePresence } from "framer-motion";
import {
  fetchIssueActivity,
  fetchIssueStats,
  fetchNotifications,
  fetchUnreadNotificationCount,
  markNotificationAsRead,
  fetchBugBucket,
  fetchMyIssues,
  fetchProjects,
  pickIssue,
  updateIssue,
} from "@/lib/api";
import {
  BUG_STATUS_OPTIONS,
  ISSUE_SORT_OPTIONS,
  ISSUE_STATUS,
  ISSUE_STATUS_OPTIONS,
  createIssueListFilters,
  filterIssues,
  getIssueDisplayKey,
  getIssueStatusLabel,
  getIssueStatusMetrics,
  isBugIssue,
  isIssueClosed,
  normalizeBugStatusForIssue,
  resolveBugDetails,
  resolveIssueProjectId,
  sortIssues,
} from "@/lib/issues";
import { cn, formatDate, formatDateTime } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import {
  getDeveloperBugBucketQueryFilters,
  getDeveloperBugBucketQueryKey,
  removeIssueFromBucketCaches,
} from "@/lib/bug-workflow-cache";
import IssueDetailsDialog from "@/components/issues/IssueDetailsDialog";
import NotificationCard from "@/components/dashboard/NotificationCard";
import EmptyState from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

const TABS = [
  { id: "tasks", label: "Tasks", Icon: ClipboardList },
  { id: "bugs", label: "Bugs / Issues", Icon: Bug },
];

const defaultFilters = createIssueListFilters({
  assigneeId: "all",
  sortBy: "priority",
});

const statusStyleMap = {
  [ISSUE_STATUS.NEW]: "border-orange-200 bg-orange-50 text-orange-700",
  [ISSUE_STATUS.TRIAGED]: "border-indigo-200 bg-indigo-50 text-indigo-700",
  [ISSUE_STATUS.OPEN]: "border-red-200 bg-red-50 text-red-700",
  [ISSUE_STATUS.ASSIGNED]: "border-violet-200 bg-violet-50 text-violet-700",
  [ISSUE_STATUS.IN_PROGRESS]: "border-blue-200 bg-blue-50 text-blue-700",
  [ISSUE_STATUS.READY_FOR_QA]: "border-cyan-200 bg-cyan-50 text-cyan-700",
  [ISSUE_STATUS.TESTING]: "border-sky-200 bg-sky-50 text-sky-700",
  [ISSUE_STATUS.QA]: "border-cyan-200 bg-cyan-50 text-cyan-700",
  [ISSUE_STATUS.FIXED]: "border-cyan-200 bg-cyan-50 text-cyan-700",
  [ISSUE_STATUS.REVIEW]: "border-cyan-200 bg-cyan-50 text-cyan-700",
  [ISSUE_STATUS.DONE]: "border-emerald-200 bg-emerald-50 text-emerald-700",
  [ISSUE_STATUS.CLOSED]: "border-green-300 bg-green-50 text-green-800",
  [ISSUE_STATUS.REJECTED]: "border-slate-200 bg-slate-100 text-slate-700",
  [ISSUE_STATUS.DEFERRED]: "border-slate-200 bg-slate-100 text-slate-700",
  [ISSUE_STATUS.BLOCKED]: "border-rose-200 bg-rose-50 text-rose-700",
  [ISSUE_STATUS.REOPEN]: "border-amber-200 bg-amber-50 text-amber-700",
  [ISSUE_STATUS.TODO]: "border-slate-200 bg-slate-50 text-slate-700",
};

const priorityStyleMap = {
  Critical: "border-red-300 bg-red-50 text-red-700",
  High: "border-orange-200 bg-orange-50 text-orange-700",
  Medium: "border-yellow-200 bg-yellow-50 text-yellow-700",
  Low: "border-slate-200 bg-blue-50 text-slate-700",
};

const severityStyleMap = {
  Blocker: "border-red-300 bg-red-950 text-white",
  Critical: "border-red-200 bg-red-50 text-red-700",
  Major: "border-orange-200 bg-orange-50 text-orange-700",
  Minor: "border-blue-200 bg-blue-50 text-blue-700",
  Trivial: "border-slate-200 bg-slate-100 text-slate-700",
};

const priorityRank = {
  Critical: 0,
  High: 1,
  Medium: 2,
  Low: 3,
};

const severityRank = {
  Blocker: 0,
  Critical: 1,
  Major: 2,
  Minor: 3,
  Trivial: 4,
};

const bugWorkflowLabels = {
  [ISSUE_STATUS.NEW]: "Open",
  [ISSUE_STATUS.TRIAGED]: "Triaged",
  [ISSUE_STATUS.OPEN]: "Open",
  [ISSUE_STATUS.ASSIGNED]: "Assigned",
  [ISSUE_STATUS.IN_PROGRESS]: "In Progress",
  [ISSUE_STATUS.READY_FOR_QA]: "Ready for QA",
  [ISSUE_STATUS.TESTING]: "Testing",
  [ISSUE_STATUS.FIXED]: "Testing",
  [ISSUE_STATUS.DONE]: "Done",
  [ISSUE_STATUS.CLOSED]: "Closed",
  [ISSUE_STATUS.REOPEN]: "Reopened",
  [ISSUE_STATUS.REJECTED]: "Rejected",
  [ISSUE_STATUS.DEFERRED]: "Deferred",
};

const developerBugTransitions = {
  [ISSUE_STATUS.NEW]: [ISSUE_STATUS.ASSIGNED],
  [ISSUE_STATUS.TRIAGED]: [ISSUE_STATUS.ASSIGNED],
  [ISSUE_STATUS.OPEN]: [ISSUE_STATUS.ASSIGNED, ISSUE_STATUS.REJECTED],
  [ISSUE_STATUS.ASSIGNED]: [ISSUE_STATUS.IN_PROGRESS, ISSUE_STATUS.FIXED, ISSUE_STATUS.READY_FOR_QA, ISSUE_STATUS.REJECTED],
  [ISSUE_STATUS.IN_PROGRESS]: [ISSUE_STATUS.FIXED, ISSUE_STATUS.READY_FOR_QA, ISSUE_STATUS.REJECTED],
  [ISSUE_STATUS.REOPEN]: [ISSUE_STATUS.ASSIGNED, ISSUE_STATUS.IN_PROGRESS],
};

const taskStatusOptions = [
  { value: ISSUE_STATUS.TODO, label: "To Do" },
  { value: ISSUE_STATUS.IN_PROGRESS, label: "In Progress" },
  { value: ISSUE_STATUS.REVIEW, label: "Review" },
  { value: ISSUE_STATUS.QA, label: "Testing" },
  { value: ISSUE_STATUS.DONE, label: "Done" },
];

const BUG_STATUS_ANALYTICS = [
  {
    key: "open",
    label: "Open",
    statuses: [ISSUE_STATUS.NEW, ISSUE_STATUS.TRIAGED, ISSUE_STATUS.OPEN],
    color: "#f59e0b",
    gradient: "from-amber-400 to-orange-500",
    track: "bg-amber-100",
    Icon: AlertTriangle,
  },
  {
    key: "inProgress",
    label: "In Progress",
    statuses: [ISSUE_STATUS.ASSIGNED, ISSUE_STATUS.IN_PROGRESS],
    color: "#6366f1",
    gradient: "from-indigo-500 to-violet-500",
    track: "bg-indigo-100",
    Icon: TimerReset,
  },
  {
    key: "resolved",
    label: "Resolved",
    statuses: [ISSUE_STATUS.READY_FOR_QA, ISSUE_STATUS.TESTING, ISSUE_STATUS.FIXED, ISSUE_STATUS.QA],
    color: "#10b981",
    gradient: "from-emerald-500 to-teal-400",
    track: "bg-emerald-100",
    Icon: CheckCircle2,
  },
  {
    key: "reopened",
    label: "Reopened",
    statuses: [ISSUE_STATUS.REOPEN],
    color: "#ec4899",
    gradient: "from-pink-500 to-rose-500",
    track: "bg-pink-100",
    Icon: RefreshCcw,
  },
  {
    key: "closed",
    label: "Closed",
    statuses: [ISSUE_STATUS.CLOSED, ISSUE_STATUS.DONE],
    color: "#64748b",
    gradient: "from-slate-500 to-slate-700",
    track: "bg-slate-200",
    Icon: CheckCircle2,
  },
  {
    key: "deferred",
    label: "Deferred",
    statuses: [ISSUE_STATUS.DEFERRED, ISSUE_STATUS.REJECTED],
    color: "#14b8a6",
    gradient: "from-cyan-500 to-teal-500",
    track: "bg-cyan-100",
    Icon: PauseCircle,
  },
];

const getStatusLabel = (issue) =>
  isBugIssue(issue)
    ? bugWorkflowLabels[normalizeBugStatusForIssue(issue)] || getIssueStatusLabel(issue.status)
    : getIssueStatusLabel(issue.status);

const getBadgeClass = (map, key, fallback) =>
  map[key] || fallback || "border-slate-200 bg-slate-100 text-slate-700";

const Pill = ({ children, className }) => (
  <span
    className={cn(
      "inline-flex h-6 items-center justify-center whitespace-nowrap rounded-full border px-2.5 text-[11px] font-semibold leading-none",
      className
    )}
  >
    {children}
  </span>
);

const bugWorkTableColumns = [
  "w-[92px]",
  "w-[320px]",
  "w-[92px]",
  "w-[98px]",
  "w-[122px]",
  "w-[128px]",
  "w-[158px]",
  "w-[156px]",
  "w-[108px]",
  "w-[136px]",
  "w-[236px]",
];

const taskWorkTableColumns = [
  "w-[96px]",
  "w-[380px]",
  "w-[96px]",
  "w-[124px]",
  "w-[136px]",
  "w-[168px]",
  "w-[112px]",
  "w-[136px]",
  "w-[226px]",
];

const getLastUpdated = (issue) => issue?.updatedAt || issue?.lastUpdatedAt || issue?.createdAt;

const getBugSeverity = (issue) => resolveBugDetails(issue)?.severity || "Trivial";

const getAssigneeName = (issue) =>
  issue?.assignee?.name ||
  resolveBugDetails(issue)?.developerLead?.name ||
  "Unassigned";

const getReporterName = (issue) =>
  issue?.reporter?.name || resolveBugDetails(issue)?.testerOwner?.name || "Unknown";

const getProjectName = (issue) => issue?.projectId?.name || "Unknown project";

const getTeamName = (issue) => issue?.teamId?.name || "No team";

const getProjectId = (project) => String(project?._id || project || "");

const getSlaInfo = (issue) => {
  if (!issue?.dueAt) {
    return {
      label: "No SLA date",
      className: "text-slate-500",
      urgent: false,
    };
  }

  const dueTime = new Date(issue.dueAt).getTime();
  const diff = dueTime - Date.now();
  const absDiff = Math.abs(diff);
  const hours = Math.ceil(absDiff / (1000 * 60 * 60));
  const days = Math.ceil(absDiff / (1000 * 60 * 60 * 24));

  if (diff < 0) {
    return {
      label: `${hours}h overdue`,
      className: "text-rose-700",
      urgent: true,
    };
  }

  if (hours <= 24) {
    return {
      label: `${hours}h left`,
      className: "text-orange-700",
      urgent: true,
    };
  }

  return {
    label: `${days}d left`,
    className: "text-slate-600",
    urgent: false,
  };
};

const isCriticalIssue = (issue) => {
  const severity = getBugSeverity(issue);

  return ["Blocker", "Critical"].includes(severity) || issue?.priority === "Critical";
};

const sortPriorityQueue = (issues = []) =>
  [...issues].sort((left, right) => {
    const leftCritical = isCriticalIssue(left) ? 0 : 1;
    const rightCritical = isCriticalIssue(right) ? 0 : 1;

    if (leftCritical !== rightCritical) {
      return leftCritical - rightCritical;
    }

    const severityDelta =
      (severityRank[getBugSeverity(left)] ?? 10) - (severityRank[getBugSeverity(right)] ?? 10);

    if (severityDelta !== 0) {
      return severityDelta;
    }

    const priorityDelta =
      (priorityRank[left.priority] ?? 10) - (priorityRank[right.priority] ?? 10);

    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    const leftDue = left.dueAt ? new Date(left.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
    const rightDue = right.dueAt ? new Date(right.dueAt).getTime() : Number.MAX_SAFE_INTEGER;

    if (leftDue !== rightDue) {
      return leftDue - rightDue;
    }

    return new Date(getLastUpdated(right) || 0) - new Date(getLastUpdated(left) || 0);
  });

const sortAvailableBugQueue = (issues = []) =>
  [...issues].sort((left, right) => {
    const severityDelta =
      (severityRank[getBugSeverity(left)] ?? 10) - (severityRank[getBugSeverity(right)] ?? 10);

    if (severityDelta !== 0) {
      return severityDelta;
    }

    const priorityDelta =
      (priorityRank[left.priority] ?? 10) - (priorityRank[right.priority] ?? 10);

    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    return new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime();
  });

const getNextBugAction = (issue) => {
  const currentStatus = normalizeBugStatusForIssue(issue);
  const [nextStatus] = developerBugTransitions[currentStatus] || [];

  if (!nextStatus) {
    return null;
  }

  const labels = {
    [ISSUE_STATUS.OPEN]: "Open",
    [ISSUE_STATUS.ASSIGNED]: "Start",
    [ISSUE_STATUS.IN_PROGRESS]: "Start",
    [ISSUE_STATUS.FIXED]: "Mark Fixed",
    [ISSUE_STATUS.READY_FOR_QA]: "Send to QA",
    [ISSUE_STATUS.FIXED]: "Send to QA",
  };

  return {
    status: nextStatus,
    label: labels[nextStatus] || getIssueStatusLabel(nextStatus),
  };
};

const activityText = (entry) => {
  if (entry?.eventType === "COMMENT_CREATED") {
    return "commented on";
  }

  if (entry?.eventType === "BUG_STATUS_CHANGED") {
    return "moved bug status";
  }

  if (entry?.eventType === "ISSUE_CREATED") {
    return "created";
  }

  return "updated";
};


const SprintProgressWidget = ({ metrics, isLoading }) => {
  const percentage = metrics?.percentage || 0;

  return (
    <div
      className="group flex h-16 min-w-[240px] flex-1 flex-col justify-center rounded-[22px] border border-cyan-100/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.86),rgba(239,246,255,0.78),rgba(236,254,255,0.68))] px-4 py-2 shadow-[0_16px_34px_-26px_rgba(14,165,233,0.78)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 hover:border-cyan-200 hover:shadow-[0_18px_38px_-24px_rgba(14,165,233,0.9)] sm:ml-auto sm:max-w-[340px]"
      title="Sprint completion based on assigned tasks."
    >
      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-3 w-28 rounded-full" />
          <Skeleton className="h-2 w-full rounded-full" />
          <Skeleton className="h-2.5 w-36 rounded-full" />
        </div>
      ) : metrics?.hasActiveSprint ? (
        <>
          <div className="mb-1 flex items-center justify-between gap-3">
            <p className="truncate text-xs font-semibold text-slate-900">Sprint Progress</p>
            <span className="shrink-0 text-xs font-bold text-cyan-700">{percentage}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-200/80 shadow-inner">
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,#2563EB_0%,#06B6D4_100%)] shadow-[0_0_16px_rgba(14,165,233,0.45)] transition-[width] duration-700 ease-out"
              style={{ width: `${percentage}%` }}
            />
          </div>
          <p className="mt-1 truncate text-[11px] font-medium text-slate-500">
            {metrics.completed} / {metrics.total} Tasks Completed
          </p>
        </>
      ) : (
        <>
          <p className="text-xs font-semibold text-slate-900">Sprint Progress</p>
          <p className="mt-1 text-[11px] font-medium text-slate-500">No active sprint</p>
        </>
      )}
    </div>
  );
};

const StatCard = ({ label, value, helper, Icon, className }) => (
  <Card className="group overflow-hidden border-white/70 bg-white/86 shadow-[0_20px_52px_-36px_rgba(15,23,42,0.34)] backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:border-blue-100 hover:shadow-[0_24px_54px_-30px_rgba(37,99,235,0.32)]">
    <CardContent className="relative overflow-hidden p-4">
      <div className={cn("absolute inset-x-0 top-0 h-1", className)} />
      <div className={cn("absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-10 blur-2xl transition group-hover:opacity-20", className)} />
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            {label}
          </p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
            {value}
          </p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/80 bg-slate-50 text-slate-700 shadow-sm">
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="text-sm text-slate-500">{helper}</p>
        <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Live</span>
      </div>
    </CardContent>
  </Card>
);

const clampScore = (value) => Math.min(100, Math.max(0, Math.round(Number(value) || 0)));
const ratingLabel = (score) =>
  score >= 85 ? "Excellent" : score >= 70 ? "Good" : score >= 55 ? "Average" : "Needs Improvement";

const RoleRatingCard = ({ metrics, title = "My Performance Rating" }) => {
  const stars = Math.max(1, Math.min(5, Math.round(metrics.score / 20)));

  return (
    <div className="flex min-h-11 min-w-[250px] flex-1 items-center gap-3 rounded-2xl border border-slate-200 bg-white/90 px-3 py-2 shadow-sm backdrop-blur-xl transition hover:border-blue-200 hover:shadow-md sm:max-w-[360px]">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-amber-100 bg-amber-50 text-amber-600">
        <Trophy className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              {title}
            </p>
            <p className="truncate text-sm font-semibold text-slate-950">
              {ratingLabel(metrics.score)} · {metrics.score}/100
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <span className="text-xs font-bold text-slate-700">{stars}/5</span>
            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
          </div>
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1.5 text-[10px]">
          {metrics.items.map((item) => (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-500"
              key={item.label}
            >
              <span className="font-semibold text-slate-800">{item.value}</span>
              {item.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

const BugStatusAnalytics = ({ issues = [] }) => {
  const statusData = useMemo(() => {
    const total = issues.length;

    return BUG_STATUS_ANALYTICS.map((item) => {
      const value = issues.filter((issue) =>
        item.statuses.includes(normalizeBugStatusForIssue(issue))
      ).length;

      return {
        ...item,
        value,
        percentage: total ? Math.round((value / total) * 100) : 0,
      };
    });
  }, [issues]);

  const visibleStatusData = useMemo(
    () => statusData.filter((item) => item.value > 0),
    [statusData]
  );

  const totalWidth = visibleStatusData.reduce((acc, item) => acc + item.percentage, 0);

  return (
    <Card className="overflow-hidden rounded-2xl border-white/70 bg-white/88 shadow-[0_20px_56px_-36px_rgba(15,23,42,0.38)] backdrop-blur-xl">
      <CardHeader className="border-b border-slate-200/70 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4 text-blue-600" />
              Bug Status
            </CardTitle>
            <CardDescription>Live distribution of your assigned bug workload.</CardDescription>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-slate-950">{issues.length}</p>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Total Bugs</p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4">
        {issues.length ? (
          <div className="space-y-6">
            {/* Large Horizontal Segmented Bar */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Status Distribution</p>
                <span className="text-xs font-medium text-slate-400">100%</span>
              </div>
              <div className="flex h-3 gap-0.5 overflow-hidden rounded-full bg-slate-100 p-0.5">
                {visibleStatusData.map((item, idx) => (
                  <div
                    key={item.key}
                    className={cn(
                      "transition-all duration-500 ease-out",
                      idx === 0 ? "rounded-l-full" : "",
                      idx === visibleStatusData.length - 1 ? "rounded-r-full" : ""
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
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {visibleStatusData.map((item) => {
                const StatusIcon = item.Icon;

                return (
                  <div
                    key={item.key}
                    className="group rounded-xl border border-slate-200/60 bg-gradient-to-br from-white/95 to-slate-50/70 p-3.5 shadow-sm transition duration-200 hover:border-blue-200/80 hover:shadow-md"
                  >
                    <div className="flex items-start justify-between gap-3 mb-2.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white shadow-sm"
                          style={{ backgroundColor: item.color }}
                        >
                          <StatusIcon className="h-3.5 w-3.5" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-600 truncate">{item.label}</p>
                        </div>
                      </div>
                      <div className="flex items-baseline gap-1 shrink-0">
                        <span className="text-lg font-bold text-slate-950">{item.value}</span>
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

            {/* Legend */}
            {statusData.length > visibleStatusData.length && (
              <div className="pt-2 border-t border-slate-100">
                <p className="text-[10px] font-medium text-slate-400 mb-2">Other statuses</p>
                <div className="flex flex-wrap gap-1.5">
                  {statusData
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
          <div className="flex min-h-[240px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-6 py-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 mb-3">
              <Bug className="h-6 w-6 text-slate-300" />
            </div>
            <p className="text-sm font-medium text-slate-600">No assigned bug activity yet</p>
            <p className="mt-1 text-xs text-slate-400">Bugs you're assigned to will appear here</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const ProjectPanel = ({ projects, issues, onOpenProject }) => {
  const projectCards = useMemo(
    () =>
      projects
        .map((project) => {
          const projectIssues = issues.filter(
            (issue) => resolveIssueProjectId(issue) === getProjectId(project)
          );
          const completed = projectIssues.filter(isIssueClosed).length;
          const active = projectIssues.length - completed;
          const progress = projectIssues.length
            ? Math.round((completed / projectIssues.length) * 100)
            : 0;
          const critical = projectIssues.filter(
            (issue) => !isIssueClosed(issue) && isCriticalIssue(issue)
          ).length;

          return {
            ...project,
            active,
            completed,
            progress,
            critical,
            total: projectIssues.length,
          };
        })
        .filter((project) => project.total > 0)
        .sort((left, right) => right.active - left.active || right.critical - left.critical),
    [issues, projects]
  );

  return (
    <Card className="h-full border-white/70 bg-white/88 shadow-[0_18px_48px_-36px_rgba(15,23,42,0.36)] backdrop-blur-xl">
      <CardHeader className="border-b border-slate-200/80 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <FolderKanban className="h-4 w-4 text-blue-600" />
          Assigned Projects
        </CardTitle>
      </CardHeader>
      <CardContent className="max-h-[320px] space-y-3 overflow-y-auto p-3">
        {projectCards.length ? (
          projectCards.map((project) => (
            <button
              key={project._id}
              className="w-full rounded-[20px] border border-slate-200/80 bg-white/76 p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:bg-white hover:shadow-md"
              type="button"
              onClick={() => onOpenProject(project._id)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-950">
                    {project.name}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {project.active} active - {project.completed} completed
                  </p>
                </div>
                <span
                  className={cn(
                    "mt-0.5 h-2.5 w-2.5 rounded-full",
                    project.critical ? "bg-rose-500" : project.active ? "bg-blue-500" : "bg-emerald-500"
                  )}
                />
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-[linear-gradient(90deg,#2563EB_0%,#10B981_100%)]"
                  style={{ width: `${project.progress}%` }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between text-xs font-semibold text-slate-500">
                <span>{project.progress}% progress</span>
                {project.critical ? (
                  <span className="text-rose-600">{project.critical} critical</span>
                ) : (
                  <span>On track</span>
                )}
              </div>
            </button>
          ))
        ) : (
          <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
            No assigned projects yet.
          </p>
        )}
      </CardContent>
    </Card>
  );
};

const PriorityQueue = ({
  issues,
  onOpenIssue,
  onStatusChange,
  updatingId,
  onClose,
}) => {
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [queueSort, setQueueSort] = useState("critical");
  const queue = useMemo(() => {
    const activeIssues = issues.filter((issue) => !isIssueClosed(issue));
    const filteredIssues = activeIssues.filter((issue) => {
      if (priorityFilter === "all") {
        return true;
      }

      if (priorityFilter === "critical") {
        return isCriticalIssue(issue);
      }

      if (priorityFilter === "overdue") {
        return getSlaInfo(issue).urgent;
      }

      return issue.priority === priorityFilter;
    });

    if (queueSort === "due") {
      return [...filteredIssues].sort((left, right) => {
        const leftDue = left.dueAt ? new Date(left.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
        const rightDue = right.dueAt ? new Date(right.dueAt).getTime() : Number.MAX_SAFE_INTEGER;

        return leftDue - rightDue;
      });
    }

    if (queueSort === "updated") {
      return [...filteredIssues].sort(
        (left, right) =>
          new Date(getLastUpdated(right) || 0) - new Date(getLastUpdated(left) || 0)
      );
    }

    return sortPriorityQueue(filteredIssues);
  }, [issues, priorityFilter, queueSort]);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Filter
          </span>
          <select
            className="field-select rounded-2xl"
            value={priorityFilter}
            onChange={(event) => setPriorityFilter(event.target.value)}
          >
            <option value="all">All active</option>
            <option value="critical">Critical only</option>
            <option value="High">High priority</option>
            <option value="Medium">Medium priority</option>
            <option value="Low">Low priority</option>
            <option value="overdue">Due / SLA risk</option>
          </select>
        </label>

        <label className="space-y-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Sort
          </span>
          <select
            className="field-select rounded-2xl"
            value={queueSort}
            onChange={(event) => setQueueSort(event.target.value)}
          >
            <option value="critical">Critical first</option>
            <option value="due">Due date</option>
            <option value="updated">Recently updated</option>
          </select>
        </label>
      </div>

      {queue.length ? (
        <div className="max-h-[62vh] space-y-3 overflow-y-auto pr-1">
          {queue.map((issue) => {
            const severity = getBugSeverity(issue);
            const sla = getSlaInfo(issue);
            const nextAction = isBugIssue(issue) ? getNextBugAction(issue) : null;
            const critical = isCriticalIssue(issue);

            return (
              <article
                key={issue._id}
                className={cn(
                  "grid gap-3 rounded-[22px] border bg-white/82 p-3 shadow-sm transition hover:border-blue-200 hover:bg-white lg:grid-cols-[minmax(0,1.5fr)_120px_110px_150px_130px_auto] lg:items-center",
                  critical
                    ? "border-rose-200 ring-2 ring-rose-100"
                    : "border-slate-200/80"
                )}
              >
                <button
                  className="min-w-0 text-left"
                  type="button"
                  onClick={() => {
                    onOpenIssue(issue);
                    onClose?.();
                  }}
                >
                  <p className="font-mono text-xs font-semibold text-slate-500">
                    {getIssueDisplayKey(issue)}
                  </p>
                  <p className="mt-1 truncate text-sm font-semibold text-slate-950" title={issue.title}>
                    {issue.title}
                  </p>
                  <p className="mt-1 truncate text-xs text-slate-500">
                    {getProjectName(issue)}
                  </p>
                </button>

                <Pill className={getBadgeClass(priorityStyleMap, issue.priority)}>
                  {issue.priority || "Medium"}
                </Pill>
                <Pill className={getBadgeClass(severityStyleMap, severity)}>
                  {severity}
                </Pill>
                <span className="truncate text-sm text-slate-600" title={getAssigneeName(issue)}>
                  {getAssigneeName(issue)}
                </span>
                <Pill
                  className={
                    sla.urgent
                      ? "border-orange-200 bg-orange-50 text-orange-700"
                      : "border-slate-200 bg-slate-50 text-slate-600"
                  }
                >
                  {sla.label}
                </Pill>
                <div className="flex justify-start gap-2 lg:justify-end">
                  {nextAction ? (
                    <Button
                      className="h-9 rounded-xl px-3 text-xs"
                      disabled={updatingId === issue._id}
                      type="button"
                      onClick={() => onStatusChange(issue, nextAction.status)}
                    >
                      {updatingId === issue._id ? "Updating" : nextAction.label}
                    </Button>
                  ) : null}
                  <Button
                    className="h-9 rounded-xl px-3 text-xs"
                    type="button"
                    variant="outline"
                    onClick={() => {
                      onOpenIssue(issue);
                      onClose?.();
                    }}
                  >
                    Open
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState
          title="Priority queue clear"
          description="No active assigned work matches the current filter."
        />
      )}
    </div>
  );
};

const ActivityList = ({ activity, compact = false, fallbackIssues = [], onOpenIssue }) => {
  const fallbackActivity = useMemo(
    () =>
      fallbackIssues.slice(0, compact ? 4 : 8).map((issue) => ({
        _id: `issue-${issue._id}`,
        createdAt: getLastUpdated(issue),
        issue: {
          _id: issue._id,
          title: issue.title,
          type: issue.type,
          status: issue.status,
          project: issue.projectId,
        },
        eventType: "ISSUE_UPDATED",
        actor: null,
      })),
    [compact, fallbackIssues]
  );
  const entries = activity.length ? activity.slice(0, compact ? 4 : 8) : fallbackActivity;

  if (!entries.length) {
    return (
      <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
        No recent activity yet.
      </p>
    );
  }

  return (
    <div className={cn("space-y-3", compact && "space-y-2")}>
      {entries.map((entry) => {
        const issue = entry.issue;

        return (
          <button
            key={entry._id}
            className="flex w-full gap-3 rounded-2xl border border-slate-200/80 bg-white/76 p-3 text-left shadow-sm transition hover:border-blue-200 hover:bg-white"
            type="button"
            onClick={() => issue?._id && onOpenIssue(issue._id)}
          >
            <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-700">
              <Activity className="h-3.5 w-3.5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-slate-900">
                {entry.actor?.name || "System"} {activityText(entry)}
              </span>
              <span className="mt-0.5 block truncate text-xs text-slate-500">
                {issue?.title || entry.meta?.title || "Work item"} -{" "}
                {entry.createdAt ? formatDateTime(entry.createdAt) : "Recently"}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
};

const BugBucketPanel = ({ issues, isLoading, onOpenIssue, onPickIssue, onViewAllBugs, pickingId }) => {
  const sortedIssues = useMemo(() => sortAvailableBugQueue(issues), [issues]);

  return (
    <Card className="overflow-hidden border-cyan-100/80 bg-white/94 shadow-[0_28px_80px_-42px_rgba(8,145,178,0.5)] ring-1 ring-cyan-100/70 backdrop-blur-xl">
      <CardHeader className="border-b border-cyan-100/90 bg-[linear-gradient(135deg,rgba(236,254,255,0.98),rgba(239,246,255,0.94),rgba(255,255,255,0.92))]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.22em] text-cyan-600">
              Primary workflow
            </p>
            <CardTitle className="flex items-center gap-2 text-2xl tracking-tight text-slate-950">
              <FolderKanban className="h-6 w-6 text-cyan-600" />
              Work Queue
            </CardTitle>
            <CardDescription>Pickup-ready work waiting for developer ownership.</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Pill className="h-8 border-cyan-200 bg-cyan-50 px-3 text-cyan-700">
              {issues.length} available
            </Pill>
            <Button
              className="h-8 rounded-full px-3 text-xs"
              type="button"
              variant="outline"
              onClick={onViewAllBugs}
            >
              <FolderKanban className="h-3.5 w-3.5" />
              View Queue
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-4 sm:p-5">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={`bucket-skeleton-${index}`} className="h-10 rounded-xl" />
            ))}
          </div>
        ) : sortedIssues.length ? (
          <>
            <div className="overflow-hidden rounded-2xl border border-cyan-100/80 bg-white/88 shadow-sm">
              <div className="hidden grid-cols-[108px_minmax(220px,1fr)_150px_140px_108px_172px] items-center gap-3 border-b border-cyan-100/80 bg-cyan-50/60 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-cyan-700 md:grid">
                <span>ID</span>
                <span>Title</span>
                <span>Module / Page</span>
                <span>Type</span>
                <span>Severity</span>
                <span className="text-right">Action</span>
              </div>
              <div className="divide-y divide-cyan-100/70">
                {sortedIssues.map((issue) => {
                  const canPick = issue.canPick !== false && issue.pickupEligibility?.canPick !== false;
                  const pickDisabled = pickingId === issue._id || !canPick;
                  const isStory = issue.type === "Story";
                  const pickLabel = pickingId === issue._id ? "Picking" : canPick ? `Pick ${isStory ? "Story" : "Bug"}` : "Not Eligible";
                  const severity = getBugSeverity(issue);
                  const bugDetails = resolveBugDetails(issue);
                  const moduleName = isStory ? issue.projectId?.name || "Story" : bugDetails?.moduleName || "General";
                  const category = isStory ? "Story" : bugDetails?.category || "Bug";

                  return (
                    <article
                      key={issue._id}
                      className={`grid gap-2 px-3 py-2.5 transition md:grid-cols-[108px_minmax(220px,1fr)_150px_140px_108px_172px] md:items-center md:gap-3 md:py-1.5 ${
                        isStory ? "bg-amber-50/70 hover:bg-amber-50" : "hover:bg-cyan-50/50"
                      }`}
                    >
                      <button
                        className="truncate text-left font-mono text-xs font-semibold text-slate-500"
                        type="button"
                        onClick={() => onOpenIssue(issue)}
                      >
                        {getIssueDisplayKey(issue)}
                      </button>

                      <button
                        className="min-w-0 text-left"
                        type="button"
                        onClick={() => onOpenIssue(issue)}
                      >
                        <span className="block truncate text-sm font-semibold text-slate-950" title={issue.title}>
                          {issue.title.length > 60 ? issue.title.substring(0, 57) + "..." : issue.title}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-slate-500 md:hidden">
                          {moduleName} • {category}
                        </span>
                      </button>

                      <span className="hidden truncate text-xs font-medium text-slate-600 md:block" title={moduleName}>
                        {moduleName}
                      </span>

                      <span className="hidden truncate text-xs font-medium text-slate-600 md:block" title={category}>
                        {category}
                      </span>

                      <div>
                        <Pill className={getBadgeClass(severityStyleMap, severity)}>
                          {severity}
                        </Pill>
                      </div>

                      <div className="flex gap-2 md:justify-end">
                        <Button
                          className="h-8 rounded-xl px-3 text-xs"
                          type="button"
                          disabled={pickDisabled}
                          title={!canPick ? issue.pickupEligibility?.reason : undefined}
                          onClick={() => onPickIssue(issue)}
                        >
                          {pickLabel}
                        </Button>
                        <Button
                          className="h-8 rounded-xl px-3 text-xs"
                          type="button"
                          variant="outline"
                          onClick={() => onOpenIssue(issue)}
                        >
                          View
                        </Button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>

            <p className="border-t border-cyan-100/80 pt-3 text-xs font-medium text-slate-500">
              Showing all {sortedIssues.length} available work items
            </p>
          </>
        ) : (
          <EmptyState
            title="No work in the queue"
            description="Unassigned bugs and Stories will appear here when they are added to the developer queue."
            icon={<FolderKanban className="h-5 w-5" />}
          />
        )}
      </CardContent>
    </Card>
  );
};

const WorkTable = ({
  issues,
  type,
  onOpenIssue,
  onStatusChange,
  updatingId,
}) => {
  if (!issues.length) {
    return (
      <EmptyState
        title={type === "bugs" ? "No bugs match this view" : "No tasks match this view"}
        description="Adjust filters or switch tabs to review another part of your queue."
        icon={type === "bugs" ? <Bug className="h-5 w-5" /> : <ListTodo className="h-5 w-5" />}
      />
    );
  }
  const tableColumns = type === "bugs" ? bugWorkTableColumns : taskWorkTableColumns;
  const tableMinWidth = type === "bugs" ? "min-w-[1646px]" : "min-w-[1474px]";

  return (
    <>
      <div className="hidden">
        {issues.map((issue) => {
          const severity = getBugSeverity(issue);
          const currentBugStatus = normalizeBugStatusForIssue(issue);
          const bugOptions = developerBugTransitions[currentBugStatus] || [];
          const nextAction = getNextBugAction(issue);

          return (
            <article
              key={issue._id}
              className="rounded-[22px] border border-slate-200/80 bg-white/78 p-3 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <button
                  className="min-w-0 flex-1 text-left"
                  type="button"
                  onClick={() => onOpenIssue(issue)}
                >
                  <p className="font-mono text-xs font-semibold text-slate-500">
                    {getIssueDisplayKey(issue)}
                  </p>
                  <p className="mt-1 line-clamp-2 text-sm font-semibold text-slate-950">
                    {issue.title}
                  </p>
                  <p className="mt-1 truncate text-xs text-slate-500">
                    {getProjectName(issue)}
                  </p>
                </button>
                <Pill className={getBadgeClass(statusStyleMap, issue.status)}>
                  {getStatusLabel(issue)}
                </Pill>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <Pill className={getBadgeClass(priorityStyleMap, issue.priority)}>
                  {issue.priority || "Medium"}
                </Pill>
                {type === "bugs" ? (
                  <Pill className={getBadgeClass(severityStyleMap, severity)}>
                    {severity}
                  </Pill>
                ) : null}
                <Pill className="border-slate-200 bg-slate-50 text-slate-600">
                  {getTeamName(issue)}
                </Pill>
                <Pill className="border-slate-200 bg-slate-50 text-slate-600">
                  {getAssigneeName(issue)}
                </Pill>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-slate-500">
                  Updated {getLastUpdated(issue) ? formatDateTime(getLastUpdated(issue)) : "Unknown"}
                </span>
                <div className="flex items-center gap-2">
                  {type === "bugs" ? (
                    <select
                      aria-label={`Update ${getIssueDisplayKey(issue)} status`}
                      className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-500/20"
                      disabled={!bugOptions.length || updatingId === issue._id}
                      value=""
                      onChange={(event) => {
                        if (event.target.value) {
                          onStatusChange(issue, event.target.value);
                        }
                      }}
                    >
                      <option value="">
                        {bugOptions.length ? "Move" : "Awaiting QA"}
                      </option>
                      {bugOptions.map((status) => (
                        <option key={status} value={status}>
                          {bugWorkflowLabels[status] || getIssueStatusLabel(status)}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <select
                      aria-label={`Update ${getIssueDisplayKey(issue)} status`}
                      className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-500/20"
                      disabled={updatingId === issue._id}
                      value={issue.status}
                      onChange={(event) => onStatusChange(issue, event.target.value)}
                    >
                      {taskStatusOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  )}
                  <Button
                    className="h-9 rounded-xl px-3 text-xs"
                    type="button"
                    variant="outline"
                    onClick={() => onOpenIssue(issue)}
                  >
                    Open
                  </Button>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <div className="max-h-[640px] overflow-auto rounded-[22px] border border-slate-200/80 bg-white/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]">
        <table className={cn("w-full table-fixed text-left text-[12px]", tableMinWidth)}>
          <colgroup>
            {tableColumns.map((columnClass, index) => (
              <col className={columnClass} key={`${type}-work-column-${index}`} />
            ))}
          </colgroup>
          <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50/95 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 backdrop-blur">
          <tr>
            <th className="px-3 py-2.5">{type === "bugs" ? "Bug ID" : "ID"}</th>
            <th className="px-3 py-2.5">{type === "bugs" ? "Bug Title" : "Title"}</th>
            <th className="px-3 py-2.5">Priority</th>
            {type === "bugs" ? <th className="px-3 py-2.5">Severity</th> : null}
            <th className="px-3 py-2.5">Status</th>
            <th className="px-3 py-2.5">Team</th>
            <th className="px-3 py-2.5">Assigned</th>
            {type === "bugs" ? <th className="px-3 py-2.5">Reporter</th> : null}
            <th className="px-3 py-2.5">Created</th>
            <th className="px-3 py-2.5">Updated</th>
            <th className="px-3 py-2.5 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200/80">
          {issues.map((issue) => {
            const severity = getBugSeverity(issue);
            const currentBugStatus = normalizeBugStatusForIssue(issue);
            const bugOptions = developerBugTransitions[currentBugStatus] || [];
            const nextAction = getNextBugAction(issue);

            return (
              <tr
                key={issue._id}
                className="h-[52px] bg-white/58 transition hover:bg-blue-50/42"
              >
                <td className="truncate px-3 py-2 align-middle" title={getIssueDisplayKey(issue)}>
                  <button
                    className="block max-w-full truncate text-left font-mono text-[11px] font-semibold text-slate-500 transition hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                    type="button"
                    onClick={() => onOpenIssue(issue)}
                  >
                    {getIssueDisplayKey(issue)}
                  </button>
                </td>
                <td className="px-3 py-2 align-middle">
                  <button
                    className="block max-w-full truncate text-left font-semibold text-slate-950 hover:text-blue-700"
                    type="button"
                    title={issue.title}
                    onClick={() => onOpenIssue(issue)}
                  >
                    {issue.title}
                  </button>
                  <p className="mt-0.5 truncate text-[11px] text-slate-500" title={getProjectName(issue)}>
                    {getProjectName(issue)}
                  </p>
                </td>
                <td className="px-3 py-2 align-middle">
                  <Pill className={getBadgeClass(priorityStyleMap, issue.priority)}>
                    {issue.priority || "Medium"}
                  </Pill>
                </td>
                {type === "bugs" ? (
                  <td className="px-3 py-2 align-middle">
                    <Pill className={getBadgeClass(severityStyleMap, severity)}>
                      {severity}
                    </Pill>
                  </td>
                ) : null}
                <td className="px-3 py-2 align-middle">
                  <Pill className={getBadgeClass(statusStyleMap, issue.status)}>
                    {getStatusLabel(issue)}
                  </Pill>
                </td>
                <td className="px-3 py-2 align-middle">
                  <span className="block truncate text-slate-600" title={getTeamName(issue)}>
                    {getTeamName(issue)}
                  </span>
                </td>
                <td className="px-3 py-2 align-middle">
                  <span className="block truncate font-medium text-slate-700" title={getAssigneeName(issue)}>
                    {getAssigneeName(issue)}
                  </span>
                </td>
                {type === "bugs" ? (
                  <td className="px-3 py-2 align-middle">
                    <span className="block truncate text-slate-600" title={getReporterName(issue)}>
                      {getReporterName(issue)}
                    </span>
                  </td>
                ) : null}
                <td className="truncate whitespace-nowrap px-3 py-2 align-middle text-slate-500" title={issue.createdAt ? formatDate(issue.createdAt) : "Unknown"}>
                  {issue.createdAt ? formatDate(issue.createdAt) : "Unknown"}
                </td>
                <td className="truncate whitespace-nowrap px-3 py-2 align-middle text-slate-500" title={getLastUpdated(issue) ? formatDateTime(getLastUpdated(issue)) : "Unknown"}>
                  {getLastUpdated(issue) ? formatDateTime(getLastUpdated(issue)) : "Unknown"}
                </td>
                <td className="px-3 py-2 align-middle">
                  <div className="flex items-center justify-end gap-2">
                    {type === "bugs" ? (
                      <select
                        aria-label={`Update ${getIssueDisplayKey(issue)} status`}
                        className="h-8 w-[104px] rounded-xl border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-700 shadow-sm outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-500/20"
                        disabled={!bugOptions.length || updatingId === issue._id}
                        value=""
                        onChange={(event) => {
                          if (event.target.value) {
                            onStatusChange(issue, event.target.value);
                          }
                        }}
                      >
                        <option value="">
                          {bugOptions.length ? "Move status" : "Awaiting QA"}
                        </option>
                        {bugOptions.map((status) => (
                          <option key={status} value={status}>
                            {bugWorkflowLabels[status] || getIssueStatusLabel(status)}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <select
                        aria-label={`Update ${getIssueDisplayKey(issue)} status`}
                        className="h-8 w-[112px] rounded-xl border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-700 shadow-sm outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-500/20"
                        disabled={updatingId === issue._id}
                        value={issue.status}
                        onChange={(event) => onStatusChange(issue, event.target.value)}
                      >
                        {taskStatusOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    )}
                    {nextAction ? (
                      <Button
                        className="h-8 max-w-[86px] shrink-0 rounded-xl px-2 text-[11px]"
                        disabled={updatingId === issue._id}
                        type="button"
                        title={updatingId === issue._id ? "Syncing" : nextAction.label}
                        onClick={() => onStatusChange(issue, nextAction.status)}
                      >
                        <span className="truncate">
                          {updatingId === issue._id ? "Syncing" : nextAction.label}
                        </span>
                      </Button>
                    ) : null}
                    <Button
                      className="h-8 shrink-0 rounded-xl px-3 text-[11px]"
                      type="button"
                      variant="outline"
                      onClick={() => onOpenIssue(issue)}
                    >
                      Open
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </>
  );
};

const DeveloperDashboardPage = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("bugs");
  const [filters, setFilters] = useState(defaultFilters);
  const [selectedIssue, setSelectedIssue] = useState(null);
  const [statusError, setStatusError] = useState("");
  const [isPriorityOpen, setIsPriorityOpen] = useState(false);
  const deferredSearch = useDeferredValue(filters.search);
  const myIssuesQueryKey = useMemo(
    () => ["issues", "my", user?._id, "developer-dashboard"],
    [user?._id]
  );
  const bucketQueryKey = useMemo(
    () => getDeveloperBugBucketQueryKey(user?._id),
    [user?._id]
  );

  const {
    data: projects = [],
    isLoading: isProjectsLoading,
    error: projectsError,
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
    queryKey: myIssuesQueryKey,
    queryFn: () =>
      fetchMyIssues({
        excludeClosedBugs: true,
        limit: 200,
        sortBy: "recently-updated",
      }),
    enabled: Boolean(user?._id),
  });

  const {
    data: activeSprintStats = null,
    isLoading: isSprintProgressLoading,
  } = useQuery({
    queryKey: ["issues", "stats", "developer-dashboard", "active-sprint-tasks", user?._id],
    queryFn: () =>
      fetchIssueStats({
        sprintState: "ACTIVE",
        excludeType: "Bug",
      }),
    enabled: Boolean(user?._id),
  });

  const {
    data: activity = [],
    isLoading: isActivityLoading,
  } = useQuery({
    queryKey: ["issues", "activity", "developer-dashboard", user?._id],
    queryFn: () => fetchIssueActivity({ limit: 12, sortBy: "recently-updated" }),
    enabled: Boolean(user?._id),
  });

  const {
    data: bucketIssuesData = [],
    isLoading: isBucketLoading,
    refetch: refetchBucket,
  } = useQuery({
    queryKey: bucketQueryKey,
    queryFn: () => fetchBugBucket(getDeveloperBugBucketQueryFilters()),
    enabled: Boolean(user?._id),
  });

  const {
    data: notifications = [],
    isLoading: isNotificationsLoading,
  } = useQuery({
    queryKey: ["issues", "notifications", user?._id],
    queryFn: fetchNotifications,
    enabled: Boolean(user?._id),
  });

  const {
    data: unreadCount = 0,
  } = useQuery({
    queryKey: ["issues", "notifications", "unread-count", user?._id],
    queryFn: fetchUnreadNotificationCount,
    enabled: Boolean(user?._id),
  });

  const allIssues = useMemo(() => (Array.isArray(issues) ? issues : []), [issues]);
  const bucketIssues = useMemo(
    () =>
      (Array.isArray(bucketIssuesData) ? bucketIssuesData : []).filter(
        (issue) => !isIssueClosed(issue)
      ),
    [bucketIssuesData]
  );
  const bugIssues = useMemo(
    () => allIssues.filter((issue) => isBugIssue(issue) && !isIssueClosed(issue)),
    [allIssues]
  );
  const taskIssues = useMemo(
    () => allIssues.filter((issue) => !isBugIssue(issue)),
    [allIssues]
  );
  const sprintProgress = useMemo(
    () => {
      const total = activeSprintStats?.total || 0;
      const completed = activeSprintStats?.closed || 0;

      return {
        completed,
        total,
        percentage: total ? Math.round((completed / total) * 100) : 0,
        hasActiveSprint: total > 0,
      };
    },
    [activeSprintStats]
  );
  useEffect(() => {
    if (!selectedIssue) {
      return;
    }

    const nextIssue = allIssues.find((issue) => issue._id === selectedIssue._id);
    setSelectedIssue(nextIssue || selectedIssue);
  }, [allIssues, selectedIssue]);

  const statusMutation = useMutation({
    mutationFn: ({ id, status, payload }) =>
      updateIssue({
        id,
        payload: payload || { status },
      }),
    onMutate: async ({ id, status }) => {
      setStatusError("");

      if (!status) {
        return {};
      }

      await queryClient.cancelQueries({ queryKey: myIssuesQueryKey });
      const previousIssues = queryClient.getQueryData(myIssuesQueryKey);
      const optimisticUpdatedAt = new Date().toISOString();

      queryClient.setQueryData(myIssuesQueryKey, (current = []) =>
        Array.isArray(current)
          ? current.map((issue) =>
              issue._id === id
                ? {
                    ...issue,
                    status,
                    updatedAt: optimisticUpdatedAt,
                  }
                : issue
            )
          : current
      );
      setSelectedIssue((current) =>
        current?._id === id
          ? {
              ...current,
              status,
              updatedAt: optimisticUpdatedAt,
            }
          : current
      );

      return { previousIssues };
    },
    onError: (error, _variables, context) => {
      if (context?.previousIssues) {
        queryClient.setQueryData(myIssuesQueryKey, context.previousIssues);
      }

      setStatusError(
        error.response?.data?.message || "Unable to update status right now."
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["issues", "bucket"] });
      queryClient.invalidateQueries({ queryKey: ["issues"] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
    },
  });

  const pickMutation = useMutation({
    mutationFn: (issue) => pickIssue(issue._id),
    onMutate: () => {
      setStatusError("");
    },
    onSuccess: (pickedIssue) => {
      queryClient.setQueryData(myIssuesQueryKey, (current = []) =>
        Array.isArray(current) ? [pickedIssue, ...current] : current
      );
      removeIssueFromBucketCaches(queryClient, pickedIssue?._id);
      queryClient.invalidateQueries({ queryKey: ["issues"] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
    },
    onError: (error) => {
      setStatusError(
        error.response?.data?.message || "Unable to pick this bug right now."
      );
      queryClient.invalidateQueries({ queryKey: ["issues", "bucket"] });
    },
  });

  const workflowIssues = useMemo(
    () => [...bugIssues, ...taskIssues],
    [bugIssues, taskIssues]
  );
  const performanceRating = useMemo(() => {
    const completedTasks = taskIssues.filter(isIssueClosed).length;
    const taskCompletionRate = taskIssues.length
      ? Math.round((completedTasks / taskIssues.length) * 100)
      : 100;
    const resolvedBugStatuses = new Set([
      ISSUE_STATUS.READY_FOR_QA,
      ISSUE_STATUS.TESTING,
      ISSUE_STATUS.FIXED,
      ISSUE_STATUS.QA,
      ISSUE_STATUS.DONE,
      ISSUE_STATUS.CLOSED,
    ]);
    const resolvedBugs = bugIssues.filter((issue) =>
      resolvedBugStatuses.has(normalizeBugStatusForIssue(issue))
    ).length;
    const bugFixRate = bugIssues.length ? Math.round((resolvedBugs / bugIssues.length) * 100) : 100;
    const reopenedBugs = bugIssues.filter(
      (issue) => normalizeBugStatusForIssue(issue) === ISSUE_STATUS.REOPEN
    ).length;
    const slaIssues = workflowIssues.filter((issue) => issue.dueAt);
    const slaMet = slaIssues.filter((issue) => {
      const dueAt = new Date(issue.dueAt).getTime();
      const finishedAt = issue.closedAt ? new Date(issue.closedAt).getTime() : Date.now();

      return finishedAt <= dueAt;
    }).length;
    const slaRate = slaIssues.length ? Math.round((slaMet / slaIssues.length) * 100) : 100;
    const reopenPenalty = bugIssues.length ? Math.round((reopenedBugs / bugIssues.length) * 100) : 0;
    const score = clampScore(
      taskCompletionRate * 0.42 + bugFixRate * 0.32 + slaRate * 0.2 + Math.max(0, 100 - reopenPenalty) * 0.06
    );

    return {
      score,
      items: [
        { label: "Task Done", value: `${taskCompletionRate}%` },
        { label: "Bug Fix", value: `${bugFixRate}%` },
        { label: "SLA", value: `${slaRate}%` },
      ],
    };
  }, [bugIssues, taskIssues, workflowIssues]);
  const stats = useMemo(() => getIssueStatusMetrics(workflowIssues), [workflowIssues]);
  const normalizedFilters = useMemo(
    () => ({
      ...filters,
      search: deferredSearch,
    }),
    [deferredSearch, filters]
  );
  const activeIssues = activeTab === "bugs" ? bugIssues : taskIssues;
  const visibleIssues = useMemo(
    () => sortIssues(filterIssues(activeIssues, normalizedFilters), normalizedFilters.sortBy),
    [activeIssues, normalizedFilters]
  );
  const recentlyUpdatedIssues = useMemo(
    () =>
      [...workflowIssues]
        .sort(
          (left, right) =>
            new Date(getLastUpdated(right) || 0) - new Date(getLastUpdated(left) || 0)
        )
        .slice(0, 8),
    [workflowIssues]
  );
  const statCards = useMemo(
    () => [
      {
        label: "Total",
        value: stats.total,
        helper: `${bugIssues.length} bugs - ${taskIssues.length} tasks`,
        Icon: CircleDotDashed,
        className: "bg-blue-500",
      },
      {
        label: "Open",
        value: stats.open,
        helper: "Ready or waiting",
        Icon: AlertTriangle,
        className: "bg-orange-500",
      },
      {
        label: "In Progress",
        value: stats.inProgress,
        helper: "Currently moving",
        Icon: TimerReset,
        className: "bg-violet-500",
      },
      {
        label: "Closed",
        value: stats.closed,
        helper: "Completed work",
        Icon: CheckCircle2,
        className: "bg-emerald-500",
      },
    ],
    [bugIssues.length, stats.closed, stats.inProgress, stats.open, stats.total, taskIssues.length]
  );
  const activeStatusLabel = activeTab === "bugs" ? "Bugs / Issues" : "Tasks";
  const error = projectsError || issuesError;
  const isLoading = isProjectsLoading || isIssuesLoading;

  const handleStatusChange = (issue, status) => {
    if (!status || String(issue.status) === String(status)) {
      return;
    }

    if (statusMutation.isPending && statusMutation.variables?.id === issue._id) {
      return;
    }

    statusMutation.mutate({
      id: issue._id,
      status,
    });
  };

  const handleOpenProject = (projectId) => {
    navigate(`/issues?projectId=${projectId}`);
  };

  const handleOpenActivityIssue = (issueId) => {
    const issue = allIssues.find((item) => item._id === issueId);

    if (issue) {
      setSelectedIssue(issue);
    }
  };

  const handleOpenNotification = async (notification) => {
    if (!notification.isRead) {
      try {
        await markNotificationAsRead(notification.id);
        queryClient.invalidateQueries({
          queryKey: ["issues", "notifications", user?._id],
        });
        queryClient.invalidateQueries({
          queryKey: ["issues", "notifications", "unread-count", user?._id],
        });
      } catch (error) {
        console.error("Failed to mark notification as read:", error);
      }
    }

    if (notification.link) {
      navigate(notification.link);
    }
  };

  if (error) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-rose-700">
          {error.response?.data?.message || "Unable to load developer dashboard data."}
        </CardContent>
      </Card>
    );
  }

  if (!isProjectsLoading && !projects.length) {
    return (
      <EmptyState
        title="No assigned projects yet"
        description="Once an admin adds you to a project, your delivery dashboard will appear here."
      />
    );
  }

  return (
    <div className="page-wrapper space-y-5">
      <section className="flex flex-wrap items-center gap-3 rounded-[26px] border border-white/70 bg-white/78 p-3 shadow-sm backdrop-blur-xl">
        <Button
          className="h-11 rounded-2xl"
          type="button"
          variant="outline"
          onClick={() => navigate("/tasks")}
        >
          <ClipboardList className="h-4 w-4" />
          View Tasks
        </Button>
        <Button
          className="h-11 rounded-2xl"
          type="button"
          variant="outline"
          onClick={() => navigate("/reports")}
        >
          <BarChart3 className="h-4 w-4" />
          Reports
        </Button>
        <Button
          className="h-11 rounded-2xl bg-[linear-gradient(90deg,#E11D48_0%,#F97316_55%,#EAB308_100%)] text-white shadow-[0_14px_28px_-18px_rgba(225,29,72,0.8)] hover:brightness-105"
          type="button"
          onClick={() => setIsPriorityOpen(true)}
        >
          <Flame className="h-4 w-4" />
          Priority Queue
        </Button>
        <RoleRatingCard metrics={performanceRating} title="Developer Rating" />
        <SprintProgressWidget metrics={sprintProgress} isLoading={isSprintProgressLoading} />
      </section>

      <BugBucketPanel
        issues={bucketIssues}
        isLoading={isBucketLoading}
        pickingId={pickMutation.isPending ? pickMutation.variables?._id : ""}
        onOpenIssue={setSelectedIssue}
        onPickIssue={(issue) => pickMutation.mutate(issue)}
        onViewAllBugs={() => navigate("/dev/bugs?status=available")}
      />

      <section className="space-y-5">
          <section className="flex snap-x gap-3 overflow-x-auto pb-2 md:grid md:grid-cols-2 md:gap-4 md:overflow-visible md:pb-0 xl:grid-cols-4 [&>*]:min-w-[220px] [&>*]:snap-start md:[&>*]:min-w-0">
            {isLoading
              ? Array.from({ length: 4 }, (_, index) => (
                  <Skeleton
                    key={`developer-stat-${index}`}
                    className="h-[132px] w-full rounded-[24px]"
                  />
                ))
              : statCards.map((card) => <StatCard key={card.label} {...card} />)}
          </section>

          <Card className="overflow-hidden border-white/70 bg-white/90 shadow-[0_22px_64px_-42px_rgba(15,23,42,0.42)] backdrop-blur-xl">
            <CardHeader className="border-b border-slate-200/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(239,246,255,0.9),rgba(240,253,250,0.78))]">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <CardTitle className="text-xl tracking-tight text-slate-950">
                    Work Overview
                  </CardTitle>
                  <CardDescription>
                    {visibleIssues.length} {activeStatusLabel.toLowerCase()} in the current view
                  </CardDescription>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="grid grid-cols-2 gap-1 rounded-[22px] border border-white/80 bg-slate-100/80 p-1 shadow-inner sm:w-auto">
                    {TABS.map(({ id, label, Icon }) => {
                      const active = activeTab === id;

                      return (
                        <button
                          key={id}
                          className={cn(
                            "inline-flex h-11 items-center justify-center gap-2 rounded-[18px] px-4 text-sm font-semibold transition-all duration-300",
                            active
                              ? "bg-[linear-gradient(90deg,#2563EB_0%,#7C3AED_55%,#0891B2_100%)] text-white shadow-[0_14px_28px_-18px_rgba(37,99,235,0.8)]"
                              : "text-slate-600 hover:bg-white/80 hover:text-slate-950"
                          )}
                          type="button"
                          onClick={() => {
                            setActiveTab(id);
                            setFilters((current) => ({
                              ...current,
                              status: "all",
                            }));
                          }}
                        >
                          <Icon className="h-4 w-4" />
                          {label}
                        </button>
                      );
                    })}
                  </div>
                  <label className="relative">
                    <span className="sr-only">Project</span>
                    <select
                      className="field-select h-11 min-w-[180px] rounded-2xl border-white/80 bg-white/92 text-sm shadow-sm"
                      value={filters.projectId}
                      onChange={(event) =>
                        setFilters((current) => ({
                          ...current,
                          projectId: event.target.value,
                        }))
                      }
                    >
                      <option value="all">All Projects</option>
                      {projects.map((project) => (
                        <option key={project._id} value={project._id}>
                          {project.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Button
                    className="h-11 w-11 rounded-2xl p-0"
                    disabled={isIssuesFetching}
                    type="button"
                    variant="outline"
                    onClick={() => {
                      refetchIssues();
                      refetchBucket();
                    }}
                  >
                    <RefreshCcw className={cn("h-4 w-4", isIssuesFetching && "animate-spin")} />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 p-4 sm:p-5">
              <div className="grid gap-3 lg:grid-cols-[minmax(240px,1.3fr)_repeat(3,minmax(140px,0.8fr))]">
                <label className="space-y-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Search
                  </span>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      className="h-11 rounded-2xl border-slate-200 bg-white/92 pl-10 shadow-sm"
                      placeholder={`Search ${activeStatusLabel.toLowerCase()}`}
                      value={filters.search}
                      onChange={(event) =>
                        setFilters((current) => ({
                          ...current,
                          search: event.target.value,
                        }))
                      }
                    />
                  </div>
                </label>

                <label className="space-y-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Status
                  </span>
                  <select
                    className="field-select rounded-2xl"
                    value={filters.status}
                    onChange={(event) =>
                      setFilters((current) => ({
                        ...current,
                        status: event.target.value,
                      }))
                    }
                  >
                    {[
                      ...(activeTab === "bugs"
                        ? [{ value: "all", label: "All" }, ...BUG_STATUS_OPTIONS]
                        : ISSUE_STATUS_OPTIONS),
                    ].map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Priority
                  </span>
                  <select
                    className="field-select rounded-2xl"
                    value={filters.priority}
                    onChange={(event) =>
                      setFilters((current) => ({
                        ...current,
                        priority: event.target.value,
                      }))
                    }
                  >
                    <option value="all">All priorities</option>
                    <option value="Critical">Critical</option>
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </label>

                <label className="space-y-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Sort
                  </span>
                  <div className="relative">
                    <ArrowUpDown className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <select
                      className="field-select rounded-2xl pl-10"
                      value={filters.sortBy}
                      onChange={(event) =>
                        setFilters((current) => ({
                          ...current,
                          sortBy: event.target.value,
                        }))
                      }
                    >
                      {ISSUE_SORT_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </label>
              </div>

              {statusError ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {statusError}
                </div>
              ) : null}

              {isLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-12 w-full rounded-2xl" />
                  <Skeleton className="h-64 w-full rounded-[24px]" />
                </div>
              ) : (
                <WorkTable
                  issues={visibleIssues}
                  type={activeTab}
                  updatingId={statusMutation.isPending ? statusMutation.variables?.id : ""}
                  onOpenIssue={setSelectedIssue}
                  onStatusChange={handleStatusChange}
                />
              )}
            </CardContent>
          </Card>

          <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            <ProjectPanel
              projects={projects}
              issues={workflowIssues}
              onOpenProject={handleOpenProject}
            />

            <Card className="h-full border-white/70 bg-white/88 shadow-[0_18px_48px_-36px_rgba(15,23,42,0.36)] backdrop-blur-xl">
              <CardHeader className="border-b border-slate-200/80">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Activity className="h-4 w-4 text-blue-600" />
                  Activity Timeline
                </CardTitle>
              </CardHeader>
              <CardContent className="max-h-[320px] overflow-y-auto p-4">
                {isActivityLoading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-16 w-full rounded-2xl" />
                    <Skeleton className="h-16 w-full rounded-2xl" />
                    <Skeleton className="h-16 w-full rounded-2xl" />
                  </div>
                ) : (
                  <ActivityList
                    activity={activity}
                    fallbackIssues={recentlyUpdatedIssues}
                    onOpenIssue={handleOpenActivityIssue}
                  />
                )}
              </CardContent>
            </Card>

            <Card className="h-full border-white/70 bg-white/88 shadow-[0_18px_48px_-36px_rgba(15,23,42,0.36)] backdrop-blur-xl md:col-span-2 xl:col-span-1">
              <CardHeader className="border-b border-slate-200/80">
                <CardTitle className="flex items-center gap-2 text-base">
                  <CalendarClock className="h-4 w-4 text-cyan-600" />
                  Recently Updated Issues
                </CardTitle>
              </CardHeader>
              <CardContent className="max-h-[320px] space-y-3 overflow-y-auto p-4">
                {recentlyUpdatedIssues.length ? (
                  recentlyUpdatedIssues.map((issue) => (
                    <button
                      key={issue._id}
                      className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white/76 px-3 py-2.5 text-left shadow-sm transition hover:border-blue-200 hover:bg-white"
                      type="button"
                      onClick={() => setSelectedIssue(issue)}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-950">
                          {issue.title}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {getIssueDisplayKey(issue)} - {formatDateTime(getLastUpdated(issue))}
                        </p>
                      </div>
                      <Pill className={getBadgeClass(statusStyleMap, issue.status)}>
                        {getStatusLabel(issue)}
                      </Pill>
                    </button>
                  ))
                ) : (
                  <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                    No recently updated issues yet.
                  </p>
                )}
              </CardContent>
            </Card>
          </section>
      </section>

      <BugStatusAnalytics issues={bugIssues} />

      <Dialog open={isPriorityOpen} onOpenChange={setIsPriorityOpen}>
        <DialogContent className="max-w-6xl border-white/70 bg-white/95 p-5 shadow-[0_30px_90px_-48px_rgba(15,23,42,0.5)] backdrop-blur-xl sm:p-6">
          <DialogHeader className="pr-10">
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Flame className="h-5 w-5 text-rose-600" />
              Priority Queue
            </DialogTitle>
          </DialogHeader>
          <PriorityQueue
            issues={workflowIssues}
            updatingId={statusMutation.isPending ? statusMutation.variables?.id : ""}
            onClose={() => setIsPriorityOpen(false)}
            onOpenIssue={setSelectedIssue}
            onStatusChange={handleStatusChange}
          />
        </DialogContent>
      </Dialog>

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
          statusMutation.mutateAsync({
            id,
            status: payload.status,
            payload,
          })
        }
        open={Boolean(selectedIssue)}
        projects={projects}
        updatingId={statusMutation.isPending ? statusMutation.variables?.id : ""}
        canEditPriority={false}
        canEditAssignee={false}
        canDeleteIssue={false}
      />
    </div>
  );
};

export default DeveloperDashboardPage;
