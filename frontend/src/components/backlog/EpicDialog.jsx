import { useEffect, useMemo, useState } from "react";
import Select from "react-select";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getIssueDisplayKey } from "@/lib/issues";

const createDraft = (epic) => ({
  name: epic?.name || "",
  description: epic?.description || "",
  color: epic?.color || "#3B82F6",
  owner: epic?.owner?._id || epic?.owner || "",
  priority: epic?.priority || "Medium",
  status: epic?.status || "ACTIVE",
  startDate: epic?.startDate ? String(epic.startDate).slice(0, 10) : "",
  targetDate: epic?.targetDate ? String(epic.targetDate).slice(0, 10) : "",
  assignIssuesNow: false,
  issueIds: [],
});

const buildIssueOption = (issue) => ({
  value: String(issue?._id || ""),
  label: issue?.title || "Untitled work item",
  issue,
});

const issueSelectStyles = {
  control: (base, state) => ({
    ...base,
    minHeight: 44,
    borderRadius: 18,
    borderColor: state.isFocused ? "rgba(59, 130, 246, 0.45)" : "#dbe2ea",
    boxShadow: state.isFocused
      ? "0 0 0 4px rgba(59, 130, 246, 0.12)"
      : "0 1px 2px rgba(15, 23, 42, 0.04)",
    "&:hover": {
      borderColor: state.isFocused ? "rgba(59, 130, 246, 0.45)" : "#cbd5e1",
    },
  }),
  valueContainer: (base) => ({
    ...base,
    padding: "3px 12px",
  }),
  indicatorSeparator: () => ({
    display: "none",
  }),
  menuPortal: (base) => ({
    ...base,
    zIndex: 9999,
  }),
  menu: (base) => ({
    ...base,
    borderRadius: 18,
    border: "1px solid #e2e8f0",
    boxShadow: "0 20px 40px -24px rgba(15, 23, 42, 0.28)",
    overflow: "hidden",
  }),
  option: (base, state) => ({
    ...base,
    backgroundColor: state.isSelected
      ? "rgba(219, 234, 254, 0.92)"
      : state.isFocused
        ? "rgba(248, 250, 252, 0.96)"
        : "transparent",
    color: "#0f172a",
    cursor: "pointer",
  }),
  multiValue: (base) => ({
    ...base,
    borderRadius: 9999,
    backgroundColor: "rgba(241, 245, 249, 0.92)",
  }),
  multiValueLabel: (base) => ({
    ...base,
    color: "#334155",
    fontWeight: 600,
  }),
  multiValueRemove: (base) => ({
    ...base,
    color: "#64748b",
    "&:hover": {
      backgroundColor: "rgba(226, 232, 240, 0.9)",
      color: "#0f172a",
    },
  }),
};

const formatIssueOptionLabel = (option) => (
  <div className="min-w-0">
    <div className="flex min-w-0 items-center gap-2">
      <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
        {getIssueDisplayKey(option.issue)}
      </span>
      <span className="truncate text-sm font-medium text-slate-900">{option.label}</span>
    </div>
    <p className="mt-1 truncate text-xs text-slate-500">
      {option.issue?.sprintId?.name || "Backlog"} / {option.issue?.epicId?.name || "No epic"}
    </p>
  </div>
);

