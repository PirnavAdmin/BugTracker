import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Users2, UserRoundPlus } from "lucide-react";
import { Link } from "react-router-dom";
import { fetchTeams } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { getWorkspaceScope } from "@/lib/workspace";
import TeamCard from "@/components/teams/TeamCard";
import EmptyState from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const TeamsPage = () => {
  const { user } = useAuth();
  const workspaceScope = getWorkspaceScope(user);

  const {
    data: teams = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["teams", workspaceScope],
    queryFn: () => fetchTeams(workspaceScope),
  });

  const stats = useMemo(() => {
    const emptyTeams = teams.filter((team) => !(team.memberCount || team.members?.length)).length;
    const totalMembersAssigned = teams.reduce(
      (total, team) => total + (team.memberCount || team.members?.length || 0),
      0
    );

    return {
      totalTeams: teams.length,
      emptyTeams,
      totalMembersAssigned,
    };
  }, [teams]);

  if (error) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-rose-700">
          {error.response?.data?.message || "Unable to load teams right now."}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border-white/60 bg-[linear-gradient(135deg,rgba(255,255,255,0.94),rgba(236,253,245,0.92),rgba(236,254,255,0.9))] shadow-[0_24px_70px_-36px_rgba(15,23,42,0.42)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 dark:bg-none dark:shadow-black/50">
        <CardContent className="relative p-5">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.18),transparent_32%),radial-gradient(circle_at_bottom_right,_rgba(14,165,233,0.16),transparent_30%)] dark:hidden" />
          <div className="relative flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200/80 bg-white/80 px-3 py-1 text-[11px] uppercase tracking-[0.28em] text-emerald-700 shadow-sm dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300">
                <Users2 className="h-3.5 w-3.5" />
                Workspace Teams
              </div>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 dark:text-slate-100">
                Keep workspace teams organized
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-400">
                Create delivery squads, QA groups, or cross-functional pods using
                members from the current workspace only.
              </p>
            </div>

            <Button asChild>
              <Link to="/teams/create">
                <Plus className="h-4 w-4" />
                Create Team
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <section className="grid gap-4 md:grid-cols-3">
        {isLoading ? (
          <>
            <Skeleton className="h-28 w-full rounded-[28px]" />
            <Skeleton className="h-28 w-full rounded-[28px]" />
            <Skeleton className="h-28 w-full rounded-[28px]" />
          </>
        ) : (
          <>
            <Card className="stats-tile">
              <CardContent className="p-5">
                <div className="flex items-center gap-3 text-slate-600">
                  <Users2 className="h-5 w-5 text-emerald-600" />
                  <span>Total teams</span>
                </div>
                <p className="mt-4 text-4xl font-semibold text-slate-950">
                  {stats.totalTeams}
                </p>
              </CardContent>
            </Card>

            <Card className="stats-tile">
              <CardContent className="p-5">
                <div className="flex items-center gap-3 text-slate-600">
                  <UserRoundPlus className="h-5 w-5 text-sky-600" />
                  <span>Members assigned</span>
                </div>
                <p className="mt-4 text-4xl font-semibold text-slate-950">
                  {stats.totalMembersAssigned}
                </p>
              </CardContent>
            </Card>

            <Card className="stats-tile">
              <CardContent className="p-5">
                <div className="flex items-center gap-3 text-slate-600">
                  <Users2 className="h-5 w-5 text-amber-600" />
                  <span>Empty teams</span>
                </div>
                <p className="mt-4 text-4xl font-semibold text-slate-950">
                  {stats.emptyTeams}
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </section>

      <section className="grid gap-5 xl:grid-cols-2 2xl:grid-cols-3">
        {isLoading ? (
          <>
            <Skeleton className="h-[290px] w-full rounded-[32px]" />
            <Skeleton className="h-[290px] w-full rounded-[32px]" />
            <Skeleton className="h-[290px] w-full rounded-[32px]" />
          </>
        ) : teams.length ? (
          teams.map((team) => <TeamCard key={team._id} team={team} />)
        ) : (
          <div className="xl:col-span-2 2xl:col-span-3">
            <EmptyState
              title="No teams yet. Create your first team."
              description="Build workspace-specific teams to keep ownership, planning, and delivery clearer across the dashboard."
              icon={<Users2 className="h-5 w-5" />}
              action={
                <Button asChild>
                  <Link to="/teams/create">
                    <Plus className="h-4 w-4" />
                    Create Team
                  </Link>
                </Button>
              }
            />
          </div>
        )}
      </section>
    </div>
  );
};

export default TeamsPage;
