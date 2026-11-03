import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  CalendarDays,
  GripVertical,
  MoreHorizontal,
  UserCircle2,
} from "lucide-react";
import {
  getIssueDeadlineLabel,
  getIssuePriorityVariant,
  getIssueDisplayKey,
  getWorkflowStatusOptionsForIssue,
  isIssueNearDue,
  isIssueOverdue,
  getIssueTypeVariant,
  normalizeIssueStatus,
  resolveIssueAssignees,
} from "@/lib/issues";
import UserAvatar from "@/components/shared/UserAvatar";
import { cn, formatDateTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const MENU_WIDTH = 224;
const MENU_OFFSET = 8;
const VIEWPORT_PADDING = 12;

const formatDueAt = (value) => (value ? formatDateTime(value) : "No due date");

const getMenuPosition = ({ triggerRect, menuRect }) => {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const menuWidth = Math.min(menuRect?.width || MENU_WIDTH, viewportWidth - VIEWPORT_PADDING * 2);
  const menuHeight = menuRect?.height || 0;
  const spaceBelow = viewportHeight - triggerRect.bottom;
  const spaceAbove = triggerRect.top;
  const openUpward =
    menuHeight > 0 && spaceBelow < menuHeight + MENU_OFFSET && spaceAbove > spaceBelow;
  let left = triggerRect.right - menuWidth;
  let top = openUpward
    ? triggerRect.top - menuHeight - MENU_OFFSET
    : triggerRect.bottom + MENU_OFFSET;

  left = Math.min(left, viewportWidth - VIEWPORT_PADDING - menuWidth);
  left = Math.max(left, VIEWPORT_PADDING);
  top = Math.max(top, VIEWPORT_PADDING);

  if (menuHeight > 0) {
    top = Math.min(top, viewportHeight - VIEWPORT_PADDING - menuHeight);
  }

  return {
    left,
    top,
    placement: openUpward ? "top" : "bottom",
    ready: true,
  };
};

const IssueCardActionMenu = ({
  issue,
  canEditIssue = false,
  canChangeStatus = false,
  isUpdating = false,
  onSelectIssue,
  onStatusChange,
}) => {
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({
    left: 0,
    top: 0,
    placement: "bottom",
    ready: false,
  });
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const statusOptions = getWorkflowStatusOptionsForIssue(issue);
  const currentStatus = normalizeIssueStatus(issue.status);
  const portalTarget = typeof document !== "undefined" ? document.body : null;

  const updateMenuPosition = useCallback(() => {
    if (!triggerRef.current) {
      return;
    }

    setMenuPosition(
      getMenuPosition({
        triggerRect: triggerRef.current.getBoundingClientRect(),
        menuRect: menuRef.current?.getBoundingClientRect(),
      })
    );
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      return undefined;
    }

    updateMenuPosition();
    const rafId = window.requestAnimationFrame(updateMenuPosition);

    const handlePointerDown = (event) => {
      const target = event.target;

      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) {
        return;
      }

      setOpen(false);
    };

    const handleResizeOrScroll = () => updateMenuPosition();
    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    document.addEventListener("scroll", handleResizeOrScroll, true);
    window.addEventListener("resize", handleResizeOrScroll);

    return () => {
      window.cancelAnimationFrame(rafId);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
      document.removeEventListener("scroll", handleResizeOrScroll, true);
      window.removeEventListener("resize", handleResizeOrScroll);
    };
  }, [open, updateMenuPosition]);

  const handleStatusSelect = async (nextStatus) => {
    setOpen(false);

    if (nextStatus === currentStatus || !onStatusChange) {
      return;
    }

    try {
      await onStatusChange(issue._id, nextStatus);
    } catch (error) {
      // Parent refetch restores state on failure.
    }
  };

  return (
    <div onClick={(event) => event.stopPropagation()}>
      <Button
        ref={triggerRef}
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
        type="button"
        aria-label="Issue actions"
        aria-expanded={open}
        disabled={isUpdating}
        onClick={(event) => {
          event.stopPropagation();

          if (!open) {
            setMenuPosition((current) => ({ ...current, ready: false }));
          }

          setOpen((current) => !current);
        }}
      >
        <MoreHorizontal className="h-4 w-4" />
      </Button>

      {open && portalTarget
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              className={cn(
                "fixed z-[70] w-56 max-w-[calc(100vw-1.5rem)] rounded-2xl border border-slate-200/90 bg-white p-1.5 shadow-[0_20px_44px_-28px_rgba(15,23,42,0.35)]",
                menuPosition.ready ? "opacity-100" : "opacity-0"
              )}
              style={{
                left: menuPosition.left,
                top: menuPosition.top,
                transformOrigin:
                  menuPosition.placement === "top" ? "bottom right" : "top right",
              }}
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                role="menuitem"
                className="w-full rounded-xl px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                onClick={() => {
                  onSelectIssue?.(issue);
                  setOpen(false);
                }}
              >
                {canEditIssue ? "Edit issue" : "Open details"}
              </button>

              {canChangeStatus && statusOptions.length ? (
                <>
                  <div className="my-1 border-t border-slate-100" />
                  <p className="px-3 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                    Move to status
                  </p>
                  {statusOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      role="menuitem"
                      disabled={isUpdating || option.value === currentStatus}
                      className={cn(
                        "w-full rounded-xl px-3 py-2 text-left text-sm transition",
                        option.value === currentStatus
                          ? "cursor-default bg-slate-50 font-semibold text-slate-900"
                          : "font-medium text-slate-700 hover:bg-slate-100"
                      )}
                      onClick={() => handleStatusSelect(option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
                </>
              ) : null}
            </div>,
            portalTarget
          )
        : null}
    </div>
  );
};

