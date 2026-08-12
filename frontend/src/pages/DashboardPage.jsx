import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bug,
  CheckCircle2,
  FolderKanban,
  Layers3,
  Plus,
  RefreshCcw,
  Settings,
  ShieldCheck,
  Sparkles,
  TimerReset,
  UserPlus,
  Users2,
  Zap,
} from "lucide-react";
import { fetchBugs, fetchIssues, fetchManagedUsers, fetchProjects, fetchTeams } from "@/lib/api";
import useAnalytics from "@/hooks/use-analytics";
import {
  ANALYTICS_PANEL_CLASS,
  ANALYTICS_SUBPANEL_CLASS,
  AnalyticsEmptyState,
  AnalyticsPanel,
  AnalyticsSkeletonGrid,
  formatCompactNumber,
} from "@/components/analytics/analytics-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import UserAvatar from "@/components/shared/UserAvatar";
import WeeklyTaskCompletionTrend from "@/components/dashboard/WeeklyTaskCompletionTrend";
import { ProjectOverviewDashboardPanel } from "@/components/delivery/ProjectDeliveryWorkflowPanel";
import { useAuth } from "@/hooks/use-auth";
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
import { cn, formatDateTime, getInitials } from "@/lib/utils";

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

const activityIcon = {
  created: Layers3,
  closed: CheckCircle2,
  assigned: Users2,
  critical: AlertTriangle,
};

const activityTone = {
  created: "border-blue-200 bg-blue-50 text-blue-700",
  closed: "border-emerald-200 bg-emerald-50 text-emerald-700",
  assigned: "border-violet-200 bg-violet-50 text-violet-700",
  critical: "border-rose-200 bg-rose-50 text-rose-700",
};

const BUG_PRIORITY_META = [
  { key: "Low", className: "bg-emerald-500", tone: "text-emerald-700", color: "#10B981" },
  { key: "Medium", className: "bg-amber-500", tone: "text-amber-700", color: "#F59E0B" },
  { key: "High", className: "bg-orange-500", tone: "text-orange-700", color: "#F97316" },
  { key: "Critical", className: "bg-rose-500", tone: "text-rose-700", color: "#F43F5E" },
];

const USER_ROLE_DISTRIBUTION_META = [
  { key: "Admin", label: "Admins", color: "#2563eb" },
  { key: "Manager", label: "Managers", color: "#0891b2" },
  { key: "Team Lead", label: "Team Leads", color: "#7c3aed" },
  { key: "Q/A Lead", label: "Q/A Leads", color: "#ec4899" },
  { key: "Developer", label: "Developers", color: "#10b981" },
  { key: "Tester", label: "Testers", color: "#f59e0b" },
];

const DASHBOARD_TALL_SCROLL_CLASS =
  "dashboard-scrollbar h-[calc(100svh-var(--app-navbar-height)-6.5rem)] min-h-[560px] space-y-3 overflow-y-scroll overscroll-auto pr-2 [scrollbar-gutter:stable]";

const DASHBOARD_SPLIT_PANEL_SCROLL_CLASS =
  "dashboard-scrollbar h-[620px] min-h-[620px] space-y-3 overflow-y-scroll overscroll-auto pr-2 [scrollbar-gutter:stable]";

const getScrollableAncestor = (element) => {
  let current = element?.parentElement || null;

  while (current) {
    const style = window.getComputedStyle(current);
    const canScrollY =
      /(auto|scroll|overlay)/.test(style.overflowY) &&
      current.scrollHeight > current.clientHeight + 1;

    if (canScrollY) {
      return current;
    }

    current = current.parentElement;
  }

  return null;
};

const forwardWheelToAncestor = (event) => {
  const container = event.currentTarget;

  if (!(container instanceof HTMLElement)) {
    return;
  }

  const maxScrollTop = container.scrollHeight - container.clientHeight;
  const direction = Math.sign(event.deltaY);
  const atTop = container.scrollTop <= 0;
  const atBottom = container.scrollTop >= maxScrollTop - 1;
  const cannotScroll = maxScrollTop <= 1;
  const shouldForward =
    cannotScroll || (direction < 0 && atTop) || (direction > 0 && atBottom);

  if (!shouldForward) {
    return;
  }

  const ancestor = getScrollableAncestor(container);

  if (ancestor) {
    event.preventDefault();
    ancestor.scrollTop += event.deltaY;
    return;
  }

  event.preventDefault();
  window.scrollBy({ top: event.deltaY, left: 0, behavior: "auto" });
};

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

const PROJECT_CONTRIBUTION_COLORS = [
  "#60A5FA",
  "#8B5CF6",
  "#22D3EE",
  "#38BDF8",
  "#6366F1",
  "#14B8A6",
];

const BUG_CONTRIBUTION_COLORS = [
  "#3B82F6",
  "#6366F1",
  "#14B8A6",
  "#FBBF24",
  "#8B5CF6",
  "#06B6D4",
];

