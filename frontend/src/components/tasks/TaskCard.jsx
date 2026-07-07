import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { CalendarDays, FolderKanban, GripVertical, LoaderCircle } from "lucide-react";
import { getIssueDisplayKey, getIssuePriorityVariant } from "@/lib/issues";
import { cn, formatDateTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

const formatDueAt = (value) => (value ? formatDateTime(value) : "");

const TaskCard = ({
  issue,
  isOverlay = false,
  isUpdating = false,
  onSelectIssue,
}) => {
  if (isOverlay) {
    return (
      <TaskCardSurface
        issue={issue}
        isOverlay
        isUpdating={isUpdating}
        onSelectIssue={onSelectIssue}
      />
    );
  }

  return (
    <DraggableTaskCard
      issue={issue}
      isUpdating={isUpdating}
      onSelectIssue={onSelectIssue}
    />
  );
};

const DraggableTaskCard = ({ issue, isUpdating, onSelectIssue }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useDraggable({
    id: issue._id,
    data: {
      issue,
    },
    disabled: isUpdating,
  });

  return (
    <TaskCardSurface
      nodeRef={setNodeRef}
      issue={issue}
      isDragging={isDragging}
      isUpdating={isUpdating}
      style={{
        transform: CSS.Translate.toString(transform),
      }}
      dragAttributes={attributes}
      dragListeners={listeners}
      onSelectIssue={onSelectIssue}
    />
  );
};

const TaskCardSurface = ({
  dragAttributes = {},
  dragListeners = {},
  isDragging = false,
  isOverlay = false,
  isUpdating = false,
  issue,
  nodeRef,
  onSelectIssue,
  style,
}) => {
  const dueAtLabel = formatDueAt(issue.dueAt);

  return (
    <article
      ref={nodeRef}
      style={style}
      aria-busy={isUpdating}
      className={cn(
        "group relative rounded-[16px] border border-slate-200 bg-white p-4 text-left shadow-sm transition duration-200 ease-out hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-[0_18px_40px_-30px_rgba(37,99,235,0.34)]",
        isDragging && "opacity-40",
        isOverlay && "rotate-[0.5deg] shadow-[0_24px_54px_-28px_rgba(15,23,42,0.58)]",
        isUpdating && "pointer-events-none opacity-70"
      )}
      role="button"
      tabIndex={isOverlay ? -1 : 0}
      onClick={() => {
        if (!isOverlay && !isUpdating && typeof onSelectIssue === "function") {
          onSelectIssue(issue);
        }
      }}
      onKeyDown={(event) => {
        if (isOverlay || isUpdating) {
          return;
        }

        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          if (typeof onSelectIssue === "function") {
            onSelectIssue(issue);
          }
        }
      }}
      {...dragAttributes}
      {...dragListeners}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              {getIssueDisplayKey(issue)}
            </span>
            <Badge
              className="px-2.5 py-1 text-[11px]"
              variant={getIssuePriorityVariant(issue.priority)}
            >
              {issue.priority}
            </Badge>
          </div>

          <h3 className="mt-3 line-clamp-2 text-sm font-semibold leading-5 text-slate-950 transition group-hover:text-blue-700">
            {issue.title}
          </h3>
        </div>

        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-400 transition group-hover:border-blue-200 group-hover:text-blue-500">
          <GripVertical className="h-4 w-4" />
        </span>
      </div>

      <div className="mt-4 space-y-2.5 text-xs text-slate-600">
        <div className="flex items-center gap-2">
          <FolderKanban className="h-4 w-4 shrink-0 text-slate-400" />
          <span className="truncate font-medium text-slate-800">
            {issue.projectId?.name || "Unknown project"}
          </span>
        </div>

        {dueAtLabel ? (
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 shrink-0 text-slate-400" />
            <span>{dueAtLabel}</span>
          </div>
        ) : null}
      </div>

      {isUpdating ? (
        <div className="absolute inset-0 flex items-center justify-center rounded-[16px] bg-white/72 backdrop-blur-[2px]">
          <span className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 shadow-sm">
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            Updating
          </span>
        </div>
      ) : null}
    </article>
  );
};

export default TaskCard;
