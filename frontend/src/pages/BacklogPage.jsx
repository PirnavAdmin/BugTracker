import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Filter,
  Flag,
  FolderKanban,
  KanbanSquare,
  Layers3,
  List,
  MoreVertical,
  Plus,
  Search,
  TimerReset,
  UserRound,
  Zap,
} from "lucide-react";
import {
  completeSprint,
  createEpic,
  createSprint,
  deleteEpic,
  deleteSprint,
  fetchBacklogBoard,
  fetchProjects,
  reopenSprint,
  reorderIssuePlanning,
  startSprint,
  updateEpic,
  updateIssue,
  updateIssuePlanning,
  updateSprint,
} from "@/lib/api";
import {
  findProjectById,
  getProjectMembers,
  getProjectTeams,
  resolveTeamId,
} from "@/lib/project-teams";
import EpicDialog from "@/components/backlog/EpicDialog";
import IssueDetailsDrawer from "@/components/backlog/IssueDetailsDrawer";
import IssuePlanningCard from "@/components/backlog/IssuePlanningCard";
import SprintCompletionDialog from "@/components/backlog/SprintCompletionDialog";
import SprintDialog from "@/components/backlog/SprintDialog";
import SprintSection from "@/components/backlog/SprintSection";
import EmptyState from "@/components/shared/EmptyState";
import ToastNotice from "@/components/shared/ToastNotice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { getSprintLifecycleState, isSprintLocked } from "@/lib/issues";
import { ROLE_ADMIN } from "@/lib/roles";
import { cn, formatDate } from "@/lib/utils";

const BACKLOG_PROJECT_FILTER_STORAGE_KEY = "pirnav.backlog.projectId";

const readStoredBacklogProjectId = () => {
  if (typeof window === "undefined") {
    return "";
  }

  return window.localStorage.getItem(BACKLOG_PROJECT_FILTER_STORAGE_KEY) || "";
};

const persistBacklogProjectId = (projectId) => {
  if (typeof window === "undefined") {
    return;
  }

  if (projectId) {
    window.localStorage.setItem(BACKLOG_PROJECT_FILTER_STORAGE_KEY, String(projectId));
    return;
  }

  window.localStorage.removeItem(BACKLOG_PROJECT_FILTER_STORAGE_KEY);
};

const createDefaultFilters = () => ({
  projectId: readStoredBacklogProjectId(),
  teamId: "all",
  assigneeId: "all",
  epicId: "all",
  sprintId: "all",
  priority: "all",
  status: "all",
  search: "",
  dateFrom: "",
  dateTo: "",
  includeCompletedSprints: false,
});

const BACKLOG_PLANNING_TYPE_KEYS = new Set(["STORY"]);

const normalizeBacklogIssueType = (value = "") =>
  String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");

const isBacklogPlanningIssue = (issue) =>
  BACKLOG_PLANNING_TYPE_KEYS.has(normalizeBacklogIssueType(issue?.type));

const createBoardState = (data) => ({
  backlogIssues: Array.isArray(data?.backlogIssues)
    ? data.backlogIssues.filter(isBacklogPlanningIssue)
    : [],
  sprintSections: Array.isArray(data?.sprintSections)
    ? data.sprintSections.map((section) => ({
        ...section,
        issues: Array.isArray(section?.issues)
          ? section.issues.filter(isBacklogPlanningIssue)
          : [],
      }))
    : [],
});

const sortByCreatedAt = (left, right) =>
  new Date(left?.createdAt || 0).getTime() - new Date(right?.createdAt || 0).getTime();

const sortEpicsByPlanning = (epics = []) =>
  [...epics].sort((left, right) => {
    const planningDelta = Number(left?.planningOrder || 0) - Number(right?.planningOrder || 0);

    if (planningDelta !== 0) {
      return planningDelta;
    }

    return sortByCreatedAt(left, right);
  });

const resolveBacklogEpicId = (value) => String(value?._id || value || "");
const resolveBacklogAssigneeId = (issue) =>
  String(issue?.assigneeId || issue?.assignee?._id || issue?.assignee || "");
const resolveBacklogTeamId = (issue) => String(issue?.teamId?._id || issue?.teamId || "");

const issueMatchesBacklogFilters = (issue, filters) => {
  if (!issue) {
    return false;
  }

  if (!isBacklogPlanningIssue(issue)) {
    return false;
  }

  if (filters.teamId !== "all" && resolveBacklogTeamId(issue) !== String(filters.teamId)) {
    return false;
  }

  if (
    filters.assigneeId !== "all" &&
    resolveBacklogAssigneeId(issue) !== String(filters.assigneeId)
  ) {
    return false;
  }

  const sprintId = String(issue?.sprintId?._id || issue?.sprintId || "");

  if (filters.sprintId === "backlog" && sprintId) {
    return false;
  }

  if (
    filters.sprintId !== "all" &&
    filters.sprintId !== "backlog" &&
    sprintId !== String(filters.sprintId)
  ) {
    return false;
  }

  if (filters.priority !== "all" && issue.priority !== filters.priority) {
    return false;
  }

  if (filters.status !== "all" && issue.status !== filters.status) {
    return false;
  }

  if (filters.epicId === "unassigned" && resolveBacklogEpicId(issue?.epicId)) {
    return false;
  }

  if (
    filters.epicId !== "all" &&
    filters.epicId !== "unassigned" &&
    resolveBacklogEpicId(issue?.epicId) !== String(filters.epicId)
  ) {
    return false;
  }

  const searchTerm = filters.search?.trim().toLowerCase() || "";

  if (searchTerm) {
    const searchableFields = [issue.title, issue.description]
      .filter(Boolean)
      .map((value) => String(value).toLowerCase());

    if (!searchableFields.some((value) => value.includes(searchTerm))) {
      return false;
    }
  }

  const createdAt = issue?.createdAt ? new Date(issue.createdAt) : null;

  if (filters.dateFrom && createdAt) {
    const dateFrom = new Date(filters.dateFrom);
    dateFrom.setHours(0, 0, 0, 0);

    if (createdAt < dateFrom) {
      return false;
    }
  }

  if (filters.dateTo && createdAt) {
    const dateTo = new Date(filters.dateTo);
    dateTo.setHours(23, 59, 59, 999);

    if (createdAt > dateTo) {
      return false;
    }
  }

  return true;
};

const rebuildBacklogSummary = (data) => {
  const backlogIssues = Array.isArray(data?.backlogIssues)
    ? data.backlogIssues.filter(isBacklogPlanningIssue)
    : [];
  const sprintSections = Array.isArray(data?.sprintSections)
    ? data.sprintSections.map((section) => ({
        ...section,
        issues: Array.isArray(section?.issues)
          ? section.issues.filter(isBacklogPlanningIssue)
          : [],
      }))
    : [];
  const totalVisibleIssues =
    backlogIssues.length +
    sprintSections.reduce((total, section) => total + (section?.issues?.length || 0), 0);

  return {
    ...(data?.summary || {}),
    totalVisibleIssues,
    backlogIssueCount: backlogIssues.length,
    activeSprintCount: sprintSections.filter((section) => section?.sprint?.state === "ACTIVE")
      .length,
    plannedSprintCount: sprintSections.filter((section) => section?.sprint?.state === "PLANNED")
      .length,
    completedSprintCount: sprintSections.filter(
      (section) => section?.sprint?.state === "COMPLETED"
    ).length,
  };
};

