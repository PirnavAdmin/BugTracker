import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bug,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  FolderKanban,
  Layers3,
  Plus,
  RefreshCcw,
  Settings,
  ShieldCheck,
  TimerReset,
  UserPlus,
  Users2,
  Zap,
} from "lucide-react";
import {
  fetchAllChatMeetings,
  fetchActiveQuickChatMessages,
  fetchBugs,
  fetchIssues,
  fetchManagedUsers,
  fetchProjects,
  fetchTeams,
  handleQuickChatMessage as persistQuickChatHandled,
} from "@/lib/api";
import useAnalytics from "@/hooks/use-analytics";
import {
  ANALYTICS_PANEL_CLASS,
  AnalyticsEmptyState,
  AnalyticsPanel,
  AnalyticsSkeletonGrid,
  formatCompactNumber,
} from "@/components/analytics/analytics-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import UserAvatar from "@/components/shared/UserAvatar";
import { ProjectOverviewDashboardPanel } from "@/components/delivery/ProjectDeliveryWorkflowPanel";
import { useAuth } from "@/hooks/use-auth";
import { useChatStore } from "@/lib/chatStore";
import { ROLE_MANAGER } from "@/lib/roles";
import {
  ISSUE_STATUS,
  ISSUE_TYPES,
  getCriticalIssues,
  getIssueDisplayKey,
  getIssuePriorityVariant,
  getIssueStatusLabel,
  getIssueStatusVariant,
  isIssueOverdue,
  getReopenedIssues,
  normalizeBugStatusForIssue,
  resolveBugDetails,
  resolveIssueProjectId,
  resolveIssueTeamId,
} from "@/lib/issues";
import { TASK_BOARD_STATUS, getTaskBoardStatus } from "@/components/tasks/taskBoardStatus";
import {
  cn,
  formatDate,
  formatRelativeDateLabel,
  formatTime,
} from "@/lib/utils";
import { getMeetingStatus, getMeetingStatusLabel } from "@/lib/chat-meetings";

const statusTone = {
  TODO: "bg-slate-400",
  IN_PROGRESS: "bg-blue-500",
  BLOCKED: "bg-rose-500",
  REVIEW: "bg-violet-500",
  QA: "bg-cyan-500",
  DONE: "bg-emerald-500",
  NEW: "bg-amber-500",
  OPEN: "bg-blue-500",
  ASSIGNED: "bg-indigo-500",
  FIXED: "bg-emerald-400",
  CLOSED: "bg-emerald-600",
  REOPEN: "bg-pink-500",
  REJECTED: "bg-slate-500",
  DEFERRED: "bg-teal-500",
};

const BUG_PRIORITY_META = [
  { key: "Low", className: "bg-emerald-500", tone: "text-emerald-700", color: "#10B981" },
  { key: "Medium", className: "bg-amber-500", tone: "text-amber-700", color: "#F59E0B" },
  { key: "High", className: "bg-orange-500", tone: "text-orange-700", color: "#F97316" },
  { key: "Critical", className: "bg-rose-500", tone: "text-rose-700", color: "#F43F5E" },
];

const DASHBOARD_TALL_SCROLL_CLASS =
  "dashboard-scrollbar h-[calc(100svh-var(--app-navbar-height)-6.5rem)] min-h-[560px] space-y-3 overflow-y-scroll overscroll-auto pr-2 [scrollbar-gutter:stable]";

const TASK_STATUS_META = [
  {
    key: TASK_BOARD_STATUS.OPEN,
    label: "To Do",
    helper: "Ready for pickup",
    className: "bg-slate-400",
    icon: Layers3,
    routeParams: { status: TASK_BOARD_STATUS.OPEN },
    tone: "blue",
  },
  {
    key: ISSUE_STATUS.IN_PROGRESS,
    label: "In Progress",
    helper: "Active task work",
    className: "bg-blue-500",
    icon: TimerReset,
    routeParams: { status: TASK_BOARD_STATUS.IN_PROGRESS },
    tone: "amber",
  },
  {
    key: ISSUE_STATUS.DONE,
    label: "Done",
    helper: "Completed tasks",
    className: "bg-emerald-500",
    icon: CheckCircle2,
    routeParams: { status: TASK_BOARD_STATUS.DONE },
    tone: "emerald",
  },
];

const BUG_STATUS_CARD_META = [
  {
    key: "bucket",
    label: "Work Queue",
    helper: "Unassigned pickup queue",
    icon: Layers3,
    tone: "cyan",
    className: "bg-cyan-500",
    routeParams: { view: "bucket" },
  },
  {
    key: "assigned",
    label: "Assigned Bugs",
    helper: "Picked but not started",
    icon: Users2,
    tone: "blue",
    className: "bg-blue-500",
    routeParams: { view: "assigned" },
  },
  {
    key: "closed",
    label: "Closed Bugs",
    helper: "Verified and closed",
    icon: CheckCircle2,
    tone: "emerald",
    className: "bg-emerald-500",
    routeParams: { view: "closed" },
  },
  {
    key: "inProgress",
    label: "In Progress",
    helper: "Active bug fixes",
    icon: TimerReset,
    tone: "violet",
    className: "bg-violet-500",
    routeParams: { view: "inprogress" },
  },
  {
    key: "readyForQa",
    label: "Ready For QA",
    helper: "Waiting for verification",
    icon: ShieldCheck,
    tone: "cyan",
    className: "bg-cyan-500",
    routeParams: { lifecycle: "fixed" },
  },
  {
    key: "reopened",
    label: "Reopen",
    helper: "Returned by QA",
    icon: RefreshCcw,
    tone: "rose",
    className: "bg-rose-500",
    routeParams: { view: "reopen" },
  },
];

const BUG_STATUS_PANEL_META = [
  ...BUG_STATUS_CARD_META,
  {
    key: "critical",
    label: "Critical Bugs",
    helper: "High-risk bug pressure",
    icon: AlertTriangle,
    tone: "rose",
    className: "bg-rose-500",
    routeParams: { filter: "critical" },
  },
  {
    key: "total",
    label: "Total Bugs",
    helper: "All tracked bug records",
    icon: Bug,
    tone: "blue",
    className: "bg-blue-600",
    routeParams: { view: "total" },
  },
];

const BUG_LIQUID_THEME = {
  bucket: {
    dot: "#7C3AED",
    top: "rgba(103, 232, 249, 0.68)",
    bottom: "rgba(6, 182, 212, 0.92)",
    glow: "rgba(34, 211, 238, 0.28)",
  },
  assigned: {
    dot: "#3B82F6",
    top: "rgba(191, 219, 254, 0.58)",
    bottom: "rgba(59, 130, 246, 0.76)",
    glow: "rgba(59, 130, 246, 0.22)",
  },
  closed: {
    dot: "#10B981",
    top: "rgba(110, 231, 183, 0.7)",
    bottom: "rgba(16, 185, 129, 0.95)",
    glow: "rgba(16, 185, 129, 0.3)",
  },
  inProgress: {
    dot: "#8B5CF6",
    top: "rgba(167, 139, 250, 0.74)",
    bottom: "rgba(109, 40, 217, 0.94)",
    glow: "rgba(139, 92, 246, 0.3)",
  },
  readyForQa: {
    dot: "#06B6D4",
    top: "rgba(153, 246, 228, 0.72)",
    bottom: "rgba(6, 182, 212, 0.9)",
    glow: "rgba(20, 184, 166, 0.28)",
  },
  reopened: {
    dot: "#F43F5E",
    top: "rgba(253, 164, 175, 0.72)",
    bottom: "rgba(239, 68, 68, 0.9)",
    glow: "rgba(244, 63, 94, 0.28)",
  },
};

const BUG_RESOLVED_STATUSES = [
  ISSUE_STATUS.FIXED,
  ISSUE_STATUS.QA,
  ISSUE_STATUS.DONE,
  ISSUE_STATUS.CLOSED,
];

const BUG_CLOSED_STATUSES = [
  ISSUE_STATUS.CLOSED,
  ISSUE_STATUS.REJECTED,
  ISSUE_STATUS.DEFERRED,
];

const getBugProjectName = (bug) => bug?.projectId?.name || "Unknown project";
const getBugAssignee = (bug) =>
  resolveBugDetails(bug)?.developerLead || bug?.assignee || bug?.assignedDeveloperId || null;
const getBugSeverity = (bug) => resolveBugDetails(bug)?.severity || "";
const getBugSeverityRank = (bug) => {
  const severity = String(getBugSeverity(bug) || bug?.priority || "Medium").toLowerCase();

  if (["critical", "blocker", "urgent"].includes(severity)) return 0;
  if (["high", "major"].includes(severity)) return 1;
  if (severity === "medium") return 2;
  if (severity === "low") return 3;
  return 4;
};
const isCriticalBug = (bug) => getCriticalIssues([bug]).length > 0;
const isOpenBug = (bug) => !BUG_CLOSED_STATUSES.includes(normalizeBugStatusForIssue(bug));
const isClosedBug = (bug) =>
  BUG_CLOSED_STATUSES.includes(normalizeBugStatusForIssue(bug));
const isResolvedBug = (bug) =>
  BUG_RESOLVED_STATUSES.includes(normalizeBugStatusForIssue(bug));
const isReopenedBug = (bug) =>
  getReopenedIssues([bug]).length > 0;
const getBugDetailRouteParams = (bug) => {
  const status = normalizeBugStatusForIssue(bug);
  const params = { bug: bug._id };

  if (status === ISSUE_STATUS.IN_PROGRESS) {
    return { ...params, view: "inprogress" };
  }

  if (
    [
      ISSUE_STATUS.READY_FOR_QA,
      ISSUE_STATUS.FIXED,
      ISSUE_STATUS.TESTING,
      ISSUE_STATUS.QA,
    ].includes(status)
  ) {
    return { ...params, view: "readyqa" };
  }

  return params;
};
const isBugBucketItem = (bug) => {
  const developer = resolveBugDetails(bug)?.developerLead || bug?.assignee || bug?.assignedDeveloperId;
  const status = normalizeBugStatusForIssue(bug);

  return (
    !developer &&
    [
      ISSUE_STATUS.NEW,
      ISSUE_STATUS.OPEN,
      ISSUE_STATUS.TRIAGED,
      ISSUE_STATUS.AVAILABLE_QUEUE,
    ].includes(status)
  );
};
const startOfDay = (date) => {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
};

const startOfWeek = (date) => {
  const value = startOfDay(date);
  const day = value.getDay();
  const diff = value.getDate() - day + (day === 0 ? -6 : 1);
  value.setDate(diff);
  return value;
};

const countBetween = (items, getDate, from, to = new Date()) =>
  items.filter((item) => {
    const time = new Date(getDate(item) || 0).getTime();

    return time >= from.getTime() && time < to.getTime();
  }).length;

const buildTrend = (current, previous, suffix = "vs last week") => {
  const delta = current - previous;

  return {
    direction: delta > 0 ? "up" : delta < 0 ? "down" : "flat",
    label: `${delta > 0 ? "+" : ""}${delta} ${suffix}`,
  };
};

const projectHealthMeta = {
  healthy: {
    label: "Healthy",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    barClassName: "bg-emerald-500",
    Icon: CheckCircle2,
  },
  attention: {
    label: "Attention",
    className: "border-amber-200 bg-amber-50 text-amber-700",
    barClassName: "bg-amber-500",
    Icon: AlertTriangle,
  },
  critical: {
    label: "Critical",
    className: "border-rose-200 bg-rose-50 text-rose-700",
    barClassName: "bg-rose-500",
    Icon: AlertTriangle,
  },
  qa: {
    label: "Waiting for QA",
    className: "border-cyan-200 bg-cyan-50 text-cyan-700",
    barClassName: "bg-cyan-500",
    Icon: ShieldCheck,
  },
};

