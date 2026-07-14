import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CheckCircle2, TrendingDown, TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const WEEKLY_TASK_COMPLETION_DATA = [
  { day: "Mon", completed: 42 },
  { day: "Tue", completed: 55 },
  { day: "Wed", completed: 61 },
  { day: "Thu", completed: 48 },
  { day: "Fri", completed: 74 },
  { day: "Sat", completed: 36 },
  { day: "Sun", completed: 18 },
];

const chartSummary = WEEKLY_TASK_COMPLETION_DATA.reduce(
  (summary, row) => {
    const completed = Number(row.completed || 0);

    return {
      total: summary.total + completed,
      highest: completed > summary.highest.completed ? row : summary.highest,
      lowest: completed < summary.lowest.completed ? row : summary.lowest,
    };
  },
  {
    total: 0,
    highest: { day: "", completed: -Infinity },
    lowest: { day: "", completed: Infinity },
  }
);

const SUMMARY_CARDS = [
  {
    label: "Total Completed",
    value: chartSummary.total,
    helper: "last 7 days",
    icon: CheckCircle2,
    className: "border-emerald-100 bg-emerald-50/80 text-emerald-700 dark:border-emerald-400/15 dark:bg-emerald-950/30 dark:text-emerald-200",
  },
  {
    label: "Highest Day",
    value: `${chartSummary.highest.day} ${chartSummary.highest.completed}`,
    helper: "completed",
    icon: TrendingUp,
    className: "border-blue-100 bg-blue-50/80 text-blue-700 dark:border-blue-400/15 dark:bg-blue-950/30 dark:text-blue-200",
  },
  {
    label: "Lowest Day",
    value: `${chartSummary.lowest.day} ${chartSummary.lowest.completed}`,
    helper: "completed",
    icon: TrendingDown,
    className: "border-rose-100 bg-rose-50/80 text-rose-700 dark:border-rose-400/15 dark:bg-rose-950/30 dark:text-rose-200",
  },
];

const tooltipStyle = {
  background: "rgba(255,255,255,0.96)",
  border: "1px solid rgba(226,232,240,0.9)",
  borderRadius: 12,
  boxShadow: "0 18px 42px -30px rgba(15,23,42,0.42)",
  color: "#0f172a",
};

const WeeklyTaskCompletionTrend = ({ className }) => (
  <Card
    className={cn(
      "h-full min-h-[380px] overflow-hidden rounded-[16px] border border-white/55 bg-white/70 p-0 shadow-sm backdrop-blur-2xl transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:border-white/10 dark:bg-slate-950/62 dark:text-slate-100",
      className
    )}
  >
    <CardContent className="flex h-full flex-col p-5">
      <div>
        <h2 className="text-base font-semibold text-slate-950 dark:text-slate-100">
          Weekly Task Completion Trend
        </h2>
        <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-400">
          Completed tasks during the last 7 days
        </p>
      </div>

      <div className="mt-4 min-h-[170px] flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={WEEKLY_TASK_COMPLETION_DATA}
            margin={{ top: 8, right: 10, bottom: 0, left: -18 }}
          >
            <defs>
              <linearGradient id="weeklyTaskCompletionLine" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#38bdf8" />
                <stop offset="55%" stopColor="#2563eb" />
                <stop offset="100%" stopColor="#1d4ed8" />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(148,163,184,0.22)" strokeDasharray="4 4" />
            <XAxis
              dataKey="day"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#64748b", fontSize: 12, fontWeight: 600 }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
              tick={{ fill: "#94a3b8", fontSize: 11, fontWeight: 600 }}
            />
            <Tooltip
              cursor={{ stroke: "rgba(37,99,235,0.18)", strokeWidth: 2 }}
              contentStyle={tooltipStyle}
              formatter={(value) => [`${value} tasks`, "Completed"]}
              labelFormatter={(label) => `${label}`}
            />
            <Line
              type="monotone"
              dataKey="completed"
              stroke="url(#weeklyTaskCompletionLine)"
              strokeWidth={3}
              dot={{ r: 4, strokeWidth: 2, stroke: "#2563eb", fill: "#fff" }}
              activeDot={{ r: 6, strokeWidth: 3, stroke: "#bfdbfe", fill: "#2563eb" }}
              isAnimationActive
              animationDuration={900}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {SUMMARY_CARDS.map((item) => {
          const Icon = item.icon;

          return (
            <div
              key={item.label}
              className={cn("rounded-[16px] border p-3 shadow-sm", item.className)}
            >
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/72 shadow-sm dark:bg-white/10">
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[10px] font-bold uppercase tracking-wide opacity-70">
                    {item.label}
                  </p>
                  <p className="truncate text-lg font-black leading-tight text-slate-950 dark:text-slate-100">
                    {item.value}
                  </p>
                </div>
              </div>
              <p className="mt-2 text-xs font-semibold opacity-70">{item.helper}</p>
            </div>
          );
        })}
      </div>
    </CardContent>
  </Card>
);

export default WeeklyTaskCompletionTrend;
