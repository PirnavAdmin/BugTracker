import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  GripVertical,
  MoreHorizontal,
  UserCircle2,
} from "lucide-react";
import {
  getIssueDisplayKey,
  getIssuePriorityVariant,
  getIssueStatusLabel,
  getIssueStatusVariant,
  getIssueTypeVariant,
  resolveIssueAssignee,
  resolveIssueTeamId,
} from "@/lib/issues";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn, getInitials } from "@/lib/utils";

const getSprintId = (sprint) => String(sprint?._id || sprint || "");
const MENU_WIDTH = 224;
const MENU_OFFSET = 8;
const VIEWPORT_PADDING = 12;

const isSprintAllowedForIssue = (issue, sprint) => {
  const sprintTeamId = String(sprint?.teamId?._id || sprint?.teamId || "");
  const issueTeamId = resolveIssueTeamId(issue);

  if (!sprintTeamId) {
    return true;
  }

  return sprintTeamId === issueTeamId;
};

const getMenuPosition = ({ triggerRect, menuRect }) => {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const menuWidth = Math.min(
    menuRect?.width || MENU_WIDTH,
    viewportWidth - VIEWPORT_PADDING * 2
  );
  const menuHeight = menuRect?.height || 0;
  const spaceBelow = viewportHeight - triggerRect.bottom - VIEWPORT_PADDING;
  const spaceAbove = triggerRect.top - VIEWPORT_PADDING;
  const openUpward =
    menuHeight > 0 && spaceBelow < menuHeight + MENU_OFFSET && spaceAbove > spaceBelow;
  let left = triggerRect.right - menuWidth;
  let top = openUpward
    ? triggerRect.top - menuHeight - MENU_OFFSET
    : triggerRect.bottom + MENU_OFFSET;

  left = Math.min(left, viewportWidth - VIEWPORT_PADDING - menuWidth);
  left = Math.max(VIEWPORT_PADDING, left);

  if (menuHeight > 0) {
    top = Math.min(top, viewportHeight - VIEWPORT_PADDING - menuHeight);
  }

  top = Math.max(VIEWPORT_PADDING, top);

  return {
    left,
    top,
    placement: openUpward ? "top" : "bottom",
    ready: true,
  };
};

const PlanningActionMenu = ({
  issue,
  availableSprints = [],
  canManagePlanning = false,
  isUpdating = false,
  onMoveIssue,
  onSelectIssue,
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
  const currentSprintId = getSprintId(issue?.sprintId);
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

      if (
        menuRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      ) {
        return;
      }

      setOpen(false);
    };
    const handleResizeOrScroll = () => {
      if (!menuRef.current && !triggerRef.current) {
        return;
      }

      updateMenuPosition();
    };
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

  return (
    <div onClick={(event) => event.stopPropagation()}>
      <Button
        ref={triggerRef}
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 rounded-full border border-slate-200/80 bg-white/88 text-slate-500 shadow-sm hover:bg-slate-50 hover:text-slate-900"
        aria-label="Work item actions"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          const nextOpen = !open;

          if (nextOpen) {
            setMenuPosition((current) => ({
              ...current,
              ready: false,
            }));
          }

          setOpen(nextOpen);
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
                "fixed z-[70] w-56 max-w-[calc(100vw-1.5rem)] rounded-[18px] border border-white/75 bg-white/96 p-2 shadow-[0_26px_52px_-28px_rgba(15,23,42,0.34)] backdrop-blur-xl",
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
                className="w-full rounded-[12px] px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-100/80 hover:text-slate-950"
                onClick={() => {
                  onSelectIssue?.(issue);
                  setOpen(false);
                }}
              >
                Open details
              </button>

              <div className="mt-2 px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                Move To Sprint
              </div>

              <button
                type="button"
                disabled={!canManagePlanning || isUpdating || !currentSprintId}
                className="w-full rounded-[12px] px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-100/80 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-45"
                onClick={() => {
                  onMoveIssue?.(issue._id, "");
                  setOpen(false);
                }}
              >
                Backlog
              </button>

              {availableSprints.map((sprint) => {
                const sprintId = getSprintId(sprint);
                const isCurrentSprint = sprintId === currentSprintId;

                return (
                  <button
                    key={sprintId}
                    type="button"
                    disabled={!canManagePlanning || isUpdating || isCurrentSprint}
                    className="w-full rounded-[12px] px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-100/80 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-45"
                    onClick={() => {
                      onMoveIssue?.(issue._id, sprintId);
                      setOpen(false);
                    }}
                  >
                    {sprint.name}
                  </button>
                );
              })}
            </div>,
            portalTarget
          )
        : null}
    </div>
  );
};