const ProjectDeliveryOverview = ({
  projects = [],
  projectOptions = [],
  selectedProjectId = "all",
  sortBy = "health-asc",
  onProjectChange,
  onSortChange,
  onOpen,
}) => {
  const shouldReduceMotion = useReducedMotion();

  return (
    <AnalyticsPanel
      className="[&>div:first-child_h2]:font-semibold"
      title="Project Delivery Overview"
      description="Track project workload, bug pressure, QA activity and delivery health."
      action={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Badge className="rounded-full border-slate-200/80 bg-white/72 px-3 py-1 text-xs font-medium text-slate-600 shadow-sm">
            {projects.length} Projects
          </Badge>
          <select
            value={selectedProjectId}
            onChange={(event) => onProjectChange?.(event.target.value)}
            className="h-8 max-w-[150px] rounded-full border border-white/70 bg-white/78 px-3 text-xs font-medium text-slate-700 shadow-sm outline-none transition focus:border-blue-200 focus:ring-2 focus:ring-blue-500/20"
            aria-label="Filter project delivery overview"
          >
            <option value="all">All Projects</option>
            {projectOptions.map((project) => (
              <option key={project.projectId} value={project.projectId}>
                {project.name}
              </option>
            ))}
          </select>
          <select
            value={sortBy}
            onChange={(event) => onSortChange?.(event.target.value)}
            className="h-8 max-w-[118px] rounded-full border border-white/70 bg-white/78 px-3 text-xs font-medium text-slate-700 shadow-sm outline-none transition focus:border-blue-200 focus:ring-2 focus:ring-blue-500/20"
            aria-label="Sort project delivery overview"
          >
            <option value="health-asc">Health</option>
            <option value="open-desc">Open Bugs</option>
            <option value="bugs-desc">Total Bugs</option>
            <option value="qa-desc">QA</option>
          </select>
        </div>
      }
    >
      {projects.length ? (
        <div className="space-y-2.5">
          <div className="grid grid-cols-[minmax(0,1.7fr)_0.56fr_0.56fr_0.6fr_0.54fr_0.86fr] gap-3 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400 max-md:hidden">
            <span>Project</span>
            <span>Bugs</span>
            <span>Open</span>
            <span>Closed</span>
            <span>QA</span>
            <span>Health</span>
          </div>

          {projects.map((project, index) => {
            const health = projectHealthMeta[project.healthState] || projectHealthMeta.attention;
            const HealthIcon = health.Icon;

            return (
              <motion.button
                key={project.projectId || project.name}
                type="button"
                initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
                animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
                transition={{ delay: index * 0.035, duration: 0.28, ease: "easeOut" }}
                onClick={() => onOpen(project)}
                className="group grid w-full gap-3 rounded-[20px] border border-white/72 bg-white/66 px-3 py-3 text-left shadow-[0_14px_34px_-32px_rgba(15,23,42,0.34)] backdrop-blur-sm transition duration-300 hover:-translate-y-0.5 hover:border-blue-200/90 hover:bg-white/88 hover:shadow-[0_20px_46px_-34px_rgba(37,99,235,0.36)] md:grid-cols-[minmax(0,1.7fr)_0.56fr_0.56fr_0.6fr_0.54fr_0.86fr] md:items-center"
              >
                <span className="min-w-0">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm font-semibold text-slate-950">
                      {project.name}
                    </span>
                    {project.gitActive ? (
                      <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.12)]" title="Git activity available" />
                    ) : null}
                  </span>
                  <span className="mt-0.5 block text-xs font-medium text-slate-500">
                    {formatCompactNumber(project.open)} open - {formatCompactNumber(project.closed)} closed
                    {project.pendingQa ? ` - ${formatCompactNumber(project.pendingQa)} QA` : ""}
                  </span>
                </span>

                <span className="hidden text-sm font-medium text-slate-800 md:block">
                  {formatCompactNumber(project.total)}
                </span>
                <span className="hidden text-sm font-medium text-rose-600 md:block">
                  {formatCompactNumber(project.open)}
                </span>
                <span className="hidden text-sm font-medium text-emerald-700 md:block">
                  {formatCompactNumber(project.closed)}
                </span>
                <span className="hidden text-sm font-medium text-cyan-700 md:block">
                  {formatCompactNumber(project.pendingQa)}
                </span>

                <span className="min-w-0">
                  <span className="flex items-center justify-between gap-2">
                    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium", health.className)}>
                      <HealthIcon className="h-3 w-3" />
                      {health.label}
                    </span>
                    <ChevronRight className="h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-blue-600" />
                  </span>
                  <span className="mt-2 flex items-center gap-2">
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
                      <motion.span
                        className={cn("block h-full rounded-full", health.barClassName)}
                        initial={shouldReduceMotion ? false : { width: 0 }}
                        animate={{ width: `${project.health}%` }}
                        transition={{ delay: 0.08 + index * 0.035, duration: 0.55, ease: "easeOut" }}
                      />
                    </span>
                    <span className="w-9 text-right text-xs font-medium text-slate-700">
                      {project.health}%
                    </span>
                  </span>
                </span>
              </motion.button>
            );
          })}
        </div>
      ) : (
        <AnalyticsEmptyState
          icon={FolderKanban}
          title="No project delivery data yet"
          description="Project delivery insight appears once projects or bugs are available."
        />
      )}
    </AnalyticsPanel>
  );
};

const rankBadge = (rank) => {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return String(rank);
};

const rankBadgeTone = (rank) => {
  if (rank === 1) return "border-amber-200 bg-amber-50 text-amber-700";
  if (rank === 2) return "border-slate-200 bg-slate-50 text-slate-600";
  if (rank === 3) return "border-orange-200 bg-orange-50 text-orange-700";
  return "border-slate-100 bg-slate-100 text-slate-600";
};

const TopContributors = ({
  contributors = [],
  totalContributors = 0,
  onOpen,
  onViewAll,
}) => {
  const shouldReduceMotion = useReducedMotion();

  return (
    <AnalyticsPanel
      className="[&>div:first-child_h2]:font-semibold"
      title="Top Contributors"
      description="Team members contributing most to tracked bug work."
      action={
        totalContributors ? (
          <Badge className="rounded-full border-white/70 bg-white/72 px-3 py-1 text-xs font-medium text-slate-600 shadow-sm">
            {totalContributors} contributors
          </Badge>
        ) : null
      }
    >
      {contributors.length ? (
        <div className="space-y-2.5">
          {contributors.map((contributor, index) => (
            <motion.button
              key={contributor.userKey}
              type="button"
              initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
              animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
              transition={{ delay: index * 0.045, duration: 0.26, ease: "easeOut" }}
              onClick={() => onOpen(contributor)}
              className="group w-full rounded-[20px] border border-white/72 bg-white/66 p-3 text-left shadow-[0_14px_34px_-32px_rgba(15,23,42,0.34)] backdrop-blur-sm transition duration-300 hover:border-blue-200/90 hover:bg-white/88"
            >
              <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
                <span
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold shadow-sm",
                    contributor.rank <= 3 ? "text-base" : "",
                    rankBadgeTone(contributor.rank)
                  )}
                >
                  {rankBadge(contributor.rank)}
                </span>
                <span className="flex min-w-0 items-center gap-2.5">
                  <UserAvatar
                    user={contributor.user}
                    name={contributor.name}
                    className="h-9 w-9 border-2 border-white/90 shadow-sm"
                    imageClassName="object-cover"
                    fallbackClassName="text-xs font-medium"
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-slate-950">
                      {contributor.name}
                    </span>
                    <span className="mt-0.5 block text-xs font-normal text-slate-500">
                      {formatCompactNumber(contributor.score)} contribution score
                    </span>
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <span className="rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-sm font-semibold text-blue-700">
                    {contributor.percent}%
                  </span>
                  {contributor.rankMovement ? (
                    <span
                      className={cn(
                        "text-[10px] font-medium",
                        contributor.rankMovement > 0 ? "text-emerald-600" : "text-rose-600"
                      )}
                    >
                      {contributor.rankMovement > 0
                        ? `↑ Up ${contributor.rankMovement}`
                        : `↓ Down ${Math.abs(contributor.rankMovement)}`}
                    </span>
                  ) : null}
                </span>
              </div>

              <div className="mt-2.5 grid grid-cols-3 gap-1.5 text-[11px] font-medium text-slate-600">
                <span className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">
                  {formatCompactNumber(contributor.resolved)} Resolved
                </span>
                <span className="rounded-full bg-blue-50 px-2 py-1 text-blue-700">
                  {formatCompactNumber(contributor.open)} Open
                </span>
                <span className="rounded-full bg-rose-50 px-2 py-1 text-rose-700">
                  {formatCompactNumber(contributor.critical)} Critical
                </span>
              </div>
            </motion.button>
          ))}

          <Button
            type="button"
            variant="outline"
            className="group mt-1 h-9 w-full justify-between rounded-2xl bg-white/68 text-xs font-medium"
            onClick={onViewAll}
          >
            View All Contributors
            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
          </Button>
        </div>
      ) : (
        <AnalyticsEmptyState
          icon={Users2}
          title="No contributors yet"
          description="Contributor insights appear once bugs are assigned to team members."
        />
      )}
    </AnalyticsPanel>
  );
};

const LiquidBugStatusCard = ({ row, fillPercent = 0, onOpen }) => {
  const shouldReduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const scrollWaveX = useTransform(scrollYProgress, [0, 1], shouldReduceMotion ? ["0%", "0%"] : ["-8%", "8%"]);
  const scrollWaveY = useTransform(scrollYProgress, [0, 1], shouldReduceMotion ? [0, 0] : [6, -6]);
  const theme = BUG_LIQUID_THEME[row.key] || BUG_LIQUID_THEME.bucket;
  const safeFill = Math.max(0, Math.min(100, fillPercent));
  const liquidOffset = 100 - safeFill;

  return (
    <button
      type="button"
      onClick={() => onOpen(row.routeParams)}
      className="group relative min-h-[210px] w-full overflow-hidden rounded-[28px] border border-white/80 bg-white/90 px-5 py-5 text-left shadow-[0_22px_55px_-36px_rgba(15,23,42,0.5)] transition duration-300 hover:-translate-y-1 hover:border-blue-200/80 hover:shadow-[0_28px_72px_-42px_rgba(37,99,235,0.52)] dark:border-slate-800/80 dark:bg-slate-950/86"
      style={{ boxShadow: `0 28px 70px -48px ${theme.bottom}` }}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_12%,rgba(255,255,255,0.92),transparent_32%),linear-gradient(135deg,rgba(255,255,255,0.72),transparent_58%)]" />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[70%] overflow-hidden transition-transform duration-700 ease-out"
        style={{ transform: `translateY(${liquidOffset}%)` }}
      >
        <motion.div
          className="absolute -left-[18%] -right-[18%] -top-8 h-16 opacity-95"
          style={{ x: scrollWaveX, y: scrollWaveY }}
        >
          <motion.div
            className="h-full w-full"
            animate={
              shouldReduceMotion
                ? undefined
                : {
                    x: ["-8%", "0%", "-8%"],
                  }
            }
            transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
          >
            <svg className="h-full w-full" viewBox="0 0 1200 120" preserveAspectRatio="none" aria-hidden="true">
              <path
                d="M0,56 C150,88 300,28 450,54 C610,82 760,92 920,54 C1035,28 1110,40 1200,58 L1200,120 L0,120 Z"
                fill={theme.top}
              />
              <path
                d="M0,72 C165,42 310,74 470,58 C640,42 760,62 920,72 C1060,82 1130,50 1200,62 L1200,120 L0,120 Z"
                fill="rgba(255,255,255,0.42)"
              />
            </svg>
          </motion.div>
        </motion.div>
        <div
          className="absolute inset-x-0 bottom-0 top-4"
          style={{
            background: `linear-gradient(180deg, ${theme.top} 0%, ${theme.bottom} 92%)`,
          }}
        />
        <motion.div
          className="absolute inset-x-0 bottom-0 top-8 opacity-55"
          style={{ x: scrollWaveX }}
          animate={
            shouldReduceMotion
              ? undefined
              : {
                  backgroundPosition: ["0px 0px", "80px 48px"],
                }
          }
          transition={{ duration: 11, repeat: Infinity, ease: "linear" }}
        >
          <div className="h-full w-full bg-[radial-gradient(circle_at_24px_24px,rgba(255,255,255,0.72)_0_2px,transparent_3px),radial-gradient(circle_at_92px_58px,rgba(255,255,255,0.42)_0_3px,transparent_4px),radial-gradient(circle_at_146px_18px,rgba(255,255,255,0.5)_0_1px,transparent_2px)] bg-[length:180px_120px]" />
        </motion.div>
        <div
          className="absolute inset-0 opacity-50"
          style={{ background: `linear-gradient(90deg, rgba(255,255,255,0.34), transparent 14%, transparent 82%, ${theme.glow})` }}
        />
      </div>

      <div className="relative z-10 flex min-w-0 items-start gap-3">
        <span
          className="mt-1 h-3.5 w-3.5 shrink-0 rounded-full shadow-sm"
          style={{ backgroundColor: theme.dot }}
        />
        <div className="min-w-0">
          <p className="truncate text-xl font-extrabold tracking-tight text-slate-950 dark:text-slate-50">
            {row.label}
          </p>
          <p className="mt-1 text-sm font-medium text-slate-500">{row.helper}</p>
        </div>
      </div>

      <div className="relative z-10 mt-14 flex justify-end text-right">
        <div className={cn(safeFill > 42 ? "text-white drop-shadow" : "text-slate-950 dark:text-slate-50")}>
          <p className="text-3xl font-black leading-none">{row.count}</p>
          <p className="mt-1 text-sm font-semibold">bugs</p>
        </div>
      </div>
    </button>
  );
};

