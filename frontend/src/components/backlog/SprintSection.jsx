import { AlertTriangle, Flag, PencilLine, Play, RotateCcw, Trash2 } from "lucide-react";
import IssuePlanningCard from "@/components/backlog/IssuePlanningCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getSprintLifecycleState, isSprintLocked } from "@/lib/issues";
import { cn, formatDate } from "@/lib/utils";

const stateMeta = {
  ACTIVE: {
    label: "Active Sprint",
    badgeClass:
      "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
    shellClass:
      "border-emerald-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(236,253,245,0.82))] dark:border-slate-800 dark:bg-slate-900/90 dark:bg-none",
  },
  PLANNED: {
    label: "Planned Sprint",
    badgeClass: "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-300",
    shellClass:
      "border-blue-100/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(239,246,255,0.82))] dark:border-slate-800 dark:bg-slate-900/90 dark:bg-none",
  },
  COMPLETED: {
    label: "Completed Sprint",
    badgeClass:
      "border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300",
    shellClass:
      "border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(241,245,249,0.82))] dark:border-slate-800 dark:bg-slate-900/90 dark:bg-none",
  },
  EXPIRED: {
    label: "Expired Sprint",
    badgeClass:
      "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-300",
    shellClass:
      "border-slate-300/80 bg-[linear-gradient(180deg,rgba(248,250,252,0.96),rgba(226,232,240,0.9))] opacity-70 dark:border-slate-800 dark:bg-slate-900/70 dark:bg-none",
  },
};

