import { cn } from "@/lib/utils";
import { usePresence } from "@/context/PresenceContext";

const statusClassName = {
  active: "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]",
  idle: "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]",
  offline: "bg-slate-400 dark:bg-slate-500",
  "in-call": "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]",
  "in-group-call": "bg-violet-500 shadow-[0_0_8px_rgba(139,92,246,0.6)]",
  ringing: "bg-sky-500 animate-pulse shadow-[0_0_8px_rgba(14,165,233,0.6)]",
};

const statusLabel = {
  active: "Online",
  idle: "Idle",
  offline: "Offline",
  "in-call": "In Call",
  "in-group-call": "In Group Call",
  ringing: "Ringing",
};

const StatusIndicator = ({
  userId,
  className = "",
  showLabel = false,
  status: statusOverride = "",
}) => {
  const { getPresence } = usePresence();
  const presence = userId ? getPresence(userId) : null;
  const status = statusOverride || presence?.status || "offline";

  return (
    <span className={cn("inline-flex items-center gap-1.5", className)} title={statusLabel[status] || "Offline"}>
      <span
        className={cn(
          "inline-flex h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white dark:ring-slate-900",
          statusClassName[status] || statusClassName.offline
        )}
      />
      {showLabel ? (
        <span
          className={cn(
            "text-xs font-semibold",
            status === "active"
              ? "text-emerald-600 dark:text-emerald-400"
              : status === "idle"
              ? "text-amber-600 dark:text-amber-400"
              : "text-slate-600 dark:text-slate-400"
          )}
        >
          {statusLabel[status] || "Offline"}
        </span>
      ) : null}
    </span>
  );
};

export default StatusIndicator;