const rebuildBacklogEpics = (epics = [], backlogIssues = [], sprintSections = []) => {
  const visibleIssues = [
    ...backlogIssues,
    ...sprintSections.flatMap((section) => section?.issues || []),
  ].filter(isBacklogPlanningIssue);
  const epicCounts = visibleIssues.reduce((counts, issue) => {
    const epicId = resolveBacklogEpicId(issue?.epicId);

    if (!epicId) {
      return counts;
    }

    counts.set(epicId, (counts.get(epicId) || 0) + 1);
    return counts;
  }, new Map());

  return sortEpicsByPlanning(epics).map((epic) => ({
    ...epic,
    issueCount: epicCounts.get(String(epic._id)) || 0,
  }));
};

const updateBacklogIssueCollections = (data, filters, updater) => {
  const backlogIssues = (data?.backlogIssues || [])
    .map((issue) => updater(issue))
    .filter((issue) => issueMatchesBacklogFilters(issue, filters));
  const sprintSections = (data?.sprintSections || []).map((section) => ({
    ...section,
    issues: (section?.issues || [])
      .map((issue) => updater(issue))
      .filter((issue) => issueMatchesBacklogFilters(issue, filters)),
  }));

  return {
    backlogIssues,
    sprintSections,
  };
};

const BacklogSkeleton = () => (
  <div className="grid h-full min-h-0 w-full gap-4 overflow-hidden lg:grid-cols-[238px_minmax(0,1fr)]">
    <Skeleton className="hidden h-full w-full rounded-none lg:block" />
    <div className="min-h-0 space-y-4 overflow-y-auto p-4">
      <Skeleton className="h-32 w-full rounded-[20px]" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Skeleton className="h-28 w-full rounded-[18px]" />
        <Skeleton className="h-28 w-full rounded-[18px]" />
        <Skeleton className="h-28 w-full rounded-[18px]" />
        <Skeleton className="h-28 w-full rounded-[18px]" />
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(360px,0.92fr)_minmax(420px,1.08fr)]">
        <Skeleton className="h-[560px] w-full rounded-[20px]" />
        <Skeleton className="h-[560px] w-full rounded-[20px]" />
      </div>
    </div>
  </div>
);

const PLANNING_NAV_ITEMS = [
  { label: "Overview", icon: BookOpen },
  { label: "Backlog", icon: ClipboardList, active: true },
  { label: "Active Sprint", icon: Flag },
  { label: "Upcoming Sprints", icon: CalendarDays },
  { label: "Completed Sprints", icon: CheckCircle2 },
  { label: "Epics", icon: Layers3 },
  { label: "My Work", icon: UserRound },
];

const getIssueProgressPercent = (issue) =>
  Math.max(0, Math.min(100, Number(issue?.storyProgress?.percent || 0)));

const getSprintIssueMetrics = (issues = []) => {
  const totals = issues.reduce(
    (metrics, issue) => {
      const progress = issue?.storyProgress || {};

      metrics.taskCount += Number(progress.taskCount || 0);
      metrics.completedTaskCount += Number(progress.completedTaskCount || 0);
      metrics.bugCount += Number(progress.bugCount || 0);
      metrics.resolvedBugCount += Number(progress.resolvedBugCount || 0);
      metrics.progressTotal += getIssueProgressPercent(issue);
      return metrics;
    },
    {
      taskCount: 0,
      completedTaskCount: 0,
      bugCount: 0,
      resolvedBugCount: 0,
      progressTotal: 0,
    }
  );
  const issueCount = issues.length;

  return {
    ...totals,
    issueCount,
    completionPercent: issueCount ? Math.round(totals.progressTotal / issueCount) : 0,
  };
};

const PlanningFilterSelect = ({ label, value, onChange, children, disabled = false }) => (
  <label className="space-y-1">
    <span className="text-[11px] font-medium text-slate-500">{label}</span>
    <select
      className="field-select h-9 rounded-[8px] border-slate-200 bg-white px-2.5 py-1.5 text-xs shadow-sm disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
    >
      {children}
    </select>
  </label>
);

