import { useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, CalendarDays, LoaderCircle, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
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
  <Card className="team-card overflow-hidden border-purple-100 bg-[radial-gradient(circle_at_top_left,_rgba(168,85,247,0.14),transparent_48%),linear-gradient(135deg,_#ffffff_42%,_#faf5ff_100%)] shadow-sm transition-all duration-200 ease-out hover:-translate-y-1 hover:border-purple-200 hover:shadow-[0_20px_44px_-22px_rgba(147,51,234,0.55)]">
    <CardContent className="relative flex min-h-[104px] items-center gap-3 p-3">
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-base font-semibold leading-5 text-slate-950">
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

      <div className="flex shrink-0 items-center border-l border-slate-100 pl-3">
        <Badge className="border border-sky-100 bg-sky-50 px-1.5 py-0 text-[9px] leading-4 text-sky-700 hover:bg-sky-50">
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