const BUG_RESOLVED_STATUSES = [
  ISSUE_STATUS.FIXED,
  ISSUE_STATUS.QA,
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

const ProjectContributionPanel = ({ projects = [], total = 0, onOpen }) => {
  const chartRows = projects.map((project, index) => ({
    ...project,
    value: project.total,
    color: PROJECT_CONTRIBUTION_COLORS[index % PROJECT_CONTRIBUTION_COLORS.length],
  }));
  const totalContributions = total || chartRows.reduce((sum, project) => sum + project.total, 0);
  const pieSize = 280;

  return (
    <AnalyticsPanel
      title="Project Contribution"
      description="Track user contributions across multiple projects."
      action={
        projects.length ? (
          <Badge className="rounded-full border-slate-200/80 bg-white/62 px-3.5 py-1 text-xs font-bold text-slate-600 shadow-sm">
            {projects.length} projects
          </Badge>
        ) : null
      }
    >
      {projects.length ? (
        <div className="grid min-h-[340px] gap-5 lg:grid-cols-[0.92fr_1.08fr] lg:items-center">
          <div className="flex min-h-[280px] flex-col items-center justify-center">
            <div className="flex justify-center">
              <PieChart width={pieSize} height={pieSize}>
                <Pie
                  data={chartRows}
                  dataKey="value"
                  nameKey="name"
                  cx={pieSize / 2}
                  cy={pieSize / 2}
                  innerRadius={0}
                  outerRadius={118}
                  paddingAngle={2}
                  stroke="rgba(255,255,255,0.84)"
                  strokeWidth={2}
                >
                  {chartRows.map((entry) => (
                    <Cell key={entry.projectId || entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value, _name, item) => [
                    `${value} contributions`,
                    item?.payload?.name || "Project",
                  ]}
                  contentStyle={{
                    borderRadius: 18,
                    border: "1px solid rgba(226,232,240,0.86)",
                    boxShadow: "0 18px 40px -28px rgba(15,23,42,0.42)",
                  }}
                />
              </PieChart>
            </div>
            <p className="mt-2 text-center text-xs font-medium text-slate-500">
              Project contribution distribution across tracked bug work.
            </p>
          </div>

          <div className="grid gap-4">
            {chartRows.map((project) => {
              const percentage = totalContributions
                ? Math.round((project.total / totalContributions) * 100)
                : 0;

              return (
                <button
                  key={project.projectId || project.name}
                  type="button"
                  onClick={() => onOpen(project)}
                  className="grid w-full grid-cols-[minmax(0,1fr)_74px_56px] items-center gap-3 rounded-[24px] border border-white/70 bg-white/58 px-5 py-4 text-left shadow-[0_14px_34px_-30px_rgba(15,23,42,0.34)] backdrop-blur-sm transition hover:bg-white/82"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span
                      className="h-4 w-4 shrink-0 rounded-full"
                      style={{ backgroundColor: project.color }}
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-[17px] font-semibold text-slate-900">
                        {project.name}
                      </span>
                      <span className="block text-sm text-slate-500">
                        {project.open} open / {project.closed} closed
                      </span>
                    </span>
                  </span>
                  <span className="text-right text-[17px] font-semibold text-slate-800">
                    {project.total}
                  </span>
                  <span className="text-right text-sm font-semibold text-slate-400">
                    {percentage}%
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <AnalyticsEmptyState
          icon={FolderKanban}
          title="No project contribution data yet"
          description="Project contribution insights appear once bugs are linked."
        />
      )}
    </AnalyticsPanel>
  );
};

const BugContributionTracker = ({
  contributors = [],
  totalBugs = 0,
  projectOptions = [],
  selectedProjectId = "all",
  onProjectChange,
  onOpen,
}) => {
  const chartRows = contributors.map((contributor, index) => ({
    ...contributor,
    value: contributor.score,
    color: BUG_CONTRIBUTION_COLORS[index % BUG_CONTRIBUTION_COLORS.length],
  }));
  const pieSize = 260;

  return (
    <AnalyticsPanel
      title="Bug Contribution Tracker"
      description="Team member contributions to bugs, based on opened, resolved, and critical bugs."
      action={
        chartRows.length || projectOptions.length ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <select
              value={selectedProjectId}
              onChange={(event) => onProjectChange?.(event.target.value)}
              className="h-8 max-w-[190px] rounded-full border border-white/70 bg-white/78 px-3 text-sm font-medium text-slate-700 shadow-sm outline-none transition focus:border-blue-200 focus:ring-2 focus:ring-blue-500/20 dark:border-white/10 dark:bg-slate-950/70 dark:text-slate-100"
              aria-label="Filter bug contributions by project"
            >
              <option value="all">All projects</option>
              {projectOptions.map((project) => (
                <option key={project.projectId} value={project.projectId}>
                  {project.name}
                </option>
              ))}
            </select>
            <Badge className="rounded-full border-white/70 bg-white/72 px-3.5 py-1 text-sm font-semibold text-slate-600 shadow-sm">
              <Bug className="mr-1.5 h-3.5 w-3.5 text-orange-500" />
              {formatCompactNumber(totalBugs)} bugs
            </Badge>
          </div>
        ) : null
      }
    >
      {chartRows.length ? (
        <div className="grid gap-4 xl:grid-cols-[1.6fr_0.78fr]">
          <div className="grid gap-3">
            <div className="grid gap-3">
              {chartRows.map((contributor) => (
                <button
                  key={contributor.userKey}
                  type="button"
                  onClick={() => onOpen(contributor)}
                  className="group relative overflow-hidden rounded-[24px] border border-white/80 bg-white/72 px-4 py-3 text-left shadow-[0_18px_42px_-34px_rgba(56,189,248,0.42)] backdrop-blur-xl transition duration-300 hover:-translate-y-0.5 hover:border-sky-200/90 hover:bg-white/84"
                >
                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(255,255,255,0.96),transparent_34%),radial-gradient(circle_at_86%_14%,rgba(96,165,250,0.18),transparent_34%),radial-gradient(circle_at_50%_100%,rgba(34,211,238,0.18),transparent_42%)]" />
                  <div className="relative z-10 grid gap-3 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center">
                    <div className="flex items-start gap-3">
                      <div className="relative">
                        <UserAvatar
                          user={contributor.user}
                          name={contributor.name}
                          className="h-14 w-14 border-2 border-white/90 shadow-[0_16px_30px_-18px_rgba(15,23,42,0.28)]"
                          imageClassName="object-cover"
                          fallbackClassName="text-base font-semibold"
                        />
                        <span
                          className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white text-white shadow-sm"
                          style={{ backgroundColor: contributor.color }}
                        >
                          <Bug className="h-3.5 w-3.5" />
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-[22px] font-semibold tracking-tight text-slate-900">
                          {contributor.name}
                        </p>
                        <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.2em] text-slate-400">
                          Contribution score {contributor.score}
                        </p>
                      </div>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-3 md:grid-cols-3">
                      <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/70 bg-white/64 px-3 py-2 text-sm text-slate-700">
                        <span className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
                          Open
                        </span>
                        <span className="font-semibold text-slate-900">{contributor.open}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/70 bg-white/64 px-3 py-2 text-sm text-slate-700">
                        <span className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                          Resolved
                        </span>
                        <span className="font-semibold text-slate-900">{contributor.resolved}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/70 bg-white/64 px-3 py-2 text-sm text-slate-700">
                        <span className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
                          Critical
                        </span>
                        <span className="font-semibold text-slate-900">{contributor.critical}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between md:justify-end">
                      <div className="rounded-full border border-white/80 bg-white/75 px-3 py-1.5 text-right shadow-sm">
                        <p className="text-base font-semibold leading-none text-slate-900">
                          {contributor.percent}%
                        </p>
                        <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.16em] text-slate-500">
                          Share
                        </p>
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-[28px] border border-white/80 bg-[radial-gradient(circle_at_18%_0%,rgba(255,255,255,0.96),transparent_34%),radial-gradient(circle_at_100%_0%,rgba(56,189,248,0.16),transparent_32%),linear-gradient(180deg,rgba(255,255,255,0.84),rgba(240,249,255,0.9))] p-4 shadow-[0_22px_58px_-38px_rgba(56,189,248,0.4)] backdrop-blur-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xl font-semibold tracking-tight text-slate-900">
                  Bug Contributions %
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  Share of tracked bug work across the top contributors.
                </p>
              </div>
            </div>

            <div className="mt-3 flex justify-center">
              <PieChart width={pieSize} height={pieSize}>
                  <Pie
                    data={chartRows}
                    dataKey="value"
                    nameKey="name"
                    cx={pieSize / 2}
                    cy={pieSize / 2}
                    innerRadius={0}
                    outerRadius={110}
                    paddingAngle={2}
                    stroke="rgba(255,255,255,0.82)"
                    strokeWidth={2}
                    labelLine={false}
                  >
                    {chartRows.map((entry) => (
                      <Cell key={entry.userKey} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value, _name, item) => {
                      const contributor = item?.payload;

                      return [
                        `${contributor?.open || 0}/${contributor?.resolved || 0}/${contributor?.critical || 0}`,
                        `${contributor?.name || "Contributor"} (${contributor?.percent || 0}%)`,
                      ];
                    }}
                    contentStyle={{
                      borderRadius: 18,
                      border: "1px solid rgba(226,232,240,0.86)",
                      boxShadow: "0 18px 40px -28px rgba(15,23,42,0.42)",
                    }}
                  />
                </PieChart>
            </div>
            <p className="mt-3 text-center text-xs font-medium text-slate-500">
              Hover chart slices to see contributor names and bug counts.
            </p>
          </div>
        </div>
      ) : (
        <AnalyticsEmptyState
          icon={Users2}
          title="No bug contribution data yet"
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
  const fillPercent = Math.max(5, Math.min(100, row.completionRate || 0));

  return (
    <button
      type="button"
      onClick={() => onOpen(row.teamId ? { teamId: row.teamId } : {})}
      className="group relative min-h-[96px] w-full overflow-hidden rounded-[24px] border border-white/75 bg-white/58 px-5 py-3.5 text-left shadow-[0_18px_44px_-34px_rgba(79,70,229,0.55)] backdrop-blur-xl transition duration-300 hover:-translate-y-0.5 hover:border-violet-200/90 hover:bg-white/72 hover:shadow-[0_24px_58px_-36px_rgba(124,58,237,0.62)] dark:border-slate-800/70 dark:bg-slate-950/70"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(255,255,255,0.92),transparent_30%),radial-gradient(circle_at_84%_20%,rgba(147,197,253,0.25),transparent_36%),radial-gradient(circle_at_52%_92%,rgba(168,85,247,0.28),transparent_42%)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 overflow-hidden">
        <div
          className="absolute inset-x-0 bottom-0 h-full opacity-90 transition-all duration-700"
          style={{
            transform: `translateY(${100 - fillPercent}%)`,
            background:
              "linear-gradient(180deg, rgba(216,180,254,0.35) 0%, rgba(168,85,247,0.62) 48%, rgba(79,70,229,0.72) 100%)",
          }}
        />
        <div className="absolute -left-8 -right-8 top-0 h-5 bg-[radial-gradient(ellipse_at_20%_90%,rgba(255,255,255,0.82),transparent_38%),linear-gradient(90deg,rgba(196,181,253,0.58),rgba(125,211,252,0.42),rgba(168,85,247,0.5))] opacity-80 [clip-path:polygon(0_52%,12%_44%,26%_50%,42%_38%,58%_44%,74%_30%,88%_42%,100%_34%,100%_100%,0_100%)] transition-transform duration-700 group-hover:translate-x-2" />
      </div>

      <div className="relative z-10 grid grid-cols-[minmax(0,1fr)_88px] items-center gap-4">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold tracking-tight text-slate-800 dark:text-slate-100">
            {row.name}
          </p>
          <p className="mt-2 truncate text-[11px] font-medium uppercase tracking-[0.12em] text-slate-600 dark:text-slate-300">
            {row.open} OPEN - {row.inProgress} IN PROGRESS - {row.done} DONE
          </p>
        </div>
        <div className="relative flex h-[72px] w-[82px] shrink-0 flex-col items-center justify-center rounded-[26px] border border-white/80 bg-white/48 text-slate-700 shadow-[inset_0_1px_10px_rgba(255,255,255,0.78),0_12px_34px_-22px_rgba(99,102,241,0.72)] backdrop-blur-xl dark:border-white/10 dark:bg-white/10 dark:text-slate-100">
          <span className="text-[2rem] font-semibold leading-none">{row.total}</span>
          <span className="my-1 h-px w-11 bg-slate-300/80" />
          <span className="text-[15px] font-semibold leading-none">{row.completionRate}%</span>
        </div>
      </div>
    </button>
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

const UserDistributionCard = ({
  rows,
  total,
  isLoading,
  hasError,
  onManageUsers,
  onViewProjects,
  projectRows = [],
}) => {
  const [viewMode, setViewMode] = useState("role");
  let segmentStart = 0;
  const activeRows = rows.filter((row) => row.count > 0);
  const donutBackground = activeRows.length
    ? `conic-gradient(${activeRows
        .map((row) => {
          const segmentEnd = segmentStart + (row.count / total) * 360;
          const segment = `${row.color} ${segmentStart}deg ${segmentEnd}deg`;
          segmentStart = segmentEnd;
          return segment;
        })
        .join(", ")})`
    : "conic-gradient(#E2E8F0 0deg 360deg)";

  return (
    <AnalyticsPanel
      className="h-full"
      title="User Distribution"
      description="Workspace users grouped by active role and project."
      action={
        <Button variant="ghost" size="sm" className="group h-8 text-xs font-bold text-violet-700" onClick={() => onManageUsers()}>
          View all users
          <ArrowRight className="ml-1.5 h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
        </Button>
      }
    >
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-[180px_minmax(0,1fr)] md:items-center">
          <Skeleton className="mx-auto h-36 w-36 rounded-full" />
          <div className="space-y-2">
            {USER_ROLE_DISTRIBUTION_META.slice(0, 4).map((item) => (
              <Skeleton key={item.key} className="h-8 rounded-lg" />
            ))}
          </div>
        </div>
      ) : hasError ? (
        <AnalyticsEmptyState
          icon={Users2}
          title="Unable to load users"
          description="User distribution will appear once membership data is available."
        />
      ) : total ? (
        <div className="space-y-5">
          <div className="grid w-full max-w-sm grid-cols-2 overflow-hidden rounded-lg border border-slate-200/80 bg-slate-50/60 p-0.5 shadow-inner">
            {[
              { key: "role", label: "By Role" },
              { key: "project", label: "By Project" },
            ].map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setViewMode(item.key)}
                className={cn(
                  "rounded-md px-3 py-2 text-xs font-bold transition",
                  viewMode === item.key
                    ? "bg-white text-violet-700 shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                )}
              >
                {item.label}
              </button>
            ))}
          </div>

          {viewMode === "role" ? (
            <div className="grid gap-5 md:grid-cols-[220px_minmax(0,1fr)] md:items-center">
              <div
                className="relative mx-auto h-44 w-44 shrink-0 rounded-full shadow-[0_16px_34px_-22px_rgba(15,23,42,0.58)]"
                style={{ background: donutBackground }}
                role="img"
                aria-label={`${total} users distributed across ${activeRows.length} roles`}
              >
                <div className="absolute inset-[28px] flex flex-col items-center justify-center rounded-full border border-white/90 bg-white text-center shadow-inner dark:border-white/10 dark:bg-slate-950">
                  <span className="text-3xl font-black leading-none text-slate-950 dark:text-slate-100">
                    {formatCompactNumber(total)}
                  </span>
                  <span className="mt-1 text-[10px] font-black uppercase tracking-wider text-slate-500">
                    Total Users
                  </span>
                </div>
              </div>

              <div className="min-w-0 overflow-hidden rounded-2xl border border-slate-100/90 bg-white/46">
                <div className="grid grid-cols-[minmax(0,1fr)_70px_120px] gap-3 border-b border-slate-100 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                  <span>Role</span>
                  <span className="text-right">Users</span>
                  <span>Percentage</span>
                </div>
                {rows.map((row) => (
                  <button
                    key={row.key}
                    type="button"
                    onClick={() => onManageUsers(row.key)}
                    className="grid w-full grid-cols-[minmax(0,1fr)_70px_120px] items-center gap-3 border-b border-slate-100/80 px-3 py-2.5 text-left transition hover:bg-slate-50/80 last:border-b-0"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: row.color }} />
                      <span className="truncate text-xs font-bold text-slate-800 dark:text-slate-100">
                        {row.label}
                      </span>
                    </span>
                    <span className="text-right text-xs font-black text-slate-800 dark:text-slate-200">
                      {formatCompactNumber(row.count)}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="w-8 text-right text-[10px] font-bold text-slate-500">
                        {row.percentage}%
                      </span>
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                        <span
                          className="block h-full rounded-full"
                          style={{
                            width: `${Math.max(row.count ? 4 : 0, row.percentage)}%`,
                            backgroundColor: row.color,
                          }}
                        />
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-100/90 bg-white/46">
              <div className="grid grid-cols-[minmax(0,1fr)_90px_90px] gap-3 border-b border-slate-100 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                <span>Project</span>
                <span className="text-right">Members</span>
                <span className="text-right">Work</span>
              </div>
              {projectRows.length ? projectRows.map((project) => (
                <button
                  key={project.key}
                  type="button"
                  onClick={() => onViewProjects(project.projectId)}
                  className="grid w-full grid-cols-[minmax(0,1fr)_90px_90px] items-center gap-3 border-b border-slate-100/80 px-3 py-2.5 text-left transition hover:bg-slate-50/80 last:border-b-0"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-[10px] font-black text-blue-700">
                      {project.initials}
                    </span>
                    <span className="truncate text-xs font-bold text-slate-800">
                      {project.name}
                    </span>
                  </span>
                  <span className="text-right text-xs font-black text-slate-800">
                    {formatCompactNumber(project.members)}
                  </span>
                  <span className="text-right text-xs font-bold text-slate-500">
                    {formatCompactNumber(project.work)}
                  </span>
                </button>
              )) : (
                <div className="px-3 py-8 text-center text-sm font-medium text-slate-500">
                  Project membership appears once projects have assigned users.
                </div>
              )}
            </div>
          )}

          {projectRows.length ? (
            <div className="border-t border-slate-100 pt-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
                  User Distribution By Project
                </p>
                <Button variant="ghost" size="sm" className="h-7 text-xs font-bold text-violet-700" onClick={() => onViewProjects()}>
                  View all projects
                  <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {projectRows.slice(0, 4).map((project) => (
                  <button
                    key={`summary-${project.key}`}
                    type="button"
                    onClick={() => onViewProjects(project.projectId)}
                    className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-slate-100 bg-white/54 px-3 py-2 text-left transition hover:border-blue-100 hover:bg-white"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-bold text-slate-800">{project.name}</span>
                      <span className="text-[11px] font-medium text-slate-500">{formatCompactNumber(project.work)} tracked work items</span>
                    </span>
                    <span className="text-xs font-black text-slate-800">{formatCompactNumber(project.members)}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <AnalyticsEmptyState
          icon={Users2}
          title="No users yet"
          description="Invite workspace members to populate this chart."
        />
      )}
    </AnalyticsPanel>
  );
};

const AdminQuickActionsCard = ({ actions = [], stats = [] }) => (
  <AnalyticsPanel
    className="h-full"
    title={
      <span className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50 text-violet-700">
          <Zap className="h-4.5 w-4.5" />
        </span>
        Quick Actions
      </span>
    }
    description="Common actions to manage your workspace efficiently."
  >
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {actions.map((action) => {
        const Icon = action.icon;

        return (
          <button
            key={action.key}
            type="button"
            onClick={action.onClick}
            className="group flex min-h-[86px] items-center gap-4 rounded-2xl border border-slate-200/70 bg-white/58 px-4 py-3 text-left shadow-[0_14px_34px_-30px_rgba(15,23,42,0.38)] transition-all hover:-translate-y-0.5 hover:border-blue-200 hover:bg-white/92 hover:shadow-[0_18px_44px_-34px_rgba(37,99,235,0.46)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
          >
            <span className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl transition group-hover:scale-[1.03]", action.className)}>
              <Icon className="h-5 w-5" />
            </span>
            <span className={cn(
              "truncate text-sm font-bold text-slate-900 dark:text-slate-100",
              action.labelClassName
            )}>
              {action.title}
            </span>
          </button>
        );
      })}
    </div>
    <div className="mt-5 grid grid-cols-1 gap-4 border-t border-slate-200/70 pt-5 sm:grid-cols-2 dark:border-white/10">
      {stats.map((stat) => {
        const Icon = stat.icon;

        return (
          <button
            key={stat.key}
            type="button"
            onClick={stat.onClick}
            className="group flex min-w-0 items-center justify-between gap-4 rounded-2xl border border-slate-200/70 bg-white/58 px-4 py-4 text-left shadow-[0_14px_34px_-30px_rgba(15,23,42,0.38)] transition hover:-translate-y-0.5 hover:border-violet-200 hover:bg-white/90 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
          >
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
                <Icon className={cn("h-5 w-5", stat.iconClassName)} />
              </span>
              <span className="min-w-0">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  {stat.title}
                </span>
                <span className="block text-2xl font-black leading-tight text-slate-950 dark:text-slate-100">
                  {stat.value}
                </span>
                {stat.helper ? (
                  <span className="mt-1 block truncate text-xs font-semibold text-emerald-600">
                    {stat.helper}
                  </span>
                ) : null}
              </span>
            </span>
            <ArrowRight className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:translate-x-0.5" />
          </button>
        );
      })}
    </div>
  </AnalyticsPanel>
);

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
      className="relative isolate overflow-hidden rounded-[28px] border border-blue-100/80 bg-white/86 px-5 py-4 shadow-[0_24px_65px_-44px_rgba(37,99,235,0.58)] backdrop-blur-xl sm:px-6"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_8%_0%,rgba(99,102,241,0.13),transparent_32%),radial-gradient(circle_at_92%_0%,rgba(14,165,233,0.12),transparent_34%),linear-gradient(135deg,rgba(255,255,255,0.92),rgba(248,250,252,0.76))]" />

      <div className="relative flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-blue-600 text-white shadow-[0_18px_34px_-18px_rgba(79,70,229,0.9)]">
            <Sparkles className="h-7 w-7" />
          </div>
          <div className="hidden h-14 w-px bg-slate-200/80 sm:block" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
                {greeting},{" "}
                <span className="bg-gradient-to-r from-violet-700 to-blue-600 bg-clip-text text-transparent">
                  {firstName || roleLabel}
                </span>
              </h1>
              <span className="rounded-full border border-violet-100 bg-white/70 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-violet-700">
                {roleLabel}
              </span>
            </div>
            <p className="mt-1 text-sm font-semibold text-slate-600 sm:text-base">
              Manage your projects, teams and workspace from one place.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center xl:justify-end">
          <div className="grid gap-2 sm:grid-cols-3">
            {statCards.map((stat) => {
              const Icon = stat.icon;

              return (
                <div
                  key={stat.key}
                  className="flex min-w-[148px] items-center gap-3 rounded-2xl border border-slate-200/75 bg-white/70 px-3.5 py-2.5 shadow-[0_14px_34px_-30px_rgba(15,23,42,0.42)] backdrop-blur-sm"
                >
                  <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", stat.className)}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <span>
                    <span className="block text-xl font-black leading-none text-slate-950">
                      {formatCompactNumber(stat.value)}
                    </span>
                    <span className="mt-1 block text-xs font-bold text-slate-500">
                      {stat.label}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            className="h-12 rounded-xl bg-gradient-to-r from-violet-700 to-blue-600 px-5 text-sm font-bold text-white shadow-[0_18px_34px_-20px_rgba(79,70,229,0.88)] hover:from-violet-600 hover:to-blue-500"
            onClick={onCreateProject}
            type="button"
          >
            <Plus className="h-4.5 w-4.5" />
            Create Project
          </Button>
            <Button
              className="h-12 rounded-xl border-slate-200 bg-white/78 px-5 text-sm font-bold text-slate-900 shadow-[0_16px_34px_-26px_rgba(15,23,42,0.42)] hover:bg-white"
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
  const [bugContributionProjectId, setBugContributionProjectId] = useState("all");
  const { user } = useAuth();
  const analytics = useAnalytics();
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
    isLoading: isUsersLoading,
    error: usersError,
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
  const issues = useMemo(
    () => (Array.isArray(issuesData) ? issuesData : []),
    [issuesData]
  );
  const taskIssues = useMemo(
    () => issues.filter((issue) => issue.type === ISSUE_TYPES.TASK),
    [issues]
  );
  const bugs = useMemo(() => (Array.isArray(bugsData) ? bugsData : []), [bugsData]);
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
  const projects = analytics.projects?.projects || [];
  const teams = analytics.teams?.teams || [];
  const activity = analytics.recentActivity?.activity || [];
  const highestWorkloadTeam = teams[0] || null;
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
      closed: closedBugs.length,
      thisWeek,
      previousWeek,
      resolvedThisWeek,
      resolvedLastWeek,
      resolvedToday,
    };
  }, [bugs, previousWeekStart, todayStart, weekStart]);
  const bugContributionProjectOptions = useMemo(() => {
    const rowsByProject = new Map();

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
  }, [bugs]);
  const bugProjectRows = useMemo(() => {
    const rowsByProject = new Map();

    bugs.forEach((bug) => {
      const projectId = resolveIssueProjectId(bug) || getBugProjectName(bug);
      const row = rowsByProject.get(projectId) || {
        projectId,
        name: getBugProjectName(bug),
        total: 0,
        open: 0,
        closed: 0,
        critical: 0,
      };

      row.total += 1;
      row.open += isOpenBug(bug) ? 1 : 0;
      row.closed += BUG_CLOSED_STATUSES.includes(normalizeBugStatusForIssue(bug)) ? 1 : 0;
      row.critical += isCriticalBug(bug) ? 1 : 0;
      row.resolutionRate = row.total ? Math.round((row.closed / row.total) * 100) : 0;
      rowsByProject.set(projectId, row);
    });

    return Array.from(rowsByProject.values())
      .sort((left, right) => right.total - left.total)
      .slice(0, 6);
  }, [bugs]);
  const userProjectDistributionRows = useMemo(() => {
    const workByProject = new Map();

    [...issues, ...bugs].forEach((item) => {
      const projectId = resolveIssueProjectId(item);

      if (!projectId) {
        return;
      }

      workByProject.set(projectId, (workByProject.get(projectId) || 0) + 1);
    });

    return allProjects
      .map((project) => {
        const projectId = String(project?._id || project?.id || "");
        const memberKeys = new Set();
        const addMember = (member) => {
          const key = String(member?._id || member?.id || member?.userId || member?.email || member || "").trim();

          if (key) {
            memberKeys.add(key);
          }
        };

        (project?.members || []).forEach(addMember);
        (project?.projectMembers || []).forEach(addMember);
        addMember(project?.projectManager || project?.manager);
        addMember(project?.teamLead);
        (project?.teams || project?.assignedTeams || []).forEach((team) => {
          (team?.members || []).forEach(addMember);
        });

        const memberCount =
          memberKeys.size ||
          project?.memberCount ||
          project?.members?.length ||
          project?.projectMembers?.length ||
          0;
        const name = project?.name || "Untitled project";

        return {
          key: projectId || name,
          projectId,
          name,
          initials: getInitials(name).slice(0, 3),
          members: memberCount,
          work: workByProject.get(projectId) || 0,
        };
      })
      .filter((project) => project.members || project.work)
      .sort((left, right) => right.members - left.members || right.work - left.work || left.name.localeCompare(right.name))
      .slice(0, 6);
  }, [allProjects, bugs, issues]);
  const bugContributionBugs = useMemo(() => {
    if (bugContributionProjectId === "all") {
      return bugs;
    }

    return bugs.filter((bug) => {
      const projectId = resolveIssueProjectId(bug) || getBugProjectName(bug);

      return projectId === bugContributionProjectId;
    });
  }, [bugContributionProjectId, bugs]);
  const bugContributorRows = useMemo(() => {
    const rowsByContributor = new Map();

    bugContributionBugs.forEach((bug) => {
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

    const rows = Array.from(rowsByContributor.values())
      .filter((row) => row.name !== "Unassigned")
      .sort(
        (left, right) =>
          right.score - left.score ||
          right.resolved - left.resolved ||
          right.open - left.open ||
          left.name.localeCompare(right.name)
      )
      .slice(0, 6);
    const totalScore = rows.reduce((sum, row) => sum + row.score, 0);

    return rows.map((row) => ({
      ...row,
      shortName: row.name.split(" ")[0] || row.name,
      percent: totalScore ? Math.round((row.score / totalScore) * 100) : 0,
    }));
  }, [bugContributionBugs, userLookup]);
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
      };
      const status = getTaskBoardStatus(issue);

      row.total += 1;
      row.open += status === TASK_BOARD_STATUS.OPEN ? 1 : 0;
      row.inProgress += status === ISSUE_STATUS.IN_PROGRESS ? 1 : 0;
      row.done += status === ISSUE_STATUS.DONE ? 1 : 0;
      row.completionRate = row.total ? Math.round((row.done / row.total) * 100) : 0;
      rowsByTeam.set(rowKey, row);
    });

    return Array.from(rowsByTeam.values())
      .sort((left, right) => right.open - left.open || right.total - left.total)
      .slice(0, 6);
  }, [taskIssues]);
  const userDistributionRows = useMemo(() => {
    const total = users.length;

    return USER_ROLE_DISTRIBUTION_META.map((item) => {
      const count = users.filter((user) => user.role === item.key).length;

      return {
        ...item,
        count,
        percentage: total ? Math.round((count / total) * 100) : 0,
      };
    });
  }, [users]);
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
  const adminQuickStats = [
    {
      key: "projects",
      title: "Total Projects",
      value: formatCompactNumber(allProjects.length),
      helper: "Workspace projects",
      icon: FolderKanban,
      iconClassName: "text-blue-600",
      onClick: () => navigate("/projects"),
    },
    {
      key: "teams",
      title: "Total Teams",
      value: formatCompactNumber(allTeams.length),
      helper: `${formatCompactNumber(users.length)} users`,
      icon: Users2,
      iconClassName: "text-violet-600",
      onClick: () => navigate("/projects?tab=teams"),
    },
  ];
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

      <section className="grid gap-5 xl:grid-cols-2">
        <UserDistributionCard
          rows={userDistributionRows}
          total={users.length}
          isLoading={isUsersLoading}
          hasError={Boolean(usersError)}
          projectRows={userProjectDistributionRows}
          onManageUsers={(role) =>
            navigate(role ? `/settings/users?role=${encodeURIComponent(role)}` : "/settings/users")
          }
          onViewProjects={(projectId) =>
            navigate(projectId ? `/projects?project=${encodeURIComponent(projectId)}` : "/projects")
          }
        />
        <AdminQuickActionsCard actions={adminQuickActions} stats={adminQuickStats} />
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

            <section>
              <ProjectContributionPanel
                projects={bugProjectRows}
                total={bugMetrics.total}
                onOpen={(selectedProject) =>
                  navigateToBugs({
                    projectId:
                      selectedProject.projectId === selectedProject.name
                        ? ""
                        : selectedProject.projectId,
                    project:
                      selectedProject.projectId === selectedProject.name
                        ? selectedProject.name
                        : "",
                  })
                }
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

      <section>
        <BugContributionTracker
          contributors={bugContributorRows}
          totalBugs={bugContributionBugs.length}
          projectOptions={bugContributionProjectOptions}
          selectedProjectId={bugContributionProjectId}
          onProjectChange={setBugContributionProjectId}
          onOpen={(contributor) =>
            navigateToBugs(
              contributor.userId
                ? { developerId: contributor.userId }
                : { search: contributor.name }
            )
          }
        />
      </section>

      <section className="grid gap-5 xl:grid-cols-[1fr_1.12fr]">
        <AnalyticsPanel
          title="Team Task Workload"
          description="Compact active task pressure by team."
          action={
            teamTaskRows.length ? (
              <Badge className="border-white/60 bg-white/72 text-slate-600">
                {taskIssues.length} tasks
              </Badge>
            ) : null
          }
        >
          {teamTaskRows.length ? (
            <div
              className={DASHBOARD_SPLIT_PANEL_SCROLL_CLASS}
              onWheelCapture={forwardWheelToAncestor}
            >
              {teamTaskRows.map((row) => (
                <TeamTaskWorkloadCard
                  key={row.teamId || row.name}
                  row={row}
                  onOpen={navigateToIssues}
                />
              ))}
            </div>
          ) : (
            <AnalyticsEmptyState
              icon={Users2}
              title="No team tasks yet"
              description="Team task workload appears once tasks are assigned."
            />
          )}
        </AnalyticsPanel>

        <AnalyticsPanel
          title="Live Activity Feed"
          description="Recently created issues, resolved tickets, assignments, and critical alerts."
          className="scroll-mt-28"
          action={
            <Button
              type="button"
              variant="outline"
              className="rounded-full border-white/60 bg-white/72 text-slate-700 shadow-sm"
              onClick={() => navigate("/issues")}
            >
              View all
            </Button>
          }
        >
          <div
            id="dashboard-activity"
            className={DASHBOARD_SPLIT_PANEL_SCROLL_CLASS}
            onWheelCapture={forwardWheelToAncestor}
          >
            {activity.length ? (
              activity.slice(0, 8).map((item) => {
                const Icon = activityIcon[item.activityType] || Activity;

                return (
                  <button
                    key={`${item.activityType}-${item._id}`}
                    type="button"
                    onClick={() => navigateToIssues({ search: item.issueId })}
                    className={cn(
                      ANALYTICS_SUBPANEL_CLASS,
                      "flex w-full items-start gap-3 px-3 py-2 text-left"
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border shadow-sm",
                        activityTone[item.activityType] || activityTone.created
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-semibold text-slate-950 dark:text-slate-100">
                          {item.title}
                        </span>
                        <Badge variant={item.priority === "High" ? "danger" : "secondary"}>
                          {item.priority}
                        </Badge>
                      </span>
                      <span className="mt-1 block text-sm text-slate-500">
                        {item.activityLabel} in {item.project?.name || "Unknown project"}
                      </span>
                      <span className="mt-1 block text-xs text-slate-400">
                        {formatDateTime(item.activityAt)}
                      </span>
                    </span>
                    {item.assignee ? (
                      <span className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/76 text-xs font-semibold text-slate-600 shadow-sm sm:flex">
                        {getInitials(item.assignee.name)}
                      </span>
                    ) : null}
                  </button>
                );
              })
            ) : (
              <AnalyticsEmptyState
                icon={Activity}
                title="No live activity yet"
                description="Recent issue movement will appear here as work changes."
              />
            )}
          </div>
        </AnalyticsPanel>

        <AnalyticsPanel
          title="Active Workload"
          description="Team delivery pressure signals."
        >
          <div className="space-y-3">
            {highestWorkloadTeam ? (
              <div className={cn(ANALYTICS_SUBPANEL_CLASS, "p-3")}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-slate-950 dark:text-slate-100">
                      {highestWorkloadTeam.name}
                    </p>
                    <p className="mt-0.5 text-[10px] font-medium text-slate-500 uppercase">
                      Top Workload
                    </p>
                  </div>
                  <Badge className="h-5 px-1.5 text-[9px] font-bold border-cyan-100 bg-cyan-50 text-cyan-700">
                    {highestWorkloadTeam.productivity}% Eff
                  </Badge>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <div className="rounded-lg bg-slate-50 px-2 py-1.5 border border-slate-100/50 text-center">
                    <p className="text-[9px] font-bold text-slate-400 uppercase">Total</p>
                    <p className="text-sm font-bold">{highestWorkloadTeam.totalIssues}</p>
                  </div>
                  <div className="rounded-lg bg-amber-50 px-2 py-1.5 border border-amber-100/50 text-center">
                    <p className="text-[9px] font-bold text-amber-600 uppercase">Open</p>
                    <p className="text-sm font-bold text-amber-900">
                      {highestWorkloadTeam.pendingWorkload}
                    </p>
                  </div>
                  <div className="rounded-lg bg-emerald-50 px-2 py-1.5 border border-emerald-100/50 text-center">
                    <p className="text-[9px] font-bold text-emerald-600 uppercase">Done</p>
                    <p className="text-sm font-bold text-emerald-900">
                      {highestWorkloadTeam.closedIssues}
                    </p>
                  </div>
                </div>
              </div>
            ) : null}

            {teams.length ? (
              <div className="space-y-3">
                {teams.slice(0, 5).map((team) => (
                  <button
                    key={team.teamId}
                    type="button"
                    className={cn(
                      ANALYTICS_SUBPANEL_CLASS,
                      "flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
                    )}
                    onClick={() => navigateToIssues({ teamId: team.teamId })}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-slate-950">
                        {team.name}
                      </span>
                      <span className="mt-1 block text-xs text-slate-500">
                        {team.assignedIssues || 0} assigned - {team.pendingWorkload || 0} pending
                      </span>
                    </span>
                    <Badge className="border-cyan-200 bg-cyan-50 text-cyan-700">
                      {team.efficiency ?? team.productivity}% efficiency
                    </Badge>
                  </button>
                ))}
              </div>
            ) : (
              <AnalyticsEmptyState
                icon={Users2}
                title="No team workload yet"
                description="Team workload appears once issues are assigned to teams."
              />
            )}
          </div>
        </AnalyticsPanel>

        <WeeklyTaskCompletionTrend />
      </section>
    </div>
  );
};

export default DashboardPage;
