import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Select from "react-select";
import {
  ArrowLeft,
  CalendarDays,
  Plus,
  ShieldCheck,
  Trash2,
  Users2,
} from "lucide-react";
import { Link, useParams } from "react-router-dom";
import {
  addTeamMember,
  fetchTeam,
  fetchWorkspaceUsers,
  removeTeamMember,
} from "@/lib/api";
import {
  buildMemberOption,
  formatMemberOptionLabel,
  memberSelectStyles,
} from "@/components/projects/memberSelectTheme";
import TeamMemberStack from "@/components/teams/TeamMemberStack";
import EmptyState from "@/components/shared/EmptyState";
import UserAvatar from "@/components/shared/UserAvatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { formatDate } from "@/lib/utils";
import { getWorkspaceScope } from "@/lib/workspace";

const filterMemberOption = (option, inputValue = "") => {
  const term = String(inputValue).trim().toLowerCase();

  if (!term) {
    return true;
  }

  return [option.label, option.data?.email, option.data?.role]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(term));
};

const TeamDetailsPage = () => {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const workspaceScope = getWorkspaceScope(user);
  const [selectedUserId, setSelectedUserId] = useState("");

  const {
    data: team,
    isLoading: isTeamLoading,
    error: teamError,
  } = useQuery({
    queryKey: ["teams", "detail", id],
    queryFn: () => fetchTeam(id),
    enabled: Boolean(id),
  });

  const {
    data: workspaceUsers = [],
    isLoading: isUsersLoading,
    error: usersError,
  } = useQuery({
    queryKey: ["workspace-users", workspaceScope],
    queryFn: () => fetchWorkspaceUsers(workspaceScope),
  });

  const addMemberMutation = useMutation({
    mutationFn: addTeamMember,
    onSuccess: () => {
      setSelectedUserId("");
      queryClient.invalidateQueries({ queryKey: ["teams"] });
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: removeTeamMember,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teams"] });
    },
  });

  const availableUsers = useMemo(() => {
    const memberIdSet = new Set((team?.members || []).map((member) => String(member._id)));

    return [...workspaceUsers]
      .filter((workspaceUser) => !memberIdSet.has(String(workspaceUser._id)))
      .sort((left, right) => (left.name || "").localeCompare(right.name || ""));
  }, [team?.members, workspaceUsers]);
  const availableUserOptions = useMemo(
    () => availableUsers.map(buildMemberOption),
    [availableUsers]
  );
  const selectedUserOption = useMemo(
    () => availableUserOptions.find((option) => option.value === selectedUserId) || null,
    [availableUserOptions, selectedUserId]
  );

  if (teamError) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-rose-700">
          {teamError.response?.data?.message || "Unable to load this team."}
        </CardContent>
      </Card>
    );
  }

  if (isTeamLoading || !team) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-[220px] w-full rounded-[32px]" />
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_380px]">
          <Skeleton className="h-[520px] w-full rounded-[32px]" />
          <Skeleton className="h-[420px] w-full rounded-[32px]" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="outline">
          <Link to="/projects">
            <ArrowLeft className="h-4 w-4" />
            Back to Projects & Teams
          </Link>
        </Button>

        <Badge className="border border-emerald-100 bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
          Workspace Teams
        </Badge>
      </div>

      <Card className="overflow-hidden border-white/60 bg-[linear-gradient(135deg,rgba(255,255,255,0.94),rgba(236,253,245,0.92),rgba(236,254,255,0.9))] shadow-[0_24px_70px_-36px_rgba(15,23,42,0.4)] backdrop-blur-xl">
        <CardContent className="relative p-6">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.18),transparent_32%),radial-gradient(circle_at_bottom_right,_rgba(14,165,233,0.16),transparent_28%)]" />
          <div className="relative space-y-5">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
              <div className="max-w-3xl">
                <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
                  {team.name}
                </h1>
                <p className="mt-3 text-sm leading-6 text-slate-600">
                  {team.description || "No description has been added for this team yet."}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-[24px] border border-white/70 bg-white/70 px-4 py-3 shadow-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                    Members
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-slate-950">
                    {team.memberCount || team.members?.length || 0}
                  </p>
                </div>
                <div className="rounded-[24px] border border-white/70 bg-white/70 px-4 py-3 shadow-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                    Created
                  </p>
                  <p className="mt-2 text-sm font-semibold text-slate-950">
                    {formatDate(team.createdAt)}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 rounded-[24px] border border-white/70 bg-white/75 px-4 py-4 shadow-sm">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <CalendarDays className="h-4 w-4 text-emerald-600" />
                  Team roster preview
                </div>
                <TeamMemberStack members={team.members || []} size="lg" />
              </div>

              <div className="rounded-[22px] border border-sky-100 bg-sky-50/85 px-4 py-3 text-sm text-sky-800">
                Only users from this workspace can be added or retained in the team.
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_380px]">
        <Card className="overflow-hidden border-white/60 bg-white/82 shadow-[0_24px_70px_-36px_rgba(15,23,42,0.32)] backdrop-blur-xl">
          <CardHeader className="border-b border-slate-200/80">
            <CardTitle>Team members</CardTitle>
            <CardDescription>
              Review the current roster and remove members when the team changes.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 p-6">
            {team.members?.length ? (
              team.members.map((member) => (
                <div
                  key={member._id}
                  className="flex flex-wrap items-center justify-between gap-4 rounded-[24px] border border-slate-200 bg-slate-50/85 p-4 shadow-sm"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <UserAvatar user={member} className="h-12 w-12 rounded-2xl" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-950">
                        {member.name}
                      </p>
                      <p className="truncate text-sm text-slate-600">{member.email}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <Badge variant={member.role === "Admin" ? "default" : "outline"}>
                      {member.role}
                    </Badge>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={
                        removeMemberMutation.isPending &&
                        removeMemberMutation.variables?.userId === member._id
                      }
                      onClick={() =>
                        removeMemberMutation.mutateAsync({
                          teamId: team._id,
                          userId: member._id,
                        })
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                      {removeMemberMutation.isPending &&
                      removeMemberMutation.variables?.userId === member._id
                        ? "Removing..."
                        : "Remove"}
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <EmptyState
                title="No members added yet"
                description="Add workspace users from the panel on the right to start building this roster."
                icon={<Users2 className="h-5 w-5" />}
              />
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-white/60 bg-white/82 shadow-[0_24px_70px_-36px_rgba(15,23,42,0.32)] backdrop-blur-xl">
          <CardHeader className="border-b border-slate-200/80">
            <CardTitle>Add member</CardTitle>
            <CardDescription>
              Only workspace users who are not already in this team can be selected.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 p-6">
            {usersError ? (
              <div className="rounded-[24px] border border-rose-200 bg-rose-50/80 p-4 text-sm text-rose-700">
                {usersError.response?.data?.message ||
                  "Unable to load workspace users for team membership changes."}
              </div>
            ) : null}

            <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                Available users
              </p>
              <p className="mt-2 text-3xl font-semibold text-slate-950">
                {isUsersLoading ? "..." : availableUsers.length}
              </p>
            </div>

            <div className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Workspace user</span>
              <Select
                isClearable
                options={availableUserOptions}
                value={selectedUserOption}
                styles={memberSelectStyles}
                filterOption={filterMemberOption}
                formatOptionLabel={formatMemberOptionLabel}
                isDisabled={isUsersLoading || !availableUserOptions.length || Boolean(usersError)}
                onChange={(option) => setSelectedUserId(option?.value || "")}
                placeholder={
                  availableUserOptions.length
                    ? "Search workspace users..."
                    : "No workspace users available to add"
                }
                noOptionsMessage={({ inputValue }) =>
                  inputValue
                    ? "No users match that search."
                    : "No workspace users available to add."
                }
              />
            </div>

            {!availableUsers.length && !isUsersLoading && !usersError ? (
              <div className="rounded-[24px] border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-800">
                All workspace users are already part of this team.
              </div>
            ) : null}

            {addMemberMutation.isError ? (
              <div className="rounded-[24px] border border-rose-200 bg-rose-50/80 p-4 text-sm text-rose-700">
                {addMemberMutation.error?.response?.data?.message ||
                  "Unable to add this member right now."}
              </div>
            ) : null}

            {removeMemberMutation.isError ? (
              <div className="rounded-[24px] border border-rose-200 bg-rose-50/80 p-4 text-sm text-rose-700">
                {removeMemberMutation.error?.response?.data?.message ||
                  "Unable to remove this member right now."}
              </div>
            ) : null}

            <Button
              className="w-full"
              type="button"
              disabled={!selectedUserId || addMemberMutation.isPending || !availableUsers.length}
              onClick={() =>
                addMemberMutation.mutateAsync({
                  teamId: team._id,
                  userId: selectedUserId,
                })
              }
            >
              <Plus className="h-4 w-4" />
              {addMemberMutation.isPending ? "Adding member..." : "Add Member"}
            </Button>

            <div className="rounded-[24px] border border-emerald-100 bg-emerald-50/80 p-4 text-sm text-emerald-800">
              <div className="flex items-start gap-2">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  Membership changes are validated against the active workspace before
                  they are saved.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
};

export default TeamDetailsPage;