const TeamTaskWorkloadCard = ({ row, onOpen }) => {
  const shouldReduceMotion = useReducedMotion();
  const fillPercent = Math.max(0, Math.min(100, row.completionRate || 0));
  const state =
    row.overdue > 0 || row.openRate >= 45
      ? "At Risk"
      : row.openRate >= 25 || row.inProgress > row.done
        ? "Attention"
        : "Healthy";
  const stateClassName =
    state === "Healthy"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : state === "At Risk"
        ? "border-rose-200 bg-rose-50 text-rose-700"
        : "border-amber-200 bg-amber-50 text-amber-700";
  const barClassName =
    state === "Healthy"
      ? "bg-emerald-500"
      : state === "At Risk"
        ? "bg-rose-500"
        : "bg-amber-500";

  return (
    <motion.button
      type="button"
      onClick={() => onOpen(row.teamId ? { teamId: row.teamId } : {})}
      initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
      animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
      whileHover={shouldReduceMotion ? undefined : { y: -2 }}
      transition={{ duration: 0.24, ease: "easeOut" }}
      className="group w-full rounded-[17px] border border-white/72 bg-white/66 px-3.5 py-2.5 text-left shadow-[0_10px_28px_-26px_rgba(15,23,42,0.32)] backdrop-blur-sm transition-colors duration-300 hover:border-blue-200/90 hover:bg-white/88 hover:shadow-[0_16px_36px_-30px_rgba(37,99,235,0.32)]"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold leading-5 tracking-tight text-slate-950">
            {row.name}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-xs font-medium">
          <span className="text-slate-700">{formatCompactNumber(row.total)} tasks</span>
          <span className="text-slate-950">{row.completionRate}%</span>
          <Badge className={cn("rounded-full border px-1.5 py-0 text-[9px] font-medium", stateClassName)}>
            {state}
          </Badge>
          <ChevronRight className="h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-blue-600" />
        </div>
      </div>

      <p className="mt-0.5 truncate text-[11px] font-normal leading-4 text-slate-500">
        {formatCompactNumber(row.open)} To Do - {formatCompactNumber(row.inProgress)} In Progress - {formatCompactNumber(row.done)} Done
        {row.overdue ? ` - ${formatCompactNumber(row.overdue)} Overdue` : ""}
      </p>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-200/90 shadow-inner">
        <motion.div
          className={cn("h-full rounded-full", barClassName)}
          initial={shouldReduceMotion ? false : { width: 0 }}
          animate={{ width: `${fillPercent}%` }}
          transition={{ duration: 0.65, ease: "easeOut" }}
        />
      </div>
    </motion.button>
  );
};

const riskTone = {
  low: "border-emerald-200 bg-emerald-50 text-emerald-700",
  moderate: "border-amber-200 bg-amber-50 text-amber-700",
  high: "border-rose-200 bg-rose-50 text-rose-700",
};

const QaBugRiskPanel = ({ metrics = [], riskLevel = "low", onOpen }) => {
  const shouldReduceMotion = useReducedMotion();
  const maxValue = Math.max(...metrics.map((metric) => metric.value || 0), 1);

  return (
    <AnalyticsPanel
      className="[&>div:first-child]:gap-2 [&>div:first-child]:p-3 [&>div:first-child_h2]:text-[15px] [&>div:first-child_h2]:font-semibold [&>div:first-child_p]:text-xs [&>div:first-child_p]:leading-5 [&>div:last-child]:p-3"
      title="QA / Bug Risk"
      description="Current QA pressure and high-risk bug signals."
      action={
        <Badge className={cn("rounded-full border px-2 py-0.5 text-[9px] font-medium uppercase tracking-[0.1em]", riskTone[riskLevel])}>
          <span className="mr-1 h-1.5 w-1.5 rounded-full bg-current" />
          {riskLevel} risk
        </Badge>
      }
    >
      <motion.div
        className="space-y-2"
        initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
        animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: "easeOut" }}
      >
        {metrics.map((metric, index) => {
          const width = metric.value ? Math.max(8, Math.round((metric.value / maxValue) * 100)) : 0;

          return (
            <motion.button
              key={metric.key}
              type="button"
              initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
              animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
              transition={{ delay: index * 0.04, duration: 0.24, ease: "easeOut" }}
              className="group w-full rounded-[16px] border border-white/72 bg-white/66 px-3 py-2.5 text-left shadow-[0_10px_24px_-24px_rgba(15,23,42,0.32)] backdrop-blur-sm transition duration-300 hover:border-blue-200/90 hover:bg-white/88"
              onClick={() => onOpen(metric.routeParams)}
            >
              <span className="flex items-center justify-between gap-3">
                <span className="grid min-w-0 grid-cols-[54px_minmax(0,1fr)] items-center gap-2">
                  <span className="text-[26px] font-semibold leading-none text-slate-950">
                    {formatCompactNumber(metric.value)}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-semibold leading-5 text-slate-800">
                      {metric.label}
                    </span>
                    <span className="block truncate text-[11px] font-medium leading-4 text-slate-500">
                      {metric.helper}
                    </span>
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-blue-600" />
              </span>
              <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-slate-200/90 shadow-inner">
                <motion.span
                  className={cn("block h-full rounded-full", metric.barClassName)}
                  initial={shouldReduceMotion ? false : { width: 0 }}
                  animate={{ width: `${width}%` }}
                  transition={{ delay: 0.08 + index * 0.04, duration: 0.58, ease: "easeOut" }}
                />
              </span>
            </motion.button>
          );
        })}
      </motion.div>
    </AnalyticsPanel>
  );
};

const getMeetingContextLabel = (meeting = {}) => {
  const conversation =
    meeting.conversationId && typeof meeting.conversationId === "object"
      ? meeting.conversationId
      : null;
  const project = conversation?.projectId || meeting.projectId;
  const team = conversation?.teamId || meeting.teamId;

  return (
    project?.name ||
    team?.name ||
    conversation?.name ||
    conversation?.title ||
    "Team meeting"
  );
};

const buildChatMeetingPath = (meeting = {}) => {
  const conversationId = String(meeting?.conversationId?._id || meeting?.conversationId || "");
  const meetingId = String(meeting?._id || meeting?.id || "");
  const params = new URLSearchParams({ module: "meetings" });

  if (conversationId) {
    params.set("conversation", conversationId);
  }

  if (meetingId) {
    params.set("meeting", meetingId);
  }

  return `/chat?${params}`;
};

const UpcomingMeetingsPanel = ({ meetings = [], onOpenCalendar, onOpenMeeting }) => {
  const shouldReduceMotion = useReducedMotion();

  return (
    <AnalyticsPanel
      className="[&>div:first-child]:gap-2 [&>div:first-child]:p-3.5 [&>div:first-child_h2]:text-[15px] [&>div:first-child_h2]:font-semibold [&>div:first-child_p]:text-xs [&>div:first-child_p]:leading-5 [&>div:last-child]:p-3"
      title="Upcoming Meetings"
      description="Your next scheduled team meetings."
      action={<CalendarDays className="h-4 w-4 text-blue-600" />}
    >
      {meetings.length ? (
        <motion.div
          className="space-y-2.5"
          initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
          animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: "easeOut" }}
        >
          {meetings.map((meeting, index) => {
            const start = meeting.startTime ? new Date(meeting.startTime) : null;
            const status = getMeetingStatus(meeting);
            const actionLabel = status === "live" ? "Join" : "View";

            return (
              <motion.button
                key={meeting._id || meeting.id}
                type="button"
                initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
                animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
                transition={{ delay: index * 0.04, duration: 0.24, ease: "easeOut" }}
                className="group grid w-full grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-3 rounded-[16px] border border-white/70 bg-white/64 px-3 py-2.5 text-left shadow-[0_10px_24px_-24px_rgba(15,23,42,0.32)] backdrop-blur-sm transition duration-300 hover:-translate-y-0.5 hover:border-blue-200/90 hover:bg-white/88"
                onClick={() => onOpenMeeting(meeting)}
              >
                <span className="text-xs font-medium text-blue-700">
                  {start ? formatTime(start) : "--"}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-slate-950">
                    {meeting.title || "Team meeting"}
                  </span>
                  <span className="mt-0.5 block truncate text-xs font-normal text-slate-500">
                    {getMeetingContextLabel(meeting)} - {(meeting.participants || []).length} participants
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <Badge className="rounded-full border-blue-100 bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                    {start ? formatRelativeDateLabel(start) : getMeetingStatusLabel(meeting)}
                  </Badge>
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 rounded-full px-2.5 text-[11px] font-medium"
                    variant={status === "live" ? "default" : "outline"}
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpenMeeting(meeting);
                    }}
                  >
                    {actionLabel}
                  </Button>
                </span>
              </motion.button>
            );
          })}
          <Button
            type="button"
            variant="ghost"
            className="group h-8 w-full justify-between rounded-2xl text-xs font-medium text-blue-700"
            onClick={onOpenCalendar}
          >
            View Calendar
            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
          </Button>
        </motion.div>
      ) : (
        <AnalyticsEmptyState
          className="min-h-[190px] py-7"
          icon={CalendarDays}
          title="No upcoming meetings"
          description="Your scheduled meetings will appear here."
        />
      )}
    </AnalyticsPanel>
  );
};

const deadlineStatusMeta = {
  "On Track": "border-emerald-200 bg-emerald-50 text-emerald-700",
  Attention: "border-amber-200 bg-amber-50 text-amber-700",
  "At Risk": "border-rose-200 bg-rose-50 text-rose-700",
};

const ProjectDeadlinesPanel = ({ deadlines = [], onOpenProjects, onOpenProject }) => {
  const shouldReduceMotion = useReducedMotion();

  return (
    <AnalyticsPanel
      className="[&>div:first-child]:gap-2 [&>div:first-child]:p-3.5 [&>div:first-child_h2]:text-[15px] [&>div:first-child_h2]:font-semibold [&>div:first-child_p]:text-xs [&>div:first-child_p]:leading-5 [&>div:last-child]:p-3"
      title="Project Deadlines"
      description="Upcoming project deadlines requiring attention."
      action={<Clock className="h-4 w-4 text-violet-600" />}
    >
      {deadlines.length ? (
        <motion.div
          className="space-y-2.5"
          initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
          animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: "easeOut" }}
        >
          {deadlines.map((deadline, index) => (
            <motion.button
              key={deadline.projectId}
              type="button"
              initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
              animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
              transition={{ delay: index * 0.04, duration: 0.24, ease: "easeOut" }}
              className="group w-full rounded-[16px] border border-white/70 bg-white/64 px-3 py-2.5 text-left shadow-[0_10px_24px_-24px_rgba(15,23,42,0.32)] backdrop-blur-sm transition duration-300 hover:-translate-y-0.5 hover:border-violet-200/90 hover:bg-white/88"
              onClick={() => onOpenProject(deadline)}
            >
              <span className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-slate-950">
                    {deadline.name}
                  </span>
                  <span className="mt-0.5 block text-xs font-normal text-slate-500">
                    {deadline.deadlineLabel} - {deadline.daysLabel}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-xs font-medium text-slate-800">
                    {deadline.progress}% progress
                  </span>
                  <Badge className={cn("rounded-full border px-2 py-0.5 text-[10px] font-medium", deadlineStatusMeta[deadline.status])}>
                    {deadline.status}
                  </Badge>
                  <ChevronRight className="h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-violet-600" />
                </span>
              </span>
              <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-slate-200/90 shadow-inner">
                <motion.span
                  className={cn(
                    "block h-full rounded-full",
                    deadline.status === "On Track"
                      ? "bg-emerald-500"
                      : deadline.status === "At Risk"
                        ? "bg-rose-500"
                        : "bg-amber-500"
                  )}
                  initial={shouldReduceMotion ? false : { width: 0 }}
                  animate={{ width: `${deadline.progress}%` }}
                  transition={{ delay: 0.08 + index * 0.04, duration: 0.58, ease: "easeOut" }}
                />
              </span>
            </motion.button>
          ))}
          <Button
            type="button"
            variant="ghost"
            className="group h-8 w-full justify-between rounded-2xl text-xs font-medium text-violet-700"
            onClick={onOpenProjects}
          >
            View Projects
            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
          </Button>
        </motion.div>
      ) : (
        <AnalyticsEmptyState
          className="min-h-[190px] py-7"
          icon={FolderKanban}
          title="No upcoming project deadlines"
          description="Project deadlines will appear here when configured."
        />
      )}
    </AnalyticsPanel>
  );
};

const TASK_HEALTH_ROW_THEME = {
  [TASK_BOARD_STATUS.OPEN]: {
    iconClassName: "border-slate-200 bg-slate-50 text-slate-600",
    bar: "from-slate-400 to-slate-500",
  },
  [ISSUE_STATUS.IN_PROGRESS]: {
    iconClassName: "border-blue-200 bg-blue-50 text-blue-600",
    bar: "from-blue-500 to-cyan-400",
  },
  [ISSUE_STATUS.DONE]: {
    iconClassName: "border-emerald-200 bg-emerald-50 text-emerald-600",
    bar: "from-emerald-500 to-teal-400",
  },
  overdue: {
    iconClassName: "border-rose-200 bg-rose-50 text-rose-600",
    bar: "from-rose-500 to-orange-400",
  },
};

