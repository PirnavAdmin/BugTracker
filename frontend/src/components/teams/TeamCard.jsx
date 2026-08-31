import { useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, CalendarDays, LoaderCircle, Trash2, Users2 } from "lucide-react";
import { Link } from "react-router-dom";
import TeamMemberStack from "@/components/teams/TeamMemberStack";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDate } from "@/lib/utils";

const TeamCard = ({ canManageTeam = false, isDeleting = false, onDeleteTeam, team }) => {
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    setDeleteError("");
    setIsDeleteDialogOpen(false);
  }, [team?._id]);

  const handleDeleteTeam = async () => {
    try {
      setDeleteError("");
      await onDeleteTeam?.(team._id);
      setIsDeleteDialogOpen(false);
    } catch (error) {
      setDeleteError(
        error.response?.data?.message || "Unable to delete this team right now."
      );
    }
  };

  return (
  <>
  <Card className="team-card group overflow-hidden border-white/70 bg-white/86 shadow-[0_18px_48px_-32px_rgba(15,23,42,0.34)] backdrop-blur-xl transition duration-200 hover:-translate-y-0.5 hover:border-emerald-100 hover:shadow-[0_22px_56px_-34px_rgba(15,23,42,0.42)]">
    <CardContent className="relative flex min-h-[104px] items-center gap-3 p-3">
      <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-[radial-gradient(circle_at_left,_rgba(16,185,129,0.13),transparent_70%)]" />

      <div className="relative min-w-0 flex-1">
        <div className="inline-flex items-center rounded-full border border-emerald-100 bg-emerald-50/90 px-2 py-0.5 text-[8px] font-bold uppercase tracking-[0.16em] text-emerald-700">
          Workspace Team
        </div>
        <h3 className="mt-1 truncate text-base font-semibold leading-5 text-slate-950">
          {team.name}
        </h3>
        <p className="truncate text-[11px] font-medium leading-4 text-slate-500">
          {team.description || "No description provided."}
        </p>
        <div className="mt-1 flex min-w-0 items-center gap-1 text-[10px] font-medium text-slate-400">
          <CalendarDays className="h-3 w-3 shrink-0" />
          <span className="truncate">Created {formatDate(team.createdAt)}</span>
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1.5 border-l border-slate-100 pl-3">
        <TeamMemberStack members={team.members || []} max={3} size="sm" />
        <Badge className="border border-sky-100 bg-sky-50 px-1.5 py-0 text-[9px] leading-4 text-sky-700 hover:bg-sky-50">
          <Users2 className="mr-1 h-3 w-3" />
          {team.memberCount || team.members?.length || 0} members
        </Badge>
      </div>

      <div className="flex shrink-0 flex-col items-center gap-1.5">
        {canManageTeam ? (
          <Button
            aria-label="Delete Team"
            className="h-7 w-7 rounded-lg border border-rose-100 bg-white p-0 text-rose-500 shadow-sm hover:border-rose-200 hover:bg-rose-50"
            disabled={isDeleting}
            size="icon"
            title="Delete Team"
            type="button"
            variant="outline"
            onClick={() => setIsDeleteDialogOpen(true)}
          >
            {isDeleting ? (
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
          </Button>
        ) : null}

        <Button
          asChild
          className="h-7 shrink-0 rounded-lg px-2 text-[10px]"
          variant="outline"
          size="sm"
        >
          <Link to={`/teams/${team._id}`}>
            Open
            <ArrowRight className="h-3 w-3" />
          </Link>
        </Button>
      </div>
    </CardContent>
  </Card>
  <Dialog open={isDeleteDialogOpen} onOpenChange={(open) => !isDeleting && setIsDeleteDialogOpen(open)}>
    <DialogContent className="w-[calc(100%-2rem)] max-w-md rounded-[24px]">
      <DialogHeader>
        <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl border border-rose-200 bg-rose-50 text-rose-700">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <DialogTitle>Delete Team</DialogTitle>
        <DialogDescription>
          Are you sure you want to delete this team? This action cannot be undone.
        </DialogDescription>
      </DialogHeader>
      {deleteError ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {deleteError}
        </div>
      ) : null}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={() => setIsDeleteDialogOpen(false)}>
          Cancel
        </Button>
        <Button type="button" variant="destructive" disabled={isDeleting} onClick={handleDeleteTeam}>
          {isDeleting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          {isDeleting ? "Deleting..." : "Delete Team"}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
  </>
  );
};

export default TeamCard;
