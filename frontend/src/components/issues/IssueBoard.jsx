import { useMemo, useState } from "react";
import { FolderKanban } from "lucide-react";
import { ISSUE_STATUS, getIssueWorkflowLane, normalizeIssueStatus, resolveIssueAssignees } from "@/lib/issues";
import EmptyState from "@/components/shared/EmptyState";
import IssueColumn from "@/components/issues/IssueColumn";
import { Card, CardContent } from "@/components/ui/card";

const BOARD_COLUMNS = [
  {
    key: ISSUE_STATUS.TODO,
    label: "To Do",
    helper: "Backlog items and planned work that are ready for pickup.",
    accentClassName: "bg-slate-400",
  },
  {
    key: ISSUE_STATUS.IN_PROGRESS,
    label: "In Progress",
    helper: "Active work, blocked items, reviews, and QA handoffs.",
    accentClassName: "bg-amber-500",
  },
  {
    key: ISSUE_STATUS.DONE,
    label: "Done",
    helper: "Completed work items that are ready to report.",
    accentClassName: "bg-emerald-500",
  },
];

const IssueBoard = ({
  issues = [],
  columnCounts = {},
  lanePagination = {},
  onLanePageChange,
  visibleColumnKeys = [],
  updatingId = "",
  canEditIssue = false,
  canChangeStatus = false,
  onSelectIssue,
  onStatusChange,
  emptyStateTitle = "No work items found",
  emptyStateDescription = "Adjust the filters or create a new work item to populate the board.",
}) => {
  const [draggedIssueId, setDraggedIssueId] = useState("");
  const [activeColumnKey, setActiveColumnKey] = useState("");

  const columns = useMemo(
    () =>
      BOARD_COLUMNS.filter(
        (column) => !visibleColumnKeys.length || visibleColumnKeys.includes(column.key)
      ).map((column) => ({
        ...column,
        items: issues
          .filter((issue) => getIssueWorkflowLane(issue.status) === column.key)
          .flatMap((issue) => {
            const assignees = resolveIssueAssignees(issue).filter(
              (assignee) => assignee.name || assignee.email
            );
            return assignees.length > 1
              ? assignees.map((assignee) => ({
                  ...issue,
                  boardCardKey: `${issue._id}-${assignee._id}`,
                  boardAssignee: assignee,
                }))
              : [issue];
          }),
      })),
    [issues, visibleColumnKeys]
  );

  const boardGridClassName =
    columns.length === 1
      ? "grid gap-4"
      : columns.length === 2
        ? "grid gap-4 xl:grid-cols-2"
        : "grid gap-4 xl:grid-cols-3";

  const handleStatusChange = async (issueId, nextStatus) => {
    if (!issueId || !nextStatus || typeof onStatusChange !== "function") {
      return;
    }

    const currentIssue = issues.find((issue) => issue._id === issueId);

    if (!currentIssue || normalizeIssueStatus(currentIssue.status) === nextStatus) {
      return;
    }

    try {
      await onStatusChange(issueId, nextStatus);
    } catch (error) {
      // The query refetch keeps the board state authoritative after failed updates.
    } finally {
      setDraggedIssueId("");
      setActiveColumnKey("");
    }
  };

  if (!issues.length) {
    return (
      <Card className="overflow-hidden border-white/70 bg-white/92 shadow-[0_18px_50px_-34px_rgba(15,23,42,0.45)] backdrop-blur">
        <CardContent className="p-8">
          <EmptyState
            title={emptyStateTitle}
            description={emptyStateDescription}
            icon={<FolderKanban className="h-5 w-5" />}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden border-white/70 bg-white/92 shadow-[0_18px_50px_-34px_rgba(15,23,42,0.45)] backdrop-blur">
      <CardContent className="p-4">
        <div className={boardGridClassName}>
          {columns.map((column) => (
            <IssueColumn
            key={column.key}
            column={column}
            issues={column.items}
            issueCount={columnCounts[column.key] ?? column.items.length}
            pagination={lanePagination[column.key]}
            onPageChange={(nextPage) => onLanePageChange?.(column.key, nextPage)}
              updatingId={updatingId}
              canEditIssue={canEditIssue}
              canChangeStatus={canChangeStatus}
              isDropTarget={activeColumnKey === column.key}
              onSelectIssue={onSelectIssue}
              onStatusChange={handleStatusChange}
              onDragStartIssue={setDraggedIssueId}
              onDragEndIssue={() => {
                setDraggedIssueId("");
                setActiveColumnKey("");
              }}
              onDragOverColumn={() => {
                if (!canChangeStatus || !draggedIssueId) {
                  return;
                }

                setActiveColumnKey(column.key);
              }}
              onDropColumn={() => handleStatusChange(draggedIssueId, column.key)}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default IssueBoard;
