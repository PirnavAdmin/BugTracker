import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  Bug,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Eye,
  Filter,
  Layers3,
  ListChecks,
  MessageSquarePlus,
  MoreHorizontal,
  Paperclip,
  RefreshCcw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  TimerReset,
  UserPlus,
} from "lucide-react";
import {
  deleteIssue,
  fetchBugs,
  fetchEpics,
  fetchProjects,
  fetchSprints,
  updateIssue,
} from "@/lib/api";
import {
  BUG_SEVERITY_OPTIONS,
  ISSUE_STATUS,
  getCriticalIssues,
  getIssueDisplayKey,
  getIssuePriorityVariant,
  getIssueStatusLabel,
  getIssueStatusVariant,
  getReopenedIssues,
  normalizeIssueFilterAlias,
  normalizeBugStatusForIssue,
  resolveBugDetails,
  resolveIssueProjectId,
  resolveIssueTeamId,
} from "@/lib/issues";
import {
  findProjectById,
  getProjectMembers,
  getProjectTeamMembers,
  getProjectTeams,
  resolveTeamId,
  resolveUserId,
} from "@/lib/project-teams";
import { cn, formatDateTime, getInitials } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import IssueDetailsDialog from "@/components/issues/IssueDetailsDialog";
import EmptyState from "@/components/shared/EmptyState";
import ToastNotice from "@/components/shared/ToastNotice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

const ALL_PROJECTS_VALUE = "ALL";
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
const DEFAULT_PAGE_SIZE = 25;

const BUG_STATUS_FILTERS = [
  { value: "all", label: "All statuses" },
  { value: ISSUE_STATUS.NEW, label: "New" },
  { value: ISSUE_STATUS.OPEN, label: "Open" },
  { value: ISSUE_STATUS.ASSIGNED, label: "Assigned" },
  { value: ISSUE_STATUS.IN_PROGRESS, label: "In Progress" },
  { value: ISSUE_STATUS.READY_FOR_QA, label: "Ready for QA" },
  { value: ISSUE_STATUS.TESTING, label: "Testing" },
  { value: ISSUE_STATUS.FIXED, label: "Fixed" },
  { value: ISSUE_STATUS.REOPEN, label: "Reopened" },
  { value: ISSUE_STATUS.CLOSED, label: "Closed" },
  { value: ISSUE_STATUS.REJECTED, label: "Rejected" },
];

const normalizeStatusQueryValue = (value) => {
  const normalizedValue = String(value || "").trim().toLowerCase();

  if (!normalizedValue || normalizedValue === "all") {
    return { status: "all", lifecycle: "all" };
  }

  if (normalizedValue === "open") {
    return { status: "all", lifecycle: "open" };
  }

  if (normalizedValue === "resolved") {
    return { status: "all", lifecycle: "resolved" };
  }

  if (normalizedValue === "closed") {
    return { status: ISSUE_STATUS.CLOSED, lifecycle: "all" };
  }

  const status = Object.values(ISSUE_STATUS).find(
    (item) => item.toLowerCase() === normalizedValue
  );

  return { status: status || "all", lifecycle: "all" };
};

const normalizePriorityQueryValue = (value) => {
  const normalizedValue = String(value || "").trim().toLowerCase();
  const priority = ["Critical", "High", "Medium", "Low"].find(
    (item) => item.toLowerCase() === normalizedValue
  );

  return priority || "all";
};

const normalizeLifecycleQueryValue = (value) => {
  const normalizedValue = String(value || "").trim().toLowerCase();

  return ["open", "reopened", "fixed", "resolved"].includes(normalizedValue)
    ? normalizedValue
    : "all";
};

const getDashboardFilterQueryValue = (value) => {
  const filterAlias = normalizeIssueFilterAlias(value);

  return ["reopened", "critical"].includes(filterAlias) ? filterAlias : "all";
};

const getNestedUser = (value) => (value && typeof value === "object" ? value : null);
const getNamedFallbackUser = (name = "", fallback = null) =>
  name ? { ...(fallback || {}), name } : fallback;
const getReporter = (issue) =>
  getNamedFallbackUser(issue?.reporterName, getNestedUser(issue?.reporter));
const getTesterOwner = (issue) =>
  getNamedFallbackUser(
    issue?.testerOwnerName,
    getNestedUser(resolveBugDetails(issue)?.testerOwner)
  );
const getBugDeveloper = (issue) =>
  getNestedUser(resolveBugDetails(issue)?.developerLead) || getNestedUser(issue?.assignee);

const getProjectName = (issue, projects = []) => {
  const projectId = resolveIssueProjectId(issue);
  const project = projects.find((item) => String(item._id) === projectId);

  return issue?.projectId?.name || project?.name || "Unknown project";
};

const getTeamName = (issue) =>
  issue?.teamId?.name || "Unassigned team";

const getUserLabel = (user, fallback = "Unassigned") =>
  user?.name || user?.email || fallback;

const getSeverity = (issue) => resolveBugDetails(issue)?.severity || "Not set";

const getResolutionEta = (issue) => {
  const bugDetails = resolveBugDetails(issue);

  if (bugDetails.targetRelease) {
    return bugDetails.targetRelease;
  }

  if (issue.dueAt) {
    return formatDateTime(issue.dueAt, { hour: undefined, minute: undefined });
  }

  return "Not set";
};

const isReopenedBug = (issue) =>
  normalizeBugStatusForIssue(issue) === ISSUE_STATUS.REOPEN;

const isReadyForQa = (issue) =>
  [ISSUE_STATUS.READY_FOR_QA, ISSUE_STATUS.TESTING, ISSUE_STATUS.FIXED, ISSUE_STATUS.QA].includes(
    normalizeBugStatusForIssue(issue)
  );

const isClosedBug = (issue) =>
  [ISSUE_STATUS.CLOSED, ISSUE_STATUS.DONE, ISSUE_STATUS.REJECTED].includes(
    normalizeBugStatusForIssue(issue)
  );

const isInProgressBug = (issue) =>
  [ISSUE_STATUS.ASSIGNED, ISSUE_STATUS.IN_PROGRESS].includes(
    normalizeBugStatusForIssue(issue)
  );

const getReopenCount = (issue) => (isReopenedBug(issue) ? 1 : 0);

const getAvailableTeams = (projects = [], projectId = ALL_PROJECTS_VALUE) => {
  if (projectId !== ALL_PROJECTS_VALUE) {
    return getProjectTeams(findProjectById(projects, projectId));
  }

  const teamsById = new Map();

  projects.forEach((project) => {
    getProjectTeams(project).forEach((team) => {
      const teamId = resolveTeamId(team);

      if (teamId && !teamsById.has(teamId)) {
        teamsById.set(teamId, team);
      }
    });
  });

  return Array.from(teamsById.values()).sort((left, right) =>
    (left.name || "").localeCompare(right.name || "")
  );
};

const getAvailableMembers = (
  projects = [],
  projectId = ALL_PROJECTS_VALUE,
  teamId = "all"
) => {
  const membersById = new Map();
  const collectMembers = (members = []) => {
    members.forEach((member) => {
      const memberId = resolveUserId(member);

      if (memberId && !membersById.has(memberId)) {
        membersById.set(memberId, member);
      }
    });
  };

  if (projectId !== ALL_PROJECTS_VALUE) {
    const project = findProjectById(projects, projectId);
    collectMembers(
      teamId !== "all"
        ? getProjectTeamMembers(project, teamId)
        : getProjectMembers(project)
    );
  } else {
    projects.forEach((project) => collectMembers(getProjectMembers(project)));
  }

  return Array.from(membersById.values()).sort((left, right) =>
    (left.name || "").localeCompare(right.name || "")
  );
};

const CompactSelect = ({ className, ...props }) => (
  <select
    className={cn(
      "h-9 w-full rounded-[10px] border border-slate-200 bg-white px-3 text-[12px] font-medium text-slate-700 shadow-sm outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-500/20 disabled:bg-slate-50 disabled:text-slate-400",
      className
    )}
    {...props}
  />
);

const CompactInput = ({ className, ...props }) => (
  <Input
    className={cn(
      "h-9 rounded-[10px] border-slate-200 bg-white text-[12px] shadow-sm focus-visible:border-blue-300 focus-visible:ring-2 focus-visible:ring-blue-500/20",
      className
    )}
    {...props}
  />
);

const FieldLabel = ({ children }) => (
  <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
    {children}
  </span>
);

const SoftBadge = ({ children, className }) => (
  <span
    className={cn(
      "inline-flex h-6 items-center rounded-full border px-2 text-[11px] font-semibold leading-none",
      className
    )}
  >
    {children}
  </span>
);

const normalizePageSize = (value) => {
  const parsed = Number(value);
  return PAGE_SIZE_OPTIONS.includes(parsed) ? parsed : DEFAULT_PAGE_SIZE;
};

const normalizePageNumber = (value) => Math.max(1, Number(value) || 1);

const HighlightMatch = ({ value, query }) => {
  const text = String(value || "");
  const term = String(query || "").trim();

  if (!term) {
    return text;
  }

  const index = text.toLowerCase().indexOf(term.toLowerCase());

  if (index < 0) {
    return text;
  }

  return (
    <>
      {text.slice(0, index)}
      <mark className="rounded bg-amber-200/80 px-0.5 text-slate-950">
        {text.slice(index, index + term.length)}
      </mark>
      {text.slice(index + term.length)}
    </>
  );
};

const severityBadgeClassName = (severity) =>
  cn(
    "inline-flex h-5 max-w-full items-center rounded-full border px-2 text-[10px] font-bold uppercase leading-none",
    ["Blocker", "Critical"].includes(severity)
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : severity === "Major" || severity === "High"
        ? "border-orange-200 bg-orange-50 text-orange-700"
        : severity === "Medium"
          ? "border-amber-200 bg-amber-50 text-amber-800"
          : severity === "Low"
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : "border-slate-200 bg-slate-100 text-slate-700"
  );

const severityAccentClassName = (severity) => {
  if (["Blocker", "Critical"].includes(severity)) {
    return "border-l-rose-500";
  }

  if (severity === "Major" || severity === "High") {
    return "border-l-orange-500";
  }

  if (severity === "Medium") {
    return "border-l-amber-400";
  }

  if (severity === "Low") {
    return "border-l-emerald-500";
  }

  return "border-l-slate-300";
};

const priorityBadgeClassName = (priority) =>
  cn(
    "inline-flex h-5 items-center rounded-full border px-2 text-[10px] font-bold uppercase leading-none",
    priority === "Critical"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : priority === "High"
        ? "border-orange-200 bg-orange-50 text-orange-700"
        : priority === "Low"
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-blue-200 bg-blue-50 text-blue-700"
  );

const statusBadgeClassName = (status) => {
  const normalizedStatus = status === ISSUE_STATUS.QA ? ISSUE_STATUS.READY_FOR_QA : status;

  if (normalizedStatus === ISSUE_STATUS.NEW) {
    return "border-slate-200 bg-slate-100 text-slate-700";
  }

  if ([ISSUE_STATUS.OPEN, ISSUE_STATUS.ASSIGNED].includes(normalizedStatus)) {
    return "border-blue-200 bg-blue-50 text-blue-700";
  }

  if (normalizedStatus === ISSUE_STATUS.IN_PROGRESS) {
    return "border-violet-200 bg-violet-50 text-violet-700";
  }

  if ([ISSUE_STATUS.READY_FOR_QA, ISSUE_STATUS.TESTING, ISSUE_STATUS.FIXED].includes(normalizedStatus)) {
    return "border-orange-200 bg-orange-50 text-orange-700";
  }

  if ([ISSUE_STATUS.CLOSED, ISSUE_STATUS.DONE].includes(normalizedStatus)) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (normalizedStatus === ISSUE_STATUS.REOPEN) {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }

  return "border-slate-200 bg-slate-100 text-slate-700";
};

