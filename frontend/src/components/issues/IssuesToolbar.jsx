import { FileSpreadsheet, Globe2, Plus, RotateCcw, Search, UserCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const ALL_PROJECTS_VALUE = "ALL";

const IssuesToolbar = ({
  filters,
  projects = [],
  teams = [],
  assignees = [],
  visibleIssueCount = 0,
  activeStatusLabel = "",
  selectedProject = null,
  taskScope = "all",
  canCreateIssue = true,
  canBulkImport = false,
  canToggleTaskScope = false,
  isAssigneeDisabled = false,
  isCreateDisabled = false,
  isResetDisabled = false,
  onTaskScopeChange,
  onProjectChange,
  onTeamChange,
  onAssigneeChange,
  onDateFromChange,
  onDateToChange,
  onSearchChange,
  onResetFilters,
  onCreateIssue,
  onOpenBulkImport,
}) => {
  const showTeamWarning = Boolean(selectedProject) && !teams.length;

  return (
    <Card className="overflow-hidden border-white/70 bg-white/92 shadow-[0_18px_50px_-34px_rgba(15,23,42,0.45)] backdrop-blur">
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-slate-900">
              {visibleIssueCount} issue{visibleIssueCount === 1 ? "" : "s"} in view
            </p>
            <p className="text-sm leading-6 text-slate-600">
              Filter Task, review ownership, and move work across the workflow with
              a Jira-style planning lens.
            </p>
          </div>

          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            {canToggleTaskScope ? (
              <div className="inline-flex rounded-2xl border border-slate-200 bg-white/80 p-1 shadow-sm">
                <Button
                  className="h-10 rounded-xl px-3"
                  type="button"
                  variant={taskScope === "all" ? "default" : "ghost"}
                  onClick={() => onTaskScopeChange?.("all")}
                >
                  <Globe2 className="h-4 w-4" />
                  All projects
                </Button>
                <Button
                  className="h-10 rounded-xl px-3"
                  type="button"
                  variant={taskScope === "mine" ? "default" : "ghost"}
                  onClick={() => onTaskScopeChange?.("mine")}
                >
                  <UserCircle2 className="h-4 w-4" />
                  My tasks
                </Button>
              </div>
            ) : null}

            {canBulkImport ? (
              <Button
                className="w-full sm:w-auto"
                type="button"
                variant="outline"
                onClick={onOpenBulkImport}
              >
                <FileSpreadsheet className="h-4 w-4" />
                Bulk assign
              </Button>
            ) : null}

            <Button
              className="w-full sm:w-auto"
              type="button"
              disabled={isCreateDisabled}
              onClick={onCreateIssue}
            >
              <Plus className="h-4 w-4" />
              Assign task
            </Button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(180px,1fr)_minmax(180px,1fr)_minmax(180px,1fr)_minmax(260px,1.2fr)_minmax(240px,1.45fr)_120px]">
          <label className="space-y-2">
            <span className="text-xs uppercase tracking-[0.22em] text-gray-500">
              Project
            </span>
            <select
              className="field-select"
              value={filters.projectId}
              onChange={(event) => onProjectChange(event.target.value)}
            >
              <option value={ALL_PROJECTS_VALUE}>All projects</option>
              {projects.map((project) => (
                <option key={project._id} value={project._id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-xs uppercase tracking-[0.22em] text-gray-500">
              Team
            </span>
            <select
              className="field-select"
              value={filters.teamId}
              onChange={(event) => onTeamChange(event.target.value)}
              disabled={!teams.length}
            >
              <option value="all">All teams</option>
              {teams.map((team) => (
                <option key={team._id} value={team._id}>
                  {team.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-xs uppercase tracking-[0.22em] text-gray-500">
              Assignee
            </span>
            <select
              className="field-select"
              value={filters.assigneeId}
              onChange={(event) => onAssigneeChange(event.target.value)}
              disabled={isAssigneeDisabled || !assignees.length}
            >
              <option value="all">All assignees</option>
              {assignees.map((assignee) => (
                <option key={assignee._id} value={assignee._id}>
                  {assignee.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-xs uppercase tracking-[0.22em] text-gray-500">
              Created Date
            </span>
            <div className="grid grid-cols-2 gap-2">
              <Input
                className="px-3"
                type="date"
                aria-label="Created from"
                value={filters.dateFrom}
                onChange={(event) => onDateFromChange(event.target.value)}
              />
              <Input
                className="px-3"
                type="date"
                aria-label="Created to"
                value={filters.dateTo}
                onChange={(event) => onDateToChange(event.target.value)}
              />
            </div>
          </label>

          <label className="space-y-2">
            <span className="text-xs uppercase tracking-[0.22em] text-gray-500">
              Filter Tasks
            </span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                className="pl-11"
                placeholder="Search issue key, title, epic, team, or assignee"
                value={filters.search}
                onChange={(event) => onSearchChange(event.target.value)}
              />
            </div>
          </label>

          <div className="space-y-2">
            <span className="block text-xs uppercase tracking-[0.22em] text-transparent">
              Reset
            </span>
            <Button
              className="h-11 w-full rounded-2xl"
              type="button"
              variant="outline"
              disabled={isResetDisabled}
              onClick={onResetFilters}
            >
              <RotateCcw className="h-4 w-4" />
              Reset
            </Button>
          </div>
        </div>

        {showTeamWarning ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            Attach a team to <span className="font-semibold">{selectedProject.name}</span>{" "}
            before creating or assigning work in this project.
          </div>
        ) : null}

        {activeStatusLabel ? (
          <div className="flex items-center">
            <Badge className="rounded-full border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-50">
              {activeStatusLabel}
            </Badge>
          </div>
        ) : null}

        {!canCreateIssue ? (
          <p className="text-xs text-slate-500">
            Work item creation is limited for your role, but the workflow board and
            work item actions remain consistent.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
};

export default IssuesToolbar;
