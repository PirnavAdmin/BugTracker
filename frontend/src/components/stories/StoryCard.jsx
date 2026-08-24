import {
  Bug,
  CheckCircle2,
  CircleUserRound,
  ListTodo,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  getIssueDisplayKey,
  getIssuePriorityVariant,
  getIssueStatusLabel,
  ISSUE_STATUS,
  normalizeIssueStatus,
  resolveIssueAssignees,
} from "@/lib/issues";
import { cn } from "@/lib/utils";

const isPastDue = (value) => {
  if (!value) {
    return false;
  }

  const dueDate = new Date(value);

  return !Number.isNaN(dueDate.getTime()) && dueDate.getTime() < Date.now();
};

const StoryCard = ({
  story,
  onClick,
  onComplete,
  canComplete = false,
  isCompleting = false,
  fadeWhenOverdue = false,
}) => {
  const progress = story.storyProgress || {};
  const progressPercent = Number(progress.percent || 0);
  const isQueued = Boolean(story.bugDetails?.addToBucket);
  const assignees = resolveIssueAssignees(story);
  const normalizedStatus = normalizeIssueStatus(story?.status, "");
  const isCompleted = [ISSUE_STATUS.DONE, ISSUE_STATUS.CLOSED].includes(normalizedStatus);
  const isOverdue = fadeWhenOverdue && isPastDue(story.dueAt);
  const canShowCompleteButton =
    canComplete && !isCompleted;
  const assigneeLabel = assignees.length
    ? assignees.map((assignee) => assignee.name).join(", ")
    : "Unassigned";

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Open Story ${getIssueDisplayKey(story)}: ${story.title}`}
      onClick={() => onClick(story)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick(story);
        }
      }}
      className={cn(
        "group grid min-w-[1270px] cursor-pointer grid-cols-[90px_minmax(240px,1.6fr)_minmax(160px,1fr)_minmax(120px,0.8fr)_90px_110px_110px_130px_90px_minmax(150px,1fr)_104px] items-center gap-3 border-b px-4 py-2.5 text-left transition last:border-b-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500",
        isQueued
          ? "border-amber-200 bg-amber-50/70 hover:bg-amber-50"
          : "border-slate-100 bg-white/75 hover:bg-blue-50/60",
        isCompleted && "opacity-45 grayscale hover:opacity-70",
        !isCompleted && isOverdue && "opacity-50 grayscale hover:opacity-75"
      )}
    >
      <span className="truncate text-xs font-semibold text-blue-700">
        {getIssueDisplayKey(story)}
      </span>
      <span className="truncate text-sm font-semibold text-slate-950 group-hover:text-blue-800" title={story.title}>
        {story.title}
      </span>
      <span className="truncate text-xs text-slate-600" title={story.projectId?.name || "Unknown project"}>
        {story.projectId?.name || "Unknown project"}
      </span>
      <span className="truncate text-xs text-slate-600" title={story.sprintId?.name || "Backlog"}>
        {story.sprintId?.name || "Backlog"}
      </span>
      <Badge variant={getIssuePriorityVariant(story.priority)}>
        {story.priority || "Medium"}
      </Badge>
      <span className="truncate text-xs font-medium text-slate-700">
        {getIssueStatusLabel(story.status)}
      </span>
      <span className="text-xs font-medium text-slate-700">
        {story.storyPoints ?? 0} points
      </span>
      <span className="min-w-0">
        <span className="flex items-center justify-between text-[11px] font-semibold text-blue-700">
          <span>{progressPercent}%</span>
          {isQueued ? <span className="text-amber-700">Queue</span> : null}
        </span>
        <span className="mt-1 block h-1 overflow-hidden rounded-full bg-blue-100">
          <div
            className="h-full rounded-full bg-blue-600 transition-[width]"
            style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
          />
        </span>
      </span>
      <span className="flex items-center gap-3 text-xs font-medium text-slate-700">
        <span className="flex items-center gap-1" title="Tasks">
          <ListTodo className="h-3.5 w-3.5 text-blue-600" />
          {progress.taskCount || 0}
        </span>
        <span className="flex items-center gap-1" title="Open bugs">
          <Bug className="h-3.5 w-3.5 text-rose-500" />
          {story.openBugCount || 0}
        </span>
      </span>
      <span className="flex min-w-0 items-center gap-1.5 text-xs text-slate-600">
        <CircleUserRound className="h-3.5 w-3.5 shrink-0 text-blue-500" />
        <span className="truncate" title={assigneeLabel}>{assigneeLabel}</span>
      </span>
      <span className="flex justify-end">
        {canShowCompleteButton ? (
          <Button
            type="button"
            size="sm"
            className="ml-auto h-8 rounded-lg px-3 text-xs"
            disabled={isCompleting}
            onClick={(event) => {
              event.stopPropagation();
              onComplete?.(story);
            }}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            {isCompleting ? "Completing..." : "Complete"}
          </Button>
        ) : isCompleted ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-label="Completed" />
        ) : null}
      </span>
    </div>
  );
};

export default StoryCard;
