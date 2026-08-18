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
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  CircleDotDashed,
  ClipboardList,
  Flame,
  FolderKanban,
  GitBranch,
  ListTodo,
  PauseCircle,
  RefreshCcw,
  Search,
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
import { motion, AnimatePresence } from "framer-motion";
import {
  fetchIssueActivity,
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
  isIssueOverdue,
  normalizeBugStatusForIssue,
  resolveBugDetails,
  resolveIssueAssigneeIds,
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
import GreetingBeachScene from "@/components/dashboard/GreetingBeachScene";
import AiCodeReviewPanel from "@/components/ai/AiCodeReviewPanel";
import { getLatestGitActivity, normalizeDeliveryModules } from "@/lib/delivery-workflow";
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
  { id: "bugs", label: "Bugs", Icon: Bug },
  { id: "stories", label: "Stories", Icon: FolderKanban },
  { id: "all", label: "All", Icon: CircleDotDashed },
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

const WORK_QUEUE_PAGE_SIZE = 10;

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

const hasAssignedDeveloper = (issue) =>
  Boolean(
    issue?.assignee ||
      issue?.assignedDeveloperId ||
      resolveBugDetails(issue)?.developerLead
  );

const getDeveloperVisibleBugStatus = (issue) => {
  const status = normalizeBugStatusForIssue(issue);

  if (
    hasAssignedDeveloper(issue) &&
    [ISSUE_STATUS.NEW, ISSUE_STATUS.OPEN, ISSUE_STATUS.TRIAGED].includes(status)
  ) {
    return ISSUE_STATUS.ASSIGNED;
  }

  return status;
};

const getDisplayStatus = (issue) =>
  isBugIssue(issue) ? getDeveloperVisibleBugStatus(issue) : issue?.status;

const taskStatusOptions = [
  { value: ISSUE_STATUS.TODO, label: "To Do" },
  { value: ISSUE_STATUS.IN_PROGRESS, label: "In Progress" },
  { value: ISSUE_STATUS.DONE, label: "Done" },
];

const inactiveOverviewStatuses = new Set([
  ISSUE_STATUS.DONE,
  ISSUE_STATUS.CLOSED,
  ISSUE_STATUS.RESOLVED,
  ISSUE_STATUS.REJECTED,
  ISSUE_STATUS.DEFERRED,
]);

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
    ? bugWorkflowLabels[getDeveloperVisibleBugStatus(issue)] ||
      getIssueStatusLabel(getDeveloperVisibleBugStatus(issue))
    : getIssueStatusLabel(issue.status);

const isTaskWorkItem = (issue) => ["Task", "Sub-task"].includes(issue?.type);

const isWorkOverviewActiveIssue = (issue) => {
  const status = isBugIssue(issue) ? normalizeBugStatusForIssue(issue) : issue?.status;

  return !inactiveOverviewStatuses.has(
    String(status || "")
      .trim()
      .toUpperCase()
      .replace(/[\s-]+/g, "_")
  );
};

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
  const currentStatus = getDeveloperVisibleBugStatus(issue);
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

const getActivitySummary = (entry) => {
  const issue = entry?.issue;
  const key = issue ? getIssueDisplayKey(issue) : "";
  const status = issue ? getStatusLabel(issue) : "";

  if (entry?.eventType === "BUG_STATUS_CHANGED") {
    return {
      title: `${entry.actor?.name || "You"} moved ${key || "a bug"} to ${status || "a new status"}`,
      detail: issue?.title || entry.meta?.title || "Bug status changed",
    };
  }

  if (entry?.eventType === "ISSUE_CREATED") {
    return {
      title: `${entry.actor?.name || "You"} created ${key || "a work item"}`,
      detail: issue?.title || entry.meta?.title || "New work item",
    };
  }

  if (entry?.eventType === "COMMENT_CREATED") {
    return {
      title: `${entry.actor?.name || "You"} commented on ${key || "a work item"}`,
      detail: issue?.title || entry.meta?.title || "New comment",
    };
  }

  return {
    title: `${entry.actor?.name || "You"} updated ${key || "a work item"}`,
    detail: issue?.title || entry.meta?.title || "Work item updated",
  };
};


const SprintProgressWidget = ({ metrics, isLoading }) => {
  const percentage = metrics?.percentage || 0;

  return (
    <div
      className="group flex h-16 min-w-0 w-full flex-1 flex-col justify-center rounded-[22px] border border-cyan-100/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.86),rgba(239,246,255,0.78),rgba(236,254,255,0.68))] px-4 py-2 shadow-[0_16px_34px_-26px_rgba(14,165,233,0.78)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 hover:border-cyan-200 hover:shadow-[0_18px_38px_-24px_rgba(14,165,233,0.9)] sm:min-w-[240px] sm:max-w-[340px]"
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

const shortSha = (value) => String(value || "").slice(0, 7) || "-";
const formatCompactDuration = (value) => {
  const ms = Number(value) || 0;

  if (ms <= 0) {
    return "-";
  }

  const hours = Math.floor(ms / 3600000);
  const minutes = Math.round((ms % 3600000) / 60000);

  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
};
const getQaHandoffStatus = (issues = []) => {
  if (issues.some((issue) => [ISSUE_STATUS.REOPEN, ISSUE_STATUS.REJECTED, ISSUE_STATUS.BLOCKED].includes(getDisplayStatus(issue)))) {
    return "QA Rework";
  }

  if (issues.some((issue) => [ISSUE_STATUS.READY_FOR_QA, ISSUE_STATUS.QA, ISSUE_STATUS.FIXED, ISSUE_STATUS.TESTING].includes(getDisplayStatus(issue)))) {
    return "Waiting for QA";
  }

  if (issues.length && issues.every(isIssueClosed)) {
    return "QA Passed";
  }

  return "In Development";
};
const getQaStatusTone = (status) => {
  if (status === "QA Rework") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "QA Passed") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "Waiting for QA") return "border-cyan-200 bg-cyan-50 text-cyan-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
};

const DeveloperLatestPushCard = ({ project }) => {
  const activity = getLatestGitActivity(project);
  const filesChanged = activity.filesChanged.length || Number(activity.filesChangedCount || 0);
  const modules = activity.modulesChanged.length
    ? activity.modulesChanged
    : normalizeDeliveryModules(project).slice(0, 3);
  const qaStatus = activity.qaStatus || "Waiting for QA";

  return (
    <Card className="rounded-2xl border-blue-100/80 bg-white/90 shadow-[0_18px_46px_-36px_rgba(37,99,235,0.45)]">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-blue-600">Latest Push</p>
            <h3 className="mt-1 truncate text-base font-semibold text-slate-950">{activity.projectName}</h3>
          </div>
          <Pill className={getQaStatusTone(qaStatus)}>{qaStatus}</Pill>
        </div>
        <div className="mt-4 space-y-3">
          <div>
            <p className="truncate text-sm font-semibold text-slate-950">{activity.pushedByName}</p>
            <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-slate-600">
              <GitBranch className="h-3.5 w-3.5 text-blue-500" />
              {activity.branch} · {shortSha(activity.commitSha)}
            </p>
          </div>
          <div className="rounded-xl bg-blue-50/70 px-3 py-2">
            <p className="text-xs font-bold uppercase tracking-[0.1em] text-blue-700">Commit Message</p>
            <p className="mt-1 line-clamp-2 text-sm font-semibold text-slate-950">{activity.commitMessage}</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-xl bg-slate-50 px-3 py-2">
              <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500">Files</p>
              <p className="mt-1 text-sm font-semibold text-slate-950">{filesChanged} changed</p>
            </div>
            <div className="rounded-xl bg-slate-50 px-3 py-2">
              <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500">Push Time</p>
              <p className="mt-1 text-sm font-semibold text-slate-950">{activity.pushedAt ? formatDateTime(activity.pushedAt) : "-"}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(modules.length ? modules : ["No module changes detected"]).map((module) => (
              <span className="rounded-full border border-cyan-100 bg-cyan-50 px-2.5 py-1 text-xs font-semibold text-cyan-700" key={module}>
                {module}
              </span>
            ))}
          </div>
          <p className="truncate text-xs font-medium text-slate-400">{activity.repository}</p>
        </div>
      </CardContent>
    </Card>
  );
};

