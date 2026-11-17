import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BookOpen,
  Bug,
  Calendar,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock,
  Flag,
  Flame,
  FolderKanban,
  KanbanSquare,
  Layers,
  ListTodo,
  PencilLine,
  Play,
  Plus,
  Sparkles,
  Target,
  TrendingUp,
  UserRound,
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
  getSprintLifecycleState,
  resolveIssueAssignee,
} from "@/lib/issues";
import { cn, formatDate, getInitials } from "@/lib/utils";

const calculateDaysRemaining = (endDate) => {
  if (!endDate) return null;
  const target = new Date(endDate);
  if (Number.isNaN(target.getTime())) return null;
  const now = new Date();
  const diffTime = target.setHours(23, 59, 59, 999) - now.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

const getDaysRemainingBadge = (daysRemaining) => {
  if (daysRemaining === null) return null;
  if (daysRemaining < 0) {
    return {
      label: `Overdue by ${Math.abs(daysRemaining)} day${Math.abs(daysRemaining) === 1 ? "" : "s"}`,
      className: "border-rose-200 bg-rose-50 text-rose-700",
    };
  }
  if (daysRemaining === 0) {
    return {
      label: "Ends today",
      className: "border-amber-200 bg-amber-50 text-amber-700 animate-pulse",
    };
  }
  if (daysRemaining === 1) {
    return {
      label: "1 day remaining",
      className: "border-amber-200 bg-amber-50 text-amber-700",
    };
  }
  return {
    label: `${daysRemaining} days left`,
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
  };
};

const SprintOverviewScreen = ({
  project,
  activeSprintSection,
  activeSprintMetrics = {},
  allSprints = [],
  plannedSprints = [],
  completedSprints = [],
  backlogCount = 0,
  unassignedEpicCount = 0,
  permissions = {},
  onSelectIssue,
  onSwitchToPlanning,
  onCreateSprint,
  onStartSprint,
  onCompleteSprint,
  onEditSprint,
}) => {
  const [storyFilter, setStoryFilter] = useState("all");

  const activeSprint = activeSprintSection?.sprint || null;
  const activeStories = useMemo(
    () => activeSprintSection?.issues || [],
    [activeSprintSection?.issues]
  );

  const daysRemaining = useMemo(
    () => calculateDaysRemaining(activeSprint?.endDate),
    [activeSprint?.endDate]
  );
  const daysBadge = useMemo(
    () => getDaysRemainingBadge(daysRemaining),
    [daysRemaining]
  );

  // Story Points & Story Status Breakdown
  const {
    totalPoints,
    completedPoints,
    statusBreakdown,
    storiesByAssignee,
    blockingBugsCount,
  } = useMemo(() => {
    let totPoints = 0;
    let compPoints = 0;
    let blockBugs = 0;

    const breakdown = {
      TODO: 0,
      IN_PROGRESS: 0,
      TESTING: 0,
      DONE: 0,
    };

    const assigneeMap = new Map();

    activeStories.forEach((story) => {
      const pts = Number(story.storyPoints || 0);
      totPoints += pts;

      const normStatus = String(story.status || "").toUpperCase();
      if (normStatus === "DONE" || normStatus === "CLOSED") {
        compPoints += pts;
        breakdown.DONE++;
      } else if (
        normStatus === "IN_PROGRESS" ||
        normStatus === "ASSIGNED" ||
        normStatus === "OPEN"
      ) {
        breakdown.IN_PROGRESS++;
      } else if (
        normStatus === "TESTING" ||
        normStatus === "READY_FOR_TESTING" ||
        normStatus === "IN_REVIEW" ||
        normStatus === "REVIEW" ||
        normStatus === "QA"
      ) {
        breakdown.TESTING++;
      } else {
        breakdown.TODO++;
      }

      if (story.storyProgress?.openBlockingBugCount) {
        blockBugs += Number(story.storyProgress.openBlockingBugCount);
      }

      // Assignee aggregation
      const assigneeObj = resolveIssueAssignee(story);
      const assigneeKey = assigneeObj?._id ? String(assigneeObj._id) : "unassigned";
      if (!assigneeMap.has(assigneeKey)) {
        assigneeMap.set(assigneeKey, {
          assignee: assigneeObj,
          stories: [],
          totalPoints: 0,
          completedPoints: 0,
          completedStories: 0,
        });
      }
      const item = assigneeMap.get(assigneeKey);
      item.stories.push(story);
      item.totalPoints += pts;
      if (normStatus === "DONE" || normStatus === "CLOSED") {
        item.completedPoints += pts;
        item.completedStories++;
      }
    });

    return {
      totalPoints: totPoints,
      completedPoints: compPoints,
      statusBreakdown: breakdown,
      storiesByAssignee: Array.from(assigneeMap.values()),
      blockingBugsCount: blockBugs,
    };
  }, [activeStories]);

  const filteredStories = useMemo(() => {
    if (storyFilter === "all") return activeStories;
    if (storyFilter === "in_progress") {
      return activeStories.filter((s) => {
        const st = String(s.status || "").toUpperCase();
        return st === "IN_PROGRESS" || st === "ASSIGNED" || st === "OPEN";
      });
    }
    if (storyFilter === "todo") {
      return activeStories.filter((s) => {
        const st = String(s.status || "").toUpperCase();
        return st === "TODO" || st === "DRAFT" || st === "READY" || st === "SPRINT_BACKLOG";
      });
    }
    if (storyFilter === "testing") {
      return activeStories.filter((s) => {
        const st = String(s.status || "").toUpperCase();
        return (
          st === "TESTING" ||
          st === "READY_FOR_TESTING" ||
          st === "IN_REVIEW" ||
          st === "REVIEW" ||
          st === "QA"
        );
      });
    }
    if (storyFilter === "done") {
      return activeStories.filter((s) => {
        const st = String(s.status || "").toUpperCase();
        return st === "DONE" || st === "CLOSED";
      });
    }
    if (storyFilter === "bugs") {
      return activeStories.filter((s) => (s.storyProgress?.bugCount || 0) > 0);
    }
    return activeStories;
  }, [activeStories, storyFilter]);

  const totalStories = activeStories.length;
  const completedStories = statusBreakdown.DONE;
  const pointsPercent = totalPoints
    ? Math.round((completedPoints / totalPoints) * 100)
    : 0;

  return (
    <div className="space-y-6 pb-12">
      {/* Top Banner & Active Sprint Hero */}
      {activeSprint ? (
        <section className="relative overflow-hidden rounded-[24px] border border-blue-200/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(239,246,255,0.85))] p-6 shadow-[0_24px_54px_-30px_rgba(37,99,235,0.35)] backdrop-blur-xl">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="h-6 border-emerald-300 bg-emerald-50 px-2.5 text-xs font-semibold text-emerald-700">
                  <span className="mr-1.5 h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  Active Sprint
                </Badge>
                {activeSprint.teamId?.name ? (
                  <Badge className="h-6 border-violet-200 bg-violet-50 px-2.5 text-xs text-violet-700">
                    {activeSprint.teamId.name}
                  </Badge>
                ) : (
                  <Badge className="h-6 border-slate-200 bg-slate-100 px-2.5 text-xs text-slate-700">
                    Project-wide
                  </Badge>
                )}
                {daysBadge ? (
                  <Badge className={cn("h-6 border px-2.5 text-xs font-medium", daysBadge.className)}>
                    <Clock className="mr-1.5 h-3 w-3" />
                    {daysBadge.label}
                  </Badge>
                ) : null}
              </div>

              <div>
                <h2 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
                  {activeSprint.name}
                </h2>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-600 sm:text-sm">
                  <span className="flex items-center gap-1.5 font-medium">
                    <Calendar className="h-4 w-4 text-blue-500" />
                    {activeSprint.startDate ? formatDate(activeSprint.startDate) : "No start date"}
                    {" — "}
                    {activeSprint.endDate ? formatDate(activeSprint.endDate) : "No end date"}
                  </span>
                  {project?.name ? (
                    <>
                      <span className="text-slate-300">•</span>
                      <span className="text-slate-600">Project: <strong>{project.name}</strong></span>
                    </>
                  ) : null}
                </div>
              </div>

              {activeSprint.goal ? (
                <div className="flex items-start gap-2.5 rounded-[14px] border border-blue-200/80 bg-blue-50/70 p-3.5 text-sm text-slate-800">
                  <Target className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                  <div>
                    <span className="font-semibold text-blue-950">Sprint Goal: </span>
                    <span className="text-slate-700">{activeSprint.goal}</span>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2.5 self-start pt-1">
              {permissions.canManageSprints ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 rounded-[10px] border-slate-200 bg-white shadow-sm hover:bg-slate-50"
                    onClick={() => onEditSprint?.(activeSprint)}
                  >
                    <PencilLine className="h-4 w-4 text-slate-600" />
                    Edit Sprint
                  </Button>
                  <Button
                    type="button"
                    className="h-10 rounded-[10px] bg-emerald-600 text-white shadow-sm hover:bg-emerald-700"
                    onClick={() => onCompleteSprint?.(activeSprint)}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Complete Sprint
                  </Button>
                </>
              ) : null}
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-[10px] border-blue-200 bg-blue-50/80 text-blue-700 shadow-sm hover:bg-blue-100"
                onClick={onSwitchToPlanning}
              >
                <ClipboardList className="h-4 w-4" />
                Planning Board
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </section>
      ) : (
        <section className="rounded-[24px] border border-slate-200/80 bg-white/95 p-8 text-center shadow-[0_20px_48px_-32px_rgba(15,23,42,0.3)] backdrop-blur-xl">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
            <CalendarClock className="h-7 w-7" />
          </div>
          <h2 className="mt-4 text-xl font-bold tracking-tight text-slate-950">
            No Active Sprint in this Project
          </h2>
          <p className="mx-auto mt-2 max-w-lg text-sm text-slate-600">
            There is no active sprint running currently. Start one of your planned sprints below or schedule work in the planning board.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            {plannedSprints.length && permissions.canManageSprints ? (
              <Button
                type="button"
                className="h-10 rounded-[10px] bg-blue-600 text-white shadow-sm hover:bg-blue-700"
                onClick={() => onStartSprint?.(plannedSprints[0])}
              >
                <Play className="h-4 w-4" />
                Start &quot;{plannedSprints[0].name}&quot;
              </Button>
            ) : null}
            {permissions.canManageSprints ? (
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-[10px] border-slate-200 bg-white"
                onClick={onCreateSprint}
              >
                <Plus className="h-4 w-4" />
                Create New Sprint
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              className="h-10 rounded-[10px] border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
              onClick={onSwitchToPlanning}
            >
              <ClipboardList className="h-4 w-4" />
              Go to Planning Board
            </Button>
          </div>
        </section>
      )}

      {/* KPI Cards Grid */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {/* Overall Completion */}
        <div className="rounded-[20px] border border-white/70 bg-white/90 p-5 shadow-[0_16px_40px_-30px_rgba(15,23,42,0.3)] backdrop-blur-xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Sprint Progress
              </p>
              <p className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
                {activeSprintMetrics.completionPercent || 0}%
              </p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="h-6 w-6" />
            </div>
          </div>
          <div className="mt-3">
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                style={{ width: `${activeSprintMetrics.completionPercent || 0}%` }}
              />
            </div>
            <p className="mt-2 text-xs font-medium text-slate-500">
              {completedStories} of {totalStories} Stories delivered
            </p>
          </div>
        </div>

        {/* Story Points */}
        <div className="rounded-[20px] border border-white/70 bg-white/90 p-5 shadow-[0_16px_40px_-30px_rgba(15,23,42,0.3)] backdrop-blur-xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Story Points
              </p>
              <p className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
                {completedPoints}{" "}
                <span className="text-lg font-normal text-slate-400">/ {totalPoints}</span>
              </p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
              <Zap className="h-6 w-6" />
            </div>
          </div>
          <div className="mt-3">
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-blue-600 transition-all duration-500"
                style={{ width: `${pointsPercent}%` }}
              />
            </div>
            <p className="mt-2 text-xs font-medium text-slate-500">
              {pointsPercent}% velocity delivered
            </p>
          </div>
        </div>

        {/* Tasks Progress */}
        <div className="rounded-[20px] border border-white/70 bg-white/90 p-5 shadow-[0_16px_40px_-30px_rgba(15,23,42,0.3)] backdrop-blur-xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Tasks &amp; Subtasks
              </p>
              <p className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
                {activeSprintMetrics.completedTaskCount || 0}{" "}
                <span className="text-lg font-normal text-slate-400">
                  / {activeSprintMetrics.taskCount || 0}
                </span>
              </p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
              <ListTodo className="h-6 w-6" />
            </div>
          </div>
          <div className="mt-3">
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-indigo-500 transition-all duration-500"
                style={{
                  width: `${
                    activeSprintMetrics.taskCount
                      ? Math.round(
                          ((activeSprintMetrics.completedTaskCount || 0) /
                            activeSprintMetrics.taskCount) *
                            100
                        )
                      : 0
                  }%`,
                }}
              />
            </div>
            <p className="mt-2 text-xs font-medium text-slate-500">
              {(activeSprintMetrics.taskCount || 0) - (activeSprintMetrics.completedTaskCount || 0)}{" "}
              tasks remaining
            </p>
          </div>
        </div>

        {/* Quality & Defects */}
        <div className="rounded-[20px] border border-white/70 bg-white/90 p-5 shadow-[0_16px_40px_-30px_rgba(15,23,42,0.3)] backdrop-blur-xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Defects &amp; Bugs
              </p>
              <p className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
                {activeSprintMetrics.resolvedBugCount || 0}{" "}
                <span className="text-lg font-normal text-slate-400">
                  / {activeSprintMetrics.bugCount || 0}
                </span>
              </p>
            </div>
            <div
              className={cn(
                "flex h-11 w-11 items-center justify-center rounded-2xl",
                blockingBugsCount > 0
                  ? "bg-rose-50 text-rose-600 animate-pulse"
                  : "bg-emerald-50 text-emerald-600"
              )}
            >
              <Bug className="h-6 w-6" />
            </div>
          </div>
          <div className="mt-3">
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                style={{
                  width: `${
                    activeSprintMetrics.bugCount
                      ? Math.round(
                          ((activeSprintMetrics.resolvedBugCount || 0) /
                            activeSprintMetrics.bugCount) *
                            100
                        )
                      : 100
                  }%`,
                }}
              />
            </div>
            <p
              className={cn(
                "mt-2 text-xs font-medium",
                blockingBugsCount > 0 ? "font-semibold text-rose-600" : "text-slate-500"
              )}
            >
              {blockingBugsCount > 0
                ? `⚠️ ${blockingBugsCount} blocking defect${blockingBugsCount === 1 ? "" : "s"}`
                : `${(activeSprintMetrics.bugCount || 0) - (activeSprintMetrics.resolvedBugCount || 0)} unresolved bugs`}
            </p>
          </div>
        </div>
      </div>

      {/* Stage Breakdown & Visual Status Bar */}
      {totalStories > 0 ? (
        <Card className="rounded-[20px] border border-white/70 bg-white/90 p-5 shadow-[0_16px_40px_-30px_rgba(15,23,42,0.3)] backdrop-blur-xl">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-950">Work Distribution by Status</h3>
              <p className="mt-0.5 text-xs text-slate-500">
                Stories currently active across development and QA stages.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs font-medium">
              <span className="inline-flex items-center gap-1.5 text-slate-600">
                <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
                To Do ({statusBreakdown.TODO})
              </span>
              <span className="inline-flex items-center gap-1.5 text-blue-700">
                <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
                In Progress ({statusBreakdown.IN_PROGRESS})
              </span>
              <span className="inline-flex items-center gap-1.5 text-amber-700">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                QA / Review ({statusBreakdown.TESTING})
              </span>
              <span className="inline-flex items-center gap-1.5 text-emerald-700">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                Done ({statusBreakdown.DONE})
              </span>
            </div>
          </div>

          <div className="mt-4 flex h-3 w-full overflow-hidden rounded-full bg-slate-100 p-0.5">
            {statusBreakdown.TODO > 0 && (
              <div
                className="h-full rounded-l-full bg-slate-300 transition-all"
                style={{ width: `${(statusBreakdown.TODO / totalStories) * 100}%` }}
                title={`To Do: ${statusBreakdown.TODO}`}
              />
            )}
            {statusBreakdown.IN_PROGRESS > 0 && (
              <div
                className="h-full bg-blue-500 transition-all"
                style={{ width: `${(statusBreakdown.IN_PROGRESS / totalStories) * 100}%` }}
                title={`In Progress: ${statusBreakdown.IN_PROGRESS}`}
              />
            )}
            {statusBreakdown.TESTING > 0 && (
              <div
                className="h-full bg-amber-500 transition-all"
                style={{ width: `${(statusBreakdown.TESTING / totalStories) * 100}%` }}
                title={`Testing/Review: ${statusBreakdown.TESTING}`}
              />
            )}
            {statusBreakdown.DONE > 0 && (
              <div
                className="h-full rounded-r-full bg-emerald-500 transition-all"
                style={{ width: `${(statusBreakdown.DONE / totalStories) * 100}%` }}
                title={`Done: ${statusBreakdown.DONE}`}
              />
            )}
          </div>
        </Card>
      ) : null}

      {/* Team Workload Allocation */}
      {storiesByAssignee.length > 0 ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-base font-bold text-slate-950">
              <Users className="h-4 w-4 text-blue-600" />
              Team Workload &amp; Allocation
            </h3>
            <span className="text-xs text-slate-500">
              {storiesByAssignee.length} contributor{storiesByAssignee.length === 1 ? "" : "s"} in this sprint
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {storiesByAssignee.map(({ assignee, stories, totalPoints: memberPts, completedStories: compSt }) => {
              const memberPercent = stories.length
                ? Math.round((compSt / stories.length) * 100)
                : 0;

              return (
                <div
                  key={assignee?._id || "unassigned"}
                  className="rounded-[18px] border border-white/70 bg-white/90 p-4 shadow-[0_12px_32px_-24px_rgba(15,23,42,0.25)] backdrop-blur-xl"
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10 border border-slate-200">
                      <AvatarImage src={assignee?.avatarUrl} alt={assignee?.name || "Unassigned"} />
                      <AvatarFallback className="text-xs font-bold">
                        {assignee?.name ? getInitials(assignee.name) : "?"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-slate-900">
                        {assignee?.name || "Unassigned Work"}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {assignee?.designation || (assignee ? "Team Member" : "Needs Owner")}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-600">
                    <span>
                      <strong>{stories.length}</strong> {stories.length === 1 ? "Story" : "Stories"}
                    </span>
                    <span>
                      <strong>{memberPts}</strong> Points
                    </span>
                  </div>

                  <div className="mt-2.5">
                    <div className="flex items-center justify-between text-[11px] font-medium text-slate-500">
                      <span>Progress</span>
                      <span>{memberPercent}%</span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all"
                        style={{ width: `${memberPercent}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* Active Sprint Stories Table / Interactive List */}
      <section className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-base font-bold text-slate-950">
              <Layers className="h-4 w-4 text-blue-600" />
              Active Sprint Stories ({activeStories.length})
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Select any story to inspect acceptance criteria, subtasks, and defects.
            </p>
          </div>

          {/* Filter Chips */}
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: "all", label: `All (${activeStories.length})` },
              { id: "in_progress", label: `In Progress (${statusBreakdown.IN_PROGRESS})` },
              { id: "todo", label: `To Do (${statusBreakdown.TODO})` },
              { id: "testing", label: `QA / Review (${statusBreakdown.TESTING})` },
              { id: "done", label: `Done (${statusBreakdown.DONE})` },
            ].map(({ id, label }) => (
              <button
                key={id}
                type="button"
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-semibold transition",
                  storyFilter === id
                    ? "bg-blue-600 text-white shadow-sm"
                    : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                )}
                onClick={() => setStoryFilter(id)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <Card className="overflow-hidden rounded-[20px] border-white/70 bg-white/90 shadow-[0_18px_48px_-36px_rgba(15,23,42,0.4)] backdrop-blur-xl">
          <CardContent className="p-0">
            {filteredStories.length ? (
              <div className="divide-y divide-slate-100">
                {filteredStories.map((story) => {
                  const assignee = resolveIssueAssignee(story);
                  const statusVariant = getIssueStatusVariant(story.status);
                  const priorityVariant = getIssuePriorityVariant(story.priority);
                  const progress = story.storyProgress || {};
                  const isDone =
                    String(story.status || "").toUpperCase() === "DONE" ||
                    String(story.status || "").toUpperCase() === "CLOSED";

                  return (
                    <div
                      key={story._id}
                      onClick={() => onSelectIssue?.(story)}
                      className="group flex cursor-pointer flex-col gap-3 p-4 transition hover:bg-blue-50/50 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex min-w-0 items-start gap-3 sm:items-center">
                        <span className="rounded-[6px] bg-blue-100/70 px-2 py-1 font-mono text-xs font-bold text-blue-700">
                          {story.key || "STORY"}
                        </span>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p
                              className={cn(
                                "truncate text-sm font-semibold text-slate-900 group-hover:text-blue-600",
                                isDone && "text-slate-500 line-through"
                              )}
                            >
                              {story.title}
                            </p>
                            {story.epicId?.name ? (
                              <Badge className="h-5 border-violet-200 bg-violet-50 px-2 text-[10px] text-violet-700">
                                {story.epicId.name}
                              </Badge>
                            ) : null}
                          </div>

                          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                            {story.storyPoints ? (
                              <span className="font-semibold text-slate-700">
                                {story.storyPoints} pts
                              </span>
                            ) : null}
                            <span>
                              Tasks: {progress.completedTaskCount || 0}/{progress.taskCount || 0}
                            </span>
                            {progress.bugCount ? (
                              <span
                                className={cn(
                                  "font-medium",
                                  progress.openBlockingBugCount
                                    ? "text-rose-600 font-semibold"
                                    : "text-slate-600"
                                )}
                              >
                                Bugs: {progress.resolvedBugCount || 0}/{progress.bugCount || 0}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 self-end sm:self-center">
                        {/* Assignee */}
                        <div className="flex items-center gap-2">
                          <Avatar className="h-7 w-7 border border-slate-200">
                            <AvatarImage src={assignee?.avatarUrl} alt={assignee?.name || "Unassigned"} />
                            <AvatarFallback className="text-[10px]">
                              {assignee?.name ? getInitials(assignee.name) : "?"}
                            </AvatarFallback>
                          </Avatar>
                          <span className="hidden text-xs text-slate-700 sm:inline">
                            {assignee?.name ? assignee.name.split(" ")[0] : "Unassigned"}
                          </span>
                        </div>

                        {/* Priority Badge */}
                        <Badge
                          variant={priorityVariant}
                          className="h-6 px-2 text-[11px] capitalize"
                        >
                          {story.priority || "Medium"}
                        </Badge>

                        {/* Status Badge */}
                        <Badge
                          variant={statusVariant}
                          className="h-6 px-2 text-[11px] font-semibold"
                        >
                          {getIssueStatusLabel(story.status)}
                        </Badge>

                        <ChevronRight className="h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-blue-600" />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="px-6 py-12 text-center text-sm text-slate-500">
                No stories match the selected filter.
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Planned & Upcoming Sprints Roadmap Preview */}
      {plannedSprints.length > 0 ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-base font-bold text-slate-950">
              <CalendarDays className="h-4 w-4 text-blue-600" />
              Upcoming Planned Sprints ({plannedSprints.length})
            </h3>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-blue-600 hover:text-blue-700"
              onClick={onSwitchToPlanning}
            >
              Manage in Planning Board
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {plannedSprints.map((sprint) => (
              <div
                key={sprint._id}
                className="rounded-[18px] border border-blue-100 bg-gradient-to-b from-white to-blue-50/30 p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <Badge className="h-5 border-blue-200 bg-blue-50 text-[10px] text-blue-700">
                      Planned
                    </Badge>
                    <p className="mt-1.5 text-base font-bold text-slate-900">{sprint.name}</p>
                  </div>
                  {permissions.canManageSprints ? (
                    <Button
                      type="button"
                      size="sm"
                      className="h-7 rounded-[8px] bg-blue-600 px-2.5 text-xs text-white hover:bg-blue-700"
                      onClick={() => onStartSprint?.(sprint)}
                    >
                      <Play className="h-3 w-3" />
                      Start
                    </Button>
                  ) : null}
                </div>

                <p className="mt-2 text-xs text-slate-500">
                  {sprint.startDate ? formatDate(sprint.startDate) : "No start date"}
                  {" — "}
                  {sprint.endDate ? formatDate(sprint.endDate) : "No end date"}
                </p>

                {sprint.goal ? (
                  <p className="mt-2 line-clamp-2 text-xs text-slate-600 italic">
                    &quot;{sprint.goal}&quot;
                  </p>
                ) : null}

                <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 text-xs text-slate-600">
                  <span>{sprint.issueCount || 0} Stories Scheduled</span>
                  <span>{sprint.completedCount || 0} Done</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Completed Sprints / Historical Velocity */}
      {completedSprints.length > 0 ? (
        <section className="space-y-3">
          <h3 className="flex items-center gap-2 text-base font-bold text-slate-950">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            Recent Completed Sprints ({completedSprints.length})
          </h3>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {completedSprints.slice(0, 3).map((sprint) => (
              <div
                key={sprint._id}
                className="rounded-[18px] border border-slate-200/80 bg-white/80 p-4 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-slate-900">{sprint.name}</p>
                  <Badge className="h-5 border-emerald-200 bg-emerald-50 text-[10px] text-emerald-700">
                    Completed
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Closed on {sprint.completedAt ? formatDate(sprint.completedAt) : "Recently"}
                </p>
                <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-xs font-medium text-slate-700">
                  <span>Delivered: {sprint.completedCount || sprint.issueCount || 0} stories</span>
                  <span className="text-emerald-700">100% Closed</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
};

export default SprintOverviewScreen;
