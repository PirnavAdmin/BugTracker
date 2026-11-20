import { useMemo, useState } from "react";
import {
  ArrowRight,
  Calendar,
  CalendarClock,
  CalendarDays,
  CalendarPlus,
  ChevronDown,
  ChevronRight,
  Clock,
  FolderKanban,
  Layers,
  PencilLine,
  Play,
  Plus,
  Target,
  Trash2,
  Users,
  Zap,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  getIssuePriorityVariant,
  getIssueStatusLabel,
  getIssueStatusVariant,
  resolveIssueAssignee,
} from "@/lib/issues";
import { cn, formatDate, getInitials } from "@/lib/utils";

const calculateSprintDurationDays = (startDate, endDate) => {
  if (!startDate || !endDate) return null;
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  const diffDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
  return diffDays > 0 ? diffDays : null;
};

const UpcomingSprintsScreen = ({
  project,
  plannedSprints = [],
  sprintSections = [],
  permissions = {},
  onSelectIssue,
  onSwitchToPlanning,
  onCreateSprint,
  onStartSprint,
  onEditSprint,
  onDeleteSprint,
}) => {
  const [expandedSprintIds, setExpandedSprintIds] = useState(() =>
    new Set(plannedSprints.map((s) => String(s._id)))
  );

  const toggleExpand = (sprintId) => {
    setExpandedSprintIds((prev) => {
      const next = new Set(prev);
      if (next.has(sprintId)) {
        next.delete(sprintId);
      } else {
        next.add(sprintId);
      }
      return next;
    });
  };

  // Map sprintId to issues
  const sprintIssuesMap = useMemo(() => {
    const map = new Map();
    sprintSections.forEach((sec) => {
      map.set(String(sec.sprint._id), sec.issues || []);
    });
    return map;
  }, [sprintSections]);

  const { totalPlannedStories, totalPlannedPoints } = useMemo(() => {
    let storiesCount = 0;
    let pointsCount = 0;

    plannedSprints.forEach((sprint) => {
      const issues = sprintIssuesMap.get(String(sprint._id)) || [];
      storiesCount += issues.length;
      issues.forEach((issue) => {
        pointsCount += Number(issue.storyPoints || 0);
      });
    });

    return {
      totalPlannedStories: storiesCount,
      totalPlannedPoints: pointsCount,
    };
  }, [plannedSprints, sprintIssuesMap]);

  return (
    <div className="space-y-6 pb-12">
      {/* Header Banner */}
      <section className="rounded-[24px] border border-blue-200/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(239,246,255,0.85))] p-6 shadow-[0_24px_54px_-30px_rgba(37,99,235,0.3)] backdrop-blur-xl dark:border-blue-900/60 dark:bg-slate-900/90 dark:bg-none dark:shadow-black/50">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Badge className="h-6 border-blue-300 bg-blue-100/80 px-2.5 text-xs font-semibold text-blue-800 dark:border-blue-800/60 dark:bg-blue-950/40 dark:text-blue-300">
                <CalendarDays className="mr-1.5 h-3.5 w-3.5" />
                Upcoming Sprints
              </Badge>
              <Badge className="h-6 border-slate-200 bg-white/80 px-2.5 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300">
                {plannedSprints.length} Planned
              </Badge>
            </div>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl dark:text-slate-100">
              Future Sprint Roadmap
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Prepare, estimate, and queue stories into future sprints for <strong>{project?.name || "this project"}</strong>.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
            {permissions.canManageSprints ? (
              <Button
                type="button"
                className="h-10 rounded-[10px] bg-blue-600 text-white shadow-sm hover:bg-blue-700"
                onClick={onCreateSprint}
              >
                <Plus className="h-4 w-4" />
                Create Sprint
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              className="h-10 rounded-[10px] border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50 self-start sm:self-center dark:border-slate-800 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              onClick={onSwitchToPlanning}
            >
              Planning Board
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Quick Stats Pill */}
        <div className="mt-5 grid grid-cols-2 gap-3 border-t border-blue-100 pt-4 sm:grid-cols-4 dark:border-slate-800">
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Planned Sprints</p>
            <p className="mt-1 text-2xl font-bold text-slate-950 dark:text-slate-100">{plannedSprints.length}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Queued Stories</p>
            <p className="mt-1 text-2xl font-bold text-slate-950 dark:text-slate-100">{totalPlannedStories}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Estimated Points</p>
            <p className="mt-1 text-2xl font-bold text-blue-700 dark:text-blue-400">{totalPlannedPoints} pts</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Next Sprint</p>
            <p className="mt-1 truncate text-base font-bold text-slate-900 dark:text-slate-100">
              {plannedSprints[0]?.name || "None"}
            </p>
          </div>
        </div>
      </section>

      {/* Sprints List */}
      {plannedSprints.length > 0 ? (
        <div className="space-y-4">
          {plannedSprints.map((sprint, index) => {
            const sprintIdStr = String(sprint._id);
            const issues = sprintIssuesMap.get(sprintIdStr) || [];
            const isExpanded = expandedSprintIds.has(sprintIdStr);
            const durationDays = calculateSprintDurationDays(sprint.startDate, sprint.endDate);

            const pointsTotal = issues.reduce(
              (acc, cur) => acc + Number(cur.storyPoints || 0),
              0
            );

            // Distinct assignees
            const assignees = Array.from(
              new Map(
                issues
                  .map((i) => resolveIssueAssignee(i))
                  .filter(Boolean)
                  .map((a) => [String(a._id), a])
              ).values()
            );

            return (
              <div
                key={sprint._id}
                className="overflow-hidden rounded-[20px] border border-blue-100 bg-white/95 shadow-[0_12px_36px_-24px_rgba(15,23,42,0.25)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 dark:shadow-black/40"
              >
                {/* Sprint Header Banner */}
                <div className="border-b border-slate-100 p-5 dark:border-slate-800">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className="h-5 border-blue-200 bg-blue-50 text-[11px] font-bold text-blue-700 dark:border-blue-800/60 dark:bg-blue-950/40 dark:text-blue-300">
                          Sprint {index + 1}
                        </Badge>
                        {sprint.teamId?.name ? (
                          <Badge className="h-5 border-violet-200 bg-violet-50 text-[11px] text-violet-700 dark:border-violet-800/60 dark:bg-violet-950/40 dark:text-violet-300">
                            {sprint.teamId.name}
                          </Badge>
                        ) : (
                          <Badge className="h-5 border-slate-200 bg-slate-100 text-[11px] text-slate-700 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300">
                            Project-wide
                          </Badge>
                        )}
                        {durationDays ? (
                          <Badge className="h-5 border-slate-200 bg-slate-50 text-[11px] text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300">
                            <Clock className="mr-1 h-3 w-3" />
                            {durationDays} days
                          </Badge>
                        ) : null}
                      </div>

                      <h3 className="text-xl font-bold text-slate-950 dark:text-slate-100">{sprint.name}</h3>

                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <span className="flex items-center gap-1 font-medium">
                          <Calendar className="h-3.5 w-3.5 text-blue-500" />
                          {sprint.startDate ? formatDate(sprint.startDate) : "No start date"}
                          {" — "}
                          {sprint.endDate ? formatDate(sprint.endDate) : "No end date"}
                        </span>
                      </div>

                      {sprint.goal ? (
                        <p className="mt-1 text-xs text-slate-600 italic dark:text-slate-400">
                          <strong className="not-italic text-slate-700 dark:text-slate-300">Goal: </strong>
                          &quot;{sprint.goal}&quot;
                        </p>
                      ) : null}
                    </div>

                    {/* Actions */}
                    <div className="flex flex-wrap items-center gap-2 self-start pt-1">
                      {permissions.canManageSprints ? (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            className="h-9 rounded-[8px] bg-blue-600 px-3 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
                            onClick={() => onStartSprint?.(sprint)}
                          >
                            <Play className="h-3.5 w-3.5" />
                            Start Sprint
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-9 rounded-[8px] border-slate-200 bg-white px-2.5 text-xs text-slate-700 hover:bg-slate-50"
                            onClick={() => onEditSprint?.(sprint)}
                          >
                            <PencilLine className="h-3.5 w-3.5" />
                            Edit
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-9 rounded-[8px] px-2 text-xs text-rose-600 hover:bg-rose-50"
                            onClick={() => onDeleteSprint?.(sprint)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      ) : null}

                      <button
                        type="button"
                        className="inline-flex h-9 items-center gap-1 rounded-[8px] border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                        onClick={() => toggleExpand(sprintIdStr)}
                      >
                        <span>{issues.length} Stories ({pointsTotal} pts)</span>
                        <ChevronDown
                          className={cn(
                            "h-4 w-4 transition-transform",
                            isExpanded ? "rotate-180" : ""
                          )}
                        />
                      </button>
                    </div>
                  </div>

                  {/* Contributors summary */}
                  {assignees.length > 0 ? (
                    <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-3">
                      <span className="text-xs text-slate-500">Assigned:</span>
                      <div className="flex -space-x-1.5 overflow-hidden">
                        {assignees.slice(0, 5).map((u) => (
                          <Avatar key={u._id} className="h-6 w-6 border-2 border-white">
                            <AvatarImage src={u.avatarUrl} alt={u.name} />
                            <AvatarFallback className="text-[9px]">
                              {getInitials(u.name)}
                            </AvatarFallback>
                          </Avatar>
                        ))}
                      </div>
                      {assignees.length > 5 ? (
                        <span className="text-[11px] text-slate-500">
                          +{assignees.length - 5} more
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                {/* Collapsible Story List */}
                {isExpanded ? (
                  <div className="bg-slate-50/50 p-4">
                    {issues.length ? (
                      <div className="space-y-2">
                        {issues.map((story) => {
                          const assignee = resolveIssueAssignee(story);
                          const priorityVariant = getIssuePriorityVariant(story.priority);
                          const statusVariant = getIssueStatusVariant(story.status);

                          return (
                            <div
                              key={story._id}
                              onClick={() => onSelectIssue?.(story)}
                              className="group flex cursor-pointer flex-col gap-2 rounded-[12px] border border-slate-200/70 bg-white p-3 shadow-xs transition hover:border-blue-300 hover:shadow-sm sm:flex-row sm:items-center sm:justify-between"
                            >
                              <div className="flex min-w-0 items-center gap-2.5">
                                <span className="rounded bg-blue-50 px-1.5 py-0.5 font-mono text-[11px] font-bold text-blue-700">
                                  {story.key || "STORY"}
                                </span>
                                <p className="truncate text-xs font-semibold text-slate-900 group-hover:text-blue-600">
                                  {story.title}
                                </p>
                                {story.epicId?.name ? (
                                  <span className="hidden rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 sm:inline">
                                    {story.epicId.name}
                                  </span>
                                ) : null}
                              </div>

                              <div className="flex items-center gap-2.5 self-end sm:self-center">
                                {story.storyPoints ? (
                                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-700">
                                    {story.storyPoints} pts
                                  </span>
                                ) : null}

                                <div className="flex items-center gap-1.5">
                                  <Avatar className="h-5 w-5 border border-slate-200">
                                    <AvatarImage src={assignee?.avatarUrl} alt={assignee?.name || "Unassigned"} />
                                    <AvatarFallback className="text-[9px]">
                                      {assignee?.name ? getInitials(assignee.name) : "?"}
                                    </AvatarFallback>
                                  </Avatar>
                                  <span className="truncate max-w-[80px] text-[11px] text-slate-600">
                                    {assignee?.name ? assignee.name.split(" ")[0] : "Unassigned"}
                                  </span>
                                </div>

                                <Badge variant={priorityVariant} className="h-5 px-1.5 text-[10px] capitalize">
                                  {story.priority || "Medium"}
                                </Badge>
                                <Badge variant={statusVariant} className="h-5 px-1.5 text-[10px] font-semibold">
                                  {getIssueStatusLabel(story.status)}
                                </Badge>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="rounded-[12px] border border-dashed border-slate-200 bg-white/70 p-6 text-center text-xs text-slate-500">
                        No stories scheduled in this sprint yet. Use the Planning Board to drag stories into this sprint.
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <section className="rounded-[24px] border border-slate-200/80 bg-white/95 p-10 text-center shadow-[0_20px_48px_-32px_rgba(15,23,42,0.3)] backdrop-blur-xl">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
            <CalendarPlus className="h-8 w-8" />
          </div>
          <h2 className="mt-4 text-2xl font-bold tracking-tight text-slate-950">
            No Upcoming Sprints Scheduled
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
            Create your next sprint so your team can estimate upcoming user stories and keep velocity high.
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            {permissions.canManageSprints ? (
              <Button
                type="button"
                className="h-10 rounded-[10px] bg-blue-600 text-white shadow-sm hover:bg-blue-700"
                onClick={onCreateSprint}
              >
                <Plus className="h-4 w-4" />
                Create Sprint
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              className="h-10 rounded-[10px] border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
              onClick={onSwitchToPlanning}
            >
              Go to Planning Board
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </section>
      )}
    </div>
  );
};

export default UpcomingSprintsScreen;
