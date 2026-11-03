import { useDeferredValue, useMemo } from "react";
import { Clock3, FolderKanban, PencilLine, UserCircle2 } from "lucide-react";
import {
  countIssuesByStatus,
  filterIssues,
  getIssuePriorityVariant,
  ISSUE_STATUS,
  normalizeIssueStatus,
  resolveIssueAssignees,
  resolveIssueAssigneeId,
  getIssueStatusLabel,
  getIssueStatusVariant,
  getIssueTypeVariant,
  sortIssues,
} from "@/lib/issues";
import {
  findProjectById,
  getProjectTeamMembers,
  getProjectTeams,
  resolveTeamId,
  resolveUserId,
} from "@/lib/project-teams";
import UserAvatar from "@/components/shared/UserAvatar";
import { cn, formatDateTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import EmptyState from "@/components/shared/EmptyState";
import IssueFilters from "@/components/issues/IssueFilters";

const DESCRIPTION_CLAMP_STYLE = {
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
};

const BOARD_COLUMNS = [
  { key: ISSUE_STATUS.TODO, label: "To Do" },
  { key: ISSUE_STATUS.IN_PROGRESS, label: "In Progress" },
  { key: ISSUE_STATUS.DONE, label: "Done" },
];

const dedupeMembers = (members = []) => {
  const uniqueMembers = new Map();

  members.forEach((member) => {
    const memberId = resolveUserId(member);

    if (!memberId || uniqueMembers.has(memberId)) {
      return;
    }

    uniqueMembers.set(memberId, member);
  });

  return Array.from(uniqueMembers.values());
};

const getAvailableTeams = (projects = [], projectId = "all") => {
  if (projectId && projectId !== "all") {
    return getProjectTeams(findProjectById(projects, projectId));
  }

  const uniqueTeams = new Map();

  projects.forEach((project) => {
    getProjectTeams(project).forEach((team) => {
      const teamId = resolveTeamId(team);

      if (!teamId || uniqueTeams.has(teamId)) {
        return;
      }

      uniqueTeams.set(teamId, team);
    });
  });

  return Array.from(uniqueTeams.values()).sort((left, right) =>
    (left.name || "").localeCompare(right.name || "")
  );
};

const getAvailableAssignees = ({
  assignees = [],
  projects = [],
  projectId = "all",
  teamId = "all",
}) => {
  if (teamId && teamId !== "all" && projectId && projectId !== "all") {
    return getProjectTeamMembers(findProjectById(projects, projectId), teamId);
  }

  if (assignees.length) {
    return assignees;
  }

  if (projectId && projectId !== "all") {
    const project = findProjectById(projects, projectId);
    const members = getProjectTeams(project).flatMap((team) => team.members || []);

    return dedupeMembers(members).sort((left, right) =>
      (left.name || "").localeCompare(right.name || "")
    );
  }

  return [];
};

const IssueStatusSelect = ({
  issue,
  onStatusChange,
  canChangeStatus,
  isUpdating,
  className = "",
}) => (
  <select
    className={cn("field-select h-9 rounded-xl px-3 py-1 text-xs", className)}
    value={normalizeIssueStatus(issue.status)}
    disabled={!canChangeStatus || isUpdating}
    onChange={async (event) => {
      event.stopPropagation();

      try {
        await onStatusChange(issue._id, event.target.value);
      } catch (error) {
        // Query data remains the source of truth, so avoiding an unhandled rejection is enough here.
      }
    }}
    onClick={(event) => event.stopPropagation()}
  >
    <option value={ISSUE_STATUS.TODO}>To Do</option>
    <option value={ISSUE_STATUS.IN_PROGRESS}>In Progress</option>
    <option value={ISSUE_STATUS.DONE}>Done</option>
  </select>
);

const IssueIdentity = ({ issue }) => (
  <div className="space-y-2">
    <div className="flex flex-wrap items-center gap-2">
      <p className="text-sm font-semibold text-slate-900 transition group-hover:text-blue-700">
        {issue.title}
      </p>
      <Badge variant={getIssueTypeVariant(issue.type)}>{issue.type}</Badge>
      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
        #{issue._id.slice(-6)}
      </span>
    </div>
    <p
      className="max-w-[360px] text-sm leading-6 text-slate-600"
      style={DESCRIPTION_CLAMP_STYLE}
    >
      {issue.description || "No description provided."}
    </p>
  </div>
);

const TeamCell = ({ issue }) =>
  issue.teamId ? (
    <div className="inline-flex min-w-0 items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-sm text-emerald-900">
      <span className="truncate font-medium">{issue.teamId?.name}</span>
    </div>
  ) : (
    <span className="text-sm text-slate-500">No team</span>
  );

const AssigneeCell = ({ issue }) => {
  const assignees = resolveIssueAssignees(issue).filter(
    (assignee) => assignee.name || assignee.email
  );
  const assigneeId = resolveIssueAssigneeId(issue);

  return assignees.length ? (
    <div className="flex min-w-0 items-center gap-2">
      <div className="flex shrink-0 -space-x-2">
        {assignees.map((assignee) => (
          <UserAvatar
            key={assignee._id}
            user={assignee}
            className="h-8 w-8 rounded-xl ring-2 ring-white"
          />
        ))}
      </div>
      <p
        className="min-w-0 truncate text-sm font-medium text-slate-900"
        title={assignees.map((assignee) => assignee.name || assignee.email).join(", ")}
      >
        {assignees.map((assignee) => assignee.name || assignee.email).join(", ")}
      </p>
    </div>
  ) : (
    <div className="flex items-center gap-2 text-sm text-slate-500">
      <UserCircle2 className="h-4 w-4" />
      <span>{assigneeId ? "Assigned" : "Unassigned"}</span>
    </div>
  );
};

const IssueBoardCard = ({
  issue,
  onSelectIssue,
  onStatusChange,
  canEditIssue,
  canChangeStatus,
  isUpdating,
}) => (
  <div
    className="group rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm transition hover:border-blue-200 hover:shadow-[0_18px_40px_-30px_rgba(37,99,235,0.45)]"
    role="button"
    tabIndex={0}
    onClick={() => onSelectIssue(issue)}
    onKeyDown={(event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onSelectIssue(issue);
      }
    }}
  >
    <IssueIdentity issue={issue} />

    <div className="mt-4 flex flex-wrap gap-2">
      <Badge variant={getIssuePriorityVariant(issue.priority)}>{issue.priority}</Badge>
      <Badge variant={getIssueStatusVariant(issue.status)}>
        {getIssueStatusLabel(issue.status)}
      </Badge>
    </div>

    <div className="mt-4 space-y-3 text-sm text-slate-600">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
          Project
        </p>
        <p className="mt-1 font-medium text-slate-900">
          {issue.projectId?.name || "Unknown project"}
        </p>
      </div>

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
          Team
        </p>
        <div className="mt-1">
          <TeamCell issue={issue} />
        </div>
      </div>

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
          Assignee
        </p>
        <div className="mt-1">
          <AssigneeCell issue={issue} />
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs text-slate-500">
        <Clock3 className="h-3.5 w-3.5" />
        <span>{formatDateTime(issue.createdAt)}</span>
      </div>
    </div>

    <div className="mt-4 flex flex-col gap-2">
      {canEditIssue ? (
        <Button
          variant="outline"
          size="sm"
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onSelectIssue(issue);
          }}
        >
          <PencilLine className="h-3.5 w-3.5" />
          Edit
        </Button>
      ) : null}
      <IssueStatusSelect
        issue={issue}
        onStatusChange={onStatusChange}
        canChangeStatus={canChangeStatus}
        isUpdating={isUpdating}
      />
    </div>
  </div>
);

