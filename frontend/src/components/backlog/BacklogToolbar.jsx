import { useEffect, useRef, useState } from "react";
import {
  CalendarRange,
  PencilLine,
  Filter,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const BacklogToolbar = ({
  filters,
  projects = [],
  teams = [],
  members = [],
  epics = [],
  sprints = [],
  permissions = {},
  selectedEpic = null,
  onChange,
  onResetFilters,
  onCreateSprint,
  onCreateEpic,
  onEditEpic,
  onDeleteEpic,
}) => {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const advancedRef = useRef(null);
  const hasSecondaryFilters = Boolean(
    filters.dateFrom ||
      filters.dateTo ||
      filters.sprintId !== "all" ||
      filters.priority !== "all" ||
      filters.status !== "all"
  );
  const advancedFilterCount = [
    filters.dateFrom,
    filters.dateTo,
    filters.sprintId !== "all",
    filters.priority !== "all",
    filters.status !== "all",
  ].filter(Boolean).length;
  const hasActiveFilters =
    filters.teamId !== "all" ||
    filters.assigneeId !== "all" ||
    filters.search.trim() ||
    filters.epicId !== "all" ||
    filters.sprintId !== "all" ||
    filters.priority !== "all" ||
    filters.status !== "all" ||
    filters.includeCompletedSprints ||
    hasSecondaryFilters;

  useEffect(() => {
    if (!advancedOpen) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (!advancedRef.current?.contains(event.target)) {
        setAdvancedOpen(false);
      }
    };
    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setAdvancedOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [advancedOpen]);

  return (
    <Card className="relative z-[70] overflow-visible border-white/70 bg-white/90 shadow-[0_14px_42px_-34px_rgba(15,23,42,0.42)] backdrop-blur-xl">
      <CardContent className="space-y-2.5 p-3 sm:p-4">
        <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/65 bg-white/68 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.22em] text-slate-500 shadow-sm backdrop-blur-xl">
              <Filter className="h-3.5 w-3.5" />
              <span>Planning Workspace</span>
            </div>
            {hasSecondaryFilters ? (
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50/90 px-3 py-1.5 text-xs font-semibold text-amber-700 shadow-sm">
                <CalendarRange className="h-3.5 w-3.5" />
                <span>Date filtered</span>
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {permissions.canManageEpics && selectedEpic ? (
              <>
                <Button type="button" variant="outline" size="sm" onClick={onEditEpic}>
                  <PencilLine className="h-4 w-4" />
                  Edit Epic
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={onDeleteEpic}>
                  <Trash2 className="h-4 w-4" />
                  Delete Epic
                </Button>
              </>
            ) : null}
            {permissions.canManageEpics ? (
              <Button type="button" variant="outline" size="sm" onClick={onCreateEpic}>
                <Plus className="h-4 w-4" />
                Create Epic
              </Button>
            ) : null}
            {permissions.canManageSprints ? (
              <Button type="button" size="sm" onClick={onCreateSprint}>
                <Plus className="h-4 w-4" />
                Create Sprint
              </Button>
            ) : null}
          </div>
        </div>

        <div className="grid items-end gap-2 md:grid-cols-2 xl:grid-cols-[minmax(160px,0.9fr)_minmax(132px,0.7fr)_minmax(132px,0.7fr)_minmax(150px,0.8fr)_minmax(150px,0.78fr)_minmax(220px,1.1fr)_auto_auto]">
          <label className="space-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
              Project
            </span>
            <select
              className="field-select h-9 rounded-[16px] px-3 py-1.5 text-sm"
              value={filters.projectId}
              onChange={(event) => onChange("projectId", event.target.value)}
            >
              <option value="">Choose project</option>
              {projects.map((project) => (
                <option key={project._id} value={project._id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
              Team
            </span>
            <select
              className="field-select h-9 rounded-[16px] px-3 py-1.5 text-sm"
              value={filters.teamId}
              onChange={(event) => onChange("teamId", event.target.value)}
            >
              <option value="all">All teams</option>
              {teams.map((team) => (
                <option key={team._id} value={team._id}>
                  {team.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
              Assignee
            </span>
            <select
              className="field-select h-9 rounded-[16px] px-3 py-1.5 text-sm"
              value={filters.assigneeId}
              onChange={(event) => onChange("assigneeId", event.target.value)}
            >
              <option value="all">All members</option>
              {members.map((member) => (
                <option key={member._id} value={member._id}>
                  {member.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
              Sprint Scope
            </span>
            <select
              className="field-select h-9 rounded-[16px] px-3 py-1.5 text-sm"
              value={filters.includeCompletedSprints ? "all" : "active"}
              onChange={(event) =>
                onChange("includeCompletedSprints", event.target.value === "all")
              }
            >
              <option value="active">Planned + active</option>
              <option value="all">Include completed</option>
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
              Epic
            </span>
            <select
              className="field-select h-9 rounded-[16px] px-3 py-1.5 text-sm"
              value={filters.epicId}
              onChange={(event) => onChange("epicId", event.target.value)}
            >
              <option value="all">All epics</option>
              <option value="unassigned">Unassigned epic</option>
              {epics.map((epic) => (
                <option key={epic._id} value={epic._id}>
                  {epic.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
              Search
            </span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                className="h-9 rounded-[16px] border-slate-200 pl-10 text-sm shadow-sm"
                placeholder="Search backlog items"
                value={filters.search}
                onChange={(event) => onChange("search", event.target.value)}
              />
            </div>
          </label>

          <div className="relative" ref={advancedRef}>
            <span className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
              Advanced
            </span>
            <Button
              type="button"
              variant="outline"
              className="mt-1 h-9 w-full rounded-[16px] px-3 xl:w-auto"
              onClick={() => setAdvancedOpen((current) => !current)}
            >
              <SlidersHorizontal className="h-4 w-4" />
              Filters
              {advancedFilterCount ? (
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                  {advancedFilterCount}
                </span>
              ) : null}
            </Button>

            {advancedOpen ? (
              <div className="absolute right-0 top-full z-[45] mt-2 w-full min-w-[280px] rounded-[22px] border border-slate-200 bg-white p-4 shadow-[0_26px_52px_-28px_rgba(15,23,42,0.34)] xl:w-[320px]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-950">Advanced Filters</p>
                    <p className="text-xs text-slate-500">
                      Keep the main toolbar lean and pull in date filters only when needed.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-xl"
                    onClick={() => setAdvancedOpen(false)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                <div className="mt-4 space-y-3">
                  <label className="space-y-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                      Sprint
                    </span>
                    <select
                      className="field-select h-10 rounded-[16px] px-3 text-sm"
                      value={filters.sprintId}
                      onChange={(event) => onChange("sprintId", event.target.value)}
                    >
                      <option value="all">All sprints</option>
                      <option value="backlog">Backlog only</option>
                      {sprints.map((sprint) => (
                        <option key={sprint._id} value={sprint._id}>
                          {sprint.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="grid grid-cols-2 gap-2">
                    <label className="space-y-1.5">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                        Priority
                      </span>
                      <select
                        className="field-select h-10 rounded-[16px] px-3 text-sm"
                        value={filters.priority}
                        onChange={(event) => onChange("priority", event.target.value)}
                      >
                        <option value="all">All</option>
                        {["Critical", "High", "Medium", "Low"].map((priority) => (
                          <option key={priority} value={priority}>{priority}</option>
                        ))}
                      </select>
                    </label>

                    <label className="space-y-1.5">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                        Status
                      </span>
                      <select
                        className="field-select h-10 rounded-[16px] px-3 text-sm"
                        value={filters.status}
                        onChange={(event) => onChange("status", event.target.value)}
                      >
                        <option value="all">All</option>
                        <option value="DRAFT">Draft</option>
                        <option value="READY">Ready</option>
                        <option value="SPRINT_BACKLOG">Sprint Backlog</option>
                        <option value="IN_PROGRESS">In Progress</option>
                        <option value="TESTING">Testing</option>
                        <option value="READY_FOR_UAT">Ready for UAT</option>
                        <option value="DONE">Done</option>
                        <option value="CLOSED">Closed</option>
                      </select>
                    </label>
                  </div>

                  <label className="space-y-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                      Created From
                    </span>
                    <Input
                      type="date"
                      className="h-10 rounded-[18px] border-slate-200"
                      value={filters.dateFrom}
                      onChange={(event) => onChange("dateFrom", event.target.value)}
                    />
                  </label>

                  <label className="space-y-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                      Created To
                    </span>
                    <Input
                      type="date"
                      className="h-10 rounded-[18px] border-slate-200"
                      value={filters.dateTo}
                      onChange={(event) => onChange("dateTo", event.target.value)}
                    />
                  </label>
                </div>

                <div className="mt-4 flex justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      onChange("dateFrom", "");
                      onChange("dateTo", "");
                      onChange("sprintId", "all");
                      onChange("priority", "all");
                      onChange("status", "all");
                    }}
                  >
                    Clear Filters
                  </Button>
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex items-end">
            <Button
              type="button"
              variant="ghost"
              className="h-9 w-full rounded-[16px] border border-transparent px-3 text-slate-600 hover:border-slate-200 hover:bg-white xl:w-auto"
              disabled={!hasActiveFilters}
              onClick={onResetFilters}
            >
              Reset
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default BacklogToolbar;