const DeveloperAiCodeReviewCard = ({ isLoading, project }) => {
  const activity = getLatestGitActivity(project);
  const hasCommit = Boolean(activity.commitSha);

  return (
    <Card className="relative overflow-hidden rounded-2xl border-blue-100/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(239,246,255,0.88)_45%,rgba(236,253,245,0.68))] shadow-[0_26px_70px_-42px_rgba(37,99,235,0.68)]">
      <motion.div
        aria-hidden="true"
        animate={{ x: ["-18%", "18%", "-18%"], opacity: [0.35, 0.7, 0.35] }}
        className="pointer-events-none absolute left-8 top-0 h-px w-2/3 bg-gradient-to-r from-transparent via-cyan-300 to-transparent"
        transition={{ duration: 5, ease: "easeInOut", repeat: Infinity }}
      />
      <CardContent className="relative flex h-full flex-col p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-blue-600">AI Code Review</p>
            {isLoading ? (
              <div className="mt-2 space-y-2">
                <Skeleton className="h-5 w-44 rounded-full" />
                <Skeleton className="h-4 w-28 rounded-full" />
              </div>
            ) : (
              <>
                <h3 className="mt-1 truncate text-base font-semibold text-slate-950">
                  {hasCommit ? activity.projectName : "No commit selected"}
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  {hasCommit ? `${activity.branch} - ${shortSha(activity.commitSha)}` : "Latest push review appears here."}
                </p>
              </>
            )}
          </div>
          <motion.span
            animate={{ y: [0, -3, 0] }}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-white/80 bg-white/85 text-blue-600 shadow-[0_12px_30px_-22px_rgba(37,99,235,0.75)]"
            transition={{ duration: 2.4, ease: "easeInOut", repeat: Infinity }}
          >
            <Sparkles className="h-5 w-5" aria-hidden="true" />
          </motion.span>
        </div>

        {isLoading ? (
          <div className="mt-4 space-y-3">
            <Skeleton className="h-8 w-36 rounded-full" />
            <Skeleton className="h-9 w-full rounded-xl" />
          </div>
        ) : (
          <AiCodeReviewPanel
            activity={activity}
            className="mt-4"
            dashboard
            project={project}
            showTitle={false}
            surface={false}
          />
        )}
      </CardContent>
    </Card>
  );
};

