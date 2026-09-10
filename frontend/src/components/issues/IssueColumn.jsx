import { getIssueStatusVariant } from "@/lib/issues";
import { cn } from "@/lib/utils";
import IssueCard from "@/components/issues/IssueCard";
import { Badge } from "@/components/ui/badge";

const IssueColumn = ({
  column,
  issues = [],
  issueCount,
  updatingId = "",
  canEditIssue = false,
  canChangeStatus = false,
  isDropTarget = false,
  onSelectIssue,
  onStatusChange,
  onDragStartIssue,
  onDragEndIssue,
  onDragOverColumn,
  onDropColumn,
}) => (
  <section
    className={cn(
      "rounded-[28px] border border-slate-200 bg-slate-50/80 p-4 transition",
      isDropTarget &&
        "border-blue-200 bg-blue-50/50 shadow-[0_18px_40px_-32px_rgba(37,99,235,0.35)]"
    )}
    onDragOver={(event) => {
      if (!canChangeStatus) {
        return;
      }

      event.preventDefault();
      onDragOverColumn();
    }}
    onDrop={(event) => {
      if (!canChangeStatus) {
        return;
      }

      event.preventDefault();
      onDropColumn();
    }}
  >
    <div className="mb-3 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className={cn("h-2.5 w-2.5 rounded-full", column.accentClassName)} />
          <p className="text-sm font-semibold text-slate-900">{column.label}</p>
        </div>
        <p className="mt-1 text-xs text-slate-500">{column.helper}</p>
      </div>
      <Badge variant={getIssueStatusVariant(column.key)}>{issueCount ?? issues.length}</Badge>
    </div>

    <div className="space-y-2">
      {issues.length ? (
        issues.map((issue) => (
          <IssueCard
            key={issue._id}
            issue={issue}
            isUpdating={updatingId === issue._id}
            canEditIssue={canEditIssue}
            canChangeStatus={canChangeStatus}
            onSelectIssue={onSelectIssue}
            onStatusChange={onStatusChange}
            onDragStart={onDragStartIssue}
            onDragEnd={onDragEndIssue}
          />
        ))
      ) : (
        <div
          className={cn(
            "rounded-[22px] border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500 transition",
            isDropTarget && "border-blue-200 text-blue-700"
          )}
        >
          {isDropTarget
            ? `Drop here to move work into ${column.label}.`
            : "No work items in this lane."}
        </div>
      )}
    </div>
  </section>
);

export default IssueColumn;
