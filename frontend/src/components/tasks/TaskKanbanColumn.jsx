import { useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import TaskCard from "@/components/tasks/TaskCard";

const TaskKanbanColumn = ({
  column,
  issues = [],
  activeIssueId = "",
  updatingId = "",
  onSelectIssue,
}) => {
  const { isOver, setNodeRef } = useDroppable({
    id: column.key,
    data: {
      status: column.key,
    },
  });

  return (
    <section
      ref={setNodeRef}
      className={cn(
        "flex h-[500px] flex-col rounded-[16px] border bg-slate-50/80 p-3 transition duration-200 ease-out lg:h-[560px]",
        column.borderClassName,
        column.surfaceClassName,
        isOver && column.activeClassName
      )}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn("h-2.5 w-2.5 rounded-full", column.accentClassName)} />
            <h2 className="truncate text-sm font-semibold text-slate-950">{column.label}</h2>
          </div>
          <p className="mt-1 text-xs font-medium text-slate-500">{column.helper}</p>
        </div>

        <Badge className={cn("shrink-0 shadow-sm", column.badgeClassName)}>
          {issues.length}
        </Badge>
      </div>

      <div className="dashboard-scrollbar flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
        {issues.length ? (
          issues.map((issue) => (
            <TaskCard
              key={issue._id}
              issue={issue}
              isUpdating={updatingId === issue._id}
              onSelectIssue={onSelectIssue}
            />
          ))
        ) : (
          <div
            className={cn(
              "flex min-h-[150px] flex-1 items-center justify-center rounded-[16px] border border-dashed border-slate-200 bg-white/72 px-4 py-8 text-center text-sm font-medium text-slate-500 transition",
              isOver && "border-slate-300 bg-white text-slate-700"
            )}
          >
            {isOver ? `Move task to ${column.label}` : `No ${column.countLabel} tasks`}
          </div>
        )}

        {activeIssueId && !issues.length ? null : (
          <div
            className={cn(
              "min-h-1 rounded-full transition",
              isOver && "bg-slate-300/80"
            )}
          />
        )}
      </div>
    </section>
  );
};

export default TaskKanbanColumn;
