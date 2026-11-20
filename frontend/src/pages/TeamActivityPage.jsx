import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, RefreshCw, Search, Users2 } from "lucide-react";
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

const getPageItems = (currentPage, totalPages) => {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const items = [1];
  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);

  if (start > 2) items.push("start-ellipsis");
  for (let pageNumber = start; pageNumber <= end; pageNumber += 1) {
    items.push(pageNumber);
  }
  if (end < totalPages - 1) items.push("end-ellipsis");
  items.push(totalPages);

  return items;
};

const TeamActivityPage = () => {
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [searchInput]);

  const {
    data,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey: [
      "team-activity",
      "today",
      page,
      pageSize,
      selectedStatus,
      search,
    ],
    queryFn: () =>
      fetchTeamActivity({
        range: "today",
        page,
        limit: pageSize,
        status: selectedStatus,
        search,
      }),
    refetchInterval: 60 * 1000,
  });
  const users = useMemo(() => (Array.isArray(data?.users) ? data.users : []), [data]);
  const summary = data?.summary || { active: 0, idle: 0, offline: 0 };
  const totalUsers = data?.totalUsers ?? users.length;
  const totalPages = data?.totalPages ?? 0;
  const currentPage = data?.currentPage ?? page;
  const workspaceUserCount =
    summary.active + summary.idle + summary.offline;
  const pageItems = useMemo(
    () => getPageItems(currentPage, totalPages),
    [currentPage, totalPages]
  );

  const handleCardClick = (status) => {
    setSelectedStatus((current) => (current === status ? "all" : status));
    setPage(1);
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
              <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50/60 px-2.5 py-1 text-[10px] font-bold uppercase text-blue-700">
                <Activity className="h-3.5 w-3.5" />
                Team Activity
              </div>
              <h1 className="mt-2 text-xl font-bold text-slate-950">Presence Overview</h1>
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
                      : cn("border-white/60 bg-white/55", meta.hoverCardClass)
                  )}
                  aria-pressed={isSelected}
                  title={`Filter by ${meta.label} members`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                      <span className={cn("h-2.5 w-2.5 rounded-full", meta.dotClassName)} />
                      {meta.label}
                    </div>
                    {isSelected && (
                      <span className="rounded-full bg-white/80 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-600 shadow-xs">
                        Filtered
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-2xl font-bold text-slate-950">
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
            <Users2 className="h-4 w-4 text-blue-600" />
            Users
          </CardTitle>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {selectedStatus !== "all" && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-slate-500 hover:text-slate-900"
                onClick={() => {
                  setSelectedStatus("all");
                  setPage(1);
                }}
              >
                Clear filter
              </Button>
            )}
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                aria-label="Search users"
                className="h-9 w-44 rounded-md border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-500/15 sm:w-56"
                placeholder="Search users"
                type="search"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
              />
            </label>
            <Badge variant="outline">
              {selectedStatus !== "all" || search
                ? `${totalUsers} of ${workspaceUserCount} members`
                : `${totalUsers} members`}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {error ? (
            <div className="p-4 text-sm text-rose-700">
              {error.response?.data?.message || "Unable to load team activity."}
            </div>
          ) : users.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-y border-slate-200/70 bg-slate-50/70 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-bold">User Name</th>
                    <th className="px-4 py-3 font-bold">Role</th>
                    <th className="px-4 py-3 font-bold">Status</th>
                    <th className="px-4 py-3 font-bold">Last Active Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {users.map((row) => {
                    const user = row.user || {};
                    const status = row.status || "offline";
                    const meta = statusMeta[status] || statusMeta.offline;

                    return (
                      <tr key={user._id} className="bg-white/35">
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-900">
                            {user.name || user.email || "Unknown user"}
                          </div>
                          <div className="text-xs text-slate-500">{user.email}</div>
                        </td>
                        <td className="px-4 py-3 text-slate-700">{user.role || "Member"}</td>
                        <td className="px-4 py-3">
                          <Badge variant={meta.variant} className="gap-2">
                            <span className={cn("h-2 w-2 rounded-full", meta.dotClassName)} />
                            {meta.label}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-slate-700">
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
              {selectedStatus !== "all" || search ? (
                <div className="space-y-3">
                  <p>
                    No users found
                    {selectedStatus !== "all" ? ` with ${selectedStatus} status` : ""}
                    {search ? ` matching "${search}"` : ""}.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelectedStatus("all");
                      setSearch("");
                      setSearchInput("");
                      setPage(1);
                    }}
                  >
                    Clear filters
                  </Button>
                </div>
              ) : (
                "No users found for this workspace."
              )}
            </div>
          )}
          {!error ? (
            <div className="flex flex-col gap-3 border-t border-slate-200/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                <span>
                  Showing{" "}
                  {totalUsers
                    ? `${(currentPage - 1) * pageSize + 1}-${Math.min(
                        currentPage * pageSize,
                        totalUsers
                      )} of ${totalUsers}`
                    : "0 users"}
                </span>
                <label className="flex items-center gap-2">
                  Users per page
                  <select
                    aria-label="Users per page"
                    className="h-8 rounded-md border border-slate-200 bg-white px-2 text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/15"
                    value={pageSize}
                    onChange={(event) => {
                      setPageSize(Number(event.target.value));
                      setPage(1);
                    }}
                  >
                    {[5, 10, 50, 100].map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <nav
                aria-label="Users pagination"
                className="flex flex-wrap items-center gap-1"
              >
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={currentPage <= 1 || isFetching}
                  onClick={() => setPage(currentPage - 1)}
                >
                  Previous
                </Button>
                {pageItems.map((item) =>
                  typeof item === "number" ? (
                    <Button
                      key={item}
                      type="button"
                      variant={item === currentPage ? "default" : "outline"}
                      size="sm"
                      aria-current={item === currentPage ? "page" : undefined}
                      aria-label={`Page ${item}`}
                      disabled={isFetching}
                      onClick={() => setPage(item)}
                    >
                      {item}
                    </Button>
                  ) : (
                    <span
                      key={item}
                      aria-hidden="true"
                      className="px-1 text-slate-400"
                    >
                      …
                    </span>
                  )
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= totalPages || isFetching}
                  onClick={() => setPage(currentPage + 1)}
                >
                  Next
                </Button>
              </nav>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
};

export default TeamActivityPage;