const ActionSelect = ({ className, ...props }) => (
  <select
    className={cn(
      "h-7 max-w-full rounded-md border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-600 shadow-sm outline-none transition hover:border-blue-200 focus:border-blue-300 focus:ring-2 focus:ring-blue-500/15 disabled:bg-slate-50 disabled:text-slate-400",
      className
    )}
    {...props}
  />
);

const getModuleTag = (issue) => {
  const details = resolveBugDetails(issue);
  const source = `${details?.category || ""} ${details?.affectedPlatform || ""} ${details?.moduleName || ""}`.toLowerCase();

  if (source.includes("api")) return "API";
  if (source.includes("backend")) return "Backend";
  if (source.includes("database")) return "DB";
  if (source.includes("mobile")) return "Mobile";
  if (source.includes("ui") || source.includes("login") || source.includes("page")) return "UI";

  return "Module";
};

const getAttachmentCount = (issue) => {
  const details = resolveBugDetails(issue);

  return [
    issue?.attachments,
    issue?.attachmentCount,
    details?.attachments,
    details?.attachmentCount,
  ].reduce((count, value) => {
    if (Array.isArray(value)) return Math.max(count, value.length);
    if (Number.isFinite(Number(value))) return Math.max(count, Number(value));
    return count;
  }, 0);
};

const getIssueCategory = (issue) => resolveBugDetails(issue)?.category || "General";

const quickFilterChips = [
  ["critical", "Critical"],
  ["unassigned", "Unassigned"],
  ["reopened", "Reopened"],
  ["mine", "My Team"],
  ["api", "API"],
  ["ui", "UI"],
  ["backend", "Backend"],
];

const BUG_CARD_VIEWS = [
  {
    id: "bucket",
    label: "Work Queue",
    description: "Unassigned bugs ready for pickup",
    icon: Layers3,
    metricKey: "bucket",
    tone: "bg-cyan-50 text-cyan-700",
  },
  {
    id: "assigned",
    label: "Assigned Bugs",
    description: "Bugs assigned but not started",
    icon: UserPlus,
    metricKey: "assigned",
    tone: "bg-blue-50 text-blue-700",
  },
  {
    id: "closed",
    label: "Closed Bugs",
    description: "Completed bug work",
    icon: CheckCircle2,
    metricKey: "closed",
    tone: "bg-emerald-50 text-emerald-700",
  },
  {
    id: "inprogress",
    label: "In Progress",
    description: "Bugs actively being fixed",
    icon: TimerReset,
    metricKey: "inProgress",
    tone: "bg-indigo-50 text-indigo-700",
  },
  {
    id: "readyqa",
    label: "Ready For QA",
    description: "Waiting for tester verification",
    icon: ShieldCheck,
    metricKey: "readyForQa",
    tone: "bg-cyan-50 text-cyan-700",
  },
  {
    id: "reopen",
    label: "Reopen",
    description: "Bugs returned after QA",
    icon: RefreshCcw,
    metricKey: "reopened",
    tone: "bg-pink-50 text-pink-700",
  },
];

const TOTAL_BUGS_VIEW = {
  id: "total",
  label: "Total Bugs",
  description: "All bugs across every status",
  icon: Bug,
  metricKey: "total",
  tone: "bg-slate-100 text-slate-700",
};

const getBugCardView = (value) =>
  [...BUG_CARD_VIEWS, TOTAL_BUGS_VIEW].find(
    (view) => view.id === String(value || "").trim().toLowerCase()
  ) ||
  BUG_CARD_VIEWS[0];

const getCardViewFilterState = (viewId) => {
  const view = getBugCardView(viewId);
  const baseFilters = {
    bucket: "all",
    filter: "all",
    lifecycle: "all",
    status: "all",
    developerId: "all",
  };

  if (view.id === "bucket") {
    return {
      ...baseFilters,
      bucket: "available",
    };
  }

  if (view.id === "assigned") {
    return {
      ...baseFilters,
      status: ISSUE_STATUS.ASSIGNED,
    };
  }

  if (view.id === "closed") {
    return {
      ...baseFilters,
      status: ISSUE_STATUS.CLOSED,
    };
  }

  if (view.id === "inprogress") {
    return {
      ...baseFilters,
      status: ISSUE_STATUS.IN_PROGRESS,
    };
  }

  if (view.id === "readyqa") {
    return {
      ...baseFilters,
      lifecycle: "fixed",
    };
  }

  if (view.id === "reopen") {
    return {
      ...baseFilters,
      filter: "reopened",
      lifecycle: "reopened",
    };
  }

  return baseFilters;
};

const TRIAGE_ACTION_MENU_WIDTH = 248;
const TRIAGE_ACTION_MENU_HEIGHT = 286;
const TRIAGE_ACTION_MENU_GUTTER = 12;

const getTriageActionMenuPosition = (triggerRect) => {
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  const maxLeft = viewportWidth - TRIAGE_ACTION_MENU_WIDTH - TRIAGE_ACTION_MENU_GUTTER;
  const maxTop = viewportHeight - TRIAGE_ACTION_MENU_HEIGHT - TRIAGE_ACTION_MENU_GUTTER;
  let left = triggerRect.right - TRIAGE_ACTION_MENU_WIDTH;
  let top = triggerRect.bottom + 8;

  if (left < TRIAGE_ACTION_MENU_GUTTER) {
    left = triggerRect.left;
  }

  if (top + TRIAGE_ACTION_MENU_HEIGHT > viewportHeight - TRIAGE_ACTION_MENU_GUTTER) {
    top = triggerRect.top - TRIAGE_ACTION_MENU_HEIGHT - 8;
  }

  return {
    left: Math.max(TRIAGE_ACTION_MENU_GUTTER, Math.min(left, maxLeft)),
    top: Math.max(TRIAGE_ACTION_MENU_GUTTER, Math.min(top, maxTop)),
  };
};

const MetricTile = ({ active = false, icon: Icon, label, tone, value, onClick }) => {
  const Component = onClick ? "button" : "div";

  return (
    <Component
      className={cn(
        "group flex min-h-[64px] w-full items-center justify-between gap-3 rounded-xl border border-l-4 border-slate-200 bg-white px-3 py-2.5 text-left shadow-sm transition duration-150 hover:-translate-y-px hover:border-blue-200 hover:bg-blue-50/30 hover:shadow-md",
        onClick && "cursor-pointer",
        active && "border-blue-200 border-l-blue-500 bg-blue-50/40"
      )}
      type={onClick ? "button" : undefined}
      onClick={onClick}
    >
      <div className="min-w-0">
        <p className="truncate text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
          {label}
        </p>
        <p className="mt-1 text-2xl font-semibold leading-none text-slate-950">{value}</p>
      </div>
      <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", tone)}>
        <Icon className="h-4 w-4" />
      </span>
    </Component>
  );
};

const DistributionPanel = ({ title, rows }) => {
  const maxCount = Math.max(...rows.map((row) => row.count), 1);

  return (
    <Card className="overflow-hidden rounded-[14px] border-white/70 bg-white/82 shadow-[0_14px_34px_-26px_rgba(15,23,42,0.28)] backdrop-blur-xl">
      <CardHeader className="border-b border-slate-200/70 px-3.5 py-2.5">
        <CardTitle className="text-[13px]">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2.5 p-3.5">
        {rows.length ? (
          rows.map((row) => (
            <div key={row.label} className="space-y-1">
              <div className="flex items-center justify-between gap-3 text-[11px] font-semibold text-slate-500">
                <span className="truncate">{row.label}</span>
                <span>{row.count}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-200/80">
                <div
                  className={cn("h-full rounded-full", row.className || "bg-blue-500")}
                  style={{ width: `${Math.max((row.count / maxCount) * 100, 6)}%` }}
                />
              </div>
            </div>
          ))
        ) : (
          <p className="text-[12px] text-slate-500">No data yet.</p>
        )}
      </CardContent>
    </Card>
  );
};

const BugResultRow = ({ bugIssue, projects, onOpen, onActionMenu }) => {
  const reporter = getReporter(bugIssue);
  const reporterName = getUserLabel(reporter, "Unknown tester");
  const developer = getBugDeveloper(bugIssue);
  const developerName = getUserLabel(developer);
  const status = normalizeBugStatusForIssue(bugIssue);
  const details = resolveBugDetails(bugIssue);
  const severity = getSeverity(bugIssue);
  const moduleTag = getModuleTag(bugIssue);
  const attachmentCount = getAttachmentCount(bugIssue);

  return (
    <article
      className={cn(
        "group relative grid gap-3 rounded-xl border border-l-4 border-slate-200 bg-white px-3 py-2.5 shadow-sm transition hover:border-blue-200 hover:bg-blue-50/30 md:grid-cols-[minmax(260px,1.25fr)_minmax(170px,0.7fr)_minmax(150px,0.62fr)_minmax(150px,0.62fr)_minmax(150px,0.7fr)_120px_82px] md:items-center",
        severityAccentClassName(severity)
      )}
    >
      <button className="min-w-0 text-left" type="button" onClick={() => onOpen(bugIssue)}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-slate-600">
            {getIssueDisplayKey(bugIssue)}
          </span>
          <span className={cn("inline-flex h-5 items-center rounded-full border px-2 text-[10px] font-bold uppercase leading-none", statusBadgeClassName(status))}>
            {status === ISSUE_STATUS.QA ? "Ready for QA" : getIssueStatusLabel(status)}
          </span>
        </div>
        <h3 className="mt-1 truncate text-sm font-semibold text-slate-950 group-hover:text-blue-700">
          {bugIssue.title || "Untitled bug"}
        </h3>
        <p className="mt-0.5 truncate text-[11px] font-medium text-slate-500">
          {getProjectName(bugIssue, projects)} / {details.moduleName || "Unmapped module"}
        </p>
      </button>

      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-1.5">
          <p className="truncate text-xs font-semibold text-slate-800">{details.moduleName || "Unmapped"}</p>
          <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[9px] font-bold uppercase text-slate-600">{moduleTag}</span>
        </div>
        <p className="mt-0.5 truncate text-[11px] font-medium text-slate-500">{getIssueCategory(bugIssue)}</p>
      </div>

      <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-700">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-[10px] text-white">{getInitials(reporterName)}</span>
        <span className="truncate">{reporterName}</span>
      </span>

      <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-700">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[10px] text-white">{getInitials(developerName)}</span>
        <span className="truncate">{developerName}</span>
      </span>

      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <span className={severityBadgeClassName(severity)}>{severity}</span>
        <span className={priorityBadgeClassName(bugIssue.priority || "Medium")}>{bugIssue.priority || "Medium"}</span>
        {isReopenedBug(bugIssue) ? (
          <span className="inline-flex h-5 items-center rounded-full border border-rose-200 bg-rose-50 px-2 text-[10px] font-bold uppercase text-rose-700">Reopened</span>
        ) : null}
      </div>

      <div className="min-w-0 text-[11px] font-medium text-slate-600">
        <span className="block truncate">{formatDateTime(bugIssue.updatedAt || bugIssue.createdAt)}</span>
        {attachmentCount ? (
          <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold text-slate-500">
            <Paperclip className="h-3 w-3" />
            {attachmentCount}
          </span>
        ) : null}
      </div>

      <div className="relative flex items-center justify-end gap-1">
        <Button
          className="h-8 w-8 rounded-lg p-0"
          type="button"
          size="icon"
          variant="outline"
          onClick={() => onOpen(bugIssue)}
          aria-label="View bug"
        >
          <Eye className="h-4 w-4" />
        </Button>
        <Button
          data-triage-action-trigger
          className="h-8 w-8 rounded-lg p-0"
          type="button"
          size="icon"
          variant="outline"
          onClick={(event) => onActionMenu(event, bugIssue._id)}
          aria-label="More actions"
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </div>
    </article>
  );
};

