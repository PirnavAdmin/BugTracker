import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Bug,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  Flame,
  Layers,
  ListTodo,
  PencilLine,
  Play,
  Plus,
  Target,
  UserCircle2,
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

const calculateDaysRemaining = (endDate) => {
  if (!endDate) return null;
  const target = new Date(endDate);
  if (Number.isNaN(target.getTime())) return null;
  const now = new Date();
  const diffTime = target.setHours(23, 59, 59, 999) - now.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

const getDaysBadge = (daysRemaining) => {
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

const STAGES = [
  {
    id: "TODO",
    title: "To Do",
    dotClass: "bg-slate-400",
    headerClass: "border-slate-200 bg-slate-50/80 text-slate-700",
    matcher: (status) =>
      ["TODO", "DRAFT", "READY", "SPRINT_BACKLOG"].includes(String(status || "").toUpperCase()),
  },
  {
    id: "IN_PROGRESS",
    title: "In Progress",
    dotClass: "bg-blue-500",
    headerClass: "border-blue-200 bg-blue-50/80 text-blue-700",
    matcher: (status) =>
      ["IN_PROGRESS", "OPEN", "ASSIGNED"].includes(String(status || "").toUpperCase()),
  },
  {
    id: "TESTING",
    title: "QA / Testing",
    dotClass: "bg-amber-500",
    headerClass: "border-amber-200 bg-amber-50/80 text-amber-700",
    matcher: (status) =>
      [
        "TESTING",
        "READY_FOR_TESTING",
        "IN_REVIEW",
        "REVIEW",
        "QA",
        "READY_FOR_UAT",
      ].includes(String(status || "").toUpperCase()),
  },
  {
    id: "DONE",
    title: "Done",
    dotClass: "bg-emerald-500",
    headerClass: "border-emerald-200 bg-emerald-50/80 text-emerald-700",
    matcher: (status) =>
      ["DONE", "CLOSED", "RESOLVED"].includes(String(status || "").toUpperCase()),
  },
];

const ActiveSprintScreen = ({
  project,
  activeSprintSection,
  activeSprintMetrics = {},
  plannedSprints = [],
  permissions = {},
  onSelectIssue,
  onSwitchToPlanning,
  onCreateSprint,
  onStartSprint,
  onCompleteSprint,
  onEditSprint,
}) => {
  const [selectedAssigneeId, setSelectedAssigneeId] = useState("all");

  const activeSprint = activeSprintSection?.sprint || null;
  const activeStories = useMemo(
    () => activeSprintSection?.issues || [],
    [activeSprintSection?.issues]
  );

  const daysRemaining = useMemo(
    () => calculateDaysRemaining(activeSprint?.endDate),
    [activeSprint?.endDate]
  );
  const daysBadge = useMemo(() => getDaysBadge(daysRemaining), [daysRemaining]);

  const { totalPoints, completedPoints, assigneesList } = useMemo(() => {
    let tot = 0;
    let comp = 0;
    const aMap = new Map();

    activeStories.forEach((story) => {
      const pts = Number(story.storyPoints || 0);
      tot += pts;
      const isDone = ["DONE", "CLOSED", "RESOLVED"].includes(
        String(story.status || "").toUpperCase()
      );
      if (isDone) comp += pts;

      const assignee = resolveIssueAssignee(story);
      if (assignee?._id) {
        aMap.set(String(assignee._id), assignee);
      }
    });

    return {
      totalPoints: tot,
      completedPoints: comp,
      assigneesList: Array.from(aMap.values()),
    };
  }, [activeStories]);

  const filteredStories = useMemo(() => {
    if (selectedAssigneeId === "all") return activeStories;
    if (selectedAssigneeId === "unassigned") {
      return activeStories.filter((s) => !resolveIssueAssignee(s));
    }
    return activeStories.filter((s) => {
      const a = resolveIssueAssignee(s);
      return a?._id && String(a._id) === selectedAssigneeId;
    });
  }, [activeStories, selectedAssigneeId]);

  // Group stories by stage
  const storiesByStage = useMemo(() => {
    const map = {
      TODO: [],
      IN_PROGRESS: [],
      TESTING: [],
      DONE: [],
    };

    filteredStories.forEach((story) => {
      const matched = STAGES.find((stage) => stage.matcher(story.status));
      if (matched) {
        map[matched.id].push(story);
      } else {
        map.TODO.push(story);
      }
    });

    return map;
  }, [filteredStories]);

  if (!activeSprint) {
    return (
      <div className="space-y-6 pb-12">
        <section className="rounded-[24px] border border-slate-200/80 bg-white/95 p-10 text-center shadow-[0_20px_48px_-32px_rgba(15,23,42,0.3)] backdrop-blur-xl">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
            <Zap className="h-8 w-8" />
          </div>
          <h2 className="mt-4 text-2xl font-bold tracking-tight text-slate-950">
            No Active Sprint
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
            There is currently no active sprint running in <strong>{project?.name || "this project"}</strong>. Start a planned sprint or schedule new stories from the planning board.
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
              Go to Planning Board
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Active Sprint Hero */}
      <section className="relative overflow-hidden rounded-[24px] border border-emerald-200/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(236,253,245,0.85))] p-6 shadow-[0_24px_54px_-30px_rgba(16,185,129,0.35)] backdrop-blur-xl dark:border-emerald-900/60 dark:bg-slate-900/90 dark:bg-none dark:shadow-black/50">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="h-6 border-emerald-300 bg-emerald-100/80 px-2.5 text-xs font-semibold text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300">
                <span className="mr-1.5 h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                Active Sprint
              </Badge>
              {activeSprint.teamId?.name ? (
                <Badge className="h-6 border-violet-200 bg-violet-50 px-2.5 text-xs text-violet-700 dark:border-violet-800/60 dark:bg-violet-950/40 dark:text-violet-300">
                  {activeSprint.teamId.name}
                </Badge>
              ) : (
                <Badge className="h-6 border-slate-200 bg-slate-100 px-2.5 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300">
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
              <h2 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl dark:text-slate-100">
                {activeSprint.name}
              </h2>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-600 sm:text-sm dark:text-slate-400">
                <span className="flex items-center gap-1.5 font-medium">
                  <Calendar className="h-4 w-4 text-emerald-600" />
                  {activeSprint.startDate ? formatDate(activeSprint.startDate) : "No start date"}
                  {" — "}
                  {activeSprint.endDate ? formatDate(activeSprint.endDate) : "No end date"}
                </span>
                {project?.name ? (
                  <>
                    <span className="text-slate-300 dark:text-slate-600">•</span>
                    <span className="text-slate-600 dark:text-slate-300">Project: <strong>{project.name}</strong></span>
                  </>
                ) : null}
              </div>
            </div>

            {activeSprint.goal ? (
              <div className="flex items-start gap-2.5 rounded-[14px] border border-emerald-200/80 bg-emerald-50/70 p-3 text-sm text-slate-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-slate-200">
                <Target className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-400" />
                <div>
                  <span className="font-semibold text-emerald-950 dark:text-emerald-300">Sprint Goal: </span>
                  <span className="text-slate-700 dark:text-slate-300">{activeSprint.goal}</span>
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start pt-1">
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
              Planning Board
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </section>

      {/* Metrics Row */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-[18px] border border-white/70 bg-white/90 p-4 shadow-[0_12px_32px_-24px_rgba(15,23,42,0.25)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 dark:shadow-black/40">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
            Sprint Progress
          </p>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold tracking-tight text-slate-950 dark:text-slate-100">
              {activeSprintMetrics.completionPercent || 0}%
            </span>
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {activeSprintMetrics.completedTaskCount || 0}/{activeSprintMetrics.taskCount || 0} tasks
            </span>
          </div>
          <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-500"
              style={{ width: `${activeSprintMetrics.completionPercent || 0}%` }}
            />
          </div>
        </div>

        <div className="rounded-[18px] border border-white/70 bg-white/90 p-4 shadow-[0_12px_32px_-24px_rgba(15,23,42,0.25)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 dark:shadow-black/40">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
            Story Points
          </p>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold tracking-tight text-slate-950 dark:text-slate-100">
              {completedPoints}{" "}
              <span className="text-base font-normal text-slate-400">/ {totalPoints}</span>
            </span>
            <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
              {totalPoints ? Math.round((completedPoints / totalPoints) * 100) : 0}% burned
            </span>
          </div>
          <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div
              className="h-full rounded-full bg-blue-600 transition-all duration-500"
              style={{
                width: `${totalPoints ? Math.round((completedPoints / totalPoints) * 100) : 0}%`,
              }}
            />
          </div>
        </div>

        <div className="rounded-[18px] border border-white/70 bg-white/90 p-4 shadow-[0_12px_32px_-24px_rgba(15,23,42,0.25)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 dark:shadow-black/40">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
            Active Stories
          </p>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold tracking-tight text-slate-950 dark:text-slate-100">
              {activeStories.length}
            </span>
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {storiesByStage.DONE.length} completed
            </span>
          </div>
          <p className="mt-2.5 text-xs text-slate-500 dark:text-slate-400">
            {storiesByStage.IN_PROGRESS.length + storiesByStage.TESTING.length} in progress or review
          </p>
        </div>

        <div className="rounded-[18px] border border-white/70 bg-white/90 p-4 shadow-[0_12px_32px_-24px_rgba(15,23,42,0.25)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 dark:shadow-black/40">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
            Sprint Defects
          </p>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold tracking-tight text-slate-950 dark:text-slate-100">
              {activeSprintMetrics.resolvedBugCount || 0}{" "}
              <span className="text-base font-normal text-slate-400">
                / {activeSprintMetrics.bugCount || 0}
              </span>
            </span>
            <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
              {activeSprintMetrics.bugCount
                ? `${Math.round(((activeSprintMetrics.resolvedBugCount || 0) / activeSprintMetrics.bugCount) * 100)}% resolved`
                : "No defects"}
            </span>
          </div>
          <p className="mt-2.5 text-xs text-slate-500 dark:text-slate-400">
            {(activeSprintMetrics.bugCount || 0) - (activeSprintMetrics.resolvedBugCount || 0)} unresolved bugs
          </p>
        </div>
      </div>

      {/* Filter by Contributor */}
      {assigneesList.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-600">Filter Contributor:</span>
          <button
            type="button"
            className={cn(
              "rounded-full px-3 py-1 text-xs font-semibold transition",
              selectedAssigneeId === "all"
                ? "bg-slate-950 text-white"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            )}
            onClick={() => setSelectedAssigneeId("all")}
          >
            All Members ({activeStories.length})
          </button>
          {assigneesList.map((user) => (
            <button
              key={user._id}
              type="button"
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition",
                selectedAssigneeId === String(user._id)
                  ? "bg-blue-600 text-white font-semibold shadow-sm"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              )}
              onClick={() => setSelectedAssigneeId(String(user._id))}
            >
              <Avatar className="h-4 w-4">
                <AvatarImage src={user.avatarUrl} alt={user.name} />
                <AvatarFallback className="text-[9px]">{getInitials(user.name)}</AvatarFallback>
              </Avatar>
              <span>{user.name.split(" ")[0]}</span>
            </button>
          ))}
          <button
            type="button"
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition",
              selectedAssigneeId === "unassigned"
                ? "bg-amber-600 text-white font-semibold"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            )}
            onClick={() => setSelectedAssigneeId("unassigned")}
          >
            Unassigned
          </button>
        </div>
      ) : null}

      {/* 4-Stage Kanban Swimlanes */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {STAGES.map((stage) => {
          const stories = storiesByStage[stage.id] || [];
          return (
            <div
              key={stage.id}
              className="flex flex-col rounded-[20px] border border-slate-200/80 bg-slate-50/60 p-3 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/40"
            >
              {/* Stage Header */}
              <div
                className={cn(
                  "flex items-center justify-between rounded-[14px] border px-3 py-2 text-xs font-bold",
                  stage.headerClass
                )}
              >
                <div className="flex items-center gap-2">
                  <span className={cn("h-2.5 w-2.5 rounded-full", stage.dotClass)} />
                  <span>{stage.title}</span>
                </div>
                <Badge className="h-5 rounded-full border border-current bg-white/70 px-2 text-[11px] font-bold dark:bg-slate-900/80">
                  {stories.length}
                </Badge>
              </div>

              {/* Stories in this Stage */}
              <div className="mt-3 flex-1 space-y-2.5">
                {stories.length ? (
                  stories.map((story) => {
                    const assignee = resolveIssueAssignee(story);
                    const priorityVariant = getIssuePriorityVariant(story.priority);
                    const progress = story.storyProgress || {};
                    const isDone = stage.id === "DONE";

                    return (
                      <div
                        key={story._id}
                        onClick={() => onSelectIssue?.(story)}
                        className="group cursor-pointer rounded-[14px] border border-white/80 bg-white p-3.5 shadow-sm transition hover:border-blue-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900/90 dark:hover:border-slate-700 dark:hover:shadow-black/50"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="rounded bg-blue-50 px-1.5 py-0.5 font-mono text-[11px] font-bold text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                            {story.key || "STORY"}
                          </span>
                          <div className="flex items-center gap-1.5">
                            {story.storyPoints ? (
                              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                {story.storyPoints} pts
                              </span>
                            ) : null}
                            <Badge
                              variant={priorityVariant}
                              className="h-5 px-1.5 text-[10px] capitalize"
                            >
                              {story.priority || "Medium"}
                            </Badge>
                          </div>
                        </div>

                        <p
                          className={cn(
                            "mt-2 text-xs font-semibold text-slate-900 group-hover:text-blue-600 line-clamp-2 dark:text-slate-100 dark:group-hover:text-blue-400",
                            isDone && "text-slate-500 line-through dark:text-slate-500"
                          )}
                        >
                          {story.title}
                        </p>

                        {story.epicId?.name ? (
                          <div className="mt-1.5">
                            <span className="rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 dark:bg-violet-950/50 dark:text-violet-300">
                              {story.epicId.name}
                            </span>
                          </div>
                        ) : null}

                        {/* Sub items & Assignee */}
                        <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
                          <div className="flex items-center gap-2">
                            <span>
                              ✓ {progress.completedTaskCount || 0}/{progress.taskCount || 0}
                            </span>
                            {progress.bugCount ? (
                              <span
                                className={cn(
                                  progress.openBlockingBugCount ? "font-bold text-rose-600 dark:text-rose-400" : ""
                                )}
                              >
                                🐛 {progress.resolvedBugCount || 0}/{progress.bugCount || 0}
                              </span>
                            ) : null}
                          </div>

                          <div className="flex items-center gap-1.5">
                            <Avatar className="h-5 w-5 border border-slate-200 dark:border-slate-700">
                              <AvatarImage src={assignee?.avatarUrl} alt={assignee?.name || "Unassigned"} />
                              <AvatarFallback className="text-[9px]">
                                {assignee?.name ? getInitials(assignee.name) : "?"}
                              </AvatarFallback>
                            </Avatar>
                            <span className="truncate max-w-[70px] text-[11px]">
                              {assignee?.name ? assignee.name.split(" ")[0] : "Unassigned"}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="rounded-[14px] border border-dashed border-slate-200 bg-white/50 p-6 text-center text-xs text-slate-400 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-500">
                    No stories in {stage.title}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ActiveSprintScreen;