const EpicDialog = ({
  open,
  onOpenChange,
  initialEpic = null,
  issues = [],
  members = [],
  isPending = false,
  onSubmit,
}) => {
  const [draft, setDraft] = useState(createDraft(initialEpic));
  const [error, setError] = useState("");
  const issueOptions = useMemo(() => issues.map(buildIssueOption), [issues]);
  const selectedIssueOptions = useMemo(
    () =>
      issueOptions.filter((option) =>
        draft.issueIds.includes(String(option.value))
      ),
    [draft.issueIds, issueOptions]
  );
  const menuPortalTarget =
    typeof document !== "undefined" ? document.body : undefined;

  useEffect(() => {
    if (!open) {
      return;
    }

    setDraft(createDraft(initialEpic));
    setError("");
  }, [initialEpic, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl overflow-visible border border-slate-200/80 bg-white p-0 shadow-[0_36px_90px_-50px_rgba(15,23,42,0.35)]">
        <div className="max-h-[90vh] overflow-y-auto">
          <DialogHeader className="border-b border-slate-200/80 px-5 py-4 sm:px-6">
            <DialogTitle>{initialEpic ? "Edit Epic" : "Create Epic"}</DialogTitle>
            <DialogDescription>
              Keep larger workstreams visible without turning planning into a long form.
            </DialogDescription>
          </DialogHeader>

          <form
            className="space-y-4 px-5 py-4 sm:px-6"
            onSubmit={async (event) => {
              event.preventDefault();

              if (!draft.name.trim()) {
                setError("Epic name is required.");
                return;
              }

              if (!initialEpic && draft.assignIssuesNow && !draft.issueIds.length) {
                setError("Select at least one work item or create the epic empty.");
                return;
              }

              try {
                setError("");
                await onSubmit({
                  name: draft.name.trim(),
                  description: draft.description.trim(),
                  color: draft.color || "#3B82F6",
                  owner: draft.owner || null,
                  priority: draft.priority,
                  status: draft.status,
                  startDate: draft.startDate || null,
                  targetDate: draft.targetDate || null,
                  issueIds: draft.assignIssuesNow ? draft.issueIds : [],
                });
                onOpenChange(false);
              } catch (submitError) {
                setError(
                  submitError.response?.data?.message || "Unable to save this epic."
                );
              }
            }}
          >
            <label className="space-y-1.5">
              <span className="text-xs uppercase tracking-[0.22em] text-slate-500">
                Epic Name
              </span>
              <Input
                className="rounded-[18px] border-slate-200"
                value={draft.name}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-xs uppercase tracking-[0.22em] text-slate-500">
                  Owner
                </span>
                <select
                  className="field-select h-11 rounded-[16px] px-3"
                  value={draft.owner}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, owner: event.target.value }))
                  }
                >
                  <option value="">Unassigned</option>
                  {members.map((member) => (
                    <option key={member._id} value={member._id}>{member.name}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1.5">
                <span className="text-xs uppercase tracking-[0.22em] text-slate-500">
                  Priority
                </span>
                <select
                  className="field-select h-11 rounded-[16px] px-3"
                  value={draft.priority}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, priority: event.target.value }))
                  }
                >
                  {["Critical", "High", "Medium", "Low"].map((priority) => (
                    <option key={priority} value={priority}>{priority}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1.5">
                <span className="text-xs uppercase tracking-[0.22em] text-slate-500">
                  Start Date
                </span>
                <Input
                  type="date"
                  value={draft.startDate}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, startDate: event.target.value }))
                  }
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs uppercase tracking-[0.22em] text-slate-500">
                  Target Date
                </span>
                <Input
                  type="date"
                  value={draft.targetDate}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, targetDate: event.target.value }))
                  }
                />
              </label>
              <label className="space-y-1.5 sm:col-span-2">
                <span className="text-xs uppercase tracking-[0.22em] text-slate-500">
                  Status
                </span>
                <select
                  className="field-select h-11 rounded-[16px] px-3"
                  value={draft.status}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, status: event.target.value }))
                  }
                >
                  {["DRAFT", "PLANNED", "ACTIVE", "DONE", "ARCHIVED"].map((status) => (
                    <option key={status} value={status}>
                      {status.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="space-y-1.5">
              <span className="text-xs uppercase tracking-[0.22em] text-slate-500">
                Description
              </span>
              <Textarea
                className="min-h-[108px] rounded-[20px] border-slate-200"
                value={draft.description}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                placeholder="Give the team context for this epic."
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-xs uppercase tracking-[0.22em] text-slate-500">
                Accent Color
              </span>
              <Input
                type="color"
                className="h-12 rounded-[18px] border-slate-200 p-2"
                value={draft.color}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    color: event.target.value,
                  }))
                }
              />
            </label>

            {!initialEpic ? (
              <div className="rounded-[22px] border border-slate-200 bg-slate-50/80 p-4">
                <p className="text-sm font-semibold text-slate-950">Assign work items now?</p>
                <div className="mt-3 space-y-2">
                  <label className="flex items-start gap-3 rounded-[18px] border border-slate-200 bg-white/85 px-3 py-3 text-sm text-slate-600">
                    <input
                      type="radio"
                      name="assignIssuesNow"
                      checked={!draft.assignIssuesNow}
                      onChange={() =>
                        setDraft((current) => ({
                          ...current,
                          assignIssuesNow: false,
                          issueIds: [],
                        }))
                      }
                    />
                    <span>
                      <span className="block font-medium text-slate-900">
                        No
                      </span>
                      <span className="block text-slate-500">Create an empty epic first.</span>
                    </span>
                  </label>

                  <label className="flex items-start gap-3 rounded-[18px] border border-slate-200 bg-white/85 px-3 py-3 text-sm text-slate-600">
                    <input
                      type="radio"
                      name="assignIssuesNow"
                      checked={draft.assignIssuesNow}
                      onChange={() =>
                        setDraft((current) => ({
                          ...current,
                          assignIssuesNow: true,
                        }))
                      }
                    />
                    <span>
                      <span className="block font-medium text-slate-900">
                        Yes
                      </span>
                      <span className="block text-slate-500">
                        Pick work items now so the epic is ready for planning immediately.
                      </span>
                    </span>
                  </label>
                </div>

                {draft.assignIssuesNow ? (
                  <div className="mt-4 space-y-1.5">
                    <span className="text-xs uppercase tracking-[0.22em] text-slate-500">
                      Work Item Picker
                    </span>
                    <Select
                      isMulti
                      options={issueOptions}
                      value={selectedIssueOptions}
                      styles={issueSelectStyles}
                      formatOptionLabel={formatIssueOptionLabel}
                      menuPortalTarget={menuPortalTarget}
                      placeholder={
                        issueOptions.length
                          ? "Select work items to move into this epic"
                          : "No visible work items available"
                      }
                      isDisabled={!issueOptions.length || isPending}
                      onChange={(options) =>
                        setDraft((current) => ({
                          ...current,
                          issueIds: (options || []).map((option) => String(option.value)),
                        }))
                      }
                      noOptionsMessage={() => "No work items available in the current planning view."}
                    />
                    <p className="text-xs text-slate-500">
                      The picker uses issues currently visible in this backlog view.
                    </p>
                  </div>
                ) : null}
              </div>
            ) : null}

            {error ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </div>
            ) : null}

            <div className="sticky bottom-0 -mx-5 flex justify-end gap-2 border-t border-slate-200/80 bg-white/95 px-5 py-3 backdrop-blur sm:-mx-6 sm:px-6">
              <Button
                type="button"
                variant="outline"
                disabled={isPending}
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Saving..." : initialEpic ? "Save Epic" : "Create Epic"}
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default EpicDialog;
