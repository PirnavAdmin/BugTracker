import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
  CalendarClock,
  ClipboardPenLine,
  Eye,
  FolderKanban,
  GripVertical,
  LoaderCircle,
  Pencil,
  Play,
  RotateCcw,
  Send,
  Trash2,
  UserCircle2,
} from "lucide-react";
import { getIssueDisplayKey, getIssuePriorityVariant, resolveBugDetails } from "@/lib/issues";
import { cn, formatDateTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const getProjectName = (issue) => issue?.projectId?.name || "Unknown project";
const getAssigneeName = (issue) =>
  issue?.assignee?.name || resolveBugDetails(issue)?.developerLead?.name || "Unassigned";
const getReporterName = (issue) =>
  issue?.reporter?.name ||
  issue?.reporterName ||
  resolveBugDetails(issue)?.testerOwner?.name ||
  issue?.testerOwnerName ||
  "Unknown reporter";
const getSeverity = (issue) => resolveBugDetails(issue)?.severity || "Not set";
const getModuleName = (issue) => resolveBugDetails(issue)?.moduleName || "Unmapped module";

const ActionButton = ({ action, disabled }) => {
  const Icon = action.icon || Eye;

  return (
    <Button
      className="h-8 rounded-lg px-2.5 text-xs"
      disabled={disabled || action.disabled}
      type="button"
      variant={action.variant || "outline"}
      onClick={(event) => {
        event.stopPropagation();
        action.onClick?.();
      }}
    >
      <Icon className="h-3.5 w-3.5" />
      {action.label}
    </Button>
  );
};

const BugCard = ({
  actionMode = "tester",
  columnKey = "",
  currentUserId = "",
  issue,
  isOverlay = false,
  isUpdating = false,
  onAction,
  onOpen,
}) => {
  if (isOverlay) {
    return (
      <BugCardSurface
        actionMode={actionMode}
        columnKey={columnKey}
        currentUserId={currentUserId}
        issue={issue}
        isOverlay
        isUpdating={isUpdating}
        onAction={onAction}
        onOpen={onOpen}
      />
    );
  }

  return (
    <DraggableBugCard
      actionMode={actionMode}
      columnKey={columnKey}
      currentUserId={currentUserId}
      issue={issue}
      isUpdating={isUpdating}
      onAction={onAction}
      onOpen={onOpen}
    />
  );
};

const DraggableBugCard = ({
  actionMode,
  columnKey,
  currentUserId,
  issue,
  isUpdating,
  onAction,
  onOpen,
}) => {
  const isDragDisabled =
    isUpdating ||
    (actionMode === "developer" && ["readyForQa", "closed"].includes(columnKey));
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: issue._id,
    data: { issue },
    disabled: isDragDisabled,
  });

  return (
    <BugCardSurface
      actionMode={actionMode}
      columnKey={columnKey}
      currentUserId={currentUserId}
      dragAttributes={attributes}
      dragListeners={listeners}
      issue={issue}
      isDragging={isDragging}
      isUpdating={isUpdating}
      isDragDisabled={isDragDisabled}
      nodeRef={setNodeRef}
      onAction={onAction}
      onOpen={onOpen}
      style={{ transform: CSS.Translate.toString(transform) }}
    />
  );
};

const buildActions = ({ actionMode, columnKey, currentUserId, issue, onAction, onOpen }) => {
  const openAction = {
    label: "View Details",
    icon: Eye,
    onClick: () => onOpen?.(issue),
  };

  if (actionMode === "developer") {
    const actionsByColumn = {
      available: [
        {
          label: issue?.type === "Story" ? "Pick Story" : "Pick Bug",
          icon: Play,
          variant: "default",
          onClick: () => onAction?.("pick", issue),
        },
        openAction,
      ],
      assigned: [
        {
          label: "Start Work",
          icon: Play,
          variant: "default",
          onClick: () => onAction?.("start", issue),
        },
        openAction,
      ],
      inProgress: [
        {
          label: "Ready For QA",
          icon: Send,
          variant: "default",
          onClick: () => onAction?.("readyForQa", issue),
        },
        {
          label: "Add Notes",
          icon: ClipboardPenLine,
          onClick: () => onAction?.("notes", issue),
        },
        openAction,
      ],
      readyForQa: [openAction],
      closed: [openAction],
      reopened: [
        {
          label: "Resume Work",
          icon: RotateCcw,
          variant: "default",
          onClick: () => onAction?.("resume", issue),
        },
        openAction,
      ],
    };

    return actionsByColumn[columnKey] || [openAction];
  }

  if (actionMode === "tester") {
    if (columnKey === "reported") {
      const isReporter = currentUserId && String(currentUserId) === String(issue.reporter?._id || issue.reporter || "");
      const isUnassigned = !issue.assignee && !resolveBugDetails(issue)?.developerLead;

      if (isReporter && isUnassigned) {
        return [
          {
            label: "Edit",
            icon: Pencil,
            onClick: () => onAction?.("edit", issue),
          },
          {
            label: "Delete",
            icon: Trash2,
            onClick: () => onAction?.("delete", issue),
          },
          openAction,
        ];
      }
    }

    if (columnKey === "readyForQa") {
      return [
        {
          label: "Close",
          icon: Send,
          variant: "default",
          onClick: () => onAction?.("close", issue),
        },
        {
          label: "Reopen",
          icon: RotateCcw,
          onClick: () => onAction?.("reopen", issue),
        },
        openAction,
      ];
    }
  }

  return [openAction];
};