const QaFeedbackCard = ({ latestProject, issues = [], onViewFeedback }) => {
  const latestActivity = getLatestGitActivity(latestProject);
  const projectId = getProjectId(latestProject);
  const projectIssues = issues.filter((issue) => resolveIssueProjectId(issue) === projectId);
  const qaReturned = projectIssues.filter((issue) => [ISSUE_STATUS.REOPEN, ISSUE_STATUS.REJECTED, ISSUE_STATUS.BLOCKED].includes(getDisplayStatus(issue)));
  const qaWaiting = projectIssues.filter((issue) => [ISSUE_STATUS.READY_FOR_QA, ISSUE_STATUS.QA, ISSUE_STATUS.FIXED, ISSUE_STATUS.TESTING].includes(getDisplayStatus(issue)));
  const qaPassed = projectIssues.filter((issue) => isIssueClosed(issue));
  const highSeverity = qaReturned.filter(isCriticalIssue).length;
  const status = qaReturned.length ? "QA Rework" : qaWaiting.length ? "Waiting for QA" : qaPassed.length ? "QA Passed" : "In Development";

  return (
    <Card className="rounded-2xl border-amber-100/80 bg-white/90 shadow-[0_18px_46px_-36px_rgba(245,158,11,0.38)]">
      <CardHeader className="border-b border-slate-200/80 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">QA Feedback</CardTitle>
            <CardDescription>Latest build result and tester follow-up.</CardDescription>
          </div>
          <Pill className={getQaStatusTone(status)}>{status}</Pill>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 p-4 md:grid-cols-[1fr_auto] md:items-center">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-950">
            Latest build {shortSha(latestActivity.commitSha)} · {latestActivity.branch}
          </p>
          <p className="mt-1 text-sm text-slate-600">
            {qaWaiting.length} waiting for QA · {qaPassed.length} passed · {qaReturned.length} returned
          </p>
          <p className="mt-1 text-xs font-semibold text-amber-700">
            {qaReturned.length ? `${qaReturned.length} issue${qaReturned.length === 1 ? "" : "s"} need rework${highSeverity ? ` · ${highSeverity} high severity` : ""}` : "No QA rework currently blocking this build."}
          </p>
        </div>
        <Button className="h-9 rounded-xl" type="button" variant="outline" onClick={onViewFeedback}>
          View QA Feedback
        </Button>
      </CardContent>
    </Card>
  );
};