const SprintSection = ({
  sprint,
  issues = [],
  availableSprints = [],
  canManageSprints = false,
  canManagePlanning = false,
  canReorderIssues = false,
  planningUpdatingIssueId = "",
  isStartPending = false,
  onSelectIssue,
  onDragStartIssue,
  onDragEndIssue,
  onDropIssueBefore,
  onDropToContainer,
  onMoveIssue,
  onEditSprint,
  onDeleteSprint,
  onStartSprint,
  onCompleteSprint,
  onReopenSprint,
  canAdminReopen = false,
}) => {
  const lifecycleState = getSprintLifecycleState(sprint);
  const isLocked = isSprintLocked(sprint);
  const meta = stateMeta[lifecycleState] || stateMeta.PLANNED;

  return (
    <section
      className={cn(
        "rounded-[20px] border p-3 shadow-[0_18px_42px_-32px_rgba(15,23,42,0.34)] backdrop-blur-xl transition hover:shadow-[0_22px_48px_-34px_rgba(37,99,235,0.28)]",
        meta.shellClass
      )}
      onDragOver={(event) => {
        if (!canReorderIssues || isLocked) {
          return;
        }

        event.preventDefault();
      }}
      onDrop={(event) => {
        if (!canReorderIssues || isLocked) {
          return;
        }

        event.preventDefault();
        onDropToContainer?.(sprint._id);
      }}
    >
      <div className="flex flex-col gap-3 border-b border-white/65 pb-3 xl:flex-row xl:items-start xl:justify-between dark:border-slate-800">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={cn("h-6 px-2 text-[11px] font-semibold", meta.badgeClass)}>
              {meta.label}
            </Badge>
            {sprint.teamId?.name ? (
              <Badge className="h-6 border border-violet-200 bg-violet-50 px-2 text-[11px] text-violet-700 hover:bg-violet-50 dark:border-violet-800 dark:bg-violet-950/50 dark:text-violet-300">
                {sprint.teamId.name}
              </Badge>
            ) : (
              <Badge className="h-6 border border-slate-200 bg-slate-100 px-2 text-[11px] text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                Project-wide
              </Badge>
            )}
            <span className="rounded-full border border-white/70 bg-white/76 px-2 py-1 text-[11px] font-semibold text-slate-500 shadow-sm dark:border-slate-700/60 dark:bg-slate-800/80 dark:text-slate-300">
              {issues.length} issues
            </span>
            <span className="rounded-full border border-white/70 bg-white/76 px-2 py-1 text-[11px] font-semibold text-slate-500 shadow-sm dark:border-slate-700/60 dark:bg-slate-800/80 dark:text-slate-300">
              {sprint.completedCount || 0} done
            </span>
          </div>

          <div className="mt-2 flex min-w-0 flex-wrap items-baseline gap-2">
            <p className="truncate text-base font-semibold text-slate-950 dark:text-slate-100">{sprint.name}</p>
            {sprint.goal ? (
              <p className="max-w-full truncate text-sm text-slate-500 dark:text-slate-400">{sprint.goal}</p>
            ) : null}
          </div>

          <div className="mt-1.5 flex flex-wrap gap-3 text-xs text-slate-500 dark:text-slate-400">
            {sprint.startDate ? <span>Starts {formatDate(sprint.startDate)}</span> : null}
            {sprint.endDate ? <span>Ends {formatDate(sprint.endDate)}</span> : null}
            {isLocked && sprint.lockReason ? (
              <span className="inline-flex items-center gap-1 font-medium text-rose-700 dark:text-rose-400">
                <AlertTriangle className="h-3.5 w-3.5" />
                {sprint.lockReason}
              </span>
            ) : null}
            {!sprint.goal ? <span>Add a sprint goal when scope is clear.</span> : null}
          </div>
        </div>

        {canManageSprints ? (
          <div className="flex flex-wrap gap-1.5">
            {sprint.state === "PLANNED" ? (
              <>
                <Button className="h-8 rounded-xl px-2.5" type="button" variant="outline" size="sm" onClick={onEditSprint}>
                  <PencilLine className="h-3.5 w-3.5" />
                  Edit
                </Button>
                <Button className="h-8 rounded-xl px-2.5" type="button" variant="outline" size="sm" onClick={onDeleteSprint}>
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </Button>
                <Button
                  className="h-8 rounded-xl px-2.5"
                  type="button"
                  size="sm"
                  onClick={onStartSprint}
                  disabled={isStartPending}
                >
                  <Play className="h-3.5 w-3.5" />
                  {isStartPending ? "Starting..." : "Start"}
                </Button>
              </>
            ) : null}
            {sprint.state === "ACTIVE" ? (
              <>
                <Button
                  className="h-8 rounded-xl px-2.5"
                  type="button"
                  size="sm"
                  onClick={onCompleteSprint}
                  disabled={isLocked}
                  title={isLocked ? sprint.lockReason : ""}
                >
                  <Flag className="h-3.5 w-3.5" />
                  Complete
                </Button>
                {canAdminReopen && lifecycleState === "EXPIRED" ? (
                  <Button className="h-8 rounded-xl px-2.5" type="button" variant="outline" size="sm" onClick={onReopenSprint}>
                    <RotateCcw className="h-3.5 w-3.5" />
                    Reopen
                  </Button>
                ) : null}
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="mt-3 min-h-[92px] rounded-[16px] border border-dashed border-blue-100/80 bg-white/42 p-2 dark:border-slate-800 dark:bg-slate-950/40">
        <div className="space-y-2">
        {issues.length ? (
          issues.map((issue) => (
            <IssuePlanningCard
              key={issue._id}
              issue={issue}
              canDrag={canReorderIssues && !isLocked}
              canManagePlanning={canManagePlanning && !isLocked}
              isUpdating={planningUpdatingIssueId === issue._id}
              availableSprints={availableSprints}
              onDragStart={onDragStartIssue}
              onDragEnd={onDragEndIssue}
              onDropBefore={() => onDropIssueBefore?.(sprint._id, issue._id)}
              onSelectIssue={onSelectIssue}
              onMoveIssue={onMoveIssue}
            />
          ))
        ) : (
          <div className="flex min-h-[84px] items-center justify-center rounded-[14px] bg-white/68 px-4 py-6 text-center text-sm text-slate-500 dark:bg-slate-900/60 dark:text-slate-400">
            {isLocked
              ? "This locked sprint has no issues in the current planning view."
              : "Drop issues here or move them in with the sprint picker."}
          </div>
        )}
        </div>
      </div>
    </section>
  );
};

export default SprintSection;
