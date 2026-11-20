import { useMemo, useState } from "react";
import {
  Archive,
  ArrowRight,
  Award,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  RotateCcw,
  Sparkles,
  TrendingUp,
  UserCheck,
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
import { ROLE_ADMIN } from "@/lib/roles";
import { cn, formatDate, getInitials } from "@/lib/utils";

const CompletedSprintsScreen = ({
  project,
  completedSprints = [],
  sprintSections = [],
  role,
  onSelectIssue,
  onSwitchToPlanning,
  onReopenSprint,
}) => {
  const [expandedSprintIds, setExpandedSprintIds] = useState(() =>
    new Set(completedSprints.slice(0, 2).map((s) => String(s._id)))
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

  const sprintIssuesMap = useMemo(() => {
    const map = new Map();
    sprintSections.forEach((sec) => {
      map.set(String(sec.sprint._id), sec.issues || []);
    });
    return map;
  }, [sprintSections]);

  // Aggregate stats across all completed sprints
  const { totalCompletedPoints, totalCompletedStories, averageVelocity } = useMemo(() => {
    let pts = 0;
    let stories = 0;

    completedSprints.forEach((sprint) => {
      const snapshot = sprint.snapshot || {};
      const deliveredPts = Number(snapshot.completedPoints || 0);
      pts += deliveredPts;

      const issues = sprintIssuesMap.get(String(sprint._id)) || [];
      const doneCount = issues.filter(
        (i) => ["DONE", "CLOSED", "RESOLVED"].includes(String(i.status || "").toUpperCase())
      ).length;
      stories += doneCount || sprint.completedCount || issues.length;
    });

    const avg = completedSprints.length
      ? Math.round(pts / completedSprints.length)
      : 0;

    return {
      totalCompletedPoints: pts,
      totalCompletedStories: stories,
      averageVelocity: avg,
    };
  }, [completedSprints, sprintIssuesMap]);

  return (
    <div className="space-y-6 pb-12">
      {/* Header Banner */}
      <section className="rounded-[24px] border border-emerald-200/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(236,253,245,0.85))] p-6 shadow-[0_24px_54px_-30px_rgba(16,185,129,0.3)] backdrop-blur-xl dark:border-emerald-900/60 dark:bg-slate-900/90 dark:bg-none dark:shadow-black/50">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Badge className="h-6 border-emerald-300 bg-emerald-100/80 px-2.5 text-xs font-semibold text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300">
                <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                Completed Sprints Archive
              </Badge>
              <Badge className="h-6 border-slate-200 bg-white/80 px-2.5 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300">
                {completedSprints.length} Sprints Closed
              </Badge>
            </div>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl dark:text-slate-100">
              Delivery History &amp; Velocity
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Review completed sprints, retrospective outcomes, and delivered velocity for <strong>{project?.name || "this project"}</strong>.
            </p>
          </div>

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

        {/* Aggregate KPI Cards */}
        <div className="mt-5 grid grid-cols-2 gap-3 border-t border-emerald-100 pt-4 sm:grid-cols-4 dark:border-slate-800">
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Total Sprints Closed</p>
            <p className="mt-1 text-2xl font-bold text-slate-950 dark:text-slate-100">{completedSprints.length}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Delivered Stories</p>
            <p className="mt-1 text-2xl font-bold text-slate-950 dark:text-slate-100">{totalCompletedStories}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Total Points Shipped</p>
            <p className="mt-1 text-2xl font-bold text-emerald-700 dark:text-emerald-400">{totalCompletedPoints} pts</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Average Velocity</p>
            <p className="mt-1 text-2xl font-bold text-blue-700 dark:text-blue-400">
              {averageVelocity} <span className="text-sm font-normal text-slate-500 dark:text-slate-400">pts / sprint</span>
            </p>
          </div>
        </div>
      </section>

      {/* Sprints List */}
      {completedSprints.length > 0 ? (
        <div className="space-y-4">
          {completedSprints.map((sprint) => {
            const sprintIdStr = String(sprint._id);
            const issues = sprintIssuesMap.get(sprintIdStr) || [];
            const isExpanded = expandedSprintIds.has(sprintIdStr);
            const snapshot = sprint.snapshot || {};

            const deliveredPoints =
              Number(snapshot.completedPoints || 0) ||
              issues.reduce((acc, cur) => acc + Number(cur.storyPoints || 0), 0);
            const committedPoints = Number(snapshot.committedPoints || 0) || deliveredPoints;

            const carriedOverCount = Array.isArray(snapshot.carriedOverIssueIds)
              ? snapshot.carriedOverIssueIds.length
              : 0;

            return (
              <div
                key={sprint._id}
                className="overflow-hidden rounded-[20px] border border-slate-200/80 bg-white/95 shadow-[0_12px_36px_-24px_rgba(15,23,42,0.2)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 dark:shadow-black/40"
              >
                {/* Sprint Header */}
                <div className="border-b border-slate-100 p-5 dark:border-slate-800">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className="h-5 border-emerald-300 bg-emerald-50 text-[11px] font-bold text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300">
                          Completed
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
                      </div>

                      <h3 className="text-xl font-bold text-slate-950 dark:text-slate-100">{sprint.name}</h3>

                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                        <span className="flex items-center gap-1 font-medium">
                          <Calendar className="h-3.5 w-3.5 text-slate-400" />
                          {sprint.startDate ? formatDate(sprint.startDate) : "No start date"}
                          {" — "}
                          {sprint.endDate ? formatDate(sprint.endDate) : "No end date"}
                        </span>
                        {sprint.completedAt ? (
                          <>
                            <span className="text-slate-300">•</span>
                            <span>Closed: <strong>{formatDate(sprint.completedAt)}</strong></span>
                          </>
                        ) : null}
                      </div>

                      {sprint.goal ? (
                        <p className="mt-1 text-xs text-slate-600 italic">
                          <strong className="not-italic text-slate-700">Goal: </strong>
                          &quot;{sprint.goal}&quot;
                        </p>
                      ) : null}
                    </div>

                    {/* Stats & Actions */}
                    <div className="flex flex-wrap items-center gap-3 self-start pt-1">
                      <div className="text-right">
                        <p className="text-sm font-bold text-slate-950">
                          {deliveredPoints}{" "}
                          <span className="text-xs font-normal text-slate-500">
                            / {committedPoints} pts delivered
                          </span>
                        </p>
                        <p className="text-xs font-medium text-emerald-600">
                          {sprint.completedCount || issues.length} Stories Shipped
                        </p>
                      </div>

                      {role === ROLE_ADMIN ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-9 rounded-[8px] border-amber-200 bg-amber-50 px-2.5 text-xs text-amber-700 hover:bg-amber-100"
                          onClick={() => onReopenSprint?.(sprint)}
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Reopen Sprint
                        </Button>
                      ) : null}

                      <button
                        type="button"
                        className="inline-flex h-9 items-center gap-1 rounded-[8px] border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                        onClick={() => toggleExpand(sprintIdStr)}
                      >
                        <span>View Stories ({issues.length})</span>
                        <ChevronDown
                          className={cn(
                            "h-4 w-4 transition-transform",
                            isExpanded ? "rotate-180" : ""
                          )}
                        />
                      </button>
                    </div>
                  </div>

                  {/* Carry Over Notice */}
                  {carriedOverCount > 0 ? (
                    <div className="mt-3 rounded-[10px] border border-amber-200 bg-amber-50/70 p-2.5 text-xs text-amber-800">
                      ℹ️ {carriedOverCount} incomplete {carriedOverCount === 1 ? "story was" : "stories were"} rolled over to {snapshot.carryOverMode === "SPRINT" ? "the next sprint" : "the backlog"} when this sprint closed.
                    </div>
                  ) : null}
                </div>

                {/* Delivered Stories List */}
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
                              className="group flex cursor-pointer flex-col gap-2 rounded-[12px] border border-slate-200/70 bg-white p-3 shadow-xs transition hover:border-emerald-300 hover:shadow-sm sm:flex-row sm:items-center sm:justify-between"
                            >
                              <div className="flex min-w-0 items-center gap-2.5">
                                <span className="rounded bg-emerald-50 px-1.5 py-0.5 font-mono text-[11px] font-bold text-emerald-700">
                                  {story.key || "STORY"}
                                </span>
                                <p className="truncate text-xs font-semibold text-slate-800 group-hover:text-emerald-700">
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
                        No individual story records stored for this completed sprint.
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
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
            <Archive className="h-8 w-8" />
          </div>
          <h2 className="mt-4 text-2xl font-bold tracking-tight text-slate-950">
            No Completed Sprints Yet
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
            When you complete an active sprint from the planning board, its final retrospective metrics, delivered story points, and velocity benchmarks will appear here.
          </p>

          <div className="mt-6 flex justify-center">
            <Button
              type="button"
              variant="outline"
              className="h-10 rounded-[10px] border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
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

export default CompletedSprintsScreen;