const AdminBugsPage = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchParamString = searchParams.toString();
  const [toast, setToast] = useState(null);
  const initialStatusQuery = normalizeStatusQueryValue(searchParams.get("status"));
  const initialDashboardFilter = getDashboardFilterQueryValue(
    searchParams.get("filter") || searchParams.get("status")
  );
  const initialCardView = searchParams.get("view")
    ? getBugCardView(searchParams.get("view")).id
    : searchParams.get("status") || searchParams.get("filter") || searchParams.get("lifecycle")
      ? ""
      : getBugCardView().id;
  const initialCardFilters = initialCardView
    ? getCardViewFilterState(initialCardView)
    : null;
  const [selectedBug, setSelectedBug] = useState(null);
  const [selectedTriageIds, setSelectedTriageIds] = useState([]);
  const [bulkPriority, setBulkPriority] = useState("");
  const [bulkDeveloperId, setBulkDeveloperId] = useState("");
  const [actionMenu, setActionMenu] = useState(null);
  const [areTriageFiltersOpen, setAreTriageFiltersOpen] = useState(false);
  const [areFiltersOpen, setAreFiltersOpen] = useState(false);
  const [activeCardView, setActiveCardView] = useState(initialCardView);
  const [page, setPage] = useState(normalizePageNumber(searchParams.get("page")));
  const [triagePage, setTriagePage] = useState(1);
  const [pageSize, setPageSize] = useState(normalizePageSize(searchParams.get("pageSize")));
  const [sortBy, setSortBy] = useState(searchParams.get("sortBy") || "updated:desc");
  const [filters, setFilters] = useState({
    projectId: searchParams.get("projectId") || ALL_PROJECTS_VALUE,
    teamId: searchParams.get("teamId") || "all",
    testerId: searchParams.get("testerId") || "all",
    developerId: searchParams.get("developerId") || "all",
    severity: searchParams.get("severity") || "all",
    priority: normalizePriorityQueryValue(searchParams.get("priority")),
    status: initialCardFilters?.status || initialStatusQuery.status,
    sprintId: "all",
    epicId: "all",
    bucket: searchParams.get("bucket") || initialCardFilters?.bucket || "all",
    lifecycle:
      initialCardFilters?.lifecycle && initialCardFilters.lifecycle !== "all"
        ? initialCardFilters.lifecycle
        : initialDashboardFilter === "reopened"
        ? "reopened"
        : normalizeLifecycleQueryValue(searchParams.get("lifecycle")) !== "all"
        ? normalizeLifecycleQueryValue(searchParams.get("lifecycle"))
        : initialStatusQuery.lifecycle,
    filter: initialCardFilters?.filter || initialDashboardFilter,
    dateFrom: searchParams.get("dateFrom") || "",
    dateTo: searchParams.get("dateTo") || "",
    search: searchParams.get("search") || "",
  });
  const deferredSearch = useDeferredValue(filters.search);
  const [debouncedSearch, setDebouncedSearch] = useState(filters.search);

  const {
    data: projects = [],
    isLoading: isProjectsLoading,
    error: projectsError,
  } = useQuery({
    queryKey: ["projects"],
    queryFn: fetchProjects,
  });

  const selectedProject = useMemo(
    () => findProjectById(projects, filters.projectId),
    [filters.projectId, projects]
  );
  const selectedProjectId =
    selectedProject && filters.projectId !== ALL_PROJECTS_VALUE ? selectedProject._id : "";

  const { data: epics = [] } = useQuery({
    queryKey: ["admin-bugs", "epics", selectedProjectId],
    queryFn: () => fetchEpics({ projectId: selectedProjectId }),
    enabled: Boolean(selectedProjectId),
  });
  const { data: sprints = [] } = useQuery({
    queryKey: ["admin-bugs", "sprints", selectedProjectId],
    queryFn: () => fetchSprints({ projectId: selectedProjectId }),
    enabled: Boolean(selectedProjectId),
  });

  const teams = useMemo(
    () => getAvailableTeams(projects, filters.projectId),
    [filters.projectId, projects]
  );
  const members = useMemo(
    () => getAvailableMembers(projects, filters.projectId, filters.teamId),
    [filters.projectId, filters.teamId, projects]
  );
  const testers = useMemo(
    () => members.filter((member) => member.role === "Tester"),
    [members]
  );
  const developers = useMemo(
    () => members.filter((member) => member.role === "Developer"),
    [members]
  );

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearch(filters.search);
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [filters.search]);

  const {
    data: bugsData = [],
    isLoading: isBugsLoading,
    error: bugsError,
  } = useQuery({
    queryKey: [
      "bugs",
      "admin-tracker",
      filters.projectId,
      filters.teamId,
      filters.priority,
      filters.status,
      filters.sprintId,
      filters.epicId,
      filters.bucket,
      filters.severity,
      filters.testerId,
      filters.developerId,
      filters.lifecycle,
      filters.dateFrom,
      filters.dateTo,
      filters.filter,
      debouncedSearch,
      page,
      pageSize,
      sortBy,
    ],
    queryFn: () =>
      fetchBugs({
        paginate: true,
        page,
        limit: pageSize,
        projectId: filters.projectId === ALL_PROJECTS_VALUE ? "" : filters.projectId,
        teamId: filters.teamId,
        testerId: filters.testerId,
        developerId: filters.developerId,
        severity: filters.severity,
        priority: filters.priority,
        status: filters.status,
        sprintId: filters.sprintId,
        epicId: filters.epicId,
        bucket: filters.bucket,
        lifecycle: filters.lifecycle,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        filter: filters.filter,
        search: debouncedSearch.trim(),
        sortBy,
    }),
    keepPreviousData: true,
  });
  const { data: cardSummaryData = null } = useQuery({
    queryKey: [
      "bugs",
      "admin-card-summary",
      filters.projectId,
      filters.teamId,
      filters.priority,
      filters.severity,
      filters.testerId,
      filters.dateFrom,
      filters.dateTo,
      debouncedSearch,
    ],
    queryFn: () =>
      fetchBugs({
        paginate: true,
        page: 1,
        limit: 1,
        projectId: filters.projectId === ALL_PROJECTS_VALUE ? "" : filters.projectId,
        teamId: filters.teamId,
        testerId: filters.testerId,
        severity: filters.severity,
        priority: filters.priority,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        search: debouncedSearch.trim(),
        sortBy,
      }),
    keepPreviousData: true,
  });

  const bugs = useMemo(
    () => (Array.isArray(bugsData) ? bugsData : bugsData?.bugs || []),
    [bugsData]
  );
  const pagination = useMemo(() => {
    const fallbackTotal = bugs.length;
    const total = Number(bugsData?.pagination?.total ?? fallbackTotal);
    const totalPages = Math.max(1, Number(bugsData?.pagination?.totalPages || Math.ceil(total / pageSize) || 1));

    return {
      page: Math.min(page, totalPages),
      pageSize,
      total,
      totalPages,
      from: total ? (Math.min(page, totalPages) - 1) * pageSize + 1 : 0,
      to: total ? Math.min(Math.min(page, totalPages) * pageSize, total) : 0,
    };
  }, [bugs.length, bugsData?.pagination?.total, bugsData?.pagination?.totalPages, page, pageSize]);
  const summary = bugsData?.summary || null;
  const cardSummary = cardSummaryData?.summary || null;
  const actionMenuId = actionMenu?.issueId || "";
  const visibleBugs = bugs;

  useEffect(() => {
    if (!toast?.id) {
      return undefined;
    }

    const timer = setTimeout(() => {
      setToast(null);
    }, 4000);

    return () => clearTimeout(timer);
  }, [toast?.id]);

  useEffect(() => {
    if (page > pagination.totalPages) {
      setPage(pagination.totalPages);
    }
  }, [page, pagination.totalPages]);

  useEffect(() => {
    if (!projects.length) {
      return;
    }

    const currentParams = new URLSearchParams(searchParamString);
    const requestedProjectId = currentParams.get("projectId");
    const requestedProjectName = currentParams.get("project");
    const matchedProjectByName = requestedProjectName
      ? projects.find(
          (project) =>
            String(project.name || "").trim().toLowerCase() ===
            requestedProjectName.trim().toLowerCase()
        )
      : null;
    const nextProjectId =
      requestedProjectId ||
      matchedProjectByName?._id ||
      (requestedProjectName ? ALL_PROJECTS_VALUE : filters.projectId);
    const statusQuery = normalizeStatusQueryValue(currentParams.get("status"));
    const lifecycleQuery = normalizeLifecycleQueryValue(currentParams.get("lifecycle"));
    const dashboardFilter = getDashboardFilterQueryValue(
      currentParams.get("filter") || currentParams.get("status")
    );
    const hasRequestedCardView = currentParams.has("view");
    const hasLegacyBugFilter =
      currentParams.has("status") || currentParams.has("filter") || currentParams.has("lifecycle");
    const nextCardView = hasRequestedCardView
      ? getBugCardView(currentParams.get("view"))
      : hasLegacyBugFilter
        ? null
        : getBugCardView();
    const cardViewFilters = nextCardView ? getCardViewFilterState(nextCardView.id) : null;
    const nextLifecycle =
      cardViewFilters?.lifecycle && cardViewFilters.lifecycle !== "all"
        ? cardViewFilters.lifecycle
        : dashboardFilter === "reopened"
        ? "reopened"
        : lifecycleQuery !== "all"
          ? lifecycleQuery
          : statusQuery.lifecycle || "all";

    setFilters((current) => {
      const nextFilters = {
        ...current,
        projectId: nextProjectId,
        priority: normalizePriorityQueryValue(currentParams.get("priority")),
        status: cardViewFilters?.status || statusQuery.status,
        lifecycle: nextLifecycle,
        filter: cardViewFilters?.filter || dashboardFilter,
        teamId: currentParams.get("teamId") || (nextProjectId !== current.projectId ? "all" : current.teamId),
        testerId: currentParams.get("testerId") || (nextProjectId !== current.projectId ? "all" : current.testerId),
        developerId: currentParams.get("developerId") || cardViewFilters?.developerId || (nextProjectId !== current.projectId ? "all" : current.developerId),
        severity: currentParams.get("severity") || "all",
        epicId: currentParams.get("epicId") || (nextProjectId !== current.projectId ? "all" : current.epicId),
        sprintId: currentParams.get("sprintId") || (nextProjectId !== current.projectId ? "all" : current.sprintId),
        bucket:
          currentParams.get("bucket") ||
          cardViewFilters?.bucket ||
          (hasRequestedCardView ? "all" : current.bucket),
        dateFrom: currentParams.get("dateFrom") || "",
        dateTo: currentParams.get("dateTo") || "",
        search: currentParams.get("search") || "",
      };

      return Object.entries(nextFilters).every(([key, value]) => current[key] === value)
        ? current
        : nextFilters;
    });
    setPage(normalizePageNumber(currentParams.get("page")));
    setPageSize(normalizePageSize(currentParams.get("pageSize")));
    setSortBy(currentParams.get("sortBy") || "updated:desc");
    if (hasRequestedCardView || hasLegacyBugFilter) {
      setActiveCardView(nextCardView?.id || "");
    }
  }, [filters.projectId, projects, searchParamString]);

  useEffect(() => {
    const bugParam = new URLSearchParams(searchParamString).get("bug");

    if (!bugParam || isBugsLoading) {
      return;
    }

    const routedBug = bugs.find(
      (bugIssue) =>
        String(bugIssue._id) === String(bugParam) ||
        getIssueDisplayKey(bugIssue).toLowerCase() ===
          String(bugParam).trim().toLowerCase()
    );

    if (routedBug && String(selectedBug?._id || "") !== String(routedBug._id)) {
      setSelectedBug(routedBug);
    }
  }, [bugs, isBugsLoading, searchParamString, selectedBug?._id]);

  const filteredBugs = useMemo(() => {
    const searchTerm = deferredSearch.trim().toLowerCase();

    return bugs.filter((bugIssue) => {
      const bugDetails = resolveBugDetails(bugIssue);
      const reporter = getReporter(bugIssue);
      const developer = getBugDeveloper(bugIssue);

      if (filters.severity !== "all" && getSeverity(bugIssue) !== filters.severity) {
        return false;
      }

      if (filters.testerId !== "all" && resolveUserId(reporter) !== filters.testerId) {
        return false;
      }

      if (filters.developerId === "unassigned" && resolveUserId(developer)) {
        return false;
      }

      if (
        filters.developerId !== "all" &&
        filters.developerId !== "unassigned" &&
        resolveUserId(developer) !== filters.developerId
      ) {
        return false;
      }

      if (filters.filter === "reopened" && !isReopenedBug(bugIssue)) {
        return false;
      }

      if (filters.filter === "critical" && !getCriticalIssues([bugIssue]).length) {
        return false;
      }

      if (filters.lifecycle === "reopened" && !isReopenedBug(bugIssue)) {
        return false;
      }

      if (filters.lifecycle === "open" && isClosedBug(bugIssue)) {
        return false;
      }

      if (filters.lifecycle === "fixed" && !isReadyForQa(bugIssue)) {
        return false;
      }

      if (
        filters.lifecycle === "resolved" &&
        ![ISSUE_STATUS.FIXED, ISSUE_STATUS.QA, ISSUE_STATUS.CLOSED].includes(
          normalizeBugStatusForIssue(bugIssue)
        )
      ) {
        return false;
      }

      if (!searchTerm) {
        return true;
      }

      return [
        getIssueDisplayKey(bugIssue),
        bugIssue.title,
        bugIssue.description,
        reporter?.name,
        reporter?.email,
        developer?.name,
        developer?.email,
        bugDetails.severity,
        bugDetails.moduleName,
        bugDetails.category,
        bugDetails.affectedPlatform,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(searchTerm));
    });
  }, [bugs, deferredSearch, filters.developerId, filters.filter, filters.lifecycle, filters.severity, filters.testerId]);

  const metrics = useMemo(
    () => ({
      total: cardSummary?.total ?? summary?.total ?? pagination.total,
      bucket:
        cardSummary?.bucket ??
        summary?.bucket ??
        visibleBugs.filter((bugIssue) => !resolveUserId(getBugDeveloper(bugIssue))).length,
      assigned: cardSummary?.assigned ?? summary?.assigned ?? visibleBugs.filter((bugIssue) => normalizeBugStatusForIssue(bugIssue) === ISSUE_STATUS.ASSIGNED).length,
      open: cardSummary?.open ?? summary?.open ?? visibleBugs.filter((bugIssue) => !isClosedBug(bugIssue)).length,
      critical: cardSummary?.critical ?? summary?.critical ?? getCriticalIssues(visibleBugs).length,
      unassigned:
        cardSummary?.unassigned ??
        summary?.unassigned ??
        visibleBugs.filter((bugIssue) => !resolveUserId(getBugDeveloper(bugIssue))).length,
      inProgress: cardSummary?.inProgress ?? summary?.inProgress ?? visibleBugs.filter(isInProgressBug).length,
      reopened: cardSummary?.reopened ?? summary?.reopened ?? getReopenedIssues(visibleBugs).length,
      readyForQa: cardSummary?.readyForQa ?? summary?.readyForQa ?? visibleBugs.filter(isReadyForQa).length,
      closed: cardSummary?.closed ?? summary?.closed ?? visibleBugs.filter(isClosedBug).length,
    }),
    [cardSummary, pagination.total, summary, visibleBugs]
  );
  const activeCard =
    [...BUG_CARD_VIEWS, TOTAL_BUGS_VIEW].find((view) => view.id === activeCardView) || {
      label: "Filtered Bugs",
      description: "Quick filter results",
    };

  const triageBugs = useMemo(
    () =>
      filteredBugs.filter((bugIssue) => {
        const status = normalizeBugStatusForIssue(bugIssue);
        const developer = getBugDeveloper(bugIssue);

        return (
          [ISSUE_STATUS.NEW, ISSUE_STATUS.NEEDS_TRIAGE, ISSUE_STATUS.TRIAGED, ISSUE_STATUS.OPEN].includes(status) ||
          !resolveUserId(developer)
        );
      }),
    [filteredBugs]
  );
  const triagePageSize = 6;
  const triagePagination = useMemo(() => {
    const total = triageBugs.length;
    const totalPages = Math.max(1, Math.ceil(total / triagePageSize));
    const safePage = Math.min(triagePage, totalPages);
    const fromIndex = (safePage - 1) * triagePageSize;

    return {
      page: safePage,
      total,
      totalPages,
      items: triageBugs.slice(fromIndex, fromIndex + triagePageSize),
    };
  }, [triageBugs, triagePage]);

  useEffect(() => {
    if (triagePage > triagePagination.totalPages) {
      setTriagePage(triagePagination.totalPages);
    }
  }, [triagePage, triagePagination.totalPages]);

  const severityRows = useMemo(
    () =>
      BUG_SEVERITY_OPTIONS.map((severity) => ({
        label: severity,
        count: filteredBugs.filter((bugIssue) => getSeverity(bugIssue) === severity).length,
        className:
          severity === "Blocker" || severity === "Critical"
            ? "bg-rose-500"
            : severity === "Major"
              ? "bg-amber-500"
              : "bg-emerald-500",
      })).filter((row) => row.count > 0),
    [filteredBugs]
  );

  const statusRows = useMemo(
    () =>
      BUG_STATUS_FILTERS.filter((status) => status.value !== "all")
        .map((status) => ({
          label: status.label,
          count: filteredBugs.filter(
            (bugIssue) => normalizeBugStatusForIssue(bugIssue) === status.value
          ).length,
          className:
            status.value === ISSUE_STATUS.CLOSED
              ? "bg-emerald-500"
              : status.value === ISSUE_STATUS.REOPEN
                ? "bg-rose-500"
                : "bg-blue-500",
        }))
        .filter((row) => row.count > 0),
    [filteredBugs]
  );

  const developerRows = useMemo(() => {
    const rowsByDeveloper = new Map();

    filteredBugs.forEach((bugIssue) => {
      const developer = getBugDeveloper(bugIssue);
      const developerId = resolveUserId(developer) || "unassigned";
      const row = rowsByDeveloper.get(developerId) || {
        label: getUserLabel(developer, "Unassigned"),
        total: 0,
        closed: 0,
      };

      row.total += 1;

      if (isClosedBug(bugIssue)) {
        row.closed += 1;
      }

      rowsByDeveloper.set(developerId, row);
    });

    return Array.from(rowsByDeveloper.values())
      .sort((left, right) => right.total - left.total)
      .slice(0, 5)
      .map((row) => ({
        label: row.label,
        count: row.total ? Math.round((row.closed / row.total) * 100) : 0,
        className: "bg-cyan-500",
      }));
  }, [filteredBugs]);

  const updateIssueMutation = useMutation({
    mutationFn: updateIssue,
    onSuccess: async (updatedIssue) => {
      if (selectedBug?._id === updatedIssue._id) {
        setSelectedBug(updatedIssue);
      }
      setToast({
        id: `update-success-${Date.now()}`,
        type: "success",
        message: "Bug updated successfully.",
      });
      setActionMenu(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["bugs"] }),
        queryClient.invalidateQueries({ queryKey: ["issues"] }),
        queryClient.invalidateQueries({ queryKey: ["reports"] }),
        queryClient.invalidateQueries({ queryKey: ["analytics"] }),
      ]);
    },
    onError: (err) => {
      setToast({
        id: `update-error-${Date.now()}`,
        type: "error",
        message: err.response?.data?.message || "Failed to update bug.",
      });
    },
  });

  const deleteIssueMutation = useMutation({
    mutationFn: deleteIssue,
    onSuccess: async () => {
      setSelectedBug(null);
      setToast({
        id: `delete-success-${Date.now()}`,
        type: "success",
        message: "Bug deleted successfully.",
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["bugs"] }),
        queryClient.invalidateQueries({ queryKey: ["issues"] }),
        queryClient.invalidateQueries({ queryKey: ["reports"] }),
        queryClient.invalidateQueries({ queryKey: ["analytics"] }),
      ]);
    },
    onError: (err) => {
      setToast({
        id: `delete-error-${Date.now()}`,
        type: "error",
        message: err.response?.data?.message || "Failed to delete bug.",
      });
    },
  });

  const handleToggleTriageBug = (issueId, checked) => {
    setSelectedTriageIds((current) =>
      checked
        ? Array.from(new Set([...current, issueId]))
        : current.filter((id) => id !== issueId)
    );
  };

  const handleBulkTriage = async () => {
    const selectedBugs = triageBugs.filter((bugIssue) =>
      selectedTriageIds.includes(bugIssue._id)
    );

    if (!selectedBugs.length) {
      return;
    }

    for (const bugIssue of selectedBugs) {
      const currentStatus = normalizeBugStatusForIssue(bugIssue);
      const payload = {};

      if (bulkPriority) {
        payload.priority = bulkPriority;
      }

      if (bulkDeveloperId) {
        payload.assigneeId = bulkDeveloperId;
        payload.assignedDeveloperId = bulkDeveloperId;
        payload.status = ISSUE_STATUS.ASSIGNED;
      } else if (currentStatus === ISSUE_STATUS.NEW) {
        payload.status = ISSUE_STATUS.TRIAGED;
      }

      if (Object.keys(payload).length > 0) {
        await updateIssueMutation.mutateAsync({
          id: bugIssue._id,
          payload,
        });
      }
    }

    setSelectedTriageIds([]);
  };

  const error = projectsError || bugsError;
  const isLoading = isProjectsLoading || isBugsLoading;

  const updateFilter = (key, value) => {
    setPage(1);
    if (searchParams.has("page")) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete("page");
      setSearchParams(nextParams, { replace: true });
    }
    setFilters((current) => ({
      ...current,
      [key]: value,
      ...(key === "projectId"
        ? {
            teamId: "all",
            testerId: "all",
            developerId: "all",
            epicId: "all",
            sprintId: "all",
          }
        : {}),
      ...(key === "teamId"
        ? {
            testerId: "all",
            developerId: "all",
          }
        : {}),
    }));
  };

  const applyQuickFilter = (filterId) => {
    setActiveCardView("");
    setFilters((current) => {
      const baseFilters = {
        ...current,
        bucket: "all",
        filter: "all",
        lifecycle: "all",
        priority: "all",
        status: "all",
        developerId: "all",
      };

      if (filterId === "mine") {
        return {
          ...baseFilters,
          developerId: String(user?._id || user?.id || "all"),
        };
      }

      if (filterId === "critical") {
        return {
          ...baseFilters,
          filter: "critical",
          priority: "Critical",
        };
      }

      if (filterId === "unassigned") {
        return {
          ...baseFilters,
          developerId: "unassigned",
        };
      }

      if (filterId === "reopened") {
        return {
          ...baseFilters,
          filter: "reopened",
          lifecycle: "reopened",
        };
      }

      if (filterId === "ready") {
        return {
          ...baseFilters,
          lifecycle: "fixed",
        };
      }

      if (["api", "ui", "backend"].includes(filterId)) {
        return {
          ...baseFilters,
          search: filterId,
        };
      }

      return baseFilters;
    });
  };

  const applyCardView = (viewId) => {
    const nextView = getBugCardView(viewId);
    const cardFilters = getCardViewFilterState(nextView.id);

    setPage(1);
    setSelectedTriageIds([]);
    setActiveCardView(nextView.id);
    setFilters((current) => ({
      ...current,
      ...cardFilters,
    }));
    setSearchParams((currentParams) => {
      const nextParams = new URLSearchParams(currentParams);
      nextParams.set("view", nextView.id);
      nextParams.delete("page");
      nextParams.delete("status");
      nextParams.delete("filter");
      nextParams.delete("lifecycle");
      nextParams.delete("bucket");
      return nextParams;
    }, { replace: true });
  };

  const isQuickFilterActive = (filterId) => {
    if (filterId === "mine") {
      return filters.developerId === String(user?._id || user?.id || "");
    }

    if (filterId === "critical") {
      return filters.filter === "critical" || filters.priority === "Critical";
    }

    if (filterId === "unassigned") {
      return filters.developerId === "unassigned";
    }

    if (filterId === "reopened") {
      return filters.filter === "reopened" || filters.lifecycle === "reopened";
    }

    if (["api", "ui", "backend"].includes(filterId)) {
      return filters.search.trim().toLowerCase() === filterId;
    }

    return false;
  };

  const handleQuickAssign = (bugIssue, developerId) => {
    if (!developerId) {
      return;
    }

    updateIssueMutation.mutate({
      id: bugIssue._id,
      payload: {
        assigneeId: developerId,
        assignedDeveloperId: developerId,
        status: ISSUE_STATUS.ASSIGNED,
      },
    });
  };

  const handleQuickPriority = (bugIssue, priority) => {
    if (!priority) {
      return;
    }

    updateIssueMutation.mutate({
      id: bugIssue._id,
      payload: {
        priority,
      },
    });
  };

  const handleQuickStatus = (bugIssue, status) => {
    if (!status) {
      return;
    }

    updateIssueMutation.mutate({
      id: bugIssue._id,
      payload: {
        status,
      },
    });
  };

  const handleMoveToTriageBucket = (bugIssue) => {
    updateIssueMutation.mutate({
      id: bugIssue._id,
      payload: {
        status: ISSUE_STATUS.AVAILABLE_QUEUE,
        addToBucket: true,
        assignedDeveloperId: "",
        assigneeId: "",
      },
    });
  };

  const handleCloseBug = (bugIssue) => {
    if (normalizeBugStatusForIssue(bugIssue) === ISSUE_STATUS.CLOSED) {
      return;
    }

    updateIssueMutation.mutate({
      id: bugIssue._id,
      payload: {
        status: ISSUE_STATUS.CLOSED,
        statusChangeComment: "Closed from admin triage queue.",
      },
    });
  };

  const closeActionMenu = () => setActionMenu(null);

  const handleToggleActionMenu = (event, issueId) => {
    event.stopPropagation();

    if (actionMenuId === issueId) {
      closeActionMenu();
      return;
    }

    setActionMenu({
      issueId,
      ...getTriageActionMenuPosition(event.currentTarget.getBoundingClientRect()),
    });
  };

  useEffect(() => {
    if (!actionMenuId) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (
        event.target.closest("[data-triage-action-menu]") ||
        event.target.closest("[data-triage-action-trigger]")
      ) {
        return;
      }

      closeActionMenu();
    };
    const handleEscape = (event) => {
      if (event.key === "Escape") {
        closeActionMenu();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    window.addEventListener("resize", closeActionMenu);
    window.addEventListener("scroll", closeActionMenu, true);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
      window.removeEventListener("resize", closeActionMenu);
      window.removeEventListener("scroll", closeActionMenu, true);
    };
  }, [actionMenuId]);

  const renderTriageActionMenu = (bugIssue) => {
    if (actionMenuId !== bugIssue._id || typeof document === "undefined") {
      return null;
    }

    const bugProjectId = resolveIssueProjectId(bugIssue);
    const bugTeamId = resolveIssueTeamId(bugIssue);
    const bugProject = findProjectById(projects, bugProjectId);
    const teamDevelopers = getProjectTeamMembers(bugProject, bugTeamId).filter(
      (member) => member.role === "Developer"
    );

    return createPortal(
      <div
        data-triage-action-menu
        className="fixed z-[45] max-h-[calc(100vh-1.5rem)] w-[248px] overflow-y-auto rounded-xl border border-slate-200/90 bg-white/95 p-2 text-slate-700 shadow-[0_24px_70px_-34px_rgba(15,23,42,0.65)] backdrop-blur-xl animate-in fade-in-0 zoom-in-95 slide-in-from-top-1"
        style={{ left: actionMenu.left, top: actionMenu.top }}
      >
        <div className="space-y-1">
          <div className="rounded-lg px-1.5 py-1 transition hover:bg-slate-50">
            <div className="mb-1 flex items-center gap-2 whitespace-nowrap text-[11px] font-bold text-slate-600">
              <UserPlus className="h-3.5 w-3.5 text-blue-600" />
              Assign Developer
            </div>
            <ActionSelect
              aria-label="Assign developer"
              className="h-7 w-full rounded-lg text-[11px]"
              value=""
              onChange={(event) => {
                handleQuickAssign(bugIssue, event.target.value);
                closeActionMenu();
              }}
            >
              <option value="">Select developer</option>
              {teamDevelopers.length > 0 ? (
                teamDevelopers.map((developerOption) => (
                  <option
                    key={resolveUserId(developerOption)}
                    value={resolveUserId(developerOption)}
                  >
                    {getUserLabel(developerOption)}
                  </option>
                ))
              ) : (
                <option value="" disabled>
                  No developers available in this team
                </option>
              )}
            </ActionSelect>
          </div>

          <div className="rounded-lg px-1.5 py-1 transition hover:bg-slate-50">
            <div className="mb-1 flex items-center gap-2 whitespace-nowrap text-[11px] font-bold text-slate-600">
              <RefreshCcw className="h-3.5 w-3.5 text-blue-600" />
              Change Status
            </div>
            <ActionSelect
              aria-label="Change status"
              className="h-7 w-full rounded-lg text-[11px]"
              value=""
              onChange={(event) => {
                handleQuickStatus(bugIssue, event.target.value);
                closeActionMenu();
              }}
            >
              <option value="">Select status</option>
              {BUG_STATUS_FILTERS.filter((item) => item.value !== "all").map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </ActionSelect>
          </div>

          <div className="rounded-lg px-1.5 py-1 transition hover:bg-slate-50">
            <div className="mb-1 flex items-center gap-2 whitespace-nowrap text-[11px] font-bold text-slate-600">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
              Change Priority
            </div>
            <ActionSelect
              aria-label="Change priority"
              className="h-7 w-full rounded-lg text-[11px]"
              value=""
              onChange={(event) => {
                handleQuickPriority(bugIssue, event.target.value);
                closeActionMenu();
              }}
            >
              <option value="">Select priority</option>
              {["Critical", "High", "Medium", "Low"].map((priority) => (
                <option key={priority} value={priority}>{priority}</option>
              ))}
            </ActionSelect>
          </div>

          <div className="my-1 h-px bg-slate-200" />

          <button className="flex h-8 w-full items-center gap-2 whitespace-nowrap rounded-lg px-2 text-left text-[12px] font-semibold text-slate-700 transition hover:bg-blue-50 hover:text-blue-700" type="button" onClick={() => { handleMoveToTriageBucket(bugIssue); closeActionMenu(); }}>
            <Layers3 className="h-3.5 w-3.5" />
            Move to Work Queue
          </button>
          <button className="flex h-8 w-full items-center gap-2 whitespace-nowrap rounded-lg px-2 text-left text-[12px] font-semibold text-slate-700 transition hover:bg-blue-50 hover:text-blue-700" type="button" onClick={() => { setSelectedBug(bugIssue); closeActionMenu(); }}>
            <MessageSquarePlus className="h-3.5 w-3.5" />
            Add Comment
          </button>
          <button className="flex h-8 w-full items-center gap-2 whitespace-nowrap rounded-lg px-2 text-left text-[12px] font-semibold text-emerald-700 transition hover:bg-emerald-50" type="button" onClick={() => { handleCloseBug(bugIssue); closeActionMenu(); }}>
            <CheckCircle2 className="h-3.5 w-3.5" />
            Close Bug
          </button>
        </div>
      </div>,
      document.body
    );
  };

  if (error) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-rose-700">
          {error.response?.data?.message || "Unable to load bug tracker."}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4 text-[13px]">
      <section className="order-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
        {BUG_CARD_VIEWS.map((view) => (
          <MetricTile
            key={view.id}
            active={activeCardView === view.id}
            icon={view.icon}
            label={view.label}
            value={metrics[view.metricKey] ?? 0}
            tone={view.tone}
            onClick={() => applyCardView(view.id)}
          />
        ))}
        <MetricTile
          active={activeCardView === TOTAL_BUGS_VIEW.id}
          icon={TOTAL_BUGS_VIEW.icon}
          label={TOTAL_BUGS_VIEW.label}
          value={metrics.total}
          tone={TOTAL_BUGS_VIEW.tone}
          onClick={() => applyCardView(TOTAL_BUGS_VIEW.id)}
        />
      </section>

      {false ? (
      <>
      <Card className="flex max-h-[calc(100svh-7rem)] min-h-[520px] flex-col overflow-hidden rounded-[14px] border border-slate-200/90 bg-white shadow-[0_18px_48px_-32px_rgba(15,23,42,0.46)] md:max-h-[calc(100vh-7.5rem)]">
        <CardContent className="flex min-h-0 flex-col p-0">
          <div className="sticky top-0 z-30 shrink-0 rounded-t-[14px] border-b border-slate-300/80 bg-white/95 px-3 py-2 backdrop-blur-xl sm:px-4">
            <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0">
                <h2 className="flex items-center gap-2 text-[15px] font-semibold text-slate-950">
                  <ListChecks className="h-4 w-4 text-blue-600" />
                  Triage Board
                </h2>
                <p className="mt-0.5 text-[12px] font-medium text-slate-600">
                  {triageBugs.length} incoming bugs ready for admin review.
                </p>
              </div>
              <div className="flex w-full flex-wrap items-center gap-1.5 rounded-xl border border-slate-200/90 bg-slate-50/80 p-1 shadow-inner xl:w-auto">
                <div className="relative w-full min-w-[190px] sm:w-[240px] xl:w-[250px]">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <CompactInput
                    className="h-8 pl-9"
                    placeholder="Search bugs"
                    value={filters.search}
                    onChange={(event) => updateFilter("search", event.target.value)}
                  />
                </div>
                <CompactSelect className="h-8 w-[118px]" value={filters.severity} onChange={(event) => updateFilter("severity", event.target.value)}>
                  <option value="all">Severity</option>
                  {BUG_SEVERITY_OPTIONS.map((severity) => (
                    <option key={severity} value={severity}>{severity}</option>
                  ))}
                </CompactSelect>
                <CompactSelect className="h-8 w-[124px]" value={filters.status} onChange={(event) => updateFilter("status", event.target.value)}>
                  {BUG_STATUS_FILTERS.map((status) => (
                    <option key={status.value} value={status.value}>{status.label}</option>
                  ))}
                </CompactSelect>
                <CompactSelect className="h-8 w-[142px]" value={filters.developerId} onChange={(event) => updateFilter("developerId", event.target.value)}>
                  <option value="all">Developer</option>
                  <option value="unassigned">Unassigned</option>
                  {developers.map((developer) => (
                    <option key={resolveUserId(developer)} value={resolveUserId(developer)}>{getUserLabel(developer)}</option>
                  ))}
                </CompactSelect>
                <Button className="h-8 rounded-[10px] px-2.5 text-[11px]" type="button" variant="outline" onClick={() => setAreTriageFiltersOpen((current) => !current)}>
                  <Filter className="h-3.5 w-3.5" />
                  Filters
                  {areTriageFiltersOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </Button>
                <SoftBadge className="border-blue-100 bg-blue-50 text-blue-700">
                  {triageBugs.length} review
                </SoftBadge>
              </div>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {quickFilterChips.map(([id, label]) => (
                <button
                  key={id}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[11px] font-semibold shadow-sm transition",
                    isQuickFilterActive(id)
                      ? "border-blue-200 bg-blue-50 text-blue-700"
                      : "border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                  )}
                  type="button"
                  onClick={() => applyQuickFilter(id)}
                >
                  {label}
                </button>
              ))}
            </div>

            {areTriageFiltersOpen ? (
              <div className="mt-2 grid gap-2 border-t border-slate-200/90 pt-2 sm:grid-cols-2 xl:grid-cols-6">
                <CompactSelect value={filters.projectId} onChange={(event) => updateFilter("projectId", event.target.value)}>
                  <option value={ALL_PROJECTS_VALUE}>All projects</option>
                  {projects.map((project) => (
                    <option key={project._id} value={project._id}>{project.name}</option>
                  ))}
                </CompactSelect>
                <CompactSelect value={filters.teamId} onChange={(event) => updateFilter("teamId", event.target.value)}>
                  <option value="all">All teams</option>
                  {teams.map((team) => (
                    <option key={resolveTeamId(team)} value={resolveTeamId(team)}>{team.name}</option>
                  ))}
                </CompactSelect>
                <CompactSelect value={filters.testerId} onChange={(event) => updateFilter("testerId", event.target.value)}>
                  <option value="all">All testers</option>
                  {testers.map((tester) => (
                    <option key={resolveUserId(tester)} value={resolveUserId(tester)}>{getUserLabel(tester)}</option>
                  ))}
                </CompactSelect>
                <CompactSelect value={filters.priority} onChange={(event) => updateFilter("priority", event.target.value)}>
                  <option value="all">All priorities</option>
                  {["Critical", "High", "Medium", "Low"].map((priority) => (
                    <option key={priority} value={priority}>{priority}</option>
                  ))}
                </CompactSelect>
                <CompactSelect value={filters.lifecycle} onChange={(event) => updateFilter("lifecycle", event.target.value)}>
                  <option value="all">All bugs</option>
                  <option value="reopened">Reopened bugs</option>
                  <option value="fixed">Fixed / Ready for QA</option>
                </CompactSelect>
                <CompactInput type="date" value={filters.dateFrom} onChange={(event) => updateFilter("dateFrom", event.target.value)} />
              </div>
            ) : null}
          </div>

          {selectedTriageIds.length ? (
            <div className="z-20 shrink-0 flex flex-col gap-2 border-b border-blue-100 bg-blue-50/95 px-3 py-2 backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:px-4">
              <p className="text-[12px] font-bold text-blue-800">{selectedTriageIds.length} Bugs Selected</p>
              <div className="flex flex-wrap items-center gap-2">
                <CompactSelect className="h-8 w-[150px]" value={bulkDeveloperId} onChange={(event) => setBulkDeveloperId(event.target.value)}>
                  <option value="">Assign</option>
                  {developers.map((developer) => (
                    <option key={resolveUserId(developer)} value={resolveUserId(developer)}>{getUserLabel(developer)}</option>
                  ))}
                </CompactSelect>
                <CompactSelect className="h-8 w-[150px]" value={bulkPriority} onChange={(event) => setBulkPriority(event.target.value)}>
                  <option value="">Change Priority</option>
                  {["Critical", "High", "Medium", "Low"].map((priority) => (
                    <option key={priority} value={priority}>{priority}</option>
                  ))}
                </CompactSelect>
                <Button className="h-8 rounded-lg px-3 text-[12px]" type="button" disabled={updateIssueMutation.isPending} onClick={handleBulkTriage}>
                  Bulk Actions
                </Button>
              </div>
            </div>
          ) : null}

          <div className="min-h-0 flex-1 overflow-auto bg-slate-100/80 p-2 [scrollbar-gutter:stable]">
            {isLoading ? (
              <div className="space-y-1.5">
                {Array.from({ length: 8 }).map((_, index) => (
                  <Skeleton key={`triage-row-skeleton-${index}`} className="h-12 rounded-lg" />
                ))}
              </div>
            ) : triageBugs.length ? (
              <>
                <div className="hidden md:block">
                  <div className="pr-1">
                    <div className="min-w-[900px] space-y-1.5 lg:min-w-0">
                      <div className="grid grid-cols-[28px_minmax(220px,1.25fr)_minmax(130px,0.7fr)_minmax(120px,0.65fr)_minmax(120px,0.65fr)_minmax(145px,0.72fr)_104px_68px] items-center gap-2 px-2 pb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500 lg:grid-cols-[28px_minmax(260px,1.35fr)_minmax(150px,0.72fr)_minmax(130px,0.65fr)_minmax(140px,0.68fr)_minmax(160px,0.76fr)_118px_72px]">
                        <div className="flex justify-center">
                          <input
                            aria-label="Select all triage bugs"
                            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            type="checkbox"
                            checked={triageBugs.length > 0 && triageBugs.every((bugIssue) => selectedTriageIds.includes(bugIssue._id))}
                            onChange={(event) =>
                              setSelectedTriageIds(event.target.checked ? triageBugs.map((bugIssue) => bugIssue._id) : [])
                            }
                          />
                        </div>
                        <span>Bug Info</span>
                        <span>Module / Project</span>
                        <span>Tester</span>
                        <span>Developer</span>
                        <span>Status / Priority</span>
                        <span>Date</span>
                        <span className="text-right">Actions</span>
                      </div>

                      {triageBugs.slice(0, 60).map((bugIssue) => {
                        const details = resolveBugDetails(bugIssue);
                        const reporter = getReporter(bugIssue);
                        const reporterName = getUserLabel(reporter, "Unknown tester");
                        const developer = getBugDeveloper(bugIssue);
                        const developerName = getUserLabel(developer);
                        const status = normalizeBugStatusForIssue(bugIssue);
                        const severity = getSeverity(bugIssue);
                        const moduleTag = getModuleTag(bugIssue);
                        const attachmentCount = getAttachmentCount(bugIssue);

                        return (
                          <article
                            key={bugIssue._id}
                            className={cn(
                              "group relative grid grid-cols-[28px_minmax(220px,1.25fr)_minmax(130px,0.7fr)_minmax(120px,0.65fr)_minmax(120px,0.65fr)_minmax(145px,0.72fr)_104px_68px] items-center gap-2 rounded-lg border border-l-4 border-slate-200 bg-white px-2 py-2 shadow-sm transition duration-150 hover:-translate-y-px hover:border-blue-200 hover:bg-blue-50/40 hover:shadow-md lg:grid-cols-[28px_minmax(260px,1.35fr)_minmax(150px,0.72fr)_minmax(130px,0.65fr)_minmax(140px,0.68fr)_minmax(160px,0.76fr)_118px_72px]",
                              severityAccentClassName(severity)
                            )}
                          >
                            <div className="flex justify-center">
                              <input
                                aria-label={`Select ${getIssueDisplayKey(bugIssue)}`}
                                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                type="checkbox"
                                checked={selectedTriageIds.includes(bugIssue._id)}
                                onChange={(event) => handleToggleTriageBug(bugIssue._id, event.target.checked)}
                              />
                            </div>

                            <button className="min-w-0 text-left" type="button" onClick={() => setSelectedBug(bugIssue)}>
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-slate-600">{getIssueDisplayKey(bugIssue)}</span>
                                {status === ISSUE_STATUS.NEW || status === ISSUE_STATUS.NEEDS_TRIAGE ? (
                                  <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-blue-700">Source: Tester Review Required</span>
                                ) : null}
                              </div>
                              <span className="mt-0.5 block truncate text-[13px] font-bold leading-5 text-slate-950">{bugIssue.title}</span>
                              <span className="mt-0.5 block truncate text-[11px] font-medium text-slate-500">
                                {getProjectName(bugIssue, projects)} &bull; {details.moduleName || "Unmapped module"}
                              </span>
                            </button>

                            <div className="min-w-0">
                              <div className="flex min-w-0 items-center gap-1.5">
                                <p className="truncate text-[12px] font-semibold text-slate-800">{details.moduleName || "Unmapped"}</p>
                                <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[9px] font-bold uppercase text-slate-600">{moduleTag}</span>
                              </div>
                              <p className="mt-0.5 truncate text-[11px] font-medium text-slate-500">{getIssueCategory(bugIssue)}</p>
                            </div>

                            <div className="min-w-0">
                              <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-700">
                                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-[10px] text-white">{getInitials(reporterName)}</span>
                                <span className="truncate">{reporterName}</span>
                              </span>
                            </div>

                            <div className="min-w-0">
                              <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-700">
                                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[10px] text-white">{getInitials(developerName)}</span>
                                <span className="truncate">{developerName}</span>
                              </span>
                            </div>

                            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                              <span className={cn("inline-flex h-5 items-center rounded-full border px-2 text-[10px] font-bold uppercase leading-none", statusBadgeClassName(status))}>
                                {status === ISSUE_STATUS.QA ? "Ready for QA" : getIssueStatusLabel(status)}
                              </span>
                              <span className={priorityBadgeClassName(bugIssue.priority || "Medium")}>{bugIssue.priority || "Medium"}</span>
                              <span className={severityBadgeClassName(severity)}>{severity}</span>
                              {isReopenedBug(bugIssue) ? (
                                <span className="inline-flex h-5 items-center rounded-full border border-rose-200 bg-rose-50 px-2 text-[10px] font-bold uppercase text-rose-700">Reopened</span>
                              ) : null}
                            </div>

                            <div className="min-w-0 text-[11px] font-medium text-slate-600">
                              <span className="block truncate">{formatDateTime(bugIssue.updatedAt || bugIssue.createdAt)}</span>
                              {attachmentCount ? (
                                <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold text-slate-500">
                                  <Paperclip className="h-3 w-3" />
                                  {attachmentCount}
                                </span>
                              ) : null}
                            </div>

                            <div className="relative flex items-center justify-end gap-1">
                              <Button className="h-7 w-7 rounded-md p-0" type="button" size="icon" variant="outline" onClick={() => setSelectedBug(bugIssue)} aria-label="View bug">
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
                              <Button data-triage-action-trigger className="h-7 w-7 rounded-md p-0" type="button" size="icon" variant="outline" onClick={(event) => handleToggleActionMenu(event, bugIssue._id)} aria-label="More actions">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                              {renderTriageActionMenu(bugIssue)}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="space-y-2 md:hidden">
                  {triageBugs.slice(0, 60).map((bugIssue) => {
                    const details = resolveBugDetails(bugIssue);
                    const developer = getBugDeveloper(bugIssue);
                    const developerName = getUserLabel(developer);
                    const status = normalizeBugStatusForIssue(bugIssue);
                    const severity = getSeverity(bugIssue);
                    const attachmentCount = getAttachmentCount(bugIssue);

                    return (
                      <article
                        key={bugIssue._id}
                        className={cn(
                          "relative rounded-lg border border-l-4 border-slate-200 bg-white p-3 shadow-sm transition hover:-translate-y-px hover:border-blue-200 hover:bg-blue-50/40 hover:shadow-md",
                          severityAccentClassName(severity)
                        )}
                      >
                        <div className="flex items-start gap-2">
                          <input
                            aria-label={`Select ${getIssueDisplayKey(bugIssue)}`}
                            className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            type="checkbox"
                            checked={selectedTriageIds.includes(bugIssue._id)}
                            onChange={(event) => handleToggleTriageBug(bugIssue._id, event.target.checked)}
                          />
                          <button className="min-w-0 flex-1 text-left" type="button" onClick={() => setSelectedBug(bugIssue)}>
                            <span className="block font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-slate-600">{getIssueDisplayKey(bugIssue)}</span>
                            <span className="mt-0.5 block truncate text-[13px] font-bold text-slate-950">{bugIssue.title}</span>
                            <span className="mt-0.5 block truncate text-[11px] font-medium text-slate-500">
                              {getProjectName(bugIssue, projects)} &bull; {details.moduleName || "Unmapped module"}
                            </span>
                          </button>
                          <div className="relative flex shrink-0 items-center gap-1">
                            <Button className="h-7 w-7 rounded-md p-0" type="button" size="icon" variant="outline" onClick={() => setSelectedBug(bugIssue)} aria-label="View bug">
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                            <Button data-triage-action-trigger className="h-7 w-7 rounded-md p-0" type="button" size="icon" variant="outline" onClick={(event) => handleToggleActionMenu(event, bugIssue._id)} aria-label="More actions">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                            {renderTriageActionMenu(bugIssue)}
                          </div>
                        </div>

                        <div className="mt-2 grid gap-1.5 text-[11px] font-medium text-slate-600">
                          <span className="truncate">{details.moduleName || "Unmapped"} / {getIssueCategory(bugIssue)}</span>
                          <span className="truncate">Tester: {getUserLabel(getReporter(bugIssue), "Unknown tester")}</span>
                          <span className="truncate">Dev: {developerName}</span>
                          <span className="truncate">{formatDateTime(bugIssue.updatedAt || bugIssue.createdAt)}</span>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <span className={cn("inline-flex h-5 items-center rounded-full border px-2 text-[10px] font-bold uppercase leading-none", statusBadgeClassName(status))}>
                            {status === ISSUE_STATUS.QA ? "Ready for QA" : getIssueStatusLabel(status)}
                          </span>
                          <span className={priorityBadgeClassName(bugIssue.priority || "Medium")}>{bugIssue.priority || "Medium"}</span>
                          <span className={severityBadgeClassName(severity)}>{severity}</span>
                          {isReopenedBug(bugIssue) ? (
                            <span className="inline-flex h-5 items-center rounded-full border border-rose-200 bg-rose-50 px-2 text-[10px] font-bold uppercase text-rose-700">Reopened</span>
                          ) : null}
                          {attachmentCount ? (
                            <span className="inline-flex h-5 items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 text-[10px] font-bold uppercase text-slate-600">
                              <Paperclip className="h-3 w-3" />
                              {attachmentCount}
                            </span>
                          ) : null}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="rounded-xl bg-white p-8">
                <EmptyState
                  title="No bugs need triage"
                  description="New, open, or unassigned bugs matching this view will appear here for quick review."
                  icon={<ListChecks className="h-5 w-5" />}
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <section className="grid gap-4 lg:grid-cols-3">
        <DistributionPanel title="Severity Distribution" rows={severityRows} />
        <DistributionPanel title="Bug Trend By Status" rows={statusRows} />
        <DistributionPanel title="Developer Resolution Rate" rows={developerRows} />
      </section>
      </>
      ) : null}

      <Card className="order-4 overflow-hidden rounded-[16px] border-white/70 bg-white/95 shadow-[0_16px_42px_-32px_rgba(15,23,42,0.4)] backdrop-blur-xl">
        <CardContent className="flex min-h-0 flex-col p-0">
          <div className="shrink-0 space-y-3 border-b border-slate-200/90 bg-white p-3.5 sm:p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0">
              <h2 className="flex items-center gap-2 text-base font-semibold text-slate-950">
                <SlidersHorizontal className="h-4 w-4 text-blue-600" />
                {activeCard.label}
              </h2>
              <p className="mt-0.5 text-[12px] text-slate-500">
                Showing {pagination.from}-{pagination.to} of {pagination.total} {activeCard.label.toLowerCase()}.
                {" "}
                {activeCard.description}
              </p>
            </div>
            <div className="grid w-full gap-2 md:grid-cols-[minmax(220px,1.3fr)_minmax(150px,0.75fr)_minmax(140px,0.65fr)_minmax(140px,0.65fr)_auto] xl:w-auto">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <CompactInput
                  className="pl-9"
                  placeholder="Search bugs"
                  value={filters.search}
                  onChange={(event) => updateFilter("search", event.target.value)}
                />
              </div>
              <CompactSelect value={filters.projectId} onChange={(event) => updateFilter("projectId", event.target.value)}>
                <option value={ALL_PROJECTS_VALUE}>All projects</option>
                {projects.map((project) => (
                  <option key={project._id} value={project._id}>{project.name}</option>
                ))}
              </CompactSelect>
              <CompactSelect value={filters.priority} onChange={(event) => updateFilter("priority", event.target.value)}>
                <option value="all">Priority</option>
                {["Critical", "High", "Medium", "Low"].map((priority) => (
                  <option key={priority} value={priority}>{priority}</option>
                ))}
              </CompactSelect>
              <CompactSelect value={filters.severity} onChange={(event) => updateFilter("severity", event.target.value)}>
                <option value="all">Severity</option>
                {BUG_SEVERITY_OPTIONS.map((severity) => (
                  <option key={severity} value={severity}>{severity}</option>
                ))}
              </CompactSelect>
              <Button
                className="h-9 rounded-[10px] px-2.5 text-[11px]"
                type="button"
                onClick={() => setAreFiltersOpen((current) => !current)}
              >
                <Filter className="h-3.5 w-3.5" />
                {areFiltersOpen ? "Less" : "More"}
                {areFiltersOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>

          {areFiltersOpen ? (
            <div className="grid gap-2 border-t border-slate-200/80 pt-3 md:grid-cols-2 xl:grid-cols-4">
              <label className="space-y-1.5">
                <FieldLabel>Project</FieldLabel>
                <CompactSelect value={filters.projectId} onChange={(event) => updateFilter("projectId", event.target.value)}>
                  <option value={ALL_PROJECTS_VALUE}>All projects</option>
                  {projects.map((project) => (
                    <option key={project._id} value={project._id}>{project.name}</option>
                  ))}
                </CompactSelect>
              </label>
              <label className="space-y-1.5">
                <FieldLabel>Team</FieldLabel>
                <CompactSelect value={filters.teamId} onChange={(event) => updateFilter("teamId", event.target.value)}>
                  <option value="all">All teams</option>
                  {teams.map((team) => (
                    <option key={resolveTeamId(team)} value={resolveTeamId(team)}>{team.name}</option>
                  ))}
                </CompactSelect>
              </label>
              <label className="space-y-1.5">
                <FieldLabel>Tester</FieldLabel>
                <CompactSelect value={filters.testerId} onChange={(event) => updateFilter("testerId", event.target.value)}>
                  <option value="all">All testers</option>
                  {testers.map((tester) => (
                    <option key={resolveUserId(tester)} value={resolveUserId(tester)}>{getUserLabel(tester)}</option>
                  ))}
                </CompactSelect>
              </label>
              <label className="space-y-1.5">
                <FieldLabel>Developer</FieldLabel>
                <CompactSelect value={filters.developerId} onChange={(event) => updateFilter("developerId", event.target.value)}>
                  <option value="all">All developers</option>
                  <option value="unassigned">Unassigned</option>
                  {developers.map((developer) => (
                    <option key={resolveUserId(developer)} value={resolveUserId(developer)}>{getUserLabel(developer)}</option>
                  ))}
                </CompactSelect>
              </label>
              <label className="space-y-1.5">
                <FieldLabel>Severity</FieldLabel>
                <CompactSelect value={filters.severity} onChange={(event) => updateFilter("severity", event.target.value)}>
                  <option value="all">All severities</option>
                  {BUG_SEVERITY_OPTIONS.map((severity) => (
                    <option key={severity} value={severity}>{severity}</option>
                  ))}
                </CompactSelect>
              </label>
              <label className="space-y-1.5">
                <FieldLabel>Priority</FieldLabel>
                <CompactSelect value={filters.priority} onChange={(event) => updateFilter("priority", event.target.value)}>
                  <option value="all">All priorities</option>
                  {["Critical", "High", "Medium", "Low"].map((priority) => (
                    <option key={priority} value={priority}>{priority}</option>
                  ))}
                </CompactSelect>
              </label>
              <label className="space-y-1.5">
                <FieldLabel>Status</FieldLabel>
                <CompactSelect value={filters.status} onChange={(event) => updateFilter("status", event.target.value)}>
                  {BUG_STATUS_FILTERS.map((status) => (
                    <option key={status.value} value={status.value}>{status.label}</option>
                  ))}
                </CompactSelect>
              </label>
              <label className="space-y-1.5">
                <FieldLabel>Epic</FieldLabel>
                <CompactSelect value={filters.epicId} disabled={!selectedProjectId} onChange={(event) => updateFilter("epicId", event.target.value)}>
                  <option value="all">All epics</option>
                  <option value="unassigned">No epic</option>
                  {epics.map((epic) => (
                    <option key={epic._id} value={epic._id}>{epic.name}</option>
                  ))}
                </CompactSelect>
              </label>
              <label className="space-y-1.5">
                <FieldLabel>Sprint</FieldLabel>
                <CompactSelect value={filters.sprintId} disabled={!selectedProjectId} onChange={(event) => updateFilter("sprintId", event.target.value)}>
                  <option value="all">All sprints</option>
                  <option value="backlog">Backlog</option>
                  {sprints.map((sprint) => (
                    <option key={sprint._id} value={sprint._id}>{sprint.name}</option>
                  ))}
                </CompactSelect>
              </label>
              <label className="space-y-1.5">
                <FieldLabel>Bug State</FieldLabel>
                <CompactSelect value={filters.lifecycle} onChange={(event) => updateFilter("lifecycle", event.target.value)}>
                  <option value="all">All bugs</option>
                  <option value="reopened">Reopened bugs</option>
                  <option value="fixed">Fixed / Ready for QA</option>
                </CompactSelect>
              </label>
              <label className="space-y-1.5">
                <FieldLabel>Date From</FieldLabel>
                <CompactInput type="date" value={filters.dateFrom} onChange={(event) => updateFilter("dateFrom", event.target.value)} />
              </label>
              <label className="space-y-1.5">
                <FieldLabel>Date To</FieldLabel>
                <CompactInput type="date" value={filters.dateTo} onChange={(event) => updateFilter("dateTo", event.target.value)} />
              </label>
              <label className="space-y-1.5 md:col-span-2 xl:col-span-4">
                <FieldLabel>Search</FieldLabel>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <CompactInput
                    className="pl-9"
                    placeholder="Search bug ID, title, developer, tester, or severity"
                    value={filters.search}
                    onChange={(event) => updateFilter("search", event.target.value)}
                  />
                </div>
              </label>
            </div>
          ) : null}
          </div>
          <div className="min-h-0 flex-1 bg-white">
          {isLoading ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 8 }).map((_, index) => (
                <Skeleton key={`bug-row-skeleton-${index}`} className="h-14 rounded-2xl" />
              ))}
            </div>
          ) : visibleBugs.length ? (
            <>
            <div className="space-y-2 bg-slate-50/80 p-3">
              {visibleBugs.map((bugIssue) => (
                <div key={bugIssue._id} className="relative">
                <BugResultRow
                  bugIssue={bugIssue}
                  projects={projects}
                  onOpen={setSelectedBug}
                  onActionMenu={handleToggleActionMenu}
                />
                {renderTriageActionMenu(bugIssue)}
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-2 border-t border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs font-medium text-slate-500">
                {activeCard.label} page {pagination.page} of {pagination.totalPages}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  className="h-8 rounded-lg px-3 text-xs"
                  type="button"
                  variant="outline"
                  disabled={pagination.page <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  Previous
                </Button>
                <Button
                  className="h-8 rounded-lg px-3 text-xs"
                  type="button"
                  variant="outline"
                  disabled={pagination.page >= pagination.totalPages}
                  onClick={() => setPage((current) => Math.min(pagination.totalPages, current + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
            <div className="hidden">
              <table className="w-full table-fixed border-separate border-spacing-0 text-left">
                <colgroup>
                  <col className="w-[6%]" />
                  <col className="w-[20%]" />
                  <col className="w-[11%]" />
                  <col className="w-[9%]" />
                  <col className="w-[6.5%]" />
                  <col className="w-[7%]" />
                  <col className="w-[10%]" />
                  <col className="w-[8%]" />
                  <col className="w-[5%]" />
                  <col className="w-[8.5%]" />
                  <col className="w-[6%]" />
                  <col className="w-[3%]" />
                </colgroup>
                <thead className="sticky top-0 z-20 bg-white/95 backdrop-blur">
                  <tr className="border-b border-slate-200 text-[10px] uppercase tracking-[0.1em] text-slate-500 xl:text-[11px]">
                    {["Bug ID", "Title", "Project", "Tester", "Severity", "Priority", "Developer", "Status", "Reopens", "Updated", "ETA", ""].map((header, index) => (
                      <th
                        key={`${header || "actions"}-${index}`}
                        className={cn(
                          "border-b border-slate-200 px-2 py-3 font-semibold",
                          index === 8 && "text-center",
                          index === 11 && "text-center"
                        )}
                      >
                        {index === 11 ? <Eye className="mx-auto h-4 w-4" /> : header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleBugs.map((bugIssue) => {
                    const reporter = getReporter(bugIssue);
                    const developer = getBugDeveloper(bugIssue);
                    const status = normalizeBugStatusForIssue(bugIssue);

                    return (
                      <tr
                        key={bugIssue._id}
                        className="cursor-pointer border-b border-slate-100 transition hover:bg-blue-50/50"
                        onClick={() => setSelectedBug(bugIssue)}
                      >
                        <td className="break-words border-b border-slate-100 px-2 py-3">
                          <button
                            className="max-w-full break-words text-left font-mono text-[11px] font-semibold leading-5 text-slate-600 transition hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedBug(bugIssue);
                            }}
                          >
                            {getIssueDisplayKey(bugIssue)}
                          </button>
                        </td>
                        <td className="border-b border-slate-100 px-2 py-3">
                          <p className="truncate text-[13px] font-semibold text-slate-950 xl:text-sm">{bugIssue.title}</p>
                          <p className="truncate text-xs text-slate-500">{getTeamName(bugIssue)}</p>
                        </td>
                        <td className="break-words border-b border-slate-100 px-2 py-3 text-[12px] leading-5 text-slate-600 xl:text-sm">
                          {getProjectName(bugIssue, projects)}
                        </td>
                        <td className="break-words border-b border-slate-100 px-2 py-3 text-[12px] leading-5 text-slate-600 xl:text-sm">
                          {getUserLabel(reporter, "Unknown tester")}
                        </td>
                        <td className="border-b border-slate-100 px-2 py-3">
                          <span className={cn(
                            "inline-flex rounded-full px-2 py-1 text-[11px] font-semibold",
                            ["Blocker", "Critical"].includes(getSeverity(bugIssue))
                              ? "bg-rose-50 text-rose-700"
                              : "bg-slate-100 text-slate-700"
                          )}>
                            {getSeverity(bugIssue)}
                          </span>
                        </td>
                        <td className="border-b border-slate-100 px-2 py-3">
                          <Badge variant={getIssuePriorityVariant(bugIssue.priority)}>
                            {bugIssue.priority || "Medium"}
                          </Badge>
                        </td>
                        <td className="break-words border-b border-slate-100 px-2 py-3 text-[12px] leading-5 text-slate-600 xl:text-sm">
                          {getUserLabel(developer)}
                        </td>
                        <td className="border-b border-slate-100 px-2 py-3">
                          <Badge variant={getIssueStatusVariant(status)}>
                            {status === ISSUE_STATUS.QA ? "Ready for QA" : getIssueStatusLabel(status)}
                          </Badge>
                        </td>
                        <td className="border-b border-slate-100 px-2 py-3 text-center text-[12px] font-semibold text-slate-700 xl:text-sm">
                          {getReopenCount(bugIssue)}
                        </td>
                        <td className="break-words border-b border-slate-100 px-2 py-3 text-[12px] leading-5 text-slate-600">
                          {formatDateTime(bugIssue.updatedAt || bugIssue.createdAt)}
                        </td>
                        <td className="break-words border-b border-slate-100 px-2 py-3 text-[12px] leading-5 text-slate-600">
                          {getResolutionEta(bugIssue)}
                        </td>
                        <td className="border-b border-slate-100 px-1 py-3 text-center">
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            className="h-8 w-8 rounded-lg"
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedBug(bugIssue);
                            }}
                            aria-label="View bug"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            </>
          ) : (
            <div className="p-8">
              <EmptyState
                title={`No ${activeCard.label.toLowerCase()} found`}
                description="Adjust project, QA, developer, lifecycle, date, or search filters to widen this result set."
                icon={<Bug className="h-5 w-5" />}
              />
            </div>
          )}
          </div>
        </CardContent>
      </Card>

      <Card className="order-2 overflow-hidden rounded-[16px] border-white/70 bg-white/95 shadow-[0_16px_42px_-32px_rgba(15,23,42,0.34)] backdrop-blur-xl">
        <CardContent className="p-0">
          <div className="flex flex-col gap-3 border-b border-slate-200/80 bg-white px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <h2 className="flex items-center gap-2 text-base font-semibold text-slate-950">
                <ListChecks className="h-4 w-4 text-blue-600" />
                Triage Board
              </h2>
              <p className="mt-0.5 text-xs font-medium text-slate-500">
                {triagePagination.total} new, open, or unassigned bugs ready for admin review.
              </p>
            </div>

            {selectedTriageIds.length ? (
              <div className="flex flex-wrap items-center gap-2">
                <CompactSelect
                  className="h-8 w-[150px]"
                  value={bulkDeveloperId}
                  onChange={(event) => setBulkDeveloperId(event.target.value)}
                >
                  <option value="">Assign</option>
                  {developers.map((developer) => (
                    <option key={resolveUserId(developer)} value={resolveUserId(developer)}>
                      {getUserLabel(developer)}
                    </option>
                  ))}
                </CompactSelect>
                <CompactSelect
                  className="h-8 w-[150px]"
                  value={bulkPriority}
                  onChange={(event) => setBulkPriority(event.target.value)}
                >
                  <option value="">Priority</option>
                  {["Critical", "High", "Medium", "Low"].map((priority) => (
                    <option key={priority} value={priority}>{priority}</option>
                  ))}
                </CompactSelect>
                <Button
                  className="h-8 rounded-lg px-3 text-xs"
                  type="button"
                  disabled={updateIssueMutation.isPending}
                  onClick={handleBulkTriage}
                >
                  Apply
                </Button>
              </div>
            ) : null}
          </div>

          {isLoading ? (
            <div className="grid gap-3 bg-slate-50/80 p-3 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={`triage-card-skeleton-${index}`} className="h-40 rounded-xl" />
              ))}
            </div>
          ) : triageBugs.length ? (
            <>
            <div className="space-y-2 bg-slate-50/80 p-3">
              {triagePagination.items.map((bugIssue) => {
                const status = normalizeBugStatusForIssue(bugIssue);
                const severity = getSeverity(bugIssue);

                return (
                  <article
                    key={bugIssue._id}
                    className={cn(
                      "group grid gap-3 rounded-xl border border-l-4 border-slate-200 bg-white px-3 py-2.5 shadow-sm transition hover:border-blue-200 hover:bg-blue-50/30 md:grid-cols-[28px_minmax(260px,1.2fr)_minmax(170px,0.7fr)_minmax(170px,0.7fr)_120px_82px] md:items-center",
                      severityAccentClassName(severity)
                    )}
                  >
                    <input
                      aria-label={`Select ${getIssueDisplayKey(bugIssue)}`}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      type="checkbox"
                      checked={selectedTriageIds.includes(bugIssue._id)}
                      onChange={(event) => handleToggleTriageBug(bugIssue._id, event.target.checked)}
                    />

                    <button
                      className="min-w-0 text-left"
                      type="button"
                      onClick={() => setSelectedBug(bugIssue)}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-slate-600">
                          {getIssueDisplayKey(bugIssue)}
                        </span>
                        <span className={cn("inline-flex h-5 items-center rounded-full border px-2 text-[10px] font-bold", statusBadgeClassName(status))}>
                          {status === ISSUE_STATUS.QA ? "Ready for QA" : getIssueStatusLabel(status)}
                        </span>
                      </div>
                      <h3 className="mt-1 truncate text-sm font-semibold text-slate-950 group-hover:text-blue-700">
                        {bugIssue.title || "Untitled bug"}
                      </h3>
                    </button>

                    <p className="min-w-0 truncate text-xs font-medium text-slate-500">
                      {getProjectName(bugIssue, projects)}
                    </p>
                    <p className="min-w-0 truncate text-xs font-medium text-slate-500">
                      {resolveBugDetails(bugIssue)?.moduleName || "Unmapped module"}
                    </p>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={severityBadgeClassName(severity)}>{severity}</span>
                      <span className={priorityBadgeClassName(bugIssue.priority || "Medium")}>{bugIssue.priority || "Medium"}</span>
                    </div>

                    <div className="relative flex items-center justify-end gap-1">
                      <Button
                        className="h-8 w-8 rounded-lg p-0"
                        type="button"
                        size="icon"
                        variant="outline"
                        onClick={() => setSelectedBug(bugIssue)}
                        aria-label="View bug"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        data-triage-action-trigger
                        className="h-8 w-8 rounded-lg p-0"
                        type="button"
                        size="icon"
                        variant="outline"
                        onClick={(event) => handleToggleActionMenu(event, bugIssue._id)}
                        aria-label="More actions"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                      {renderTriageActionMenu(bugIssue)}
                    </div>
                  </article>
                );
              })}
            </div>
            <div className="flex flex-col gap-2 border-t border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs font-medium text-slate-500">
                Triage page {triagePagination.page} of {triagePagination.totalPages}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  className="h-8 rounded-lg px-3 text-xs"
                  type="button"
                  variant="outline"
                  disabled={triagePagination.page <= 1}
                  onClick={() => setTriagePage((current) => Math.max(1, current - 1))}
                >
                  Previous
                </Button>
                <Button
                  className="h-8 rounded-lg px-3 text-xs"
                  type="button"
                  variant="outline"
                  disabled={triagePagination.page >= triagePagination.totalPages}
                  onClick={() => setTriagePage((current) => Math.min(triagePagination.totalPages, current + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
            </>
          ) : (
            <div className="bg-slate-50/80 p-6">
              <EmptyState
                title="No bugs need triage"
                description="New, open, or unassigned bugs will appear here for quick review."
                icon={<ListChecks className="h-5 w-5" />}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <IssueDetailsDialog
        deletingId={deleteIssueMutation.isPending ? deleteIssueMutation.variables : ""}
        issue={selectedBug}
        onDeleteIssue={async (issueId) => {
          const confirmed = window.confirm(
            "Delete this bug? This will remove it from active bug lists."
          );

          if (!confirmed) {
            return false;
          }

          await deleteIssueMutation.mutateAsync(issueId);
          return true;
        }}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedBug(null);

            if (searchParams.get("bug")) {
              const nextParams = new URLSearchParams(searchParams);
              nextParams.delete("bug");
              setSearchParams(nextParams, { replace: true });
            }
          }
        }}
        onUpdateIssue={(id, payload) =>
          updateIssueMutation.mutateAsync({ id, payload })
        }
        open={Boolean(selectedBug)}
        projects={projects}
        availableIssues={[]}
        updatingId={updateIssueMutation.isPending ? updateIssueMutation.variables?.id : ""}
        canEditCoreDetails
        canEditPriority
        canEditAssignee
        canDeleteIssue
      />

      <ToastNotice toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
};

export default AdminBugsPage;
