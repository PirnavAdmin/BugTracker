import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  FolderKanban,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { getIssueStatusLabel, ISSUE_STATUS } from "@/lib/issues";
import { formatDate } from "@/lib/utils";

const createDraft = () => ({
  carryOverMode: "BACKLOG",
  targetSprintId: "",
  newSprint: {
    name: "",
    goal: "",
    startDate: "",
    endDate: "",
  },
  options: {
    autoCloseDoneStories: true,
    generateSprintReport: true,
    updateVelocityMetrics: true,
    notifyTeamMembers: true,
  },
});

const SprintCompletionDialog = ({
  open,
  onOpenChange,
  sprint = null,
  sprintIssues = [],
  plannedSprints = [],
  isPending = false,
  onSubmit,
}) => {
  const [draft, setDraft] = useState(createDraft());
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) {
      return;
    }

    setDraft(createDraft());
    setShowConfirmation(false);
    setError("");
  }, [open, sprint]);

  const summary = useMemo(() => {
    const issues = Array.isArray(sprintIssues) ? sprintIssues : [];
    const completedIssues = issues.filter((issue) =>
      [ISSUE_STATUS.DONE, ISSUE_STATUS.CLOSED].includes(issue?.status)
    );
    const doneIssues = issues.filter((issue) => issue?.status === ISSUE_STATUS.DONE);
    const incompleteIssues = issues.filter(
      (issue) => ![ISSUE_STATUS.DONE, ISSUE_STATUS.CLOSED].includes(issue?.status)
    );
    const completedPoints = completedIssues.reduce(
      (sum, issue) => sum + Number(issue?.storyPoints || 0),
      0
    );
    const totalPoints = issues.reduce((sum, issue) => sum + Number(issue?.storyPoints || 0), 0);
    const breakdownMap = incompleteIssues.reduce((result, issue) => {
      const label = getIssueStatusLabel(issue?.status);
      result.set(label, (result.get(label) || 0) + 1);
      return result;
    }, new Map());

    return {
      totalCount: issues.length,
      completedCount: completedIssues.length,
      doneCount: doneIssues.length,
      alreadyClosedCount: completedIssues.length - doneIssues.length,
      incompleteCount: incompleteIssues.length,
      completedPoints,
      totalPoints,
      completionRate: issues.length
        ? Math.round((completedIssues.length / issues.length) * 100)
        : 0,
      incompleteBreakdown: Array.from(breakdownMap.entries()),
    };
  }, [sprintIssues]);

  const hasPlannedSprints = plannedSprints.length > 0;
  const requiresExistingSprint = draft.carryOverMode === "SPRINT" && summary.incompleteCount > 0;
  const requiresNewSprint = draft.carryOverMode === "NEW_SPRINT" && summary.incompleteCount > 0;
  const canSubmit =
    (!requiresExistingSprint || draft.targetSprintId) &&
    (!requiresNewSprint ||
      (draft.newSprint.name.trim() &&
        draft.newSprint.startDate &&
        draft.newSprint.endDate));

  const selectedSprintName =
    plannedSprints.find((item) => String(item._id) === String(draft.targetSprintId))?.name ||
    "the selected sprint";

  const confirmationLines = [
    summary.doneCount
      ? `${summary.doneCount} done stor${summary.doneCount === 1 ? "y" : "ies"} will be closed.`
      : "No done stories need to be closed.",
    draft.carryOverMode === "BACKLOG"
      ? `${summary.incompleteCount} unfinished stor${summary.incompleteCount === 1 ? "y will" : "ies will"} move back to the product backlog.`
      : draft.carryOverMode === "SPRINT"
        ? `${summary.incompleteCount} unfinished stor${summary.incompleteCount === 1 ? "y will" : "ies will"} move to ${selectedSprintName}.`
        : `${summary.incompleteCount} unfinished stor${summary.incompleteCount === 1 ? "y will" : "ies will"} move to ${draft.newSprint.name || "the new sprint"}.`,
    "This action cannot be undone.",
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-6xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Complete Sprint</DialogTitle>
          <DialogDescription>
            Review sprint delivery, decide what happens to unfinished work, and confirm the closeout.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-5"
          onSubmit={async (event) => {
            event.preventDefault();

            if (!canSubmit) {
              setError("Complete the required carry-over details before finishing the sprint.");
              return;
            }

            if (!showConfirmation) {
              setError("");
              setShowConfirmation(true);
              return;
            }

            try {
              setError("");
              await onSubmit({
                carryOverMode: draft.carryOverMode,
                targetSprintId:
                  draft.carryOverMode === "SPRINT" ? draft.targetSprintId : undefined,
                newSprint:
                  draft.carryOverMode === "NEW_SPRINT"
                    ? {
                        name: draft.newSprint.name.trim(),
                        goal: draft.newSprint.goal.trim(),
                        startDate: draft.newSprint.startDate,
                        endDate: draft.newSprint.endDate,
                      }
                    : undefined,
                options: draft.options,
              });
              onOpenChange(false);
            } catch (submitError) {
              setError(
                submitError.response?.data?.message || "Unable to complete the sprint."
              );
            }
          }}
        >
          <div className="rounded-[24px] border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.95))] p-5 shadow-sm">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.75fr)_minmax(360px,1.1fr)]">
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                    Sprint Summary
                  </p>
                  <p className="mt-2 text-lg font-semibold text-slate-950">{sprint?.name}</p>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    {sprint?.goal || "No sprint goal was added."}
                  </p>
                </div>

                <div className="flex flex-wrap gap-3 text-sm text-slate-600">
                  <span>
                    Duration:{" "}
                    {sprint?.startDate && sprint?.endDate
                      ? `${formatDate(sprint.startDate)} - ${formatDate(sprint.endDate)}`
                      : "Dates not fully scheduled"}
                  </span>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  {
                    label: "Completed Stories",
                    value: summary.completedCount,
                    helper: `${summary.totalCount} total`,
                    icon: CheckCircle2,
                    accent: "emerald",
                  },
                  {
                    label: "Incomplete Stories",
                    value: summary.incompleteCount,
                    helper: "Needs carry-over",
                    icon: AlertTriangle,
                    accent: "amber",
                  },
                  {
                    label: "Story Points Completed",
                    value: `${summary.completedPoints} / ${summary.totalPoints}`,
                    helper: "Delivered points",
                    icon: TrendingUp,
                    accent: "blue",
                  },
                  {
                    label: "Completion",
                    value: `${summary.completionRate}%`,
                    helper: "By completed stories",
                    icon: Circle,
                    accent: "slate",
                  },
                ].map((card) => {
                  const Icon = card.icon;
                  const accentClass = {
                    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
                    amber: "border-amber-200 bg-amber-50 text-amber-700",
                    blue: "border-blue-200 bg-blue-50 text-blue-700",
                    slate: "border-slate-200 bg-slate-100 text-slate-700",
                  }[card.accent];

                  return (
                    <div
                      key={card.label}
                      className="rounded-[20px] border border-white/70 bg-white/92 p-4 shadow-sm"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span
                          className={`inline-flex h-9 w-9 items-center justify-center rounded-2xl border ${accentClass}`}
                        >
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="text-lg font-semibold text-slate-950">{card.value}</span>
                      </div>
                      <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        {card.label}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">{card.helper}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="grid gap-5 xl:grid-cols-[minmax(300px,0.72fr)_minmax(0,1.28fr)] xl:items-start">
            <section className="space-y-4 rounded-[24px] border border-slate-200 bg-white/95 p-5 shadow-sm xl:sticky xl:top-0">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                  Completed Stories
                </p>
                <p className="mt-2 text-sm font-medium text-slate-900">
                  {summary.doneCount} done stor{summary.doneCount === 1 ? "y" : "ies"} will be
                  automatically closed.
                </p>
                {summary.alreadyClosedCount ? (
                  <p className="mt-1 text-sm text-slate-500">
                    {summary.alreadyClosedCount} stor
                    {summary.alreadyClosedCount === 1 ? "y is" : "ies are"} already closed and
                    will remain in this sprint.
                  </p>
                ) : null}
              </div>

              <div className="rounded-[20px] border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-800">
                No extra action is needed for completed work items.
              </div>
            </section>

            <section className="space-y-4 rounded-[24px] border border-slate-200 bg-white/95 p-5 shadow-sm">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                  Incomplete Stories
                </p>
                <p className="mt-2 text-sm font-medium text-slate-900">
                  What should happen to unfinished stories?
                </p>
              </div>

              {summary.incompleteBreakdown.length ? (
                <div className="rounded-[18px] border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-900">
                  {summary.incompleteBreakdown.map(([label, count]) => (
                    <div key={label} className="flex items-center justify-between gap-3">
                      <span>{label}</span>
                      <span className="font-semibold">{count}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-[18px] border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-800">
                  No unfinished stories remain in this sprint.
                </div>
              )}

              <div className="grid gap-3">
                {[
                  {
                    value: "BACKLOG",
                    label: "Move all unfinished stories back to Product Backlog",
                    helper: "Sprint is cleared and work returns to the backlog with the same status.",
                    disabled: summary.incompleteCount === 0,
                  },
                  {
                    value: "SPRINT",
                    label: "Move unfinished stories to another existing sprint",
                    helper: hasPlannedSprints
                      ? "Carry unfinished work into another planned sprint."
                      : "No planned sprint found. Create Sprint instead.",
                    disabled: summary.incompleteCount === 0 || !hasPlannedSprints,
                  },
                  {
                    value: "NEW_SPRINT",
                    label: "Create a new sprint and move unfinished stories",
                    helper: "A follow-up sprint will be created with the same scope before work is moved.",
                    disabled: summary.incompleteCount === 0,
                  },
                ].map((option) => (
                  <label
                    key={option.value}
                    className={`block rounded-[20px] border px-4 py-4 transition ${
                      draft.carryOverMode === option.value
                        ? "border-blue-300 bg-blue-50/70 shadow-sm"
                        : "border-slate-200 bg-slate-50/65"
                    } ${option.disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="radio"
                        name="carryOverMode"
                        className="mt-1 h-4 w-4 accent-blue-600"
                        value={option.value}
                        checked={draft.carryOverMode === option.value}
                        disabled={option.disabled}
                        onChange={(event) => {
                          setDraft((current) => ({
                            ...current,
                            carryOverMode: event.target.value,
                            targetSprintId: event.target.value === "SPRINT" ? current.targetSprintId : "",
                          }));
                          setShowConfirmation(false);
                        }}
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900">{option.label}</p>
                        <p className="mt-1 text-sm leading-6 text-slate-500">{option.helper}</p>
                      </div>
                    </div>
                  </label>
                ))}
              </div>

              {draft.carryOverMode === "SPRINT" ? (
                <label className="space-y-2">
                  <span className="text-xs uppercase tracking-[0.22em] text-slate-500">
                    Sprint
                  </span>
                  <select
                    className="field-select"
                    value={draft.targetSprintId}
                    disabled={!hasPlannedSprints || summary.incompleteCount === 0}
                    onChange={(event) => {
                      setDraft((current) => ({
                        ...current,
                        targetSprintId: event.target.value,
                      }));
                      setShowConfirmation(false);
                    }}
                  >
                    <option value="">Select sprint</option>
                    {plannedSprints.map((plannedSprint) => (
                      <option key={plannedSprint._id} value={plannedSprint._id}>
                        {plannedSprint.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              {draft.carryOverMode === "NEW_SPRINT" ? (
                <div className="grid gap-4 rounded-[20px] border border-slate-200 bg-slate-50/80 p-4 xl:grid-cols-[minmax(220px,1fr)_minmax(220px,1fr)]">
                  <label className="space-y-2 xl:col-span-2">
                    <span className="text-xs uppercase tracking-[0.22em] text-slate-500">
                      Sprint Name
                    </span>
                    <Input
                      value={draft.newSprint.name}
                      onChange={(event) => {
                        setDraft((current) => ({
                          ...current,
                          newSprint: {
                            ...current.newSprint,
                            name: event.target.value,
                          },
                        }));
                        setShowConfirmation(false);
                      }}
                    />
                  </label>

                  <label className="space-y-2 xl:col-span-2">
                    <span className="text-xs uppercase tracking-[0.22em] text-slate-500">
                      Sprint Goal
                    </span>
                    <Input
                      value={draft.newSprint.goal}
                      placeholder="Optional follow-up sprint goal"
                      onChange={(event) => {
                        setDraft((current) => ({
                          ...current,
                          newSprint: {
                            ...current.newSprint,
                            goal: event.target.value,
                          },
                        }));
                        setShowConfirmation(false);
                      }}
                    />
                  </label>

                  <div className="grid gap-4 sm:grid-cols-2 xl:col-span-2">
                    <label className="space-y-2">
                      <span className="text-xs uppercase tracking-[0.22em] text-slate-500">
                        Start Date
                      </span>
                      <Input
                        type="date"
                        value={draft.newSprint.startDate}
                        onChange={(event) => {
                          setDraft((current) => ({
                            ...current,
                            newSprint: {
                              ...current.newSprint,
                              startDate: event.target.value,
                            },
                          }));
                          setShowConfirmation(false);
                        }}
                      />
                    </label>

                    <label className="space-y-2">
                      <span className="text-xs uppercase tracking-[0.22em] text-slate-500">
                        End Date
                      </span>
                      <Input
                        type="date"
                        value={draft.newSprint.endDate}
                        onChange={(event) => {
                          setDraft((current) => ({
                            ...current,
                            newSprint: {
                              ...current.newSprint,
                              endDate: event.target.value,
                            },
                          }));
                          setShowConfirmation(false);
                        }}
                      />
                    </label>
                  </div>
                </div>
              ) : null}
            </section>
          </div>

          <section className="space-y-4 rounded-[24px] border border-slate-200 bg-white/95 p-5 shadow-sm">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                Sprint Completion Options
              </p>
              <p className="mt-2 text-sm text-slate-600">
                Choose the follow-up actions that should happen after the sprint closes.
              </p>
            </div>

            <div className="grid gap-3 xl:grid-cols-4 sm:grid-cols-2">
              {[
                ["autoCloseDoneStories", "Automatically close Done stories"],
                ["generateSprintReport", "Generate Sprint Report"],
                ["updateVelocityMetrics", "Update Velocity Metrics"],
                ["notifyTeamMembers", "Notify Team Members"],
              ].map(([key, label]) => (
                <label
                  key={key}
                  className="flex items-center gap-3 rounded-[18px] border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm font-medium text-slate-800"
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded accent-blue-600"
                    checked={draft.options[key]}
                    onChange={(event) => {
                      setDraft((current) => ({
                        ...current,
                        options: {
                          ...current.options,
                          [key]: event.target.checked,
                        },
                      }));
                      setShowConfirmation(false);
                    }}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </section>

          {showConfirmation ? (
            <section className="rounded-[24px] border border-amber-200 bg-amber-50/85 p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-amber-200 bg-white text-amber-700">
                  <FolderKanban className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-base font-semibold text-slate-950">Are you sure?</p>
                  <div className="mt-2 space-y-1 text-sm leading-6 text-slate-700">
                    {confirmationLines.map((line) => (
                      <p key={line}>{line}</p>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          {error ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          ) : null}

          <DialogFooter className="gap-2 sm:justify-between">
            <p className="text-sm text-slate-500">
              Complete Sprint becomes available when the required carry-over fields are ready.
            </p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                disabled={isPending}
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending || !canSubmit}>
                {isPending
                  ? "Completing..."
                  : showConfirmation
                    ? "Complete Sprint"
                    : "Review Completion"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default SprintCompletionDialog;