const BugCardSurface = ({
  actionMode,
  columnKey,
  currentUserId,
  dragAttributes = {},
  dragListeners = {},
  issue,
  isDragging = false,
  isDragDisabled = false,
  isOverlay = false,
  isUpdating = false,
  nodeRef,
  onAction,
  onOpen,
  style,
}) => {
  const details = resolveBugDetails(issue);
  const actions = buildActions({
    actionMode,
    columnKey,
    currentUserId,
    issue,
    onAction,
    onOpen,
  });

  return (
    <article
      ref={nodeRef}
      aria-busy={isUpdating}
      className={cn(
        "group relative rounded-lg border border-slate-200 bg-white p-3 text-left shadow-sm transition duration-200 ease-out hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-[0_18px_40px_-30px_rgba(37,99,235,0.34)]",
        isDragging && "opacity-40",
        isOverlay && "rotate-[0.5deg] shadow-[0_24px_54px_-28px_rgba(15,23,42,0.58)]",
        isUpdating && "pointer-events-none opacity-70",
        isDragDisabled && "cursor-default"
      )}
      role="button"
      style={style}
      tabIndex={isOverlay ? -1 : 0}
      onClick={() => !isOverlay && !isUpdating && onOpen?.(issue)}
      onKeyDown={(event) => {
        if (isOverlay || isUpdating) {
          return;
        }

        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen?.(issue);
        }
      }}
      {...dragAttributes}
      {...dragListeners}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-semibold uppercase text-slate-600">
              {getIssueDisplayKey(issue)}
            </span>
            <Badge className="px-2 py-0.5 text-[11px]" variant={getIssuePriorityVariant(issue.priority)}>
              {issue.priority || "Medium"}
            </Badge>
          </div>
          <h3 className="mt-2 line-clamp-2 text-sm font-semibold leading-5 text-slate-950 group-hover:text-blue-700">
            {issue.title || "Untitled bug"}
          </h3>
        </div>
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-400 group-hover:border-blue-200 group-hover:text-blue-500",
            isDragDisabled && "opacity-50"
          )}
        >
          <GripVertical className="h-4 w-4" />
        </span>
      </div>

      <div className="mt-3 grid gap-2 text-xs text-slate-600">
        <div className="flex items-center gap-2">
          <FolderKanban className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span className="truncate font-medium text-slate-800">{getProjectName(issue)}</span>
        </div>
        <div className="flex items-center gap-2">
          <UserCircle2 className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span className="truncate">
            {actionMode === "developer" && columnKey === "available"
              ? getReporterName(issue)
              : getAssigneeName(issue)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <CalendarClock className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span className="truncate">{formatDateTime(issue.updatedAt || issue.createdAt)}</span>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
          {getSeverity(issue)}
        </span>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
          {getModuleName(issue)}
        </span>
      </div>

      {actionMode === "developer" && columnKey === "readyForQa" ? (
        <p className="mt-3 rounded-lg border border-cyan-100 bg-cyan-50 px-3 py-2 text-xs font-medium text-cyan-700">
          Waiting for tester verification.
        </p>
      ) : null}

      {actionMode === "developer" && columnKey === "closed" ? (
        <p className="mt-3 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
          Closed by QA.
        </p>
      ) : null}

      {actionMode === "developer" && columnKey === "reopened" ? (
        <div className="mt-3 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <p className="font-semibold">{details.reopenReason || issue.reopenReason || "Reopened by tester"}</p>
          <p className="mt-1 line-clamp-2">{details.testerComments || issue.reopenComment || "Tester requested another fix pass."}</p>
          <p className="mt-1 font-medium">{formatDateTime(issue.reopenedAt || issue.updatedAt || issue.createdAt)}</p>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {actions.map((action) => (
          <ActionButton key={action.label} action={action} disabled={isUpdating} />
        ))}
      </div>

      {isUpdating ? (
        <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-white/72 backdrop-blur-[2px]">
          <span className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 shadow-sm">
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            Updating
          </span>
        </div>
      ) : null}
    </article>
  );
};

export default BugCard;