const IssuePlanningCard = ({
  issue,
  canDrag = false,
  canManagePlanning = false,
  isUpdating = false,
  availableSprints = [],
  onDragStart,
  onDragEnd,
  onDropBefore,
  onSelectIssue,
  onMoveIssue,
}) => {
  const assignee = resolveIssueAssignee(issue);
  const sprintOptions = useMemo(
    () =>
      availableSprints.filter(
        (sprint) => sprint?.state !== "COMPLETED" && isSprintAllowedForIssue(issue, sprint)
      ),
    [availableSprints, issue]
  );
  const currentSprintId = getSprintId(issue?.sprintId);
  const issueKey = getIssueDisplayKey(issue);
  const progress = issue?.storyProgress || {};

  return (
    <article
      draggable={canDrag && !isUpdating}
      onDragStart={(event) => {
        if (!canDrag || isUpdating) {
          return;
        }

        event.dataTransfer.effectAllowed = "move";
        onDragStart?.(issue);
      }}
      onDragEnd={onDragEnd}
      onDragOver={(event) => {
        if (!canDrag || isUpdating) {
          return;
        }

        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }}
      onDrop={(event) => {
        if (!canDrag || isUpdating) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        onDropBefore?.(issue);
      }}
      className={cn(
        "group rounded-[14px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.86))] px-2.5 py-2 shadow-[0_10px_24px_-22px_rgba(15,23,42,0.36)] backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-blue-200/80 hover:shadow-[0_18px_34px_-26px_rgba(59,130,246,0.28)]",
        canDrag && !isUpdating ? "cursor-grab active:cursor-grabbing" : ""
      )}
    >
      <div className="flex items-start gap-2.5">
        <div
          className={cn(
            "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-[10px] border border-slate-200/80 bg-white/82 text-slate-400 shadow-sm",
            canDrag && !isUpdating ? "opacity-100" : "opacity-50"
          )}
          aria-hidden="true"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start gap-2">
            <button
              type="button"
              onClick={() => onSelectIssue?.(issue)}
              className="min-w-0 flex-1 text-left"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="shrink-0 rounded-full border border-slate-200/80 bg-white/90 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 shadow-sm">
                  {issueKey}
                </span>
                <p className="min-w-0 truncate text-sm font-semibold leading-5 text-slate-950 transition group-hover:text-blue-700">
                  {issue.title}
                </p>
              </div>
            </button>
            <PlanningActionMenu
              issue={issue}
              availableSprints={sprintOptions}
              canManagePlanning={canManagePlanning}
              isUpdating={isUpdating}
              onMoveIssue={onMoveIssue}
              onSelectIssue={onSelectIssue}
            />
          </div>

          <div className="mt-1.5 flex flex-col gap-1.5 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0 flex flex-wrap items-center gap-1.5">
              <Badge
                variant={getIssueTypeVariant(issue.type)}
                className="inline-flex h-5 items-center px-1.5 py-0 text-[10px] font-semibold"
              >
                {issue.type}
              </Badge>
              <Badge
                variant={getIssuePriorityVariant(issue.priority)}
                className="inline-flex h-5 items-center px-1.5 py-0 text-[10px] font-semibold"
              >
                {issue.priority}
              </Badge>
              <Badge
                variant={getIssueStatusVariant(issue.status)}
                className="inline-flex h-5 items-center px-1.5 py-0 text-[10px] font-semibold"
              >
                {getIssueStatusLabel(issue.status)}
              </Badge>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 xl:justify-end">
              <label
                className="inline-flex h-7 items-center gap-1.5 rounded-full border border-slate-200/80 bg-white/88 px-2 text-xs font-medium text-slate-500 shadow-sm"
                onClick={(event) => event.stopPropagation()}
              >
                <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                  Sprint
                </span>
                <select
                  className="min-w-[92px] bg-transparent text-xs font-semibold text-slate-700 outline-none"
                  value={currentSprintId}
                  disabled={!canManagePlanning || isUpdating}
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) => onMoveIssue?.(issue._id, event.target.value)}
                >
                  <option value="">Backlog</option>
                  {sprintOptions.map((sprint) => (
                    <option key={sprint._id} value={sprint._id}>
                      {sprint.name}
                    </option>
                  ))}
                </select>
              </label>

              {assignee ? (
                <div className="inline-flex h-7 max-w-[160px] items-center gap-1.5 rounded-full border border-slate-200/80 bg-white/88 px-2 shadow-sm">
                  <Avatar className="h-5 w-5 rounded-full">
                    <AvatarFallback>{getInitials(assignee.name)}</AvatarFallback>
                  </Avatar>
                  <span className="truncate text-xs font-medium text-slate-700">
                    {assignee.name}
                  </span>
                </div>
              ) : (
                <div className="inline-flex h-7 items-center gap-1.5 rounded-full border border-slate-200/80 bg-white/88 px-2 text-xs font-medium text-slate-500 shadow-sm">
                  <UserCircle2 className="h-3.5 w-3.5 shrink-0" />
                  <span>Unassigned</span>
                </div>
              )}
            </div>
          </div>

          <div className="mt-2 flex items-center gap-2">
            <div className="h-1.5 min-w-20 flex-1 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-emerald-500 transition-[width]"
                style={{ width: `${Math.max(0, Math.min(100, Number(progress.percent || 0)))}%` }}
              />
            </div>
            <span className="text-[11px] font-semibold text-slate-500">
              {Number(progress.percent || 0)}%
            </span>
            <span className="text-[11px] text-slate-500">
              {Number(progress.completedTaskCount || 0)}/{Number(progress.taskCount || 0)} tasks
            </span>
            <span className="text-[11px] text-slate-500">
              {Number(progress.resolvedBugCount || 0)}/{Number(progress.bugCount || 0)} bugs
            </span>
          </div>
        </div>
      </div>
    </article>
  );
};

export default IssuePlanningCard;