const PlanningSidebar = ({
  filters,
  projects = [],
  teams = [],
  members = [],
  epics = [],
  sprints = [],
  permissions = {},
  onChange,
  onResetFilters,
  onCreateSprint,
  onCreateEpic,
  onAddWorkItem,
}) => (
  <aside className="min-h-0 min-w-0 border-r border-[#EEF2F7] bg-white/72 pr-3">
    <details className="group sticky top-0 flex h-full min-h-0 flex-col py-3" open>
      <summary className="flex cursor-pointer list-none items-center justify-between rounded-lg px-3 py-1 lg:pointer-events-none">
        <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-700">
          <Zap className="h-3.5 w-3.5 text-blue-500" />
          Planning
        </span>
        <ChevronDown className="h-4 w-4 text-slate-400 transition group-open:rotate-180 lg:hidden" />
      </summary>

      <div className="mt-3 min-h-0 flex-1 space-y-4 overflow-y-auto px-3 pb-5">
        <nav className="space-y-1">
          {PLANNING_NAV_ITEMS.map(({ label, icon: Icon, active }) => (
            <button
              key={label}
              type="button"
              className={cn(
                "flex h-9 w-full items-center gap-2 rounded-[8px] px-2.5 text-left text-sm font-medium transition",
                active
                  ? "bg-[linear-gradient(135deg,rgba(79,70,229,0.12),rgba(14,165,233,0.1))] text-blue-700 shadow-sm"
                  : "text-slate-600 hover:bg-slate-100/80 hover:text-slate-950"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{label}</span>
            </button>
          ))}
        </nav>

        <div className="border-t border-slate-200/70 pt-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-700">
              <Filter className="h-3.5 w-3.5 text-blue-500" />
              Filters
            </span>
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={onResetFilters}>
              <TimerReset className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="space-y-2.5">
            <PlanningFilterSelect label="Project" value={filters.projectId} onChange={(value) => onChange("projectId", value)}>
              <option value="">Choose project</option>
              {projects.map((project) => (
                <option key={project._id} value={project._id}>
                  {project.name}
                </option>
              ))}
            </PlanningFilterSelect>
            <PlanningFilterSelect label="Team" value={filters.teamId} onChange={(value) => onChange("teamId", value)}>
              <option value="all">All teams</option>
              {teams.map((team) => (
                <option key={team._id} value={team._id}>
                  {team.name}
                </option>
              ))}
            </PlanningFilterSelect>
            <PlanningFilterSelect label="Assignee" value={filters.assigneeId} onChange={(value) => onChange("assigneeId", value)}>
              <option value="all">All members</option>
              {members.map((member) => (
                <option key={member._id} value={member._id}>
                  {member.name}
                </option>
              ))}
            </PlanningFilterSelect>
            <PlanningFilterSelect
              label="Sprint Scope"
              value={filters.includeCompletedSprints ? "all" : "active"}
              onChange={(value) => onChange("includeCompletedSprints", value === "all")}
            >
              <option value="active">Planned + active</option>
              <option value="all">Include completed</option>
            </PlanningFilterSelect>
            <PlanningFilterSelect label="Sprint" value={filters.sprintId} onChange={(value) => onChange("sprintId", value)}>
              <option value="all">All sprints</option>
              <option value="backlog">Backlog only</option>
              {sprints.map((sprint) => (
                <option key={sprint._id} value={sprint._id}>
                  {sprint.name}
                </option>
              ))}
            </PlanningFilterSelect>
            <PlanningFilterSelect label="Epic" value={filters.epicId} onChange={(value) => onChange("epicId", value)}>
              <option value="all">All epics</option>
              <option value="unassigned">Unassigned epic</option>
              {epics.map((epic) => (
                <option key={epic._id} value={epic._id}>
                  {epic.name}
                </option>
              ))}
            </PlanningFilterSelect>
            <PlanningFilterSelect label="Priority" value={filters.priority} onChange={(value) => onChange("priority", value)}>
              <option value="all">All priorities</option>
              <option value="Critical">Critical</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </PlanningFilterSelect>
            <PlanningFilterSelect label="Status" value={filters.status} onChange={(value) => onChange("status", value)}>
              <option value="all">All statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="READY">Ready</option>
              <option value="SPRINT_BACKLOG">Sprint Backlog</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="TESTING">Testing</option>
              <option value="READY_FOR_UAT">Ready for UAT</option>
              <option value="DONE">Done</option>
              <option value="CLOSED">Closed</option>
            </PlanningFilterSelect>
            <PlanningFilterSelect label="Issue Type" value="STORY" disabled onChange={() => {}}>
              <option value="STORY">Story items</option>
            </PlanningFilterSelect>
            <label className="space-y-1">
              <span className="text-[11px] font-medium text-slate-500">Created From</span>
              <Input
                type="date"
                className="h-9 rounded-[8px] border-slate-200 bg-white px-2.5 text-xs shadow-sm"
                value={filters.dateFrom}
                onChange={(event) => onChange("dateFrom", event.target.value)}
              />
            </label>
            <label className="space-y-1">
              <span className="text-[11px] font-medium text-slate-500">Created To</span>
              <Input
                type="date"
                className="h-9 rounded-[8px] border-slate-200 bg-white px-2.5 text-xs shadow-sm"
                value={filters.dateTo}
                onChange={(event) => onChange("dateTo", event.target.value)}
              />
            </label>
          </div>
        </div>

        <div className="border-t border-slate-200/70 pt-4">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-700">
            Quick Actions
          </span>
          <div className="mt-3 space-y-2">
            {permissions.canManageEpics ? (
              <Button type="button" variant="outline" className="h-9 w-full justify-start rounded-[8px]" onClick={onCreateEpic}>
                <Plus className="h-4 w-4" />
                Create Epic
              </Button>
            ) : null}
            {permissions.canManageSprints ? (
              <Button type="button" variant="outline" className="h-9 w-full justify-start rounded-[8px] border-emerald-100 bg-emerald-50/70 text-emerald-700 hover:bg-emerald-100/70" onClick={onCreateSprint}>
                <Plus className="h-4 w-4" />
                Create Sprint
              </Button>
            ) : null}
            <Button type="button" variant="outline" className="h-9 w-full justify-start rounded-[8px] border-blue-100 bg-blue-50/70 text-blue-700 hover:bg-blue-100/70" onClick={onAddWorkItem}>
              <Plus className="h-4 w-4" />
              Add Work Item
            </Button>
          </div>
        </div>
      </div>
    </details>
  </aside>
);

const PlanningHeader = ({
  filters,
  permissions = {},
  selectedEpic = null,
  onChange,
  onCreateEpic,
  onCreateSprint,
  onEditEpic,
  onDeleteEpic,
}) => (
  <section className="rounded-[20px] border border-white/70 bg-white/88 p-4 shadow-[0_18px_48px_-38px_rgba(15,23,42,0.36)] backdrop-blur-xl">
    <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Planning Hub</h1>
        <p className="mt-1 text-sm text-slate-600">
          Prioritize work, organize your backlog and plan successful sprints.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {permissions.canManageEpics && selectedEpic ? (
          <>
            <Button type="button" variant="outline" className="h-9 rounded-[8px]" onClick={onEditEpic}>
              Edit Epic
            </Button>
            <Button type="button" variant="outline" className="h-9 rounded-[8px]" onClick={onDeleteEpic}>
              Delete Epic
            </Button>
          </>
        ) : null}
        {permissions.canManageEpics ? (
          <Button type="button" variant="outline" className="h-9 rounded-[8px]" onClick={onCreateEpic}>
            <Plus className="h-4 w-4" />
            Create Epic
          </Button>
        ) : null}
        {permissions.canManageSprints ? (
          <Button type="button" className="h-9 rounded-[8px]" onClick={onCreateSprint}>
            <Plus className="h-4 w-4" />
            Create Sprint
          </Button>
        ) : null}
      </div>
    </div>

    <div className="mt-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
      <div className="relative max-w-xl flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          className="h-10 rounded-[8px] border-slate-200 bg-white pl-9 text-sm shadow-sm"
          placeholder="Search backlog items, epics, sprints..."
          value={filters.search}
          onChange={(event) => onChange("search", event.target.value)}
        />
      </div>
      <div className="flex items-center gap-2">
        <div className="inline-flex rounded-[8px] border border-slate-200 bg-white p-1 shadow-sm">
          <Button type="button" size="sm" className="h-8 rounded-[6px] px-3">
            <List className="h-4 w-4" />
            List
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-8 rounded-[6px] px-3 text-slate-600">
            <KanbanSquare className="h-4 w-4" />
            Board
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-8 rounded-[6px] px-3 text-slate-600">
            <BarChart3 className="h-4 w-4" />
            Timeline
          </Button>
        </div>
        <Button type="button" variant="outline" size="icon" className="h-10 w-10 rounded-[8px]">
          <MoreVertical className="h-4 w-4" />
        </Button>
      </div>
    </div>
  </section>
);

const SummaryCard = ({ title, value, detail, icon: Icon, accentClass, progress = null }) => (
  <div className="rounded-[18px] border border-white/70 bg-white/90 p-4 shadow-[0_16px_42px_-34px_rgba(15,23,42,0.34)] backdrop-blur-xl">
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-sm font-semibold text-slate-600">{title}</p>
        <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{value}</p>
        {detail ? <p className="mt-1 text-xs font-medium text-slate-500">{detail}</p> : null}
      </div>
      <div className={cn("flex h-11 w-11 items-center justify-center rounded-full", accentClass)}>
        <Icon className="h-5 w-5" />
      </div>
    </div>
    {progress !== null ? (
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200">
        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${progress}%` }} />
      </div>
    ) : null}
  </div>
);

const PlanningSummary = ({ backlogCount = 0, activeIssueCount = 0, activeProgress = 0, plannedCount = 0, unassignedCount = 0 }) => (
  <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
    <SummaryCard title="Backlog" value={backlogCount} detail="+ this planning view" icon={Layers3} accentClass="bg-indigo-50 text-indigo-600" />
    <SummaryCard title="Active Sprint" value={`${activeIssueCount} issues`} detail={`${activeProgress}% completed`} icon={Flag} accentClass="bg-emerald-50 text-emerald-600" progress={activeProgress} />
    <SummaryCard title="Upcoming Sprints" value={plannedCount} detail="Ready to plan" icon={CalendarDays} accentClass="bg-amber-50 text-amber-600" />
    <SummaryCard title="Needs Assignment" value={unassignedCount} detail="Unassigned epic" icon={UserRound} accentClass="bg-rose-50 text-rose-600" />
  </section>
);

const findIssueById = (boardState, issueId) => {
  if (!issueId) {
    return null;
  }

  const backlogIssue = boardState.backlogIssues.find(
    (issue) => String(issue._id) === String(issueId)
  );

  if (backlogIssue) {
    return backlogIssue;
  }

  for (const section of boardState.sprintSections) {
    const sprintIssue = section.issues.find(
      (issue) => String(issue._id) === String(issueId)
    );

    if (sprintIssue) {
      return sprintIssue;
    }

  }

  return null;
};

const getAllBoardIssues = (boardState) => [
  ...boardState.backlogIssues,
  ...boardState.sprintSections.flatMap((section) => section.issues),
];

const moveIssueLocally = ({ boardState, issueId, destinationSprintId = "", overIssueId = "" }) => {
  const nextState = {
    backlogIssues: [...boardState.backlogIssues],
    sprintSections: boardState.sprintSections.map((section) => ({
      ...section,
      issues: [...section.issues],
    })),
  };
  let movingIssue = null;

  nextState.backlogIssues = nextState.backlogIssues.filter((issue) => {
    if (String(issue._id) === String(issueId)) {
      movingIssue = issue;
      return false;
    }

    return true;
  });

  nextState.sprintSections = nextState.sprintSections.map((section) => {
    const filteredIssues = section.issues.filter((issue) => {
      if (String(issue._id) === String(issueId)) {
        movingIssue = issue;
        return false;
      }

      return true;
    });

    return {
      ...section,
      issues: filteredIssues,
    };
  });

  if (!movingIssue) {
    return boardState;
  }

  if (!isBacklogPlanningIssue(movingIssue)) {
    return boardState;
  }

  if (!destinationSprintId) {
    movingIssue = {
      ...movingIssue,
      sprintId: null,
    };
    const destinationIssues = [...nextState.backlogIssues];
    const insertIndex = overIssueId
      ? destinationIssues.findIndex((issue) => String(issue._id) === String(overIssueId))
      : -1;

    if (insertIndex >= 0) {
      destinationIssues.splice(insertIndex, 0, movingIssue);
    } else {
      destinationIssues.push(movingIssue);
    }

    nextState.backlogIssues = destinationIssues;
    return nextState;
  }

  nextState.sprintSections = nextState.sprintSections.map((section) => {
    if (String(section.sprint._id) !== String(destinationSprintId)) {
      return section;
    }

    const destinationIssues = [...section.issues];
    const insertIndex = overIssueId
      ? destinationIssues.findIndex((issue) => String(issue._id) === String(overIssueId))
      : -1;
    const nextIssue = {
      ...movingIssue,
      sprintId: section.sprint,
    };

    if (insertIndex >= 0) {
      destinationIssues.splice(insertIndex, 0, nextIssue);
    } else {
      destinationIssues.push(nextIssue);
    }

    return {
      ...section,
      issues: destinationIssues,
    };
  });

  return nextState;
};

const BacklogPage = () => {
  const { role } = useAuth();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState(createDefaultFilters);
  const [boardState, setBoardState] = useState(createBoardState(null));
  const [selectedIssueId, setSelectedIssueId] = useState("");
  const [draggedIssueId, setDraggedIssueId] = useState("");
  const [toast, setToast] = useState(null);
  const [epicDialogState, setEpicDialogState] = useState({
    open: false,
    epic: null,
  });
  const [sprintDialogState, setSprintDialogState] = useState({
    open: false,
    sprint: null,
  });
  const [completionSprint, setCompletionSprint] = useState(null);
  const [isEpicSubmitting, setIsEpicSubmitting] = useState(false);
  const previousProjectIdRef = useRef(filters.projectId);
  const deferredSearch = useDeferredValue(filters.search);
  const queryFilters = useMemo(
    () => ({
      ...filters,
      search: deferredSearch,
    }),
    [deferredSearch, filters]
  );

  const {
    data: projects = [],
    isLoading: isProjectsLoading,
    error: projectsError,
  } = useQuery({
    queryKey: ["projects"],
    queryFn: fetchProjects,
  });

  useEffect(() => {
    persistBacklogProjectId(filters.projectId);
  }, [filters.projectId]);

  useEffect(() => {
    if (isProjectsLoading || !filters.projectId) {
      return;
    }

    if (projects.some((project) => String(project._id) === String(filters.projectId))) {
      return;
    }

    setFilters((current) => ({
      ...current,
      projectId: "",
      teamId: "all",
      assigneeId: "all",
      epicId: "all",
      sprintId: "all",
      priority: "all",
      status: "all",
    }));
  }, [filters.projectId, isProjectsLoading, projects]);

  useEffect(() => {
    if (previousProjectIdRef.current === filters.projectId) {
      return;
    }

    previousProjectIdRef.current = filters.projectId;
    setBoardState(createBoardState(null));
    setSelectedIssueId("");
  }, [filters.projectId]);

  const selectedProject = useMemo(
    () => findProjectById(projects, filters.projectId),
    [filters.projectId, projects]
  );
  const availableTeams = useMemo(
    () => getProjectTeams(selectedProject),
    [selectedProject]
  );
  const availableMembers = useMemo(
    () => getProjectMembers(selectedProject),
    [selectedProject]
  );

  useEffect(() => {
    if (!availableTeams.length) {
      if (filters.teamId !== "all") {
        setFilters((current) => ({
          ...current,
          teamId: "all",
        }));
      }
      return;
    }

    if (
      filters.teamId === "all" ||
      availableTeams.some((team) => resolveTeamId(team) === String(filters.teamId))
    ) {
      return;
    }

    setFilters((current) => ({
      ...current,
      teamId: "all",
    }));
  }, [availableTeams, filters.teamId]);

  useEffect(() => {
    if (!availableMembers.length) {
      if (filters.assigneeId !== "all") {
        setFilters((current) => ({
          ...current,
          assigneeId: "all",
        }));
      }
      return;
    }

    if (
      filters.assigneeId === "all" ||
      availableMembers.some((member) => String(member._id) === String(filters.assigneeId))
    ) {
      return;
    }

    setFilters((current) => ({
      ...current,
      assigneeId: "all",
    }));
  }, [availableMembers, filters.assigneeId]);

  const {
    data: backlogData,
    isLoading: isBacklogLoading,
    error: backlogError,
  } = useQuery({
    queryKey: ["backlog", queryFilters],
    queryFn: () => fetchBacklogBoard(queryFilters),
    enabled: Boolean(filters.projectId),
  });

  useEffect(() => {
    if (!backlogData) {
      return;
    }

    setBoardState(createBoardState(backlogData));
  }, [backlogData]);

  useEffect(() => {
    if (
      filters.epicId === "all" ||
      filters.epicId === "unassigned" ||
      !backlogData?.epics
    ) {
      return;
    }

    if (
      backlogData.epics.some((epic) => String(epic._id) === String(filters.epicId))
    ) {
      return;
    }

    setFilters((current) => ({
      ...current,
      epicId: "all",
    }));
  }, [backlogData?.epics, filters.epicId]);

  useEffect(() => {
    if (!selectedIssueId) {
      return;
    }

    if (findIssueById(boardState, selectedIssueId)) {
      return;
    }

    setSelectedIssueId("");
  }, [boardState, selectedIssueId]);

  const permissions = backlogData?.permissions || {};
  const selectedIssue = useMemo(
    () => findIssueById(boardState, selectedIssueId),
    [boardState, selectedIssueId]
  );
  const selectedEpic = useMemo(
    () =>
      (backlogData?.epics || []).find((epic) => String(epic._id) === String(filters.epicId)) ||
      null,
    [backlogData?.epics, filters.epicId]
  );
  const allSprints = useMemo(
    () => boardState.sprintSections.map((section) => section.sprint),
    [boardState.sprintSections]
  );
  const assignableSprints = useMemo(
    () => allSprints.filter((sprint) => !isSprintLocked(sprint)),
    [allSprints]
  );
  const plannedSprints = useMemo(
    () => allSprints.filter((sprint) => sprint.state === "PLANNED"),
    [allSprints]
  );
  const activeSprintSection = useMemo(
    () =>
      boardState.sprintSections.find(
        (section) => getSprintLifecycleState(section.sprint) === "ACTIVE"
      ) || null,
    [boardState.sprintSections]
  );
  const activeSprintMetrics = useMemo(
    () => getSprintIssueMetrics(activeSprintSection?.issues || []),
    [activeSprintSection?.issues]
  );
  const sprintSectionsForDisplay = useMemo(() => {
    if (!activeSprintSection) {
      return boardState.sprintSections;
    }

    return [
      activeSprintSection,
      ...boardState.sprintSections.filter(
        (section) => String(section.sprint._id) !== String(activeSprintSection.sprint._id)
      ),
    ];
  }, [activeSprintSection, boardState.sprintSections]);
  const planningIssues = useMemo(() => getAllBoardIssues(boardState), [boardState]);
  const unassignedEpicCount = useMemo(
    () => planningIssues.filter((issue) => !issue?.epicId?._id && !issue?.epicId).length,
    [planningIssues]
  );

  const syncCurrentBacklogData = (updater) => {
    queryClient.setQueryData(["backlog", queryFilters], (current) => {
      if (!current) {
        return current;
      }

      const nextData = updater(current);

      if (!nextData) {
        return current;
      }

      return {
        ...nextData,
        summary: rebuildBacklogSummary(nextData),
      };
    });
  };

  const insertEpicIntoCurrentBacklog = (epic) => {
    syncCurrentBacklogData((current) => {
      const epicsById = new Map(
        (current?.epics || []).map((currentEpic) => [String(currentEpic._id), currentEpic])
      );

      epicsById.set(String(epic._id), {
        ...epic,
        issueCount: epicsById.get(String(epic._id))?.issueCount || 0,
      });

      return {
        ...current,
        epics: rebuildBacklogEpics(
          Array.from(epicsById.values()),
          current.backlogIssues,
          current.sprintSections
        ),
      };
    });
  };

  const updateEpicInCurrentBacklog = (epic) => {
    syncCurrentBacklogData((current) => {
      const currentEpics = current?.epics || [];

      if (!currentEpics.some((currentEpic) => String(currentEpic._id) === String(epic._id))) {
        return current;
      }

      const { backlogIssues, sprintSections } = updateBacklogIssueCollections(
        current,
        queryFilters,
        (issue) => {
          if (resolveBacklogEpicId(issue?.epicId) !== String(epic._id)) {
            return issue;
          }

          return {
            ...issue,
            epicId: {
              ...(typeof issue?.epicId === "object" && issue?.epicId ? issue.epicId : {}),
              ...epic,
            },
          };
        }
      );

      return {
        ...current,
        backlogIssues,
        sprintSections,
        epics: rebuildBacklogEpics(
          currentEpics.map((currentEpic) =>
            String(currentEpic._id) === String(epic._id)
              ? {
                  ...currentEpic,
                  ...epic,
                }
              : currentEpic
          ),
          backlogIssues,
          sprintSections
        ),
      };
    });
  };

  const removeEpicFromCurrentBacklog = (epicId) => {
    syncCurrentBacklogData((current) => ({
      ...current,
      epics: rebuildBacklogEpics(
        (current?.epics || []).filter(
          (currentEpic) => String(currentEpic._id) !== String(epicId)
        ),
        current.backlogIssues,
        current.sprintSections
      ),
    }));
  };

  const assignIssuesToEpicInCurrentBacklog = (epic, issueIds = []) => {
    if (!issueIds.length) {
      return;
    }

    const issueIdSet = new Set(issueIds.map((issueId) => String(issueId)));

    syncCurrentBacklogData((current) => {
      const { backlogIssues, sprintSections } = updateBacklogIssueCollections(
        current,
        queryFilters,
        (issue) => {
          if (!issueIdSet.has(String(issue?._id))) {
            return issue;
          }

          return {
            ...issue,
            epicId: epic,
          };
        }
      );

      return {
        ...current,
        backlogIssues,
        sprintSections,
        epics: rebuildBacklogEpics(
          (current?.epics || []).map((currentEpic) =>
            String(currentEpic._id) === String(epic._id)
              ? {
                  ...currentEpic,
                  ...epic,
                }
              : currentEpic
          ),
          backlogIssues,
          sprintSections
        ),
      };
    });
  };

  const invalidatePlanningQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["backlog"],
      }),
      queryClient.invalidateQueries({
        queryKey: ["issues"],
      }),
      queryClient.invalidateQueries({
        queryKey: ["reports"],
      }),
      queryClient.invalidateQueries({
        queryKey: ["analytics"],
      }),
    ]);
  };

  const createEpicMutation = useMutation({
    mutationFn: createEpic,
  });
  const updateEpicMutation = useMutation({
    mutationFn: updateEpic,
  });
  const deleteEpicMutation = useMutation({
    mutationFn: deleteEpic,
    onSuccess: async (_response, variables) => {
      setFilters((current) => ({
        ...current,
        epicId: "all",
      }));
      removeEpicFromCurrentBacklog(variables?.id);
      await invalidatePlanningQueries();
    },
  });
  const createSprintMutation = useMutation({
    mutationFn: createSprint,
    onSuccess: async () => invalidatePlanningQueries(),
  });
  const updateSprintMutation = useMutation({
    mutationFn: updateSprint,
    onSuccess: async () => invalidatePlanningQueries(),
  });
  const deleteSprintMutation = useMutation({
    mutationFn: deleteSprint,
    onSuccess: async () => invalidatePlanningQueries(),
  });
  const startSprintMutation = useMutation({
    mutationFn: startSprint,
    onSuccess: async () => invalidatePlanningQueries(),
  });
  const completeSprintMutation = useMutation({
    mutationFn: completeSprint,
    onSuccess: async () => invalidatePlanningQueries(),
  });
  const reopenSprintMutation = useMutation({
    mutationFn: reopenSprint,
    onSuccess: async () => invalidatePlanningQueries(),
  });
  const updatePlanningMutation = useMutation({
    mutationFn: updateIssuePlanning,
    onSuccess: async () => invalidatePlanningQueries(),
  });
  const updateStatusMutation = useMutation({
    mutationFn: updateIssue,
    onSuccess: async () => invalidatePlanningQueries(),
  });
  const reorderMutation = useMutation({
    mutationFn: reorderIssuePlanning,
    onSuccess: async () => invalidatePlanningQueries(),
  });
  const planningUpdatingIssueId = updatePlanningMutation.isPending
    ? updatePlanningMutation.variables?.id || ""
    : "";
  const startingSprintId = startSprintMutation.isPending
    ? startSprintMutation.variables || ""
    : "";

  const handleFilterChange = (field, value) => {
    if (field === "projectId") {
      setFilters((current) => {
        const nextProjectId = String(value || "");

        if (String(current.projectId) === nextProjectId) {
          return current;
        }

        return {
          ...current,
          projectId: nextProjectId,
          teamId: "all",
          assigneeId: "all",
          epicId: "all",
          sprintId: "all",
          priority: "all",
          status: "all",
        };
      });
      return;
    }

    setFilters((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handlePlanningDrop = async ({ destinationSprintId = "", overIssueId = "" }) => {
    if (!draggedIssueId || !permissions.canReorderIssues) {
      return;
    }

    const previousState = boardState;
    const nextState = moveIssueLocally({
      boardState,
      issueId: draggedIssueId,
      destinationSprintId,
      overIssueId,
    });
    const destinationIssues = destinationSprintId
      ? nextState.sprintSections.find(
          (section) => String(section.sprint._id) === String(destinationSprintId)
        )?.issues || []
      : nextState.backlogIssues;
    const droppedIndex = destinationIssues.findIndex(
      (issue) => String(issue._id) === String(draggedIssueId)
    );
    const beforeIssueId =
      droppedIndex > 0 ? destinationIssues[droppedIndex - 1]?._id || "" : "";

    setBoardState(nextState);
    setDraggedIssueId("");

    try {
      await reorderMutation.mutateAsync({
        issueId: draggedIssueId,
        destinationSprintId: destinationSprintId || null,
        beforeIssueId,
        afterIssueId: overIssueId || "",
      });
    } catch (error) {
      setBoardState(previousState);
      setToast({
        type: "error",
        title: "Unable to reorder work item",
        message:
          error.response?.data?.message ||
          "The backlog order could not be saved. Your previous view was restored.",
      });
    }
  };

  const handleQuickMoveIssue = async (issueId, destinationSprintId = "") => {
    if (!permissions.canAssignIssues) {
      return;
    }

    const issue = findIssueById(boardState, issueId);

    if (!issue) {
      return;
    }

    const currentSprintId = String(issue?.sprintId?._id || issue?.sprintId || "");
    const nextSprintId = String(destinationSprintId || "");

    if (currentSprintId === nextSprintId) {
      return;
    }

    const previousState = boardState;
    const nextState = moveIssueLocally({
      boardState,
      issueId,
      destinationSprintId,
    });

    setBoardState(nextState);

    try {
      await updatePlanningMutation.mutateAsync({
        id: issueId,
        payload: {
          sprintId: destinationSprintId || null,
        },
      });
    } catch (error) {
      setBoardState(previousState);
      setToast({
        type: "error",
        title: "Unable to move work item",
        message:
          error.response?.data?.message ||
          "That work item could not be reassigned to the selected sprint.",
      });
    }
  };

  const handleResetFilters = () =>
    setFilters((current) => ({
      ...createDefaultFilters(),
      projectId: current.projectId,
    }));

  if (projectsError || backlogError) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-rose-700">
          {projectsError?.response?.data?.message ||
            backlogError?.response?.data?.message ||
            "Unable to load backlog planning data right now."}
        </CardContent>
      </Card>
    );
  }

  if (!isProjectsLoading && !projects.length) {
    return (
      <EmptyState
        title="No accessible project backlog yet"
        description="Attach the current user to a project team or create a new project first. Backlog planning appears per project."
        icon={<FolderKanban className="h-5 w-5" />}
      />
    );
  }

  if (isProjectsLoading || (filters.projectId && isBacklogLoading && !backlogData)) {
    return <BacklogSkeleton />;
  }

  if (!filters.projectId) {
    return (
      <div className="grid h-full min-h-0 w-full gap-4 overflow-hidden lg:grid-cols-[238px_minmax(0,1fr)]">
        <PlanningSidebar
          filters={filters}
          projects={projects}
          teams={availableTeams}
          members={availableMembers}
          permissions={{}}
          onChange={handleFilterChange}
          onResetFilters={handleResetFilters}
          onCreateSprint={() => setSprintDialogState({ open: true, sprint: null })}
          onCreateEpic={() => setEpicDialogState({ open: true, epic: null })}
          onAddWorkItem={() =>
            setToast({
              type: "info",
              message: "Select a project before adding work to the backlog.",
            })
          }
        />

        <main className="min-h-0 min-w-0 space-y-4 overflow-y-auto pr-1">
          <PlanningHeader
            filters={filters}
            permissions={{}}
            onChange={handleFilterChange}
            onCreateSprint={() => setSprintDialogState({ open: true, sprint: null })}
            onCreateEpic={() => setEpicDialogState({ open: true, epic: null })}
          />

          <Card className="border-white/70 bg-white/92 shadow-[0_18px_50px_-34px_rgba(15,23,42,0.45)] backdrop-blur">
            <CardContent className="p-8">
              <EmptyState
                title="Select a project backlog"
                description="Choose a project from the Planning filters to load backlog planning. The page keeps your last valid project selection instead of auto-switching to the first project."
                icon={<FolderKanban className="h-5 w-5" />}
              />
            </CardContent>
          </Card>
        </main>

        <ToastNotice toast={toast} onDismiss={() => setToast(null)} />
      </div>
    );
  }

  return (
    <div className="grid h-full min-h-0 w-full gap-4 overflow-hidden lg:grid-cols-[238px_minmax(0,1fr)]">
      <PlanningSidebar
        filters={filters}
        projects={projects}
        teams={availableTeams}
        members={availableMembers}
        epics={backlogData?.epics || []}
        sprints={(backlogData?.sprintSections || []).map((section) => section.sprint)}
        permissions={permissions}
        selectedEpic={selectedEpic}
        onChange={handleFilterChange}
        onResetFilters={handleResetFilters}
        onCreateSprint={() => setSprintDialogState({ open: true, sprint: null })}
        onCreateEpic={() => setEpicDialogState({ open: true, epic: null })}
        onAddWorkItem={() =>
          setToast({
            type: "info",
            message: "Use Stories, Tasks, or Bugs to create new work items, then plan them here.",
          })
        }
      />

      <main className="min-h-0 min-w-0 space-y-4 overflow-y-auto pr-1">
        <PlanningHeader
          filters={filters}
          permissions={permissions}
          selectedEpic={selectedEpic}
          onChange={handleFilterChange}
          onCreateSprint={() => setSprintDialogState({ open: true, sprint: null })}
          onCreateEpic={() => setEpicDialogState({ open: true, epic: null })}
        onEditEpic={() =>
          setEpicDialogState({
            open: true,
            epic: selectedEpic,
          })
        }
        onDeleteEpic={async () => {
          if (!selectedEpic) {
            return;
          }

          try {
            await deleteEpicMutation.mutateAsync({
              id: selectedEpic._id,
            });
            setToast({
              type: "success",
              message: `${selectedEpic.name} was removed from backlog planning.`,
            });
          } catch (error) {
            setToast({
              type: "error",
              message:
                error.response?.data?.message || "Unable to delete that epic right now.",
            });
          }
        }}
      />

      <PlanningSummary
        backlogCount={backlogData?.summary?.backlogIssueCount || boardState.backlogIssues.length}
        activeIssueCount={activeSprintMetrics.issueCount}
        activeProgress={activeSprintMetrics.completionPercent}
        plannedCount={backlogData?.summary?.plannedSprintCount || plannedSprints.length}
        unassignedCount={unassignedEpicCount}
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(360px,0.95fr)_minmax(420px,1.05fr)] xl:h-[calc(100vh-17.5rem)]">
        <Card className="overflow-hidden rounded-[20px] border-white/70 bg-white/90 shadow-[0_18px_48px_-36px_rgba(15,23,42,0.42)] backdrop-blur-xl xl:h-full">
          <CardContent
            className="flex h-full min-h-0 flex-col p-0"
            onDragOver={(event) => {
              if (!permissions.canReorderIssues) {
                return;
              }

              event.preventDefault();
            }}
            onDrop={(event) => {
              if (!permissions.canReorderIssues) {
                return;
              }

              event.preventDefault();
              handlePlanningDrop({
                destinationSprintId: "",
              });
            }}
          >
            <div className="border-b border-white/60 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-700">
                      Product Backlog
                    </p>
                    <Badge className="h-5 border border-slate-200 bg-slate-100 px-2 text-[11px] text-slate-700 hover:bg-slate-100">
                      {boardState.backlogIssues.length}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Drag into a sprint or use a row picker to schedule work.
                  </p>
                </div>
                <Button type="button" variant="outline" size="icon" className="h-8 w-8 rounded-[8px]">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="min-h-0 overflow-y-auto p-2.5">
              <div className="space-y-2">
                {boardState.backlogIssues.length ? (
                  boardState.backlogIssues.map((issue) => (
                    <IssuePlanningCard
                      key={issue._id}
                      issue={issue}
                      canDrag={permissions.canReorderIssues}
                      canManagePlanning={permissions.canAssignIssues}
                      isUpdating={planningUpdatingIssueId === issue._id}
                      availableSprints={assignableSprints}
                      onDragStart={(dragIssue) => setDraggedIssueId(dragIssue._id)}
                      onDragEnd={() => setDraggedIssueId("")}
                      onDropBefore={(overIssue) =>
                        handlePlanningDrop({
                          destinationSprintId: "",
                          overIssueId: overIssue._id,
                        })
                      }
                      onSelectIssue={(nextIssue) => setSelectedIssueId(nextIssue._id)}
                      onMoveIssue={handleQuickMoveIssue}
                    />
                  ))
                ) : (
                  <div className="rounded-[18px] border border-dashed border-slate-200 bg-slate-50/80 px-4 py-8 text-center text-sm leading-6 text-slate-500">
                    No backlog items match the current filter set.
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden rounded-[20px] border-blue-100/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(239,246,255,0.72))] shadow-[0_24px_60px_-40px_rgba(37,99,235,0.42)] backdrop-blur-xl xl:h-full">
          <CardContent className="flex h-full min-h-0 flex-col p-0">
            <div className="border-b border-white/70 px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-700">
                      Active Sprint
                    </p>
                    {activeSprintSection ? (
                      <Badge className="h-5 border border-emerald-200 bg-emerald-50 px-2 text-[11px] text-emerald-700 hover:bg-emerald-50">
                        In Progress
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 text-base font-semibold text-slate-950">
                    {activeSprintSection?.sprint?.name || "No active sprint"}
                  </p>
                  {activeSprintSection ? (
                    <p className="mt-0.5 text-xs text-slate-500">
                      {activeSprintSection.sprint.startDate ? formatDate(activeSprintSection.sprint.startDate) : "No start date"}
                      {" - "}
                      {activeSprintSection.sprint.endDate ? formatDate(activeSprintSection.sprint.endDate) : "No end date"}
                    </p>
                  ) : (
                    <p className="mt-0.5 text-xs text-slate-500">
                      Start a planned sprint to focus this workspace.
                    </p>
                  )}
                </div>
                <Button type="button" variant="outline" size="icon" className="h-8 w-8 rounded-[8px]">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </div>
              {activeSprintSection ? (
                <div className="mt-3 grid gap-3 sm:grid-cols-4">
                  <div>
                    <p className="text-lg font-semibold text-slate-950">{activeSprintMetrics.issueCount}</p>
                    <p className="text-xs text-slate-500">Issues</p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-slate-950">{activeSprintMetrics.taskCount}</p>
                    <p className="text-xs text-slate-500">Tasks</p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-slate-950">{activeSprintMetrics.bugCount}</p>
                    <p className="text-xs text-slate-500">Bugs</p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-slate-950">{activeSprintMetrics.completionPercent}%</p>
                    <p className="text-xs text-slate-500">Completed</p>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${activeSprintMetrics.completionPercent}%` }} />
                    </div>
                  </div>
                </div>
              ) : null}
              {activeSprintSection?.sprint?.goal ? (
                <div className="mt-3 rounded-[12px] bg-white/70 px-3 py-2 text-xs text-slate-600">
                  <span className="font-semibold text-slate-700">Sprint Goal </span>
                  {activeSprintSection.sprint.goal}
                </div>
              ) : null}
            </div>

            <div className="min-h-0 overflow-y-auto p-3">
              <div className="space-y-3">
                {sprintSectionsForDisplay.length ? (
                  sprintSectionsForDisplay.map((section) => (
                    <SprintSection
                      key={section.sprint._id}
                      sprint={section.sprint}
                      issues={section.issues}
                      availableSprints={assignableSprints}
                      canManageSprints={permissions.canManageSprints}
                      canAdminReopen={role === ROLE_ADMIN}
                      canManagePlanning={permissions.canAssignIssues}
                      canReorderIssues={permissions.canReorderIssues}
                      planningUpdatingIssueId={planningUpdatingIssueId}
                      onSelectIssue={(issue) => setSelectedIssueId(issue._id)}
                      onDragStartIssue={(issue) => setDraggedIssueId(issue._id)}
                      onDragEndIssue={() => setDraggedIssueId("")}
                      onDropIssueBefore={(sprintId, overIssueId) =>
                        handlePlanningDrop({
                          destinationSprintId: sprintId,
                          overIssueId,
                        })
                      }
                      onDropToContainer={(sprintId) =>
                        handlePlanningDrop({
                          destinationSprintId: sprintId,
                        })
                      }
                      onMoveIssue={handleQuickMoveIssue}
                      onEditSprint={() =>
                        setSprintDialogState({
                          open: true,
                          sprint: section.sprint,
                        })
                      }
                      onDeleteSprint={async () => {
                        if (deleteSprintMutation.isPending) {
                          return;
                        }

                        const confirmed = window.confirm(
                          `Delete sprint "${section.sprint.name}"? This action cannot be undone.`
                        );

                        if (!confirmed) {
                          return;
                        }

                        try {
                          await deleteSprintMutation.mutateAsync(section.sprint._id);
                          setToast({
                            type: "success",
                            message: `${section.sprint.name} was deleted.`,
                          });
                        } catch (error) {
                          setToast({
                            type: "error",
                            message:
                              error.response?.data?.message ||
                              "Unable to delete that sprint right now.",
                          });
                        }
                      }}
                      onStartSprint={async () => {
                        if (startSprintMutation.isPending) {
                          return;
                        }

                        try {
                          const startedSprint = await startSprintMutation.mutateAsync(
                            section.sprint._id
                          );
                          const startedState = String(
                            startedSprint?.state || startedSprint?.status || ""
                          )
                            .trim()
                            .toUpperCase();

                          if (startedState !== "ACTIVE") {
                            throw new Error(
                              "Sprint start was acknowledged, but the sprint is not active yet."
                            );
                          }

                          setToast({
                            type: "success",
                            title: "Sprint started",
                            message: `${startedSprint.name || section.sprint.name} is now active.`,
                          });
                        } catch (error) {
                          setToast({
                            type: "error",
                            title: "Sprint not started",
                            message:
                              error.response?.data?.message ||
                              "Unable to start that sprint right now.",
                          });
                        }
                      }}
                      isStartPending={startingSprintId === section.sprint._id}
                      onCompleteSprint={() => {
                        if (isSprintLocked(section.sprint)) {
                          setToast({
                            type: "error",
                            message:
                              section.sprint.lockReason ||
                              "Sprint has ended. Create a new sprint to continue working.",
                          });
                          return;
                        }

                        setCompletionSprint({
                          sprint: section.sprint,
                          issues: section.issues,
                        });
                      }}
                      onReopenSprint={async () => {
                        if (reopenSprintMutation.isPending) {
                          return;
                        }

                        const confirmed = window.confirm(
                          `Reopen sprint "${section.sprint.name}"? Developers will be allowed to update tasks again.`
                        );

                        if (!confirmed) {
                          return;
                        }

                        try {
                          await reopenSprintMutation.mutateAsync(section.sprint._id);
                          setToast({
                            type: "success",
                            message: `${section.sprint.name} was reopened.`,
                          });
                        } catch (error) {
                          setToast({
                            type: "error",
                            message:
                              error.response?.data?.message ||
                              "Unable to reopen that sprint right now.",
                          });
                        }
                      }}
                    />
                  ))
                ) : (
                  <div className="rounded-[22px] border border-dashed border-blue-200/80 bg-white/68 p-8 shadow-inner">
                    <EmptyState
                      title="No sprint sections yet"
                      description="Create the first sprint to begin planning scoped work from the backlog."
                      icon={<Layers3 className="h-5 w-5" />}
                    />
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <IssueDetailsDrawer
        issue={selectedIssue}
        open={Boolean(selectedIssue)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedIssueId("");
          }
        }}
        project={selectedProject}
        epics={backlogData?.epics || []}
        sprints={assignableSprints}
        permissions={permissions}
        onUpdatePlanning={(id, payload) =>
          updatePlanningMutation.mutateAsync({
            id,
            payload,
          })
        }
        onUpdateIssue={(id, payload) =>
          updateStatusMutation.mutateAsync({
            id,
            payload,
          })
        }
        onUpdateStatus={(id, status) =>
          updateStatusMutation.mutateAsync({
            id,
            payload: { status },
          })
        }
        isPlanningPending={updatePlanningMutation.isPending}
        isStatusPending={updateStatusMutation.isPending}
      />

      <EpicDialog
        open={epicDialogState.open}
        onOpenChange={(open) =>
          setEpicDialogState((current) => ({
            ...current,
            open,
          }))
        }
        initialEpic={epicDialogState.epic}
        issues={planningIssues}
        members={availableMembers}
        isPending={
          createEpicMutation.isPending || updateEpicMutation.isPending || isEpicSubmitting
        }
        onSubmit={async (payload) => {
          setIsEpicSubmitting(true);

          try {
            if (epicDialogState.epic) {
              const { issueIds: _issueIds, ...epicPayload } = payload;
              const updatedEpic = await updateEpicMutation.mutateAsync({
                id: epicDialogState.epic._id,
                payload: epicPayload,
              });
              updateEpicInCurrentBacklog(updatedEpic);
              await invalidatePlanningQueries();

              setToast({
                type: "success",
                message: `${epicPayload.name} was updated.`,
              });

              return updatedEpic;
            }

            const { issueIds = [], ...epicPayload } = payload;
            const createdEpic = await createEpicMutation.mutateAsync({
              projectId: filters.projectId,
              ...epicPayload,
            });
            insertEpicIntoCurrentBacklog(createdEpic);

            if (issueIds.length) {
              try {
                await Promise.all(
                  issueIds.map((issueId) =>
                    updateIssuePlanning({
                      id: issueId,
                      payload: {
                        epicId: createdEpic._id,
                      },
                    })
                  )
                );
                assignIssuesToEpicInCurrentBacklog(createdEpic, issueIds);
                await invalidatePlanningQueries();
                setToast({
                  type: "success",
                  message: `${createdEpic.name} created and linked to ${issueIds.length} work item${issueIds.length === 1 ? "" : "s"}.`,
                });
              } catch (error) {
                await invalidatePlanningQueries();
                setToast({
                  type: "error",
                  title: "Epic created, assignments need attention",
                  message:
                    error.response?.data?.message ||
                    "The epic was created, but one or more work items could not be linked.",
                });
              }
            } else {
              await invalidatePlanningQueries();
              setToast({
                type: "success",
                message: `${createdEpic.name} was created.`,
              });
            }

            return createdEpic;
          } finally {
            setIsEpicSubmitting(false);
          }
        }}
      />

      <SprintDialog
        open={sprintDialogState.open}
        onOpenChange={(open) =>
          setSprintDialogState((current) => ({
            ...current,
            open,
          }))
        }
        initialSprint={sprintDialogState.sprint}
        teams={availableTeams}
        isPending={createSprintMutation.isPending || updateSprintMutation.isPending}
        onSubmit={(payload) => {
          if (sprintDialogState.sprint) {
            return updateSprintMutation.mutateAsync({
              id: sprintDialogState.sprint._id,
              payload,
            });
          }

          return createSprintMutation.mutateAsync({
            projectId: filters.projectId,
            ...payload,
          });
        }}
      />

      <SprintCompletionDialog
        open={Boolean(completionSprint)}
        onOpenChange={(open) => {
          if (!open) {
            setCompletionSprint(null);
          }
        }}
        sprint={completionSprint?.sprint || null}
        sprintIssues={completionSprint?.issues || []}
        plannedSprints={plannedSprints.filter(
          (sprint) => String(sprint._id) !== String(completionSprint?.sprint?._id || "")
        )}
        isPending={completeSprintMutation.isPending}
        onSubmit={async (payload) => {
          const result = await completeSprintMutation.mutateAsync({
            id: completionSprint.sprint._id,
            payload,
          });

          setToast({
            type: "success",
            title: "Sprint completed",
            message:
              result?.targetSprintName
                ? `${completionSprint.sprint.name} was completed and unfinished work moved to ${result.targetSprintName}.`
                : `${completionSprint.sprint.name} was completed successfully.`,
          });

          return result;
        }}
      />

      <ToastNotice toast={toast} onDismiss={() => setToast(null)} />
      </main>
    </div>
  );
};

export default BacklogPage;
