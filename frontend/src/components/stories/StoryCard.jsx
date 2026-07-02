import {
  Bug,
  CheckCircle2,
  CircleUserRound,
  FolderKanban,
  Layers3,
  ListTodo,
  Milestone,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  getIssueDisplayKey,
  getIssuePriorityVariant,
  getIssueStatusLabel,
} from "@/lib/issues";
import { cn } from "@/lib/utils";

const StoryCard = ({ story, onClick }) => {
  const progress = story.storyProgress || {};
  const progressPercent = Number(progress.percent || 0);
  const isQueued = Boolean(story.bugDetails?.addToBucket);

  return (
    <button
      type="button"
      onClick={() => onClick(story)}
      className={cn(
        "group min-w-0 rounded-lg border p-4 text-left backdrop-blur-xl transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
        isQueued
          ? "border-amber-300/90 bg-amber-50/85 shadow-[0_14px_34px_-28px_rgba(217,119,6,0.58)] hover:border-amber-400 hover:bg-amber-50 hover:shadow-[0_20px_42px_-28px_rgba(217,119,6,0.66)]"
          : "border-blue-200/80 bg-blue-50/75 shadow-[0_14px_34px_-28px_rgba(37,99,235,0.55)] hover:border-blue-300 hover:bg-blue-50 hover:shadow-[0_20px_42px_-28px_rgba(37,99,235,0.62)]"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="text-xs font-semibold text-blue-700">
            {getIssueDisplayKey(story)}
          </span>
          <h2 className="mt-1 line-clamp-2 text-sm font-semibold leading-5 text-slate-950 group-hover:text-blue-800">
            {story.title}
          </h2>
        </div>
        <Badge variant={getIssuePriorityVariant(story.priority)}>
          {story.priority || "Medium"}
        </Badge>
      </div>

      <div className="mt-4 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
        <span className="flex min-w-0 items-center gap-2">
          <FolderKanban className="h-3.5 w-3.5 shrink-0 text-blue-500" />
          <span className="truncate">{story.projectId?.name || "Unknown project"}</span>
        </span>
        <span className="flex min-w-0 items-center gap-2">
          <Layers3 className="h-3.5 w-3.5 shrink-0 text-blue-500" />
          <span className="truncate">{story.epicId?.name || "No epic"}</span>
        </span>
        <span className="flex min-w-0 items-center gap-2">
          <Milestone className="h-3.5 w-3.5 shrink-0 text-blue-500" />
          <span className="truncate">{story.sprintId?.name || "Backlog"}</span>
        </span>
        <span className="flex min-w-0 items-center gap-2">
          <CircleUserRound className="h-3.5 w-3.5 shrink-0 text-blue-500" />
          <span className="truncate">{story.assignee?.name || "Unassigned"}</span>
        </span>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-md border border-blue-200 bg-white/75 px-2 py-1 font-medium text-slate-700">
          {getIssueStatusLabel(story.status)}
        </span>
        <span className="rounded-md border border-blue-200 bg-white/75 px-2 py-1 font-medium text-slate-700">
          {story.storyPoints ?? 0} points
        </span>
        {isQueued ? (
          <span className="rounded-md border border-amber-300 bg-white/80 px-2 py-1 font-medium text-amber-800">
            Work Queue
          </span>
        ) : null}
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5 font-medium text-slate-700">
            <CheckCircle2 className="h-3.5 w-3.5 text-blue-600" />
            Progress
          </span>
          <span className="font-semibold text-blue-700">{progressPercent}%</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-blue-100">
          <div
            className="h-full rounded-full bg-blue-600 transition-[width]"
            style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
          />
        </div>
      </div>

      <div className="mt-4 flex items-center gap-4 border-t border-blue-200/70 pt-3 text-xs font-medium text-slate-700">
        <span className="flex items-center gap-1.5">
          <ListTodo className="h-3.5 w-3.5 text-blue-600" />
          {progress.taskCount || 0} tasks
        </span>
        <span className="flex items-center gap-1.5">
          <Bug className="h-3.5 w-3.5 text-rose-500" />
          {story.openBugCount || 0} open bugs
        </span>
      </div>
    </button>
  );
};

export default StoryCard;