const IssueCard = ({
  issue,
  isUpdating = false,
  canEditIssue = false,
  canChangeStatus = false,
  onSelectIssue,
  onStatusChange,
  onDragStart,
  onDragEnd,
}) => {
  const assignees = issue.boardAssignee
    ? [issue.boardAssignee]
    : resolveIssueAssignees(issue).filter(
        (assignee) => assignee.name || assignee.email
      );
  const assignee = assignees[0];
  const issueKey = getIssueDisplayKey(issue);
  const projectLabel = issue.projectId?.name || "Unknown project";
  const teamLabel = issue.teamId?.name;
  const isOverdue = isIssueOverdue(issue);
  const isNearDue = !isOverdue && isIssueNearDue(issue);
  const deadlineLabel = getIssueDeadlineLabel(issue);
  const secondaryChips = [
    issue.epicId?.name
      ? { key: `epic-${issue._id}`, label: issue.epicId.name, className: "border-violet-100 bg-violet-50 text-violet-700" }
      : null,
    issue.sprintId?.name
      ? { key: `sprint-${issue._id}`, label: issue.sprintId.name, className: "border-sky-100 bg-sky-50 text-sky-700" }
      : { key: `backlog-${issue._id}`, label: "Backlog", className: "border-slate-200 bg-slate-50 text-slate-600" },
  ].filter(Boolean);

  return (
    <article
      className={cn(
        "group rounded-[18px] border border-slate-200 bg-white p-3 shadow-sm transition hover:border-blue-200 hover:shadow-[0_14px_32px_-28px_rgba(37,99,235,0.35)]",
        isNearDue && "border-amber-300"
      )}
      role="button"
      tabIndex={0}
      draggable={canChangeStatus && !isUpdating}
      onClick={() => onSelectIssue(issue)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelectIssue(issue);
        }
      }}
      onDragStart={(event) => {
        if (!canChangeStatus || isUpdating) {
          return;
        }

        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", issue._id);
        onDragStart(issue._id);
      }}
      onDragEnd={() => onDragEnd()}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
              {issueKey}
            </span>
            {issue.priority ? (
              <Badge className="px-2 py-0 text-[10px]" variant={getIssuePriorityVariant(issue.priority)}>
                {issue.priority}
              </Badge>
            ) : null}
            {issue.type ? (
              <Badge className="px-2 py-0 text-[10px]" variant={getIssueTypeVariant(issue.type)}>
                {issue.type}
              </Badge>
            ) : null}
            {deadlineLabel ? (
              <Badge className="gap-1 px-2 py-0 text-[10px]" variant={isOverdue ? "danger" : "warning"}>
                <AlertTriangle className="h-3 w-3" />
                {deadlineLabel}
              </Badge>
            ) : null}
          </div>

          <button
            type="button"
            className="mt-1.5 block w-full line-clamp-2 text-left text-[15px] font-bold leading-5 text-slate-950 transition group-hover:text-blue-700"
            onClick={(event) => {
              event.stopPropagation();
              onSelectIssue(issue);
            }}
          >
            {issue.title || "Untitled work item"}
          </button>

          {secondaryChips.length ? (
            <div className="mt-2 flex flex-wrap items-center gap-1">
              {secondaryChips.map((chip) => (
                <span
                  key={chip.key}
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[10px] font-medium",
                    chip.className
                  )}
                >
                  {chip.label}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <IssueCardActionMenu
            issue={issue}
            canEditIssue={canEditIssue}
            canChangeStatus={canChangeStatus}
            isUpdating={isUpdating}
            onSelectIssue={onSelectIssue}
            onStatusChange={onStatusChange}
          />

          {canChangeStatus ? (
            <div
              className="hidden rounded-lg border border-slate-200 bg-slate-50 p-1 text-slate-400 lg:flex"
              aria-hidden="true"
            >
              <GripVertical className="h-3.5 w-3.5" />
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-2.5 space-y-1.5 border-t border-slate-100 pt-2.5">
        <div className="flex items-center gap-2">
          {assignee ? (
            <UserAvatar
              user={assignee}
              className="h-7 w-7 rounded-lg"
              fallbackClassName="text-[10px]"
            />
          ) : (
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
              <UserCircle2 className="h-3.5 w-3.5" />
            </div>
          )}

          <p className="min-w-0 flex-1 truncate text-xs font-medium text-slate-800">
            {assignees.length
              ? assignees.map((user) => user.name || user.email).join(", ")
              : "Unassigned"}
          </p>

          <div className="flex shrink-0 items-center gap-1 text-[11px] text-slate-500">
            {isOverdue ? (
              <AlertTriangle className="h-3.5 w-3.5 text-rose-500" />
            ) : (
              <CalendarDays className="h-3.5 w-3.5 text-slate-400" />
            )}
            <span className={cn("whitespace-nowrap", isOverdue && "font-semibold text-rose-700")}>
              {formatDueAt(issue.dueAt)}
            </span>
          </div>
        </div>

        <p className="truncate text-[11px] text-slate-500">
          {[projectLabel, teamLabel].filter(Boolean).join(" • ")}
        </p>
      </div>
    </article>
  );
};

export default IssueCard;