const DevelopmentHealthPanel = ({ bugIssues = [], taskIssues = [], projects = [] }) => {
  const commits = projects.filter((project) => project.latestGitActivity?.commitSha).length;
  const completedTasks = taskIssues.filter(isIssueClosed).length;
  const qaReturned = bugIssues.filter((issue) => [ISSUE_STATUS.REOPEN, ISSUE_STATUS.REJECTED, ISSUE_STATUS.BLOCKED].includes(getDisplayStatus(issue))).length;
  const qaPassed = bugIssues.filter(isIssueClosed).length;
  const qaTested = qaPassed + qaReturned;
  const readyForQa = bugIssues.filter((issue) => [ISSUE_STATUS.READY_FOR_QA, ISSUE_STATUS.QA, ISSUE_STATUS.FIXED, ISSUE_STATUS.TESTING].includes(getDisplayStatus(issue))).length;

  return (
    <Card className="rounded-2xl border-emerald-100/80 bg-white/90 shadow-[0_18px_46px_-36px_rgba(16,185,129,0.35)]">
      <CardHeader className="border-b border-slate-200/80 pb-3">
        <CardTitle className="text-base">Development Health</CardTitle>
        <CardDescription>Small delivery loop snapshot for your current work.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 p-4">
        <div className="grid gap-2 sm:grid-cols-4">
          <MiniHealthStat label="Commits" value={commits} helper="latest pushes" />
          <MiniHealthStat label="Tasks" value={`${completedTasks}/${taskIssues.length}`} helper="completed" />
          <MiniHealthStat label="QA Pass Rate" value={`${qaTested ? Math.round((qaPassed / qaTested) * 100) : 0}%`} helper="tested bugs" />
          <MiniHealthStat label="Bug Reopen" value={`${bugIssues.length ? Math.round((qaReturned / bugIssues.length) * 100) : 0}%`} helper="current rework" />
        </div>
        <div className="grid gap-2 text-sm sm:grid-cols-5">
          {[
            ["Commits", commits],
            ["Builds", commits],
            ["QA Tested", qaTested + readyForQa],
            ["Passed", qaPassed],
            ["Returned", qaReturned],
          ].map(([label, value]) => (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-center" key={label}>
              <p className="text-lg font-semibold text-slate-950">{value}</p>
              <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500">{label}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

const MiniHealthStat = ({ label, value, helper }) => (
  <div className="rounded-xl bg-slate-50 px-3 py-2">
    <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500">{label}</p>
    <p className="mt-1 text-xl font-semibold text-slate-950">{value}</p>
    <p className="text-xs text-slate-500">{helper}</p>
  </div>
);

const BugStatusAnalytics = ({ issues = [] }) => {
  const statusData = useMemo(() => {
    const total = issues.length;

    return BUG_STATUS_ANALYTICS.map((item) => {
      const value = issues.filter((issue) =>
        item.statuses.includes(getDeveloperVisibleBugStatus(issue))
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

const DeveloperBugHealth = ({ issues = [] }) => {
  const open = issues.filter((issue) => [ISSUE_STATUS.NEW, ISSUE_STATUS.TRIAGED, ISSUE_STATUS.OPEN, ISSUE_STATUS.ASSIGNED].includes(getDisplayStatus(issue))).length;
  const inProgress = issues.filter((issue) => getDisplayStatus(issue) === ISSUE_STATUS.IN_PROGRESS).length;
  const reopened = issues.filter((issue) => getDisplayStatus(issue) === ISSUE_STATUS.REOPEN).length;
  const resolved = issues.filter((issue) => [ISSUE_STATUS.READY_FOR_QA, ISSUE_STATUS.QA, ISSUE_STATUS.FIXED, ISSUE_STATUS.TESTING, ISSUE_STATUS.CLOSED, ISSUE_STATUS.DONE].includes(getDisplayStatus(issue))).length;
  const highSeverity = issues.filter((issue) => !isIssueClosed(issue) && isCriticalIssue(issue)).length;
  const resolutionRate = issues.length ? Math.round((resolved / issues.length) * 100) : 0;
  const resolutionSamples = issues
    .map((issue) => Number(issue.resolutionTimeMs || 0))
    .filter((value) => value > 0);
  const avgResolution = resolutionSamples.length
    ? resolutionSamples.reduce((sum, value) => sum + value, 0) / resolutionSamples.length
    : 0;

  return (
    <Card className="overflow-hidden rounded-2xl border-white/70 bg-white/88 shadow-[0_20px_56px_-36px_rgba(15,23,42,0.38)] backdrop-blur-xl">
      <CardHeader className="border-b border-slate-200/70 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4 text-blue-600" />
              Bug Health
            </CardTitle>
            <CardDescription>Actionable QA and resolution state for assigned bugs.</CardDescription>
          </div>
          <Pill className={highSeverity ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}>
            {highSeverity ? `${highSeverity} high severity` : "Healthy"}
          </Pill>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        {issues.length ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <MiniHealthStat label="Open" value={open} helper="needs action" />
            <MiniHealthStat label="In Progress" value={inProgress} helper="being fixed" />
            <MiniHealthStat label="Reopened" value={reopened} helper="QA rework" />
            <MiniHealthStat label="Resolved" value={resolved} helper="ready/closed" />
            <MiniHealthStat label="Resolution Rate" value={`${resolutionRate}%`} helper={`${resolved}/${issues.length} bugs`} />
            <MiniHealthStat label="Avg Resolution" value={formatCompactDuration(avgResolution)} helper="recorded cycle" />
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
            No assigned bug activity yet.
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
          const waitingQa = projectIssues.filter((issue) =>
            [ISSUE_STATUS.READY_FOR_QA, ISSUE_STATUS.QA, ISSUE_STATUS.FIXED, ISSUE_STATUS.TESTING].includes(getDisplayStatus(issue))
          ).length;
          const latestActivity = getLatestGitActivity(project);
          const qaStatus = getQaHandoffStatus(projectIssues);

          return {
            ...project,
            active,
            completed,
            progress,
            critical,
            waitingQa,
            latestActivity,
            qaStatus,
            total: projectIssues.length,
          };
        })
        .filter((project) => project.total > 0)
        .sort((left, right) => right.active - left.active || right.critical - left.critical),
    [issues, projects]
  );

  return (
    <Card className="h-full min-w-0 border-white/70 bg-white/88 shadow-[0_18px_48px_-36px_rgba(15,23,42,0.36)] backdrop-blur-xl">
      <CardHeader className="border-b border-slate-200/80 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <FolderKanban className="h-4 w-4 text-blue-600" />
          Project Health
        </CardTitle>
      </CardHeader>
      <CardContent className="max-h-[320px] space-y-3 overflow-x-hidden overflow-y-auto p-3">
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
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <Pill className={getQaStatusTone(project.qaStatus)}>{project.qaStatus}</Pill>
                {project.waitingQa ? <span className="font-semibold text-cyan-700">{project.waitingQa} waiting for QA</span> : null}
                {project.latestActivity.commitSha ? (
                  <span className="truncate text-slate-500">
                    {shortSha(project.latestActivity.commitSha)} · {project.latestActivity.branch}
                  </span>
                ) : null}
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
        const summary = getActivitySummary(entry);

        return (
          <button
            key={entry._id}
            className="flex min-w-0 w-full gap-3 rounded-2xl border border-slate-200/80 bg-white/76 p-3 text-left shadow-sm transition hover:border-blue-200 hover:bg-white"
            type="button"
            onClick={() => issue?._id && onOpenIssue(issue._id)}
          >
            <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-700">
              <Activity className="h-3.5 w-3.5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block break-words text-sm font-semibold text-slate-900">
                {summary.title}
              </span>
              <span className="mt-0.5 block truncate text-xs text-slate-500">
                {summary.detail} -{" "}
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
  const [currentPage, setCurrentPage] = useState(1);
  const sortedIssues = useMemo(() => sortAvailableBugQueue(issues), [issues]);
  const pageCount = Math.max(1, Math.ceil(sortedIssues.length / WORK_QUEUE_PAGE_SIZE));
  const activePage = Math.min(currentPage, pageCount);
  const pageStartIndex = (activePage - 1) * WORK_QUEUE_PAGE_SIZE;
  const visibleIssues = sortedIssues.slice(pageStartIndex, pageStartIndex + WORK_QUEUE_PAGE_SIZE);
  const firstVisibleItem = sortedIssues.length ? pageStartIndex + 1 : 0;
  const lastVisibleItem = Math.min(pageStartIndex + visibleIssues.length, sortedIssues.length);

  useEffect(() => {
    setCurrentPage((page) => Math.min(Math.max(page, 1), pageCount));
  }, [pageCount]);

  return (
    <Card className="overflow-hidden border-cyan-100/80 bg-white/94 shadow-[0_18px_46px_-36px_rgba(8,145,178,0.42)] ring-1 ring-cyan-100/70 backdrop-blur-xl">
      <CardHeader className="border-b border-cyan-100/90 bg-[linear-gradient(135deg,rgba(236,254,255,0.98),rgba(239,246,255,0.94),rgba(255,255,255,0.92))] py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.22em] text-cyan-600">
              Primary workflow
            </p>
            <CardTitle className="flex items-center gap-2 text-lg tracking-tight text-slate-950">
              <FolderKanban className="h-5 w-5 text-cyan-600" />
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
      <CardContent className={cn("space-y-4 p-4", !sortedIssues.length && !isLoading && "py-3")}>
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
                {visibleIssues.map((issue) => {
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

            <div className="flex flex-col gap-3 border-t border-cyan-100/80 pt-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs font-medium text-slate-500">
                Showing {firstVisibleItem}-{lastVisibleItem} of {sortedIssues.length} available work items
              </p>
              {pageCount > 1 ? (
                <div className="flex items-center gap-2">
                  <Button
                    aria-label="Previous work queue page"
                    className="h-8 w-8 rounded-xl p-0"
                    type="button"
                    variant="outline"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="min-w-[72px] text-center text-xs font-semibold text-slate-600">
                    {activePage} / {pageCount}
                  </span>
                  <Button
                    aria-label="Next work queue page"
                    className="h-8 w-8 rounded-xl p-0"
                    type="button"
                    variant="outline"
                    disabled={activePage === pageCount}
                    onClick={() => setCurrentPage((page) => Math.min(pageCount, page + 1))}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              ) : null}
            </div>
          </>
        ) : (
          <div className="flex flex-col rounded-2xl border border-dashed border-cyan-100 bg-cyan-50/35 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div>
              <p className="text-sm font-semibold text-slate-950">0 available</p>
              <p className="mt-1 text-sm text-slate-500">
                No unassigned bugs or stories currently waiting for developer ownership.
              </p>
            </div>
            <Button
              className="mt-3 h-9 rounded-xl sm:mt-0"
              type="button"
              variant="outline"
              onClick={onViewAllBugs}
            >
              View Queue
            </Button>
          </div>
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
    const emptyCopyByType = {
      bugs: {
        title: "No active bugs at present",
        description: "Assigned bugs that still need developer action will appear here.",
        icon: <Bug className="h-5 w-5" />,
      },
      stories: {
        title: "No active stories at present",
        description: "Assigned stories that are still moving will appear here.",
        icon: <FolderKanban className="h-5 w-5" />,
      },
      all: {
        title: "No active work at present",
        description: "Tasks, bugs, and stories that still need action will appear here.",
        icon: <CircleDotDashed className="h-5 w-5" />,
      },
      tasks: {
        title: "No active tasks at present",
        description: "Assigned tasks that are not done will appear here.",
        icon: <ListTodo className="h-5 w-5" />,
      },
    };
    const emptyCopy = emptyCopyByType[type] || emptyCopyByType.tasks;

    return (
      <EmptyState
        title={emptyCopy.title}
        description={emptyCopy.description}
        icon={emptyCopy.icon}
      />
    );
  }
  const usesBugColumns = type === "bugs" || type === "all";
  const tableColumns = usesBugColumns ? bugWorkTableColumns : taskWorkTableColumns;
  const tableMinWidth = usesBugColumns ? "min-w-[1646px]" : "min-w-[1474px]";

  return (
    <>
      <div className="hidden">
          {issues.map((issue) => {
            const severity = getBugSeverity(issue);
            const currentBugStatus = isBugIssue(issue) ? getDeveloperVisibleBugStatus(issue) : "";
            const bugOptions = developerBugTransitions[currentBugStatus] || [];
            const nextAction = isBugIssue(issue) ? getNextBugAction(issue) : null;

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
                <Pill className={getBadgeClass(statusStyleMap, getDisplayStatus(issue))}>
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
            <th className="px-3 py-2.5">{usesBugColumns ? "ID" : "ID"}</th>
            <th className="px-3 py-2.5">{usesBugColumns ? "Title" : "Title"}</th>
            <th className="px-3 py-2.5">Priority</th>
            {usesBugColumns ? <th className="px-3 py-2.5">Severity</th> : null}
            <th className="px-3 py-2.5">Status</th>
            <th className="px-3 py-2.5">Team</th>
            <th className="px-3 py-2.5">Assigned</th>
            {usesBugColumns ? <th className="px-3 py-2.5">Reporter</th> : null}
            <th className="px-3 py-2.5">Created</th>
            <th className="px-3 py-2.5">Updated</th>
            <th className="px-3 py-2.5 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200/80">
          {issues.map((issue) => {
            const rowIsBug = isBugIssue(issue);
            const severity = getBugSeverity(issue);
            const currentBugStatus = rowIsBug ? getDeveloperVisibleBugStatus(issue) : "";
            const bugOptions = developerBugTransitions[currentBugStatus] || [];
            const nextAction = rowIsBug ? getNextBugAction(issue) : null;

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
                {usesBugColumns ? (
                  <td className="px-3 py-2 align-middle">
                    {rowIsBug ? (
                      <Pill className={getBadgeClass(severityStyleMap, severity)}>
                        {severity}
                      </Pill>
                    ) : (
                      <span className="text-xs text-slate-400">-</span>
                    )}
                  </td>
                ) : null}
                <td className="px-3 py-2 align-middle">
                  <Pill className={getBadgeClass(statusStyleMap, getDisplayStatus(issue))}>
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
                {usesBugColumns ? (
                  <td className="px-3 py-2 align-middle">
                    {rowIsBug ? (
                      <span className="block truncate text-slate-600" title={getReporterName(issue)}>
                        {getReporterName(issue)}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">-</span>
                    )}
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
                    {rowIsBug ? (
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
  const currentHour = new Date().getHours();
  const greeting = currentHour < 12
    ? "Good morning"
    : currentHour < 17
      ? "Good afternoon"
      : "Good evening";
  const timeOfDay = currentHour < 12 ? "morning" : currentHour < 17 ? "afternoon" : "evening";
  const developerName = String(user?.name || "Developer").trim().split(/\s+/)[0];
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
    () =>
      allIssues
        .filter(isTaskWorkItem)
        .filter((issue) =>
          user?._id ? resolveIssueAssigneeIds(issue).includes(String(user._id)) : true
        ),
    [allIssues, user?._id]
  );
  const storyIssues = useMemo(
    () =>
      allIssues
        .filter((issue) => issue?.type === "Story")
        .filter((issue) =>
          user?._id ? resolveIssueAssigneeIds(issue).includes(String(user._id)) : true
        ),
    [allIssues, user?._id]
  );
  const activeBugIssues = useMemo(
    () => bugIssues.filter(isWorkOverviewActiveIssue),
    [bugIssues]
  );
  const activeTaskIssues = useMemo(
    () => taskIssues.filter(isWorkOverviewActiveIssue),
    [taskIssues]
  );
  const activeStoryIssues = useMemo(
    () => storyIssues.filter(isWorkOverviewActiveIssue),
    [storyIssues]
  );
  const activeWorkOverviewIssues = useMemo(
    () => [...activeBugIssues, ...activeTaskIssues, ...activeStoryIssues],
    [activeBugIssues, activeStoryIssues, activeTaskIssues]
  );
  const workOverviewCounts = useMemo(
    () => ({
      bugs: activeBugIssues.length,
      tasks: activeTaskIssues.length,
      stories: activeStoryIssues.length,
      all: activeBugIssues.length + activeTaskIssues.length + activeStoryIssues.length,
    }),
    [activeBugIssues.length, activeStoryIssues.length, activeTaskIssues.length]
  );
  const preferredWorkOverviewTab = useMemo(
    () => {
      if (!workOverviewCounts.all) {
        return "tasks";
      }

      return [
        { id: "bugs", count: workOverviewCounts.bugs },
        { id: "tasks", count: workOverviewCounts.tasks },
        { id: "stories", count: workOverviewCounts.stories },
      ].sort((left, right) => right.count - left.count)[0]?.id || "tasks";
    },
    [
      workOverviewCounts.all,
      workOverviewCounts.bugs,
      workOverviewCounts.stories,
      workOverviewCounts.tasks,
    ]
  );
  const sprintProgress = useMemo(
    () => {
      const activeSprintTasks = taskIssues.filter(
        (issue) => String(issue?.sprintId?.state || issue?.sprintId?.status || "") === "ACTIVE"
      );
      const total = activeSprintTasks.length;
      const completed = activeSprintTasks.filter(isIssueClosed).length;

      return {
        completed,
        total,
        percentage: total ? Math.round((completed / total) * 100) : 0,
        hasActiveSprint: total > 0,
      };
    },
    [taskIssues]
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
    () => [...bugIssues, ...taskIssues, ...storyIssues],
    [bugIssues, storyIssues, taskIssues]
  );
  const stats = useMemo(() => getIssueStatusMetrics(workflowIssues), [workflowIssues]);
  useEffect(() => {
    setActiveTab(preferredWorkOverviewTab);
  }, [preferredWorkOverviewTab]);
  const normalizedFilters = useMemo(
    () => ({
      ...filters,
      search: deferredSearch,
    }),
    [deferredSearch, filters]
  );
  const activeIssues =
    activeTab === "bugs"
      ? activeBugIssues
      : activeTab === "stories"
        ? activeStoryIssues
        : activeTab === "all"
          ? activeWorkOverviewIssues
          : activeTaskIssues;
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
  const waitingForQaCount = useMemo(
    () =>
      workflowIssues.filter((issue) =>
        [ISSUE_STATUS.READY_FOR_QA, ISSUE_STATUS.QA, ISSUE_STATUS.FIXED, ISSUE_STATUS.TESTING].includes(getDisplayStatus(issue))
      ).length,
    [workflowIssues]
  );
  const qaReworkCount = useMemo(
    () =>
      workflowIssues.filter((issue) =>
        [ISSUE_STATUS.REOPEN, ISSUE_STATUS.REJECTED, ISSUE_STATUS.BLOCKED].includes(getDisplayStatus(issue))
      ).length,
    [workflowIssues]
  );
  const statCards = useMemo(
    () => [
      {
        label: "Open Work",
        value: stats.open,
        helper: "Needs developer action",
        Icon: CircleDotDashed,
        className: "bg-blue-500",
      },
      {
        label: "In Progress",
        value: stats.inProgress,
        helper: "Currently moving",
        Icon: TimerReset,
        className: "bg-violet-500",
      },
      {
        label: "Waiting for QA",
        value: waitingForQaCount,
        helper: "Submitted for testing",
        Icon: CheckCircle2,
        className: "bg-cyan-500",
      },
      {
        label: "QA Rework",
        value: qaReworkCount,
        helper: "Returned by QA",
        Icon: RefreshCcw,
        className: "bg-amber-500",
      },
      {
        label: "Open Bugs",
        value: bugIssues.length,
        helper: "Assigned active bugs",
        Icon: Bug,
        className: "bg-rose-500",
      },
      {
        label: "Completed",
        value: stats.closed,
        helper: "Closed work items",
        Icon: CheckCircle2,
        className: "bg-emerald-500",
      },
    ],
    [
      bugIssues.length,
      qaReworkCount,
      stats.closed,
      stats.inProgress,
      stats.open,
      waitingForQaCount,
    ]
  );
  const latestDeliveryProject = useMemo(
    () =>
      [...projects].sort(
        (left, right) =>
          new Date(right.latestGitActivity?.pushedAt || right.updatedAt || right.createdAt || 0) -
          new Date(left.latestGitActivity?.pushedAt || left.updatedAt || left.createdAt || 0)
      )[0] || projects[0],
    [projects]
  );
  const needAttentionCount = qaReworkCount + workflowIssues.filter(isCriticalIssue).length + workflowIssues.filter(isIssueOverdue).length;
  const developmentWorkStats = useMemo(
    () => [
      { label: "Active Projects", value: projects.length, tone: "bg-blue-50 text-blue-700" },
      { label: "Open Tasks", value: taskIssues.filter((issue) => !isIssueClosed(issue)).length, tone: "bg-slate-100 text-slate-700" },
      { label: "Open Bugs", value: bugIssues.length, tone: "bg-rose-50 text-rose-700" },
      {
        label: "Waiting for QA",
        value: waitingForQaCount,
        tone: "bg-cyan-50 text-cyan-700",
      },
      {
        label: "QA Rework",
        value: qaReworkCount,
        tone: "bg-amber-50 text-amber-700",
      },
    ],
    [bugIssues.length, projects.length, qaReworkCount, taskIssues, waitingForQaCount]
  );
  const activeStatusLabel =
    activeTab === "bugs"
      ? "Bugs"
      : activeTab === "stories"
        ? "Stories"
        : activeTab === "all"
          ? "Work Items"
          : "Tasks";
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
    <div className="page-wrapper min-w-0 space-y-5 overflow-x-hidden">
      <section className="relative isolate flex flex-wrap items-center gap-3 overflow-hidden rounded-[26px] border border-blue-100/80 bg-white p-3 shadow-[0_24px_65px_-42px_rgba(37,99,235,0.65)] sm:p-4">
        <GreetingBeachScene timeOfDay={timeOfDay} />
        <div className="relative z-10 min-w-0 w-full flex-1 px-3 py-1 [text-shadow:0_1px_12px_rgba(255,255,255,0.9)] sm:min-w-[240px] sm:w-auto">
          <p className="text-lg font-semibold tracking-tight text-slate-950 sm:text-xl">
            {greeting},{" "}
            <span className="inline-flex rounded-lg bg-gradient-to-r from-blue-600 to-cyan-500 px-2.5 py-0.5 text-white shadow-[0_8px_20px_-10px_rgba(37,99,235,0.9)]">
              {developerName}
            </span>
          </p>
          <p className="mt-1 inline-flex max-w-full rounded-lg bg-white/80 px-2 py-1 text-xs font-semibold text-slate-900 shadow-sm backdrop-blur-sm sm:text-sm">
            Welcome back. Here’s what’s happening with your work today.
          </p>
        </div>
        <div className="relative z-10 flex w-full flex-wrap items-center justify-start gap-2 sm:ml-auto sm:w-auto sm:justify-end sm:gap-3">
          <Button
            className="h-9 flex-1 rounded-xl px-2 text-xs sm:h-11 sm:flex-none sm:rounded-2xl sm:px-4 sm:text-sm"
            type="button"
            variant="outline"
            onClick={() => navigate("/tasks")}
          >
            <ClipboardList className="h-4 w-4" />
            View Tasks
          </Button>
          <Button
            className="h-9 flex-1 rounded-xl px-2 text-xs sm:h-11 sm:flex-none sm:rounded-2xl sm:px-4 sm:text-sm"
            type="button"
            variant="outline"
            onClick={() => navigate("/reports")}
          >
            <BarChart3 className="h-4 w-4" />
            Reports
          </Button>
          <Button
            className="h-9 flex-1 rounded-xl bg-[linear-gradient(90deg,#E11D48_0%,#F97316_55%,#EAB308_100%)] px-2 text-xs text-white shadow-[0_14px_28px_-18px_rgba(225,29,72,0.8)] hover:brightness-105 sm:h-11 sm:flex-none sm:rounded-2xl sm:px-4 sm:text-sm"
            type="button"
            onClick={() => setIsPriorityOpen(true)}
          >
            <Flame className="h-4 w-4" />
            {needAttentionCount} Need Attention
          </Button>
        </div>
        <div className="relative z-10 w-full sm:w-auto">
          <SprintProgressWidget metrics={sprintProgress} isLoading={isIssuesLoading} />
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <Card className="rounded-2xl border-blue-100/80 bg-white/90 shadow-[0_18px_46px_-36px_rgba(37,99,235,0.45)]">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-blue-600">My Development Work</p>
                <h2 className="mt-1 text-lg font-semibold text-slate-950">Delivery queue</h2>
                <p className="mt-1 text-sm text-slate-600">Assigned work, repository readiness, and QA handoff signals.</p>
              </div>
              <Button className="h-9 rounded-xl" variant="outline" onClick={() => navigate("/tasks")} type="button">
                <ClipboardList className="h-4 w-4" />
                Tasks
              </Button>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {developmentWorkStats.map((item) => (
                <div className={cn("rounded-xl px-3 py-2", item.tone)} key={item.label}>
                  <p className="text-[10px] font-bold uppercase tracking-[0.1em]">{item.label}</p>
                  <p className="mt-1 text-2xl font-semibold text-slate-950">{item.value}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <DeveloperLatestPushCard project={latestDeliveryProject} />
        <DeveloperAiCodeReviewCard isLoading={isProjectsLoading} project={latestDeliveryProject} />
      </section>

      <QaFeedbackCard
        latestProject={latestDeliveryProject}
        issues={workflowIssues}
        onViewFeedback={() => navigate("/dev/bugs?status=reopened")}
      />

      <BugBucketPanel
        issues={bucketIssues}
        isLoading={isBucketLoading}
        pickingId={pickMutation.isPending ? pickMutation.variables?._id : ""}
        onOpenIssue={setSelectedIssue}
        onPickIssue={(issue) => pickMutation.mutate(issue)}
        onViewAllBugs={() => navigate("/dev/bugs?status=available")}
      />

      <DevelopmentHealthPanel
        bugIssues={bugIssues}
        projects={projects}
        taskIssues={taskIssues}
      />

      <section className="space-y-5">
          <section className="grid grid-flow-col auto-cols-[minmax(220px,1fr)] gap-3 overflow-x-auto pb-2 md:[grid-template-columns:repeat(6,minmax(0,1fr))] md:gap-4 md:overflow-visible md:pb-0 md:[&>*]:min-w-0 [&>*]:snap-start">
            {isLoading
              ? Array.from({ length: 6 }, (_, index) => (
                  <Skeleton
                    key={`developer-stat-${index}`}
                    className="h-[132px] w-full rounded-[24px]"
                  />
                ))
              : statCards.map((card) => <StatCard key={card.label} {...card} />)}
          </section>

          <Card className="min-w-0 overflow-hidden border-white/70 bg-white/90 shadow-[0_22px_64px_-42px_rgba(15,23,42,0.42)] backdrop-blur-xl">
            <CardHeader className="border-b border-slate-200/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(239,246,255,0.9),rgba(240,253,250,0.78))]">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <CardTitle className="text-xl tracking-tight text-slate-950">
                    Work Overview
                  </CardTitle>
                  <CardDescription>
                    {visibleIssues.length
                      ? `${visibleIssues.length} active ${activeStatusLabel.toLowerCase()} in the current view`
                      : `No active ${activeStatusLabel.toLowerCase()} at present`}
                  </CardDescription>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="grid grid-cols-2 gap-1 rounded-[22px] border border-white/80 bg-slate-100/80 p-1 shadow-inner sm:w-auto">
                    {TABS.map(({ id, label, Icon }) => {
                      const active = activeTab === id;
                      const count = workOverviewCounts[id] || 0;

                      return (
                        <button
                          key={id}
                          className={cn(
                            "relative inline-flex h-11 items-center justify-center gap-2 rounded-[18px] px-4 pr-7 text-sm font-semibold transition-all duration-300",
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
                          <span
                            className={cn(
                              "absolute right-1.5 top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-extrabold leading-none shadow-sm",
                              active
                                ? "bg-white text-blue-700"
                                : count
                                  ? "bg-rose-500 text-white"
                                  : "bg-slate-200 text-slate-500"
                            )}
                            aria-label={`${count} active ${label.toLowerCase()}`}
                          >
                            {count > 99 ? "99+" : count}
                          </span>
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

          <section className="grid min-w-0 gap-5 md:grid-cols-2 xl:grid-cols-3">
            <ProjectPanel
              projects={projects}
              issues={workflowIssues}
              onOpenProject={handleOpenProject}
            />

            <Card className="h-full min-w-0 border-white/70 bg-white/88 shadow-[0_18px_48px_-36px_rgba(15,23,42,0.36)] backdrop-blur-xl">
              <CardHeader className="border-b border-slate-200/80">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Activity className="h-4 w-4 text-blue-600" />
                  Activity Timeline
                </CardTitle>
              </CardHeader>
              <CardContent className="max-h-[320px] overflow-x-hidden overflow-y-auto p-3 sm:p-4">
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

            <Card className="h-full min-w-0 border-white/70 bg-white/88 shadow-[0_18px_48px_-36px_rgba(15,23,42,0.36)] backdrop-blur-xl md:col-span-2 xl:col-span-1">
              <CardHeader className="border-b border-slate-200/80">
                <CardTitle className="flex items-center gap-2 text-base">
                  <CalendarClock className="h-4 w-4 text-cyan-600" />
                  Recently Updated Issues
                </CardTitle>
              </CardHeader>
              <CardContent className="max-h-[320px] space-y-3 overflow-x-hidden overflow-y-auto p-3 sm:p-4">
                {recentlyUpdatedIssues.length ? (
                  recentlyUpdatedIssues.map((issue) => (
                    <button
                      key={issue._id}
                      className="flex min-w-0 w-full items-center justify-between gap-2 rounded-2xl border border-slate-200/80 bg-white/76 px-3 py-2.5 text-left shadow-sm transition hover:border-blue-200 hover:bg-white sm:gap-3"
                      type="button"
                      onClick={() => setSelectedIssue(issue)}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-950">
                          {issue.title}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-slate-500">
                          {getIssueDisplayKey(issue)} - {formatDateTime(getLastUpdated(issue))}
                        </p>
                        {isBugIssue(issue) ? (
                          <p className="mt-1 truncate text-xs text-slate-500">
                            {getBugSeverity(issue)} severity · Reported by {getReporterName(issue)}
                          </p>
                        ) : null}
                      </div>
                      <Pill className={getBadgeClass(statusStyleMap, getDisplayStatus(issue))}>
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

      <DeveloperBugHealth issues={bugIssues} />

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
