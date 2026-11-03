import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { FolderKanban } from "lucide-react";
import EmptyState from "@/components/shared/EmptyState";
import { Card, CardContent } from "@/components/ui/card";
import TaskKanbanColumn from "@/components/tasks/TaskKanbanColumn";
import TaskCard from "@/components/tasks/TaskCard";
import { resolveIssueAssignees } from "@/lib/issues";
import {
  TASK_BOARD_COLUMNS,
  getTaskBoardStatus,
  sortTasksByPriority,
} from "@/components/tasks/taskBoardStatus";

const TaskKanbanBoard = ({
  issues = [],
  updatingId = "",
  onSelectIssue,
  onStatusChange,
  readOnly = false,
  emptyStateTitle = "No assigned tasks",
  emptyStateDescription = "Assigned work will appear here once it is available.",
}) => {
  const [activeIssueId, setActiveIssueId] = useState("");
  const [pendingStatuses, setPendingStatuses] = useState({});
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const activeIssue = useMemo(
    () => issues.find((issue) => issue._id === activeIssueId) || null,
    [activeIssueId, issues]
  );

  const columns = useMemo(
    () =>
      TASK_BOARD_COLUMNS.map((column) => ({
        ...column,
        items: sortTasksByPriority(
          issues
            .filter(
              (issue) => (pendingStatuses[issue._id] || getTaskBoardStatus(issue)) === column.key
            )
            .flatMap((issue) => {
              if (!readOnly) return [issue];

              const assignees = resolveIssueAssignees(issue).filter(
                (assignee) => assignee.name || assignee.email
              );

              return assignees.length > 1
                ? assignees.map((assignee) => ({
                    ...issue,
                    boardCardKey: `${issue._id}-${assignee._id || assignee.id}`,
                    boardAssignee: assignee,
                  }))
                : [issue];
            })
        ),
      })),
    [issues, pendingStatuses, readOnly]
  );

  const handleDragStart = (event) => {
    if (readOnly) {
      return;
    }

    setActiveIssueId(String(event.active.id || ""));
  };

  const handleDragEnd = (event) => {
    if (readOnly) {
      setActiveIssueId("");
      return;
    }

    const issueId = String(event.active?.id || "");
    const nextStatus = String(event.over?.id || "");
    const currentIssue = issues.find((issue) => issue._id === issueId);

    setActiveIssueId("");

    if (!currentIssue || !nextStatus || typeof onStatusChange !== "function") {
      return;
    }

    if (getTaskBoardStatus(currentIssue) === nextStatus) {
      return;
    }

    setPendingStatuses((current) => ({
      ...current,
      [issueId]: nextStatus,
    }));

    Promise.resolve(onStatusChange(issueId, nextStatus)).catch(() => {
      // Query refetches keep the board authoritative if the status update fails.
    }).finally(() => {
      setPendingStatuses((current) => {
        const nextStatuses = {
          ...current,
        };
        delete nextStatuses[issueId];
        return nextStatuses;
      });
    });
  };

  const handleDragCancel = () => {
    setActiveIssueId("");
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
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {columns.map((column) => (
          <TaskKanbanColumn
            key={column.key}
            column={column}
            issues={column.items}
            activeIssueId={activeIssueId}
            updatingId={updatingId}
            onSelectIssue={onSelectIssue}
            readOnly={readOnly}
          />
        ))}
      </div>

      <DragOverlay dropAnimation={{ duration: 180, easing: "ease-out" }}>
        {activeIssue ? (
          <TaskCard
            issue={activeIssue}
            isOverlay
            onSelectIssue={onSelectIssue}
            readOnly={readOnly}
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};

export default TaskKanbanBoard;
