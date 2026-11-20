import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, RefreshCw, Users2 } from "lucide-react";
import { fetchTeamActivity } from "@/lib/api";
import { cn, formatDateTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const statusMeta = {
  active: {
    label: "Active",
    variant: "success",
    dotClassName: "bg-emerald-500",
    activeCardClass: "border-emerald-500/60 bg-emerald-50/70 shadow-sm ring-2 ring-emerald-500/20",
    hoverCardClass: "hover:border-emerald-300 hover:bg-emerald-50/30",
  },
  idle: {
    label: "Idle",
    variant: "warning",
    dotClassName: "bg-amber-500",
    activeCardClass: "border-amber-500/60 bg-amber-50/70 shadow-sm ring-2 ring-amber-500/20",
    hoverCardClass: "hover:border-amber-300 hover:bg-amber-50/30",
  },
  offline: {
    label: "Offline",
    variant: "secondary",
    dotClassName: "bg-slate-400",
    activeCardClass: "border-slate-500/60 bg-slate-100/80 shadow-sm ring-2 ring-slate-400/20",
    hoverCardClass: "hover:border-slate-300 hover:bg-slate-100/40",
  },
};

const TeamActivityPage = () => {
  const [selectedStatus, setSelectedStatus] = useState("all");
  const {
    data,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey: ["team-activity", "today"],
    queryFn: () => fetchTeamActivity({ range: "today" }),
    refetchInterval: 60 * 1000,
  });
  const users = useMemo(() => (Array.isArray(data?.users) ? data.users : []), [data]);
  const summary = data?.summary || { active: 0, idle: 0, offline: 0 };

  const filteredUsers = useMemo(() => {
    if (selectedStatus === "all") {
      return users;
    }
    return users.filter((row) => (row.status || "offline") === selectedStatus);
  }, [users, selectedStatus]);

  const handleCardClick = (status) => {
    setSelectedStatus((current) => (current === status ? "all" : status));
  };

  if (isLoading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-[420px] w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Card className="rounded-xl border-white/60 bg-white/45 shadow-sm backdrop-blur-2xl">
        <CardContent className="p-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50/60 px-2.5 py-1 text-[10px] font-bold uppercase text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-400">
                <Activity className="h-3.5 w-3.5" />
                Team Activity
              </div>
              <h1 className="mt-2 text-xl font-bold text-slate-950 dark:text-slate-100">Presence Overview</h1>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
              Refresh
            </Button>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {["active", "idle", "offline"].map((status) => {
              const meta = statusMeta[status];
              const isSelected = selectedStatus === status;

              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => handleCardClick(status)}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-left transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/20",
                    isSelected
                      ? meta.activeCardClass
                      : cn("border-white/60 bg-white/55 dark:border-slate-800 dark:bg-slate-900/60", meta.hoverCardClass)
                  )}
                  aria-pressed={isSelected}
                  title={`Filter by ${meta.label} members`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                      <span className={cn("h-2.5 w-2.5 rounded-full", meta.dotClassName)} />
                      {meta.label}
                    </div>
                    {isSelected && (
                      <span className="rounded-full bg-white/80 dark:bg-slate-800 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 shadow-xs">
                        Filtered
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-2xl font-bold text-slate-950 dark:text-slate-100">
                    {summary[status] || 0}
                  </p>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-xl border-white/60 bg-white/45 shadow-sm backdrop-blur-2xl">
        <CardHeader className="flex-row items-center justify-between gap-3 p-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            Users
          </CardTitle>
          <div className="flex items-center gap-2">
            {selectedStatus !== "all" && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                onClick={() => setSelectedStatus("all")}
              >
                Clear filter
              </Button>
            )}
            <Badge variant="outline">
              {selectedStatus !== "all"
                ? `${filteredUsers.length} of ${users.length} members`
                : `${users.length} members`}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {error ? (
            <div className="p-4 text-sm text-rose-700 dark:text-rose-400">
              {error.response?.data?.message || "Unable to load team activity."}
            </div>
          ) : filteredUsers.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-y border-slate-200/70 bg-slate-50/70 text-xs uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-900/90 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-3 font-bold">User Name</th>
                    <th className="px-4 py-3 font-bold">Role</th>
                    <th className="px-4 py-3 font-bold">Status</th>
                    <th className="px-4 py-3 font-bold">Last Active Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredUsers.map((row) => {
                    const user = row.user || {};
                    const status = row.status || "offline";
                    const meta = statusMeta[status] || statusMeta.offline;

                    return (
                      <tr key={user._id} className="bg-white/35 dark:bg-slate-900/40 hover:bg-slate-50/60 dark:hover:bg-slate-800/50 transition">
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-900 dark:text-slate-100">
                            {user.name || user.email || "Unknown user"}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">{user.email}</div>
                        </td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{user.role || "Member"}</td>
                        <td className="px-4 py-3">
                          <Badge variant={meta.variant} className="gap-2">
                            <span className={cn("h-2 w-2 rounded-full", meta.dotClassName)} />
                            {meta.label}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                          {row.lastSeen ? formatDateTime(row.lastSeen) : "No activity yet"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8 text-center text-sm text-slate-500">
              {selectedStatus !== "all" ? (
                <div className="space-y-3">
                  <p>No {selectedStatus} members found.</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedStatus("all")}
                  >
                    Show all members
                  </Button>
                </div>
              ) : (
                "No users found for this workspace."
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default TeamActivityPage;
