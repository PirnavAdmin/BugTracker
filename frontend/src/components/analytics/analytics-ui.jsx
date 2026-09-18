import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export const ANALYTICS_PANEL_CLASS =
  "overflow-hidden rounded-[16px] border border-white/55 bg-white/60 shadow-sm backdrop-blur-2xl dark:border-white/10 dark:bg-slate-950/62 dark:text-slate-100";

export const ANALYTICS_SUBPANEL_CLASS =
  "rounded-[16px] border border-white/55 bg-white/54 shadow-sm backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:border-white/10 dark:bg-slate-900/58";

export const ANALYTICS_FIELD_CLASS =
  "h-11 rounded-2xl border-white/60 bg-white/78 text-slate-800 shadow-[0_16px_30px_-24px_rgba(15,23,42,0.3)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/60 dark:text-slate-100";

export const ANALYTICS_SELECT_CLASS =
  "h-11 w-full rounded-2xl border border-white/60 bg-white/78 px-4 text-sm font-semibold text-slate-700 shadow-[0_16px_30px_-24px_rgba(15,23,42,0.3)] outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-500/25 dark:border-white/10 dark:bg-slate-950/60 dark:text-slate-100";

export const CHART_GRID_COLOR = "rgba(148, 163, 184, 0.24)";

export const chartTooltipStyle = {
  background: "rgba(255,255,255,0.94)",
  border: "1px solid rgba(226,232,240,0.9)",
  borderRadius: 16,
  boxShadow: "0 18px 48px -30px rgba(15,23,42,0.38)",
  color: "#0f172a",
};

const toneClasses = {
  blue: "border-blue-100 bg-blue-50 text-blue-900 dark:bg-blue-950/30 dark:text-blue-100",
  amber: "border-amber-100 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-100",
  emerald: "border-emerald-100 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100",
  rose: "border-rose-100 bg-rose-50 text-rose-900 dark:bg-rose-950/30 dark:text-rose-100",
  violet: "border-violet-100 bg-violet-50 text-violet-900 dark:bg-violet-950/30 dark:text-violet-100",
  cyan: "border-cyan-100 bg-cyan-50 text-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-100",
};

export const formatCompactNumber = (value) =>
  new Intl.NumberFormat("en-US", {
    notation: Number(value || 0) >= 1000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value || 0);

export const formatDuration = (milliseconds) => {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) {
    return "--";
  }

  const days = milliseconds / (24 * 60 * 60 * 1000);

  if (days >= 1) {
    return `${days.toFixed(days >= 10 ? 0 : 1)}d`;
  }

  const hours = milliseconds / (60 * 60 * 1000);

  if (hours >= 1) {
    return `${hours.toFixed(hours >= 10 ? 0 : 1)}h`;
  }

  return `${Math.max(Math.round(milliseconds / (60 * 1000)), 1)}m`;
};

export const AnalyticsPanel = ({ title, description, action, children, className }) => (
  <Card className={cn(ANALYTICS_PANEL_CLASS, className)}>
    {(title || description || action) ? (
      <div className="flex flex-col gap-3 border-b border-white/45 p-4 sm:flex-row sm:items-start sm:justify-between dark:border-white/10">
        <div>
          {title ? (
            <h2 className="text-base font-semibold text-slate-950 dark:text-slate-100">
              {title}
            </h2>
          ) : null}
          {description ? (
            <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-400">
              {description}
            </p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    ) : null}
    <CardContent className="p-4">{children}</CardContent>
  </Card>
);

export const AnalyticsKpiCard = ({
  className,
  compact = false,
  helper,
  icon: Icon,
  onClick,
  title,
  tone = "blue",
  trend,
  value,
}) => {
  const TrendIcon =
    trend?.direction === "up"
      ? ArrowUpRight
      : trend?.direction === "down"
        ? ArrowDownRight
        : Minus;
  const isInteractive = typeof onClick === "function";

  if (compact) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "flex items-center justify-between gap-4 rounded-xl border p-3 transition-all duration-200 hover:bg-white/50",
          toneClasses[tone] || toneClasses.blue,
          className
        )}
      >
        <div className="min-w-0 text-left">
          <p className="text-[10px] font-bold uppercase tracking-wider opacity-70">{title}</p>
          <p className="text-lg font-bold">{value}</p>
        </div>
        {Icon ? (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/20 backdrop-blur-sm">
            <Icon className="h-4 w-4" />
          </span>
        ) : null}
      </button>
    );
  }

  return (
    <Card
      className={cn(
        "group relative overflow-hidden rounded-[16px] border backdrop-blur-xl transition-all duration-200 hover:-translate-y-1 shadow-sm",
        toneClasses[tone] || toneClasses.blue,
        isInteractive ? "cursor-pointer" : "",
        className
      )}
      onClick={onClick}
      onKeyDown={(event) => {
        if (!isInteractive) {
          return;
        }

        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      }}
      role={isInteractive ? "button" : undefined}
      tabIndex={isInteractive ? 0 : undefined}
    >
      <CardContent className="relative p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wider opacity-70">{title}</p>
            <p className="mt-1 break-words text-2xl font-bold">
              {value}
            </p>
          </div>
          {Icon ? (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-white/20 shadow-sm backdrop-blur-xl transition-all duration-200 group-hover:scale-[1.03]">
              <Icon className="h-4 w-4" />
            </span>
          ) : null}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          {trend ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold backdrop-blur-xl">
              <TrendIcon className="h-3 w-3" />
              {trend.label}
            </span>
          ) : null}
          {helper ? (
            <span className="text-[9px] font-bold uppercase tracking-tighter opacity-60">
              {helper}
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
};

export const AnalyticsEmptyState = ({
  className,
  compact = false,
  description,
  icon: Icon,
  title,
}) => (
  <div
    className={cn(
      "flex items-center justify-center rounded-[16px] border border-dashed border-white/65 bg-white/34 text-center backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/34",
      compact ? "min-h-[76px] px-4 py-3" : "min-h-[220px] px-6 py-10",
      className
    )}
  >
    <div className={cn("max-w-sm", compact && "flex max-w-none items-center gap-3 text-left")}>
      {Icon ? (
        <span className={cn(
          "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/60 bg-white/74 text-slate-600 shadow-sm dark:border-white/10 dark:bg-slate-900 dark:text-slate-300",
          compact ? "h-9 w-9 rounded-xl" : "mx-auto"
        )}>
          <Icon className="h-5 w-5" />
        </span>
      ) : null}
      <div>
        <p className={cn("text-sm font-semibold text-slate-950 dark:text-slate-100", !compact && "mt-4")}>
          {title}
        </p>
        <p className={cn("text-sm leading-6 text-slate-500 dark:text-slate-400", compact ? "mt-0 text-xs leading-5" : "mt-2")}>
          {description}
        </p>
      </div>
    </div>
  </div>
);

export const AnalyticsSkeletonGrid = ({ count = 6, className }) => (
  <div className={cn("grid gap-4 md:grid-cols-2 xl:grid-cols-6", className)}>
    {Array.from({ length: count }).map((_, index) => (
      <Skeleton
        className="h-[150px] rounded-[16px] bg-gradient-to-r from-slate-200/70 via-white/80 to-slate-200/70"
        key={`analytics-skeleton-${index}`}
      />
    ))}
  </div>
);