const TaskHealthRow = ({ row, total, onOpen, shouldReduceMotion }) => {
  const Icon = row.icon;
  const percentage = total ? Math.round((row.count / total) * 100) : 0;
  const visualPercentage = row.count ? Math.max(8, Math.min(100, percentage)) : 0;
  const theme = TASK_HEALTH_ROW_THEME[row.key] || TASK_HEALTH_ROW_THEME[TASK_BOARD_STATUS.OPEN];

  return (
    <motion.button
      type="button"
      onClick={() => onOpen(row.routeParams)}
      className="group w-full rounded-2xl border border-white/70 bg-white/58 px-4 py-3 text-left shadow-[0_14px_34px_-32px_rgba(15,23,42,0.38)] outline-none backdrop-blur-sm transition-colors duration-200 hover:border-blue-200/80 hover:bg-white/86 hover:shadow-[0_18px_44px_-34px_rgba(37,99,235,0.48)] focus-visible:ring-2 focus-visible:ring-blue-500/55 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
      whileHover={shouldReduceMotion ? undefined : { y: -2 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
    >
      <div className="flex items-center gap-3">
        <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border", theme.iconClassName)}>
          <Icon className="h-4.5 w-4.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-3">
            <span className="truncate text-sm font-bold text-slate-950 dark:text-slate-100">
              {row.label}
            </span>
            <span className="flex shrink-0 items-center gap-3">
              <span className="text-sm font-black text-slate-950 dark:text-slate-100">
                {formatCompactNumber(row.count)}
              </span>
              <span className="w-10 text-right text-xs font-bold text-slate-500">
                {percentage}%
              </span>
              <ArrowRight className="h-3.5 w-3.5 text-slate-400 opacity-0 transition duration-200 group-hover:translate-x-0.5 group-hover:opacity-100 group-focus-visible:translate-x-0.5 group-focus-visible:opacity-100" />
            </span>
          </span>
          <span className="mt-1 block text-xs font-medium text-slate-500">
            {row.helper}
          </span>
        </span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100/90 shadow-inner">
        <motion.div
          className={cn("h-full rounded-full bg-gradient-to-r", theme.bar)}
          initial={shouldReduceMotion ? false : { width: 0 }}
          animate={{ width: `${visualPercentage}%` }}
          transition={{ duration: 0.65, ease: "easeOut" }}
        />
      </div>
    </motion.button>
  );
};

const TaskStatusDistributionPanel = ({ rows = [], total = 0, overdue = 0, onOpen }) => {
  const shouldReduceMotion = useReducedMotion();
  const healthRows = rows
    .filter((row) =>
      [TASK_BOARD_STATUS.OPEN, ISSUE_STATUS.IN_PROGRESS, ISSUE_STATUS.DONE].includes(row.key)
    )
    .map((row) => ({
      ...row,
      count: row.count || 0,
    }))
    .concat([
      {
        key: "overdue",
        label: "Overdue",
        helper: "Need attention now",
        count: overdue || 0,
        icon: AlertTriangle,
        routeParams: { filter: "overdue" },
      },
    ]);

  return (
    <AnalyticsPanel
      className="h-full overflow-hidden"
      title="Task Health"
      description="Current workload and delivery pressure across your team's assigned work."
      action={
        <Badge className="border-white/60 bg-white/72 text-slate-600">
          {formatCompactNumber(total || 0)} total tasks
        </Badge>
      }
    >
      {total || overdue ? (
        <motion.div
          className="space-y-3"
          initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32, ease: "easeOut" }}
        >
          {healthRows.map((row) => (
            <TaskHealthRow
              key={row.key}
              row={row}
              total={total || 0}
              onOpen={onOpen}
              shouldReduceMotion={shouldReduceMotion}
            />
          ))}
          <div className="flex justify-end pt-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="group h-8 px-2 text-xs font-bold text-blue-700"
              onClick={() => onOpen()}
            >
              View Tasks
              <ArrowRight className="ml-1.5 h-3.5 w-3.5 transition duration-200 group-hover:translate-x-0.5" />
            </Button>
          </div>
        </motion.div>
      ) : (
        <AnalyticsEmptyState
          icon={Layers3}
          title="No task status data yet"
          description="Create task work to populate the task status overview."
        />
      )}
    </AnalyticsPanel>
  );
};

const BugStatusMetricCard = ({ row, onOpen }) => (
  <button
    type="button"
    onClick={() => onOpen(row.routeParams)}
    className="group relative min-h-[118px] w-full overflow-hidden rounded-[24px] border border-white/80 bg-white/84 px-4 py-3 text-left shadow-[0_18px_42px_-34px_rgba(15,23,42,0.34)] transition duration-300 hover:-translate-y-0.5 hover:border-blue-200/80 hover:bg-white"
  >
    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_14%_0%,rgba(255,255,255,0.96),transparent_32%),radial-gradient(circle_at_88%_18%,rgba(96,165,250,0.12),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.65),rgba(248,250,252,0.88))]" />
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 h-2.5 opacity-90"
      style={{
        background:
          row.tone === "emerald"
            ? "linear-gradient(90deg, rgba(110,231,183,0.72), rgba(16,185,129,0.95))"
            : row.tone === "violet"
              ? "linear-gradient(90deg, rgba(196,181,253,0.74), rgba(124,58,237,0.92))"
              : row.tone === "rose"
                ? "linear-gradient(90deg, rgba(253,164,175,0.72), rgba(244,63,94,0.92))"
                : row.tone === "cyan"
                  ? "linear-gradient(90deg, rgba(165,243,252,0.72), rgba(6,182,212,0.92))"
                  : "linear-gradient(90deg, rgba(191,219,254,0.72), rgba(37,99,235,0.92))",
      }}
    />
    <div className="relative z-10 flex h-full items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className={cn("h-3 w-3 shrink-0 rounded-full", row.className)} />
          <p className="truncate text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            {row.label}
          </p>
        </div>
        <p className="mt-2 text-3xl font-semibold leading-none text-slate-900">
          {row.count}
        </p>
        <p className="mt-2 text-sm text-slate-500">{row.helper}</p>
      </div>
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/80 bg-white/72 text-slate-600 shadow-sm">
        <row.icon className="h-4.5 w-4.5" />
      </div>
    </div>
  </button>
);