const IssueListView = ({
  title = "Issue tracker",
  description = "A structured view of active work across the workspace.",
  issues,
  filters,
  projects = [],
  assignees = [],
  isAssigneesLoading = false,
  onFilterChange,
  onResetFilters,
  onSelectIssue,
  onStatusChange,
  updatingId = "",
  showAssigneeFilter = true,
  showTeamFilter = false,
  showPriorityFilter = true,
  showSortFilter = true,
  showSearchFilter = true,
  showHeading = true,
  emptyStateTitle = "No issues found",
  emptyStateDescription = "Adjust the filters or create a new issue to populate the tracker.",
  canEditIssue = false,
  canChangeStatus = true,
  actions = null,
  viewMode = "list",
  showViewToggle = false,
  onViewModeChange,
  usePageScroll = false,
}) => {
  const deferredSearch = useDeferredValue(filters.search);

  const normalizedFilters = useMemo(
    () => ({
      ...filters,
      search: deferredSearch,
    }),
    [deferredSearch, filters]
  );

  const availableTeams = useMemo(
    () => getAvailableTeams(projects, filters.projectId),
    [filters.projectId, projects]
  );
  const availableAssignees = useMemo(
    () =>
      getAvailableAssignees({
        assignees,
        projects,
        projectId: filters.projectId,
        teamId: filters.teamId,
      }),
    [assignees, filters.projectId, filters.teamId, projects]
  );

  const issuesWithoutStatusFilter = useMemo(
    () =>
      filterIssues(issues, {
        ...normalizedFilters,
        status: "all",
      }),
    [issues, normalizedFilters]
  );

  const visibleIssues = useMemo(
    () => sortIssues(filterIssues(issues, normalizedFilters), normalizedFilters.sortBy),
    [issues, normalizedFilters]
  );

  const statusCounts = useMemo(
    () => countIssuesByStatus(issuesWithoutStatusFilter),
    [issuesWithoutStatusFilter]
  );

  const hasActiveFilters = useMemo(
    () =>
      Boolean(normalizedFilters.search?.trim()) ||
      normalizedFilters.status !== "all" ||
      normalizedFilters.priority !== "all" ||
      normalizedFilters.projectId !== "all" ||
      normalizedFilters.teamId !== "all" ||
      (showAssigneeFilter &&
        (normalizedFilters.assigneeId ?? normalizedFilters.assignee ?? "all") !== "all") ||
      normalizedFilters.sortBy !== "newest",
    [normalizedFilters, showAssigneeFilter]
  );

  const issuesByStatus = useMemo(
    () =>
      BOARD_COLUMNS.map((column) => ({
        ...column,
        items: visibleIssues.filter(
          (issue) => normalizeIssueStatus(issue.status) === column.key
        ),
      })),
    [visibleIssues]
  );
  const desktopTableWrapperClassName = useMemo(
    () => (usePageScroll ? "overflow-x-auto" : "max-h-[780px] overflow-auto"),
    [usePageScroll]
  );
  const desktopTableHeaderClassName = useMemo(
    () =>
      usePageScroll
        ? "bg-slate-50/95 px-5 py-4 font-semibold"
        : "sticky top-0 bg-slate-50/95 px-5 py-4 font-semibold",
    [usePageScroll]
  );

  return (
    <div className="space-y-4">
      <IssueFilters
        title={title}
        description={description}
        filters={filters}
        projects={projects}
        teams={availableTeams}
        assignees={availableAssignees}
        isAssigneesLoading={isAssigneesLoading}
        onChange={onFilterChange}
        onReset={onResetFilters}
        total={visibleIssues.length}
        statusCounts={statusCounts}
        showAssigneeFilter={showAssigneeFilter}
        showTeamFilter={showTeamFilter}
        showPriorityFilter={showPriorityFilter}
        showSortFilter={showSortFilter}
        showSearchFilter={showSearchFilter}
        showHeading={showHeading}
        actions={actions}
        showViewToggle={showViewToggle}
        viewMode={viewMode}
        onViewModeChange={onViewModeChange}
      />

      <Card className="overflow-hidden border-white/70 bg-white/92 shadow-[0_18px_50px_-34px_rgba(15,23,42,0.45)] backdrop-blur">
        {visibleIssues.length ? (
          viewMode === "board" ? (
            <CardContent className="p-4">
              <div className="grid gap-4 xl:grid-cols-3">
                {issuesByStatus.map((column) => (
                  <div
                    key={column.key}
                    className="rounded-[28px] border border-slate-200 bg-slate-50/80 p-4"
                  >
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          {column.label}
                        </p>
                        <p className="text-xs text-slate-500">
                          {column.items.length} issues
                        </p>
                      </div>
                      <Badge variant={getIssueStatusVariant(column.key)}>
                        {column.items.length}
                      </Badge>
                    </div>

                    <div className="space-y-3">
                      {column.items.length ? (
                        column.items.map((issue) => (
                          <IssueBoardCard
                            key={issue._id}
                            issue={issue}
                            onSelectIssue={onSelectIssue}
                            onStatusChange={onStatusChange}
                            canEditIssue={canEditIssue}
                            canChangeStatus={canChangeStatus}
                            isUpdating={updatingId === issue._id}
                          />
                        ))
                      ) : (
                        <div className="rounded-[22px] border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
                          No issues in this lane.
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          ) : (
            <>
              <div className={desktopTableWrapperClassName}>
                <table className="hidden min-w-[1180px] w-full text-left lg:table">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/95 text-[11px] uppercase tracking-[0.24em] text-slate-500">
                      <th className={desktopTableHeaderClassName}>
                        Issue
                      </th>
                      <th className={desktopTableHeaderClassName}>
                        Project
                      </th>
                      <th className={desktopTableHeaderClassName}>
                        Team
                      </th>
                      <th className={desktopTableHeaderClassName}>
                        Assignee
                      </th>
                      <th className={desktopTableHeaderClassName}>
                        Priority
                      </th>
                      <th className={desktopTableHeaderClassName}>
                        Status
                      </th>
                      <th className={desktopTableHeaderClassName}>
                        Created
                      </th>
                      <th className={desktopTableHeaderClassName}>
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleIssues.map((issue) => (
                      <tr
                        key={issue._id}
                        className="group border-b border-slate-200/80 bg-white transition hover:bg-slate-50/70"
                      >
                        <td className="px-5 py-4 align-top">
                          <button
                            className="text-left"
                            type="button"
                            onClick={() => onSelectIssue(issue)}
                          >
                            <IssueIdentity issue={issue} />
                          </button>
                        </td>
                        <td className="px-5 py-4 align-top">
                          <p className="text-sm font-medium text-slate-900">
                            {issue.projectId?.name || "Unknown project"}
                          </p>
                        </td>
                        <td className="px-5 py-4 align-top">
                          <TeamCell issue={issue} />
                        </td>
                        <td className="px-5 py-4 align-top">
                          <AssigneeCell issue={issue} />
                        </td>
                        <td className="px-5 py-4 align-top">
                          <Badge variant={getIssuePriorityVariant(issue.priority)}>
                            {issue.priority}
                          </Badge>
                        </td>
                        <td className="px-5 py-4 align-top">
                          <Badge variant={getIssueStatusVariant(issue.status)}>
                            {getIssueStatusLabel(issue.status)}
                          </Badge>
                        </td>
                        <td className="px-5 py-4 align-top">
                          <div className="space-y-1 text-sm text-slate-600">
                            <p>{formatDateTime(issue.createdAt)}</p>
                            {issue.startedAt ? (
                              <p className="text-xs text-slate-500">
                                Started {formatDateTime(issue.startedAt)}
                              </p>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-5 py-4 align-top">
                          <div className="flex min-w-[210px] flex-col gap-3">
                            <div className="flex items-center gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                type="button"
                                onClick={() => onSelectIssue(issue)}
                              >
                                View
                              </Button>
                              {canEditIssue ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  type="button"
                                  onClick={() => onSelectIssue(issue)}
                                >
                                  <PencilLine className="h-3.5 w-3.5" />
                                  Edit
                                </Button>
                              ) : null}
                            </div>
                            <IssueStatusSelect
                              issue={issue}
                              onStatusChange={onStatusChange}
                              canChangeStatus={canChangeStatus}
                              isUpdating={updatingId === issue._id}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="grid gap-4 p-4 lg:hidden">
                  {visibleIssues.map((issue) => (
                    <div
                      key={issue._id}
                      className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-200 hover:bg-slate-50"
                      role="button"
                      tabIndex={0}
                      onClick={() => onSelectIssue(issue)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onSelectIssue(issue);
                        }
                      }}
                    >
                      <IssueIdentity issue={issue} />

                      <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                            Project
                          </p>
                          <p className="mt-1 text-sm font-medium text-slate-900">
                            {issue.projectId?.name || "Unknown project"}
                          </p>
                        </div>

                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                            Team
                          </p>
                          <div className="mt-1">
                            <TeamCell issue={issue} />
                          </div>
                        </div>

                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                            Assignee
                          </p>
                          <div className="mt-1">
                            <AssigneeCell issue={issue} />
                          </div>
                        </div>

                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                            Created
                          </p>
                          <div className="mt-1 flex items-center gap-2 text-sm text-slate-600">
                            <Clock3 className="h-4 w-4 text-slate-400" />
                            <span>{formatDateTime(issue.createdAt)}</span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <Badge variant={getIssuePriorityVariant(issue.priority)}>
                          {issue.priority}
                        </Badge>
                        <Badge variant={getIssueStatusVariant(issue.status)}>
                          {getIssueStatusLabel(issue.status)}
                        </Badge>
                      </div>

                      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              onSelectIssue(issue);
                            }}
                          >
                            View
                          </Button>
                          {canEditIssue ? (
                            <Button
                              variant="outline"
                              size="sm"
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                onSelectIssue(issue);
                              }}
                            >
                              <PencilLine className="h-3.5 w-3.5" />
                              Edit
                            </Button>
                          ) : null}
                        </div>

                        <IssueStatusSelect
                          issue={issue}
                          onStatusChange={onStatusChange}
                          canChangeStatus={canChangeStatus}
                          isUpdating={updatingId === issue._id}
                          className="sm:max-w-[190px]"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )
        ) : (
          <CardContent className="p-8">
            <EmptyState
              title={
                !issues.length && !hasActiveFilters
                  ? emptyStateTitle
                  : "No issues match these filters"
              }
              description={
                !issues.length && !hasActiveFilters
                  ? emptyStateDescription
                  : hasActiveFilters
                    ? "Try resetting one or more filters to widen the tracker."
                    : emptyStateDescription
              }
              icon={<FolderKanban className="h-5 w-5" />}
            />
          </CardContent>
        )}
      </Card>
    </div>
  );
};

export default IssueListView;
