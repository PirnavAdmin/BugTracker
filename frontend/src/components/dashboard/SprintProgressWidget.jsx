import { Link } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { MY_SPRINT_TASKS_PATH } from "@/lib/sprint-task-progress";

const SprintProgressWidget = ({ metrics, isLoading }) => {
  const percentage = metrics?.percentage || 0;
  const Container = !isLoading && metrics?.hasActiveSprint ? Link : "div";

  return (
    <Container
      to={!isLoading && metrics?.hasActiveSprint ? MY_SPRINT_TASKS_PATH : undefined}
      className="group flex min-h-20 min-w-0 w-full flex-1 flex-col justify-center rounded-[22px] border border-cyan-100/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.86),rgba(239,246,255,0.78),rgba(236,254,255,0.68))] px-4 py-2 shadow-[0_16px_34px_-26px_rgba(14,165,233,0.78)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 hover:border-cyan-200 hover:shadow-[0_18px_38px_-24px_rgba(14,165,233,0.9)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 focus-visible:ring-offset-2 sm:min-w-[280px] sm:max-w-[380px] dark:border-slate-800 dark:bg-slate-900/90 dark:bg-none dark:shadow-black/50"
      title="Task completion across your assigned tasks in active sprints."
    >
      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-3 w-28 rounded-full" />
          <Skeleton className="h-2 w-full rounded-full" />
          <Skeleton className="h-2.5 w-36 rounded-full" />
        </div>
      ) : metrics?.hasActiveSprint ? (
        <>
          <div className="mb-1 flex items-center justify-between gap-3">
            <p className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">My Sprint Task Progress</p>
            <span className="shrink-0 text-xs font-bold text-cyan-700 dark:text-cyan-400">{percentage}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-200/80 shadow-inner dark:bg-slate-800">
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,#2563EB_0%,#06B6D4_100%)] shadow-[0_0_16px_rgba(14,165,233,0.45)] transition-[width] duration-700 ease-out"
              style={{ width: `${percentage}%` }}
            />
          </div>
          <p className="mt-1 truncate text-[11px] font-medium text-slate-500 dark:text-slate-400">
            {metrics.completed} / {metrics.total} Tasks Completed
          </p>
        </>
      ) : (
        <>
          <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">My Sprint Task Progress</p>
          <p className="mt-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">No assigned tasks in active sprints</p>
          <Link className="mt-1 w-fit rounded text-xs font-semibold text-cyan-700 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 focus-visible:ring-offset-2 dark:text-cyan-400" to="/tasks">View My Tasks</Link>
        </>
      )}
    </Container>
  );
};

export default SprintProgressWidget;