const PriorityDistribution = ({ rows, total }) => {
  let segmentStart = 0;
  const activeRows = rows.filter((row) => row.count > 0);
  const donutBackground = `conic-gradient(${activeRows
    .map((row) => {
      const segmentEnd = segmentStart + (row.count / total) * 360;
      const segment = `${row.color} ${segmentStart}deg ${segmentEnd}deg`;
      segmentStart = segmentEnd;
      return segment;
    })
    .join(", ")})`;

  return (
    <AnalyticsPanel
      title="Bug Priority Distribution"
      description="Live severity pressure across all tracked bug records."
    >
      {total ? (
        <div className="grid min-h-[300px] gap-5 md:grid-cols-[190px_minmax(0,1fr)] md:items-center">
          <div
            className="relative mx-auto h-44 w-44 shrink-0 rounded-full shadow-[0_18px_38px_-24px_rgba(15,23,42,0.7)]"
            style={{ background: donutBackground }}
            role="img"
            aria-label={`${total} bugs distributed across ${activeRows.length} priority levels`}
          >
            <div className="absolute inset-[22px] flex flex-col items-center justify-center rounded-full border border-white/85 bg-white/92 text-center shadow-inner backdrop-blur-sm dark:border-white/10 dark:bg-slate-950">
              <Bug className="mb-2 h-7 w-7 text-blue-500" />
              <span className="text-3xl font-black leading-none text-slate-950 dark:text-slate-100">
                {formatCompactNumber(total)}
              </span>
              <span className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Total Bugs
              </span>
            </div>
          </div>

          <div className="grid gap-2">
            {rows.map((row) => (
              <div
                key={row.key}
                className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 rounded-2xl border border-white/70 bg-white/55 px-3 py-2.5 shadow-[0_14px_34px_-30px_rgba(15,23,42,0.55)] backdrop-blur-sm dark:border-white/10 dark:bg-white/5"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: row.color }} />
                  <span className={cn("truncate text-sm font-bold", row.tone)}>{row.key}</span>
                </span>
                <span className="text-sm font-black text-slate-700 dark:text-slate-200">
                  {row.count}
                </span>
                <span className="w-10 text-right text-xs font-bold text-slate-400">
                  {row.percentage}%
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <AnalyticsEmptyState
          icon={Bug}
          title="No bug priorities yet"
          description="Priority distribution appears once bugs are reported."
        />
      )}
    </AnalyticsPanel>
  );
};

const getEntityId = (value) => String(value?._id || value?.id || value || "");

const getConversationPeer = (conversation = {}, currentUserId = "") =>
  (conversation.participants || []).find(
    (participant) => getEntityId(participant) !== String(currentUserId)
  );

const getDashboardConversationName = (conversation = {}, currentUserId = "") => {
  if (conversation.type === "direct") {
    return getConversationPeer(conversation, currentUserId)?.name || "Direct message";
  }

  return conversation.name || conversation.projectId?.name || conversation.teamId?.name || "Group chat";
};

const getDashboardChatBadge = (conversation = {}) => {
  const text = `${conversation.lastMessage || ""} ${conversation.name || ""}`.toLowerCase();

  if (text.includes("qa") || text.includes("test")) return "QA Update";
  if (text.includes("fix") || text.includes("bug")) return "Bug Fix";
  if (text.includes("review") || text.includes("pr ")) return "Review";
  if (conversation.channelType === "project") return "Project";
  if (conversation.channelType === "team") return "Team";
  if (conversation.type === "direct") return "Direct";
  return "Admin";
};

const isQuickChatActionableText = (message = "") => {
  const text = String(message || "").trim().toLowerCase();

  if (!text) {
    return false;
  }

  return ![
    "scheduled a chat meeting",
    "updated a chat meeting",
    "cancelled a chat meeting",
    "joined the call",
    "left the call",
    "call ended",
    "missed call",
    "audio call ended",
    "video call ended",
    "ended the call",
    "started a call",
  ].some((systemText) => text.includes(systemText));
};

const formatQuickChatTime = (value) => {
  const date = value ? new Date(value) : null;

  if (!date || Number.isNaN(date.getTime())) {
    return "Just now";
  }

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));

  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  return formatDate(date);
};

const AdminQuickActionsCard = ({
  actions = [],
  quickChatItems = [],
  onlineUsers = [],
  currentUserId = "",
  onOpenChat,
  onSendReply,
}) => {
  const carouselRef = useRef(null);
  const replyInputRef = useRef(null);
  const [activeReplyId, setActiveReplyId] = useState("");
  const [replyText, setReplyText] = useState("");
  const [sendingReplyId, setSendingReplyId] = useState("");
  const [replyErrors, setReplyErrors] = useState({});
  const [handledConversationUntil, setHandledConversationUntil] = useState(() => new Map());
  const isHandledConversation = (item = {}) => {
    const conversationId = getEntityId(item.conversationId || item.conversation);
    const handledUntil = handledConversationUntil.get(conversationId);

    if (!handledUntil) {
      return false;
    }

    const latestTime = new Date(
      item.lastMessageAt || item.updatedAt || item.createdAt || 0
    ).getTime();

    return latestTime <= handledUntil;
  };
  const recentMessages = quickChatItems
    .filter((item) => item.messageId || item._id)
    .filter((item) => item.lastMessage || item.unreadCount)
    .filter((item) => !isHandledConversation(item))
    .slice(0, 8);
  const visibleUnreadCount = recentMessages.reduce(
    (total, item) => total + Number(item.unreadCount || 1),
    0
  );

  useEffect(() => {
    if (activeReplyId) {
      window.setTimeout(() => replyInputRef.current?.focus(), 40);
    }
  }, [activeReplyId]);

  const scrollCarousel = (direction) => {
    const target = carouselRef.current;

    if (!target) {
      return;
    }

    target.scrollBy({
      left: direction * Math.max(260, target.clientWidth * 0.72),
      behavior: "smooth",
    });
  };
  const openReplyComposer = (conversationId) => {
    setActiveReplyId(conversationId);
    setReplyText("");
    setReplyErrors({});
  };
  const closeReplyComposer = () => {
    setActiveReplyId("");
    setReplyText("");
    setReplyErrors({});
  };
  const submitReply = async (item) => {
    const conversationId = getEntityId(item.conversationId || item.conversation);
    const messageId = getEntityId(item.messageId || item._id);
    const text = replyText.trim();

    if (!conversationId || !messageId || !text || sendingReplyId) {
      return;
    }

    setSendingReplyId(conversationId);
    setReplyErrors((current) => ({ ...current, [conversationId]: "" }));

    const sentMessage = await onSendReply?.({ conversationId, messageId, message: text });

    if (sentMessage) {
      const handledThrough =
        new Date(sentMessage.createdAt || Date.now()).getTime() + 1000;
      setHandledConversationUntil((current) => {
        const next = new Map(current);
        next.set(conversationId, handledThrough);
        return next;
      });
      setActiveReplyId("");
      setReplyText("");
    } else {
      setReplyErrors((current) => ({
        ...current,
        [conversationId]: "Failed to send",
      }));
    }

    setSendingReplyId("");
  };

  return (
    <AnalyticsPanel
      className="[&>div:first-child]:p-3.5 [&>div:first-child_h2]:text-base [&>div:first-child_h2]:font-semibold [&>div:last-child]:space-y-3 [&>div:last-child]:p-3.5"
      title={
        <span className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-50 text-violet-700">
            <Zap className="h-3.5 w-3.5" />
          </span>
          Quick Actions
        </span>
      }
    >
      <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {actions.map((action) => {
          const Icon = action.icon;

          return (
            <button
              key={action.key}
              type="button"
              onClick={action.onClick}
              className="group flex min-w-[154px] items-center gap-2 rounded-xl border border-slate-200/70 bg-white/62 px-3 py-2 text-left shadow-[0_10px_24px_-24px_rgba(15,23,42,0.38)] transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:bg-white/92 hover:shadow-[0_14px_30px_-26px_rgba(37,99,235,0.38)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
            >
              <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition group-hover:scale-[1.02]", action.className)}>
                <Icon className="h-4 w-4" />
              </span>
              <span className={cn(
                "truncate text-xs font-medium text-slate-900 dark:text-slate-100",
                action.labelClassName
              )}>
                {action.title}
              </span>
            </button>
          );
        })}
      </div>

      <div className="rounded-[18px] border border-slate-200/70 bg-white/52 p-3 shadow-[0_12px_32px_-30px_rgba(15,23,42,0.36)] dark:border-white/10 dark:bg-white/5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-950 dark:text-slate-100">
                Quick Chat
              </h3>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-100 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Online
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              {visibleUnreadCount
                ? `${formatCompactNumber(visibleUnreadCount)} new messages`
                : recentMessages.length
                  ? `${formatCompactNumber(recentMessages.length)} messages need attention`
                  : "No messages need your attention"}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8 rounded-full bg-white/72"
              onClick={() => scrollCarousel(-1)}
              disabled={!recentMessages.length}
              aria-label="Previous messages"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8 rounded-full bg-white/72"
              onClick={() => scrollCarousel(1)}
              disabled={!recentMessages.length}
              aria-label="Next messages"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="group h-8 rounded-full px-2.5 text-xs font-medium text-blue-700"
              onClick={() => onOpenChat()}
            >
              View All Messages
              <ArrowRight className="ml-1 h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
            </Button>
          </div>
        </div>

        {recentMessages.length ? (
          <motion.div
            ref={carouselRef}
            layout
            className="mt-3 flex snap-x gap-2.5 overflow-x-auto scroll-smooth pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <AnimatePresence initial={false}>
            {recentMessages.map((item) => {
              const conversation = item.conversation || item;
              const conversationId = getEntityId(item.conversationId || conversation);
              const messageId = getEntityId(item.messageId || item._id);
              const title = getDashboardConversationName(conversation, currentUserId);
              const peer = getConversationPeer(conversation, currentUserId);
              const avatarUser = item.sender || (conversation.type === "direct" ? peer : conversation.createdBy);
              const isUnread = Number(item.unreadCount || 1) > 0;
              const isOnline =
                conversation.type === "direct" && onlineUsers.includes(getEntityId(peer));
              const isReplying = activeReplyId === conversationId;
              const isSending = sendingReplyId === conversationId;

              return (
                <motion.div
                  key={messageId}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.24, ease: "easeOut" }}
                  className={cn(
                    "group relative min-w-full snap-start rounded-2xl border bg-white/68 p-3 text-left shadow-[0_12px_28px_-26px_rgba(15,23,42,0.36)] transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:bg-white/94 sm:min-w-[calc(50%-0.3125rem)] lg:min-w-[calc(33.333%-0.4375rem)] 2xl:min-w-[calc(25%-0.5rem)]",
                    isUnread ? "border-blue-200/90" : "border-slate-200/70",
                    isReplying ? "border-violet-200 bg-white/95 shadow-[0_16px_34px_-28px_rgba(124,58,237,0.36)]" : ""
                  )}
                >
                  {isUnread ? (
                    <span className="absolute right-3 top-3 h-2 w-2 rounded-full bg-blue-500 shadow-[0_0_0_4px_rgba(59,130,246,0.12)]" />
                  ) : null}
                  <span className="flex items-start gap-2.5">
                    <span className="relative shrink-0">
                      <UserAvatar
                        user={avatarUser}
                        name={title}
                        className="h-9 w-9 rounded-xl border border-white/90 shadow-sm"
                        fallbackClassName="text-xs font-medium"
                      />
                      {isOnline ? (
                        <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500" />
                      ) : null}
                    </span>
                    <span className="min-w-0 flex-1 pr-2">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-sm font-semibold text-slate-950">
                          {title}
                        </span>
                        <span className="shrink-0 text-[11px] text-slate-400">
                          {formatQuickChatTime(item.lastMessageAt || item.updatedAt)}
                        </span>
                      </span>
                      <span className="mt-1 line-clamp-2 min-h-[32px] text-xs leading-4 text-slate-500">
                        {item.lastMessage || "No recent message"}
                      </span>
                    </span>
                  </span>
                  <span className="mt-2.5 flex items-center justify-between gap-2">
                    <Badge className="rounded-full border-blue-100 bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                      {getDashboardChatBadge(conversation)}
                    </Badge>
                    <button
                      type="button"
                      className="inline-flex items-center text-xs font-medium text-violet-700 transition group-hover:translate-x-0.5"
                      onClick={() => openReplyComposer(conversationId)}
                    >
                      Reply
                      <ArrowRight className="ml-1 h-3.5 w-3.5" />
                    </button>
                  </span>
                  <AnimatePresence initial={false}>
                    {isReplying ? (
                      <motion.div
                        layout
                        initial={{ opacity: 0, height: 0, y: -4 }}
                        animate={{ opacity: 1, height: "auto", y: 0 }}
                        exit={{ opacity: 0, height: 0, y: -4 }}
                        transition={{ duration: 0.24, ease: "easeOut" }}
                        className="mt-3 overflow-hidden"
                      >
                        <Textarea
                          ref={replyInputRef}
                          value={replyText}
                          onChange={(event) => setReplyText(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" && !event.shiftKey) {
                              event.preventDefault();
                              submitReply(item);
                            }
                          }}
                          placeholder="Type your reply..."
                          className="min-h-[68px] resize-none rounded-xl border-slate-200 bg-white/86 text-xs leading-5 shadow-inner focus-visible:ring-violet-500/25"
                          disabled={isSending}
                        />
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <span className="text-[11px] text-rose-500">
                            {replyErrors[conversationId] || ""}
                          </span>
                          <span className="flex items-center gap-2">
                            <Button
                              type="button"
                              variant="ghost"
                              className="h-7 rounded-full px-2.5 text-xs font-medium"
                              onClick={closeReplyComposer}
                              disabled={isSending}
                            >
                              Cancel
                            </Button>
                            <Button
                              type="button"
                              className="h-7 rounded-full px-3 text-xs font-medium"
                              onClick={() => submitReply(item)}
                              disabled={!replyText.trim() || isSending}
                            >
                              {isSending ? "Sending..." : "Send"}
                              <ArrowRight className="ml-1 h-3.5 w-3.5" />
                            </Button>
                          </span>
                        </div>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </motion.div>
              );
            })}
            </AnimatePresence>
          </motion.div>
        ) : (
          <AnalyticsEmptyState
            className="min-h-[124px] py-5"
            icon={CheckCircle2}
            title="You're all caught up"
            description="No messages need your attention."
          />
        )}
      </div>
    </AnalyticsPanel>
  );
};

const RecentCriticalBugs = ({ bugs, onOpen, onNavigate }) => (
  <AnalyticsPanel
    title="Recent Critical Bugs"
    description="Latest high-risk bug records."
    action={
      <Button variant="ghost" size="sm" className="h-8 text-xs font-bold" onClick={onNavigate}>
        View All Bugs
      </Button>
    }
  >
    {bugs.length ? (
      <div className="space-y-2">
        {bugs.map((bug) => {
          const status = normalizeBugStatusForIssue(bug);

          return (
            <button
              key={bug._id}
              type="button"
              onClick={() => onOpen(bug)}
              className="flex w-full items-center gap-3 rounded-lg border border-slate-100 bg-white/50 px-3 py-2 text-left transition-colors hover:bg-slate-50"
            >
              <span className="font-mono text-[11px] font-bold text-slate-500 shrink-0 w-24">
                {getIssueDisplayKey(bug)}
              </span>
              <span className="truncate text-[12px] font-bold text-slate-900 flex-1">
                {bug.title || "Untitled bug"}
              </span>
              <Badge variant={getIssuePriorityVariant(bug.priority)} className="h-5 px-1.5 text-[9px] font-bold uppercase tracking-wider">
                {bug.priority || "Medium"}
              </Badge>
              <Badge variant={getIssueStatusVariant(status)} className="h-5 px-1.5 text-[9px] font-bold uppercase tracking-wider">
                {getIssueStatusLabel(status)}
              </Badge>
            </button>
          );
        })}
      </div>
    ) : (
      <AnalyticsEmptyState
        icon={AlertTriangle}
        title="No critical bugs"
        description="High-risk bugs will appear here."
      />
    )}
  </AnalyticsPanel>
);

const TriageBoardWidget = ({ bugs, onOpen, onNavigate }) => {
  const shouldReduceMotion = useReducedMotion();
  const triageBugs = useMemo(() => {
    return bugs.filter(bug => {
      const status = normalizeBugStatusForIssue(bug);
      const developer = resolveBugDetails(bug)?.developerLead || bug?.assignee;
      return [ISSUE_STATUS.NEW, ISSUE_STATUS.TRIAGED, ISSUE_STATUS.OPEN].includes(status) || !developer;
    }).sort(
      (a, b) =>
        getBugSeverityRank(a) - getBugSeverityRank(b) ||
        new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );
  }, [bugs]);

  const metrics = useMemo(() => {
    const incoming = bugs.filter(b => [ISSUE_STATUS.NEW, ISSUE_STATUS.OPEN].includes(normalizeBugStatusForIssue(b))).length;
    const unassigned = bugs.filter(b => !(resolveBugDetails(b)?.developerLead || b?.assignee)).length;
    const awaitingReview = bugs.filter(b => normalizeBugStatusForIssue(b) === ISSUE_STATUS.TRIAGED).length;
    return { incoming, unassigned, awaitingReview };
  }, [bugs]);

  const displayBugs = triageBugs.slice(0, 6);
  const metricCards = [
    {
      key: "incoming",
      label: "Incoming",
      value: metrics.incoming,
      helper: "New bugs",
      className: "border-blue-100 bg-blue-50/55 text-blue-700",
      valueClassName: "text-blue-950",
    },
    {
      key: "unassigned",
      label: "Unassigned",
      value: metrics.unassigned,
      helper: "Need ownership",
      className: "border-amber-100 bg-amber-50/55 text-amber-700",
      valueClassName: "text-amber-950",
    },
    {
      key: "review",
      label: "Review",
      value: metrics.awaitingReview,
      helper: "Being triaged",
      className: "border-violet-100 bg-violet-50/55 text-violet-700",
      valueClassName: "text-violet-950",
    },
  ];

  return (
    <AnalyticsPanel
      className="h-full"
      title="Triage Board"
      description="Bugs requiring review and assignment."
      action={
        <Button variant="ghost" size="sm" className="h-8 text-xs font-bold" onClick={onNavigate}>
          Open Triage Board
        </Button>
      }
    >
      <motion.div
        className="space-y-3"
        initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, delay: 0.04, ease: "easeOut" }}
      >
        <div className="grid grid-cols-3 gap-2">
          {metricCards.map((metric) => (
            <div
              key={metric.key}
              className={cn("rounded-2xl border px-3 py-2.5 text-center shadow-[0_12px_30px_-28px_rgba(15,23,42,0.42)]", metric.className)}
            >
              <p className="text-[9px] font-black uppercase tracking-[0.16em]">{metric.label}</p>
              <p className={cn("mt-1 text-2xl font-black leading-none", metric.valueClassName)}>
                {formatCompactNumber(metric.value)}
              </p>
              <p className="mt-1 text-[11px] font-semibold text-slate-500">{metric.helper}</p>
            </div>
          ))}
        </div>

      <div className="space-y-2">
        {displayBugs.length ? displayBugs.map(bug => {
          const severity = getBugSeverity(bug);
          const severityVariant =
            ["Critical", "Blocker", "Urgent"].includes(severity)
              ? "danger"
              : ["High", "Major"].includes(severity)
                ? "warning"
                : "secondary";
          const description = bug.description || bug.title || "No description added.";
          const status = normalizeBugStatusForIssue(bug);

          return (
            <button
              key={bug._id}
              onClick={() => onOpen(bug)}
              className="group grid w-full grid-cols-[78px_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-slate-100/90 bg-white/56 px-3 py-2.5 text-left shadow-[0_12px_30px_-30px_rgba(15,23,42,0.36)] transition duration-200 hover:-translate-y-0.5 hover:border-blue-100 hover:bg-white/88 hover:shadow-[0_16px_38px_-32px_rgba(37,99,235,0.42)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
            >
              <span className="font-mono text-[11px] font-bold text-slate-500">{getIssueDisplayKey(bug)}</span>
              <span className="min-w-0">
                <span className="block truncate text-xs font-semibold text-slate-800">
                  {bug.title || "Untitled bug"}
                </span>
                <span className="mt-0.5 line-clamp-1 text-[11px] font-medium text-slate-500">
                  {description}
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                <Badge variant={severityVariant} className="h-5 px-1.5 text-[9px] font-bold uppercase tracking-wider">
                  {severity || "Medium"}
                </Badge>
                <Badge variant={getIssueStatusVariant(status)} className="h-5 px-1.5 text-[9px] font-bold uppercase tracking-wider">
                  {getIssueStatusLabel(status)}
                </Badge>
              </span>
            </button>
          );
        }) : (
          <AnalyticsEmptyState
            icon={CheckCircle2}
            title="All triaged"
            description="No bugs awaiting review."
            className="min-h-[140px] py-4"
          />
        )}
      </div>
      </motion.div>
    </AnalyticsPanel>
  );
};

