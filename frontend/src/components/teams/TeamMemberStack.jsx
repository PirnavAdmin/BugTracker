import UserAvatar from "@/components/shared/UserAvatar";
import StatusIndicator from "@/components/presence/StatusIndicator";
import { cn } from "@/lib/utils";

const sizeClasses = {
  sm: "h-7 w-7 text-[10px]",
  md: "h-10 w-10 text-xs",
  lg: "h-12 w-12 text-sm",
};

const overflowSizeClasses = {
  sm: "h-7 min-w-7 text-[10px]",
  md: "h-8 min-w-8 text-xs",
  lg: "h-9 min-w-9 text-sm",
};

const TeamMemberStack = ({
  members = [],
  max = 4,
  size = "md",
  className,
}) => {
  const visibleMembers = members.slice(0, max);
  const overflowCount = Math.max(members.length - visibleMembers.length, 0);

  if (!members.length) {
    return (
      <div
        className={cn(
          "inline-flex items-center rounded-full border border-dashed border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-500",
          className
        )}
      >
        No members yet
      </div>
    );
  }

  return (
    <div className={cn("flex items-center", className)}>
      <div className="flex items-center">
        {visibleMembers.map((member, index) => (
          <span
            key={member._id}
            className={cn("relative", index === 0 ? "" : "-ml-3")}
          >
            <UserAvatar
              user={member}
              className={cn(
                "rounded-2xl border-2 border-white bg-gradient-to-br from-sky-100 to-cyan-100 text-slate-700 shadow-sm",
                sizeClasses[size] || sizeClasses.md
              )}
            />
            <StatusIndicator userId={member._id} className="absolute -bottom-0.5 -right-0.5" />
          </span>
        ))}
      </div>

      {overflowCount ? (
        <span
          className={cn(
            "ml-1.5 inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-2 font-semibold text-slate-600 shadow-sm",
            overflowSizeClasses[size] || overflowSizeClasses.md
          )}
        >
          +{overflowCount}
        </span>
      ) : null}
    </div>
  );
};

export default TeamMemberStack;