const AdminGreetingCard = ({
  user,
  totalUsers = 0,
  totalProjects = 0,
  totalTeams = 0,
  onCreateProject,
  onManageUsers,
}) => {
  const reduceMotion = useReducedMotion();
  const currentHour = new Date().getHours();
  const greeting =
    currentHour < 12
      ? "Good morning"
      : currentHour < 17
        ? "Good afternoon"
        : "Good evening";
  const firstName = String(user?.name || user?.role || "Admin")
    .trim()
    .split(/\s+/)[0];
  const isManager = user?.role === ROLE_MANAGER;
  const roleLabel = isManager ? "Manager" : "Admin";
  const statCards = [
    {
      key: "users",
      label: "Users",
      value: totalUsers,
      icon: Users2,
      className: "bg-violet-50 text-violet-700",
    },
    {
      key: "projects",
      label: "Projects",
      value: totalProjects,
      icon: FolderKanban,
      className: "bg-blue-50 text-blue-700",
    },
    {
      key: "teams",
      label: "Teams",
      value: totalTeams,
      icon: Users2,
      className: "bg-emerald-50 text-emerald-700",
    },
  ];

  return (
    <motion.section
      initial={reduceMotion ? false : { opacity: 0, y: 14, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
      className="relative isolate overflow-hidden rounded-2xl border border-blue-100/80 bg-white/86 px-4 py-3 shadow-[0_18px_50px_-38px_rgba(37,99,235,0.58)] backdrop-blur-xl sm:px-5"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_8%_0%,rgba(99,102,241,0.13),transparent_32%),radial-gradient(circle_at_92%_0%,rgba(14,165,233,0.12),transparent_34%),linear-gradient(135deg,rgba(255,255,255,0.92),rgba(248,250,252,0.76))]" />

      <div className="relative flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <UserAvatar
            user={user}
            name={user?.name || roleLabel}
            className="h-12 w-12 shrink-0 border-2 border-white shadow-[0_14px_28px_-18px_rgba(15,23,42,0.48)]"
            imageClassName="object-cover"
            fallbackClassName="text-sm font-black"
          />
          <div className="hidden h-10 w-px bg-slate-200/80 sm:block" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-black tracking-tight text-slate-950 sm:text-2xl">
                {greeting},{" "}
                <span className="bg-gradient-to-r from-violet-700 to-blue-600 bg-clip-text text-transparent">
                  {firstName || roleLabel}
                </span>
              </h1>
              <span className="rounded-full border border-violet-100 bg-white/70 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.14em] text-violet-700">
                {roleLabel}
              </span>
            </div>
            <p className="mt-0.5 text-xs font-semibold text-slate-600 sm:text-sm">
              Manage your projects, teams and workspace from one place.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center xl:justify-end">
          <div className="grid gap-2 sm:grid-cols-3">
            {statCards.map((stat) => {
              const Icon = stat.icon;

              return (
                <div
                  key={stat.key}
                  className="flex min-w-[126px] items-center gap-2.5 rounded-xl border border-slate-200/75 bg-white/70 px-3 py-2 shadow-[0_12px_28px_-26px_rgba(15,23,42,0.42)] backdrop-blur-sm"
                >
                  <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", stat.className)}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span>
                    <span className="block text-lg font-black leading-none text-slate-950">
                      {formatCompactNumber(stat.value)}
                    </span>
                    <span className="mt-0.5 block text-[11px] font-bold text-slate-500">
                      {stat.label}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            className="h-10 rounded-xl bg-gradient-to-r from-violet-700 to-blue-600 px-4 text-xs font-bold text-white shadow-[0_16px_30px_-20px_rgba(79,70,229,0.88)] hover:from-violet-600 hover:to-blue-500"
            onClick={onCreateProject}
            type="button"
          >
            <Plus className="h-4 w-4" />
            Create Project
          </Button>
            <Button
              className="h-10 rounded-xl border-slate-200 bg-white/78 px-4 text-xs font-bold text-slate-900 shadow-[0_14px_28px_-24px_rgba(15,23,42,0.42)] hover:bg-white"
              onClick={onManageUsers}
              type="button"
              variant="outline"
            >
              Manage Users
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </motion.section>
  );
};

const DashboardLoading = () => (
  <div className="space-y-6">
    <Skeleton className="h-[120px] rounded-xl bg-slate-100/50" />
    <AnalyticsSkeletonGrid />
    <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
      <Skeleton className="h-[350px] rounded-xl" />
      <Skeleton className="h-[350px] rounded-xl" />
    </div>
  </div>
);

const DashboardPage = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [deliveryProjectId, setDeliveryProjectId] = useState("all");
  const [deliverySort, setDeliverySort] = useState("health-asc");
  const { user } = useAuth();
  const analytics = useAnalytics();
  const chatConversations = useChatStore((state) => state.conversations);
  const chatMessagesByConversation = useChatStore((state) => state.messagesByConversation);
  const chatOnlineUsers = useChatStore((state) => state.onlineUsers);
  const hasLoadedChatConversations = useChatStore(
    (state) => state.hasLoadedConversations
  );
  const loadChatConversations = useChatStore((state) => state.loadConversations);
  const sendChatMessage = useChatStore((state) => state.sendMessage);
  const setChatCurrentUserId = useChatStore((state) => state.setCurrentUserId);

  useEffect(() => {
    setChatCurrentUserId(getEntityId(user));
  }, [setChatCurrentUserId, user]);

  useEffect(() => {
    if (user?._id && !hasLoadedChatConversations) {
      loadChatConversations().catch(() => {});
    }
  }, [hasLoadedChatConversations, loadChatConversations, user?._id]);

  const {
    data: issuesData = [],
    isLoading: isIssuesLoading,
    error: issuesError,
  } = useQuery({
    queryKey: ["issues", "admin-dashboard-overview", { excludeType: ISSUE_TYPES.BUG }],
    queryFn: () => fetchIssues({ excludeType: ISSUE_TYPES.BUG }),
    staleTime: 0,
    refetchOnMount: "always",
  });
  const {
    data: bugsData = [],
    isLoading: isBugsLoading,
    error: bugsError,
  } = useQuery({
    queryKey: ["bugs", "admin-dashboard-overview"],
    queryFn: () => fetchBugs({ sortBy: "recently-updated" }),
  });
  const {
    data: usersData = [],
  } = useQuery({
    queryKey: ["managed-users", "admin-dashboard-overview"],
    queryFn: fetchManagedUsers,
  });
  const {
    data: allProjectsData = [],
    isLoading: isProjectsCountLoading,
  } = useQuery({
    queryKey: ["projects", "admin-dashboard-counts"],
    queryFn: fetchProjects,
  });
  const {
    data: allTeamsData = [],
    isLoading: isTeamsCountLoading,
  } = useQuery({
    queryKey: ["teams", "admin-dashboard-counts"],
    queryFn: () => fetchTeams(),
  });
  const {
    data: meetingsData = [],
  } = useQuery({
    queryKey: ["chat-meetings", "admin-dashboard-upcoming"],
    queryFn: () => fetchAllChatMeetings(),
    enabled: Boolean(user?._id),
  });
  const {
    data: activeQuickChatData = [],
  } = useQuery({
    queryKey: ["chat", "quick-chat", "active", user?._id],
    queryFn: fetchActiveQuickChatMessages,
    enabled: Boolean(user?._id),
    staleTime: 0,
    refetchOnMount: "always",
  });
  const issues = useMemo(
    () => (Array.isArray(issuesData) ? issuesData : []),
    [issuesData]
  );
  const taskIssues = useMemo(
    () => issues.filter((issue) => issue.type === ISSUE_TYPES.TASK),
    [issues]
  );
  const bugs = useMemo(() => (Array.isArray(bugsData) ? bugsData : []), [bugsData]);
  const meetings = useMemo(
    () => (Array.isArray(meetingsData) ? meetingsData : []),
    [meetingsData]
  );
  const users = useMemo(() => (Array.isArray(usersData) ? usersData : []), [usersData]);
  const userLookup = useMemo(() => {
    const byId = new Map();
    const byEmail = new Map();
    const byName = new Map();

    users.forEach((user) => {
      const id = String(user?._id || user?.id || "").trim();
      const email = String(user?.email || "").trim().toLowerCase();
      const name = String(user?.name || "").trim().toLowerCase();

      if (id) {
        byId.set(id, user);
      }
      if (email) {
        byEmail.set(email, user);
      }
      if (name) {
        byName.set(name, user);
      }
    });

    return { byId, byEmail, byName };
  }, [users]);
  const allProjects = useMemo(
    () => (Array.isArray(allProjectsData) ? allProjectsData : []),
    [allProjectsData]
  );
  const allTeams = useMemo(
    () => (Array.isArray(allTeamsData) ? allTeamsData : []),
    [allTeamsData]
  );
  const upcomingMeetings = useMemo(
    () =>
      meetings
        .filter((meeting) => getMeetingStatus(meeting) !== "completed")
        .sort(
          (left, right) =>
            new Date(left.startTime || left.createdAt || 0).getTime() -
            new Date(right.startTime || right.createdAt || 0).getTime()
        )
        .slice(0, 5),
    [meetings]
  );
  const taskStatusRows = useMemo(() => {
    const total = taskIssues.length;

    return TASK_STATUS_META.map((item) => {
      const count = taskIssues.filter((issue) => getTaskBoardStatus(issue) === item.key).length;

      return {
        ...item,
        count,
        percentage: total ? Math.round((count / total) * 100) : 0,
      };
    });
  }, [taskIssues]);
  const overdueTaskCount = useMemo(
    () => taskIssues.filter((issue) => isIssueOverdue(issue)).length,
    [taskIssues]
  );
  const now = useMemo(() => new Date(), []);
  const weekStart = useMemo(() => startOfWeek(now), [now]);
  const previousWeekStart = useMemo(() => {
    const value = new Date(weekStart);
    value.setDate(value.getDate() - 7);
    return value;
  }, [weekStart]);
  const todayStart = useMemo(() => startOfDay(now), [now]);
  const navigateToIssues = (params = {}) => {
    const searchParams = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
      if (value && value !== "all") {
        searchParams.set(key, value);
      }
    });

    navigate(`/issues${searchParams.toString() ? `?${searchParams}` : ""}`);
  };
  const navigateToBugs = (params = {}) => {
    const searchParams = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
      if (value && value !== "all") {
        searchParams.set(key, value);
      }
    });

    navigate(`/admin/bugs${searchParams.toString() ? `?${searchParams}` : ""}`);
  };
  const navigateToTasks = (params = {}) => {
    const searchParams = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
      if (value && value !== "all") {
        searchParams.set(key, value);
      }
    });

    navigate(`/tasks${searchParams.toString() ? `?${searchParams}` : ""}`);
  };
  const bugMetrics = useMemo(() => {
    const openBugs = bugs.filter(isOpenBug);
    const criticalBugs = bugs.filter(isCriticalBug);
    const resolvedBugs = bugs.filter(isResolvedBug);
    const reopenedBugs = bugs.filter(isReopenedBug);
    const bucketBugs = bugs.filter(isBugBucketItem);
    const assignedBugs = bugs.filter(
      (bug) => normalizeBugStatusForIssue(bug) === ISSUE_STATUS.ASSIGNED
    );
    const inProgressBugs = bugs.filter(
      (bug) => normalizeBugStatusForIssue(bug) === ISSUE_STATUS.IN_PROGRESS
    );
    const readyForQaBugs = bugs.filter((bug) =>
      [
        ISSUE_STATUS.READY_FOR_QA,
        ISSUE_STATUS.FIXED,
        ISSUE_STATUS.TESTING,
        ISSUE_STATUS.QA,
      ].includes(normalizeBugStatusForIssue(bug))
    );
    const qaReworkBugs = bugs.filter(
      (bug) =>
        normalizeBugStatusForIssue(bug) === ISSUE_STATUS.REJECTED ||
        normalizeBugStatusForIssue(bug) === ISSUE_STATUS.REOPEN
    );
    const closedBugs = bugs.filter(isClosedBug);
    const thisWeek = countBetween(bugs, (bug) => bug.createdAt, weekStart);
    const previousWeek = countBetween(bugs, (bug) => bug.createdAt, previousWeekStart, weekStart);
    const resolvedThisWeek = countBetween(
      resolvedBugs,
      (bug) => bug.updatedAt || bug.createdAt,
      weekStart
    );
    const resolvedLastWeek = countBetween(
      resolvedBugs,
      (bug) => bug.updatedAt || bug.createdAt,
      previousWeekStart,
      weekStart
    );
    const resolvedToday = countBetween(
      resolvedBugs,
      (bug) => bug.updatedAt || bug.createdAt,
      todayStart
    );

    return {
      total: bugs.length,
      open: openBugs.length,
      critical: criticalBugs.length,
      resolved: resolvedBugs.length,
      reopened: reopenedBugs.length,
      bucket: bucketBugs.length,
      assigned: assignedBugs.length,
      inProgress: inProgressBugs.length,
      readyForQa: readyForQaBugs.length,
      qaRework: qaReworkBugs.length,
      closed: closedBugs.length,
      thisWeek,
      previousWeek,
      resolvedThisWeek,
      resolvedLastWeek,
      resolvedToday,
    };
  }, [bugs, previousWeekStart, todayStart, weekStart]);
  const projectDeadlineRows = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const projectWorkItems = [...issues, ...bugs];

    return allProjects
      .map((project) => {
        const deadline = project.targetDate ? new Date(project.targetDate) : null;

        if (!deadline || Number.isNaN(deadline.getTime())) {
          return null;
        }

        const deadlineDay = new Date(deadline);
        deadlineDay.setHours(0, 0, 0, 0);

        if (deadlineDay < today) {
          return null;
        }

        const projectId = String(project?._id || project?.id || "");
        const items = projectWorkItems.filter(
          (item) => resolveIssueProjectId(item) === projectId
        );
        const completedItems = items.filter((item) =>
          item.type === ISSUE_TYPES.BUG
            ? isResolvedBug(item) || isClosedBug(item)
            : [ISSUE_STATUS.DONE, ISSUE_STATUS.CLOSED, ISSUE_STATUS.RESOLVED].includes(item.status)
        );
        const existingProgress = Number(
          project.progress ?? project.completionRate ?? project.deliveryProgress
        );
        const progress = items.length
          ? Math.round((completedItems.length / items.length) * 100)
          : Number.isFinite(existingProgress)
            ? Math.max(0, Math.min(100, Math.round(existingProgress)))
            : 0;
        const days = Math.ceil((deadlineDay.getTime() - today.getTime()) / 86400000);
        const status =
          progress >= 80
            ? "On Track"
            : days <= 7 && progress < 60
              ? "At Risk"
              : progress >= 55
                ? "Attention"
                : "At Risk";

        return {
          projectId,
          name: project.name || "Untitled project",
          deadline,
          deadlineLabel: formatDate(deadline),
          daysLabel: days === 0 ? "Due today" : days === 1 ? "1 day remaining" : `${days} days remaining`,
          progress,
          status,
        };
      })
      .filter(Boolean)
      .sort(
        (left, right) =>
          left.deadline.getTime() - right.deadline.getTime() ||
          left.progress - right.progress ||
          left.name.localeCompare(right.name)
      )
      .slice(0, 5);
  }, [allProjects, bugs, issues]);
  const bugContributionProjectOptions = useMemo(() => {
    const rowsByProject = new Map();

    allProjects.forEach((project) => {
      const projectId = String(project?._id || project?.id || project?.name || "").trim();

      if (!projectId) {
        return;
      }

      rowsByProject.set(projectId, {
        projectId,
        name: project.name || "Untitled project",
        total: 0,
      });
    });

    bugs.forEach((bug) => {
      const projectId = resolveIssueProjectId(bug) || getBugProjectName(bug);
      const row = rowsByProject.get(projectId) || {
        projectId,
        name: getBugProjectName(bug),
        total: 0,
      };

      row.total += 1;
      rowsByProject.set(projectId, row);
    });

    return Array.from(rowsByProject.values()).sort(
      (left, right) => right.total - left.total || left.name.localeCompare(right.name)
    );
  }, [allProjects, bugs]);
  const projectDeliveryRows = useMemo(() => {
    const rowsByProject = new Map();

    allProjects.forEach((project) => {
      const projectId = String(project?._id || project?.id || project?.name || "").trim();

      if (!projectId) {
        return;
      }

      rowsByProject.set(projectId, {
        projectId,
        name: project.name || "Untitled project",
        project,
        total: 0,
        open: 0,
        closed: 0,
        pendingQa: 0,
        critical: 0,
        gitActive: Boolean(
          project.latestGitActivity?.commitSha ||
            project.latestGitActivity?.pushedAt ||
            project.git?.status?.connectionStatus === "Connected"
        ),
      });
    });

    bugs.forEach((bug) => {
      const projectId = resolveIssueProjectId(bug) || getBugProjectName(bug);
      const row = rowsByProject.get(projectId) || {
        projectId,
        name: getBugProjectName(bug),
        project: null,
        total: 0,
        open: 0,
        closed: 0,
        pendingQa: 0,
        critical: 0,
        gitActive: false,
      };
      const status = normalizeBugStatusForIssue(bug);

      row.total += 1;
      row.closed += isResolvedBug(bug) || isClosedBug(bug) ? 1 : 0;
      row.open += isResolvedBug(bug) || isClosedBug(bug) ? 0 : 1;
      row.pendingQa += [
        ISSUE_STATUS.READY_FOR_QA,
        ISSUE_STATUS.FIXED,
        ISSUE_STATUS.TESTING,
        ISSUE_STATUS.QA,
      ].includes(status)
        ? 1
        : 0;
      row.critical += isCriticalBug(bug) ? 1 : 0;
      rowsByProject.set(projectId, row);
    });

    return Array.from(rowsByProject.values())
      .map((row) => {
        const health = row.total ? Math.round((row.closed / row.total) * 100) : 100;
        const openRate = row.total ? row.open / row.total : 0;
        const criticalRate = row.total ? row.critical / row.total : 0;
        const healthState =
          row.pendingQa > 0 && health >= 55
            ? "qa"
            : health >= 80 && row.critical === 0
              ? "healthy"
              : health < 45 || criticalRate >= 0.18 || openRate >= 0.55
                ? "critical"
                : "attention";

        return {
          ...row,
          health,
          healthState,
        };
      })
      .filter((row) => deliveryProjectId === "all" || row.projectId === deliveryProjectId)
      .sort((left, right) => {
        if (deliverySort === "open-desc") {
          return right.open - left.open || left.name.localeCompare(right.name);
        }

        if (deliverySort === "bugs-desc") {
          return right.total - left.total || left.name.localeCompare(right.name);
        }

        if (deliverySort === "qa-desc") {
          return right.pendingQa - left.pendingQa || left.name.localeCompare(right.name);
        }

        return left.health - right.health || right.open - left.open || left.name.localeCompare(right.name);
      })
      .slice(0, 6);
  }, [allProjects, bugs, deliveryProjectId, deliverySort]);
  const bugContributorRows = useMemo(() => {
    const buildContributorRows = (bugList) => {
      const rowsByContributor = new Map();

      bugList.forEach((bug) => {
        const assignee = getBugAssignee(bug);
        const rawId = String(assignee?._id || assignee?.id || "").trim();
        const rawEmail = String(assignee?.email || "").trim().toLowerCase();
        const rawName = String(assignee?.name || assignee?.fullName || "").trim();
        const matchedUser =
          (rawId && userLookup.byId.get(rawId)) ||
          (rawEmail && userLookup.byEmail.get(rawEmail)) ||
          (rawName && userLookup.byName.get(rawName.toLowerCase())) ||
          assignee ||
          null;
        const resolvedId = String(matchedUser?._id || matchedUser?.id || rawId).trim();
        const resolvedEmail = String(matchedUser?.email || rawEmail).trim().toLowerCase();
        const resolvedName = String(
          matchedUser?.name || matchedUser?.fullName || rawName || "Unassigned"
        ).trim();
        const rowKey = resolvedId || resolvedEmail || resolvedName.toLowerCase();

        if (!rowKey) {
          return;
        }

        const row = rowsByContributor.get(rowKey) || {
          userKey: rowKey,
          userId: resolvedId,
          name: resolvedName,
          open: 0,
          resolved: 0,
          critical: 0,
          total: 0,
          score: 0,
          user: matchedUser,
        };

        row.total += 1;
        row.open += isOpenBug(bug) ? 1 : 0;
        row.resolved += isResolvedBug(bug) ? 1 : 0;
        row.critical += isCriticalBug(bug) ? 1 : 0;
        row.score = row.open + row.resolved + row.critical;
        row.user = matchedUser || row.user;
        rowsByContributor.set(rowKey, row);
      });

      return Array.from(rowsByContributor.values())
        .filter((row) => row.name !== "Unassigned")
        .sort(
          (left, right) =>
            right.score - left.score ||
            right.resolved - left.resolved ||
            right.open - left.open ||
            left.name.localeCompare(right.name)
        );
    };

    const recentWindowStart = new Date();
    recentWindowStart.setDate(recentWindowStart.getDate() - 7);
    const historicalBugs = bugs.filter((bug) => {
      const activityDate = new Date(bug.updatedAt || bug.createdAt || 0);
      return activityDate < recentWindowStart;
    });
    const rows = buildContributorRows(bugs);
    const previousRankByContributor = new Map(
      buildContributorRows(historicalBugs).map((row, index) => [row.userKey, index + 1])
    );
    const totalScore = rows.reduce((sum, row) => sum + row.score, 0);

    return rows.slice(0, 6).map((row, index) => ({
      ...row,
      rank: index + 1,
      rankMovement: previousRankByContributor.has(row.userKey)
        ? previousRankByContributor.get(row.userKey) - (index + 1)
        : 0,
      shortName: row.name.split(" ")[0] || row.name,
      percent: totalScore ? Math.round((row.score / totalScore) * 100) : 0,
    }));
  }, [bugs, userLookup]);
  const totalBugContributorCount = useMemo(() => {
    const contributorKeys = new Set();

    bugs.forEach((bug) => {
      const assignee = getBugAssignee(bug);
      const key = String(
        assignee?._id ||
          assignee?.id ||
          assignee?.email ||
          assignee?.name ||
          assignee?.fullName ||
          ""
      ).trim();

      if (key && key !== "Unassigned") {
        contributorKeys.add(key);
      }
    });

    return contributorKeys.size;
  }, [bugs]);
  const priorityRows = useMemo(
    () =>
      BUG_PRIORITY_META.map((item) => {
        const count = bugs.filter((bug) => (bug.priority || "Medium") === item.key).length;

        return {
          ...item,
          count,
          percentage: bugMetrics.total ? Math.round((count / bugMetrics.total) * 100) : 0,
        };
      }),
    [bugMetrics.total, bugs]
  );
  const teamTaskRows = useMemo(() => {
    const rowsByTeam = new Map();

    taskIssues.forEach((issue) => {
      const teamId = resolveIssueTeamId(issue);
      const rowKey = teamId || "unassigned";
      const row = rowsByTeam.get(rowKey) || {
        teamId,
        name: issue.teamId?.name || "Unassigned tasks",
        total: 0,
        open: 0,
        inProgress: 0,
        done: 0,
        overdue: 0,
      };
      const status = getTaskBoardStatus(issue);

      row.total += 1;
      row.open += status === TASK_BOARD_STATUS.OPEN ? 1 : 0;
      row.inProgress += status === ISSUE_STATUS.IN_PROGRESS ? 1 : 0;
      row.done += status === ISSUE_STATUS.DONE ? 1 : 0;
      row.overdue += isIssueOverdue(issue) ? 1 : 0;
      row.completionRate = row.total ? Math.round((row.done / row.total) * 100) : 0;
      row.openRate = row.total ? Math.round(((row.open + row.inProgress) / row.total) * 100) : 0;
      rowsByTeam.set(rowKey, row);
    });

    return Array.from(rowsByTeam.values()).sort(
      (left, right) =>
        right.overdue - left.overdue ||
        right.open + right.inProgress - (left.open + left.inProgress) ||
        right.total - left.total
    );
  }, [taskIssues]);
  const qaBugRiskMetrics = useMemo(
    () => [
      {
        key: "pending-qa",
        label: "Pending QA",
        helper: "Awaiting verification",
        value: bugMetrics.readyForQa,
        barClassName: "bg-cyan-500",
        routeParams: { view: "readyqa" },
      },
      {
        key: "critical",
        label: "Critical Bugs",
        helper: "High-risk issues",
        value: bugMetrics.critical,
        barClassName: "bg-rose-500",
        routeParams: { filter: "critical" },
      },
      {
        key: "reopened",
        label: "Reopened",
        helper: "Returned by QA",
        value: bugMetrics.reopened,
        barClassName: "bg-amber-500",
        routeParams: { view: "reopen" },
      },
      {
        key: "qa-rework",
        label: "QA Rework",
        helper: "Needs retesting",
        value: bugMetrics.qaRework,
        barClassName: "bg-violet-500",
        routeParams: { status: ISSUE_STATUS.REJECTED },
      },
    ],
    [bugMetrics.critical, bugMetrics.qaRework, bugMetrics.readyForQa, bugMetrics.reopened]
  );
  const qaBugRiskLevel = useMemo(() => {
    const pressure = bugMetrics.readyForQa + bugMetrics.critical * 2 + bugMetrics.reopened + bugMetrics.qaRework;
    const pressureRate = bugMetrics.total ? pressure / bugMetrics.total : 0;

    if (bugMetrics.critical >= 10 || pressureRate >= 0.35) {
      return "high";
    }

    if (bugMetrics.critical > 0 || pressureRate >= 0.16) {
      return "moderate";
    }

    return "low";
  }, [bugMetrics.critical, bugMetrics.qaRework, bugMetrics.readyForQa, bugMetrics.reopened, bugMetrics.total]);
  const adminQuickActions = [
    {
      key: "create-project",
      title: "Create Project",
      icon: FolderKanban,
      className: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
      onClick: () => navigate("/projects"),
    },
    {
      key: "log-issue",
      title: "Log Issue",
      icon: Zap,
      className: "bg-orange-50 text-orange-600 dark:bg-orange-950/40 dark:text-orange-300",
      labelClassName: "text-orange-700 dark:text-orange-300",
      onClick: () => navigate("/issues?compose=1"),
    },
    {
      key: "invite-user",
      title: "Invite User",
      icon: UserPlus,
      className: "bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300",
      onClick: () => navigate("/settings/users?panel=invite"),
    },
    {
      key: "view-reports",
      title: "View Reports",
      icon: BarChart3,
      className: "bg-cyan-50 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300",
      onClick: () => navigate("/reports"),
    },
    {
      key: "team-activity",
      title: "Team Activity",
      icon: Activity,
      className: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
      onClick: () => navigate("/admin/team-activity"),
    },
    {
      key: "system-settings",
      title: "System Settings",
      icon: Settings,
      className: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
      onClick: () => navigate("/settings/users"),
    },
  ];
  const quickChatItems = useMemo(() => {
    const itemsByMessageId = new Map();
    const conversationsById = new Map(
      chatConversations.map((conversation) => [getEntityId(conversation), conversation])
    );
    const addItem = (item) => {
      const messageId = getEntityId(item.messageId || item._id);

      if (!messageId || itemsByMessageId.has(messageId)) {
        return;
      }

      itemsByMessageId.set(messageId, item);
    };

    (Array.isArray(activeQuickChatData) ? activeQuickChatData : []).forEach(addItem);

    Object.entries(chatMessagesByConversation || {}).forEach(([conversationId, messages]) => {
      const conversation = conversationsById.get(conversationId);

      if (
        !conversation ||
        conversation.isArchived ||
        !Number(conversation.unreadCount || 0) ||
        !Array.isArray(messages)
      ) {
        return;
      }

      const latestIncoming = [...messages]
        .filter((message) => {
          const senderId = getEntityId(message.senderId);
          const metadataType = String(message?.metadata?.type || "").trim().toLowerCase();
          const text = String(message.message || "").trim();
          const hasCurrentUserSeen = (message.seenBy || []).some(
            (entry) => getEntityId(entry.userId) === getEntityId(user)
          );

          return (
            senderId &&
            senderId !== getEntityId(user) &&
            !message.deleted &&
            !hasCurrentUserSeen &&
            (!metadataType || metadataType === "message") &&
            (isQuickChatActionableText(text) || (message.attachments || []).length)
          );
        })
        .sort(
          (left, right) =>
            new Date(right.createdAt || 0).getTime() -
            new Date(left.createdAt || 0).getTime()
        )[0];

      if (!latestIncoming) {
        return;
      }

      addItem({
        _id: getEntityId(latestIncoming),
        messageId: getEntityId(latestIncoming),
        conversationId,
        conversation,
        sender:
          typeof latestIncoming.senderId === "object" ? latestIncoming.senderId : null,
        lastMessage:
          latestIncoming.message ||
          ((latestIncoming.attachments || []).length ? "Attachment" : ""),
        lastMessageAt: latestIncoming.createdAt,
        createdAt: latestIncoming.createdAt,
        updatedAt: latestIncoming.updatedAt,
        unreadCount: conversation.unreadCount || 1,
      });
    });

    return Array.from(itemsByMessageId.values())
      .sort(
        (left, right) =>
          new Date(right.lastMessageAt || right.createdAt || 0).getTime() -
          new Date(left.lastMessageAt || left.createdAt || 0).getTime()
      )
      .slice(0, 12);
  }, [activeQuickChatData, chatConversations, chatMessagesByConversation, user]);
  const recentCriticalBugs = useMemo(
    () =>
      bugs
        .filter((bug) => isCriticalBug(bug) && !isClosedBug(bug))
        .sort(
          (left, right) =>
            new Date(right.updatedAt || right.createdAt || 0).getTime() -
            new Date(left.updatedAt || left.createdAt || 0).getTime()
        )
        .slice(0, 7),
    [bugs]
  );
  const bugStatusPanelRows = useMemo(
    () =>
      BUG_STATUS_PANEL_META.map((item) => ({
        ...item,
        count:
          item.key === "total"
            ? bugMetrics.total
            : item.key === "critical"
              ? bugMetrics.critical
              : bugMetrics[item.key] || 0,
      })),
    [bugMetrics]
  );
  if (analytics.isLoading || isIssuesLoading || isProjectsCountLoading || isTeamsCountLoading) {
    return <DashboardLoading />;
  }

  if (analytics.error || issuesError) {
    return (
      <Card className={ANALYTICS_PANEL_CLASS}>
        <CardContent className="p-6 text-sm text-rose-700">
          {analytics.error?.response?.data?.message ||
            issuesError?.response?.data?.message ||
            "Unable to load dashboard analytics right now."}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <AdminGreetingCard
        user={user}
        totalUsers={users.length}
        totalProjects={allProjects.length}
        totalTeams={allTeams.length}
        onCreateProject={() => navigate("/projects")}
        onManageUsers={() => navigate("/settings/users")}
      />

      <section>
        <AdminQuickActionsCard
          actions={adminQuickActions}
          quickChatItems={quickChatItems}
          onlineUsers={chatOnlineUsers}
          currentUserId={getEntityId(user)}
          onOpenChat={(conversationId = "") =>
            navigate(
              conversationId
                ? `/chat?conversation=${encodeURIComponent(conversationId)}`
                : "/chat"
            )
          }
          onSendReply={async ({ conversationId, messageId, message }) => {
            const sentMessage = await sendChatMessage({
              conversationId,
              message,
              currentUser: user,
            });

            if (!sentMessage) {
              return false;
            }

            await persistQuickChatHandled({
              conversationId,
              messageId,
              repliedWithMessageId: getEntityId(sentMessage),
            });
            queryClient.setQueryData(
              ["chat", "quick-chat", "active", user?._id],
              (current = []) =>
                (Array.isArray(current) ? current : []).filter(
                  (item) => getEntityId(item.messageId || item._id) !== messageId
                )
            );
            queryClient.invalidateQueries({
              queryKey: ["chat", "quick-chat", "active", user?._id],
            });
            return sentMessage;
          }}
        />
      </section>

      <ProjectOverviewDashboardPanel
        issues={[...issues, ...bugs]}
        onViewGitActivity={() => navigate("/projects")}
        projects={allProjects}
      />

      <section className="space-y-4">
        {bugsError ? (
          <Card className={ANALYTICS_PANEL_CLASS}>
            <CardContent className="p-6 text-sm text-rose-700">
              {bugsError.response?.data?.message || "Unable to load bug analytics."}
            </CardContent>
          </Card>
        ) : isBugsLoading ? (
          <AnalyticsSkeletonGrid />
        ) : (
          <>
            <div className="grid gap-5 lg:grid-cols-2">
              <TaskStatusDistributionPanel
                rows={taskStatusRows}
                total={taskIssues.length}
                overdue={overdueTaskCount}
                onOpen={navigateToTasks}
              />

              <TriageBoardWidget
                bugs={bugs}
                onOpen={(bug) => navigateToBugs({ bug: bug._id })}
                onNavigate={() => navigate("/admin/bugs")}
              />
            </div>

            <div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
                <h2 className="text-base font-bold text-slate-950 dark:text-slate-100 uppercase tracking-tight">
                  Bug Management Overview
                </h2>
                <Badge className="w-fit border-slate-100 bg-slate-50 text-slate-600 text-[10px] font-bold">
                  {bugMetrics.total} tracked bugs
                </Badge>
              </div>

              <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {bugStatusPanelRows.map((row) => (
                  <BugStatusMetricCard
                    key={row.key}
                    row={row}
                    onOpen={navigateToBugs}
                  />
                ))}
              </section>
            </div>

            <section className="grid items-stretch gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(280px,3fr)]">
              <ProjectDeliveryOverview
                projects={projectDeliveryRows}
                projectOptions={bugContributionProjectOptions}
                selectedProjectId={deliveryProjectId}
                sortBy={deliverySort}
                onProjectChange={setDeliveryProjectId}
                onSortChange={setDeliverySort}
                onOpen={(selectedProject) =>
                  navigate(`/projects?projectId=${encodeURIComponent(selectedProject.projectId)}`, {
                    state: { selectedProjectId: selectedProject.projectId },
                  })
                }
              />

              <TopContributors
                contributors={bugContributorRows}
                totalContributors={totalBugContributorCount}
                onOpen={(contributor) =>
                  navigateToBugs(
                    contributor.userId
                      ? { developerId: contributor.userId }
                      : { search: contributor.name }
                  )
                }
                onViewAll={() => navigateToBugs()}
              />
            </section>
          </>
        )}
      </section>

      <section>
        <RecentCriticalBugs
          bugs={recentCriticalBugs}
          onOpen={(bug) => navigateToBugs(getBugDetailRouteParams(bug))}
          onNavigate={() => navigateToBugs({ filter: "critical" })}
        />
      </section>

      <section className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(280px,3fr)]">
        <AnalyticsPanel
          className="[&>div:first-child]:gap-2 [&>div:first-child]:p-3 [&>div:first-child_h2]:text-[15px] [&>div:first-child_h2]:font-semibold [&>div:first-child_p]:text-xs [&>div:first-child_p]:leading-5 [&>div:last-child]:p-3"
          title="Team Task Workload"
          description="Current task pressure and completion across teams."
          action={
            teamTaskRows.length ? (
              <Badge className="border-white/60 bg-white/72 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                {taskIssues.length} tasks
              </Badge>
            ) : null
          }
        >
          {teamTaskRows.length ? (
            <div className="space-y-2">
              {teamTaskRows.slice(0, 6).map((row) => (
                <TeamTaskWorkloadCard
                  key={row.teamId || row.name}
                  row={row}
                  onOpen={navigateToIssues}
                />
              ))}
              {teamTaskRows.length > 6 ? (
                <Button
                  type="button"
                  variant="outline"
                  className="group h-8 w-full justify-between rounded-2xl bg-white/68 text-xs font-medium"
                  onClick={() => navigate("/teams")}
                >
                  View All Teams
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                </Button>
              ) : null}
            </div>
          ) : (
            <AnalyticsEmptyState
              icon={Users2}
              title="No team tasks yet"
              description="Team task workload appears once tasks are assigned."
            />
          )}
        </AnalyticsPanel>

        <QaBugRiskPanel
          metrics={qaBugRiskMetrics}
          riskLevel={qaBugRiskLevel}
          onOpen={navigateToBugs}
        />
      </section>

      <section className="grid items-stretch gap-5 lg:grid-cols-2">
        <UpcomingMeetingsPanel
          meetings={upcomingMeetings}
          onOpenCalendar={() =>
            navigate("/chat?module=meetings", {
              state: { activeModule: "meetings" },
            })
          }
          onOpenMeeting={(meeting) =>
            navigate(buildChatMeetingPath(meeting), {
              state: { activeModule: "meetings" },
            })
          }
        />

        <ProjectDeadlinesPanel
          deadlines={projectDeadlineRows}
          onOpenProjects={() => navigate("/projects")}
          onOpenProject={(project) =>
            navigate(`/projects?projectId=${encodeURIComponent(project.projectId)}`, {
              state: { selectedProjectId: project.projectId },
            })
          }
        />
      </section>
    </div>
  );
};

export default DashboardPage;
