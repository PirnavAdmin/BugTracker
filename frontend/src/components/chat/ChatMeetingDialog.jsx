import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const ChatMeetingDialog = ({
  conversation,
  error,
  isOpen,
  isSaving,
  mode = "create",
  onClose,
  onSave,
  onChange,
  draft,
}) => {
  const participants = conversation?.participants || [];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{mode === "edit" ? "Edit meeting" : "Schedule meeting"}</DialogTitle>
          <DialogDescription>
            The meeting link is generated automatically inside this chat module.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">Meeting Title</label>
              <Input
                value={draft.title}
                onChange={(event) => onChange("title", event.target.value)}
                placeholder="Sprint Planning"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">Description</label>
              <Textarea
                value={draft.description}
                onChange={(event) => onChange("description", event.target.value)}
                placeholder="Optional agenda or notes"
                className="min-h-[110px]"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Start Date & Time</label>
                <Input
                  type="datetime-local"
                  value={draft.startDateTime}
                  onChange={(event) => onChange("startDateTime", event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Duration</label>
                <Input
                  type="number"
                  min="5"
                  step="5"
                  value={draft.durationMinutes}
                  onChange={(event) => onChange("durationMinutes", event.target.value)}
                  placeholder="30"
                />
              </div>
            </div>
          </div>

          <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-bold text-slate-900">Participants</p>
            <p className="mt-1 text-xs font-medium text-slate-500">
              Auto-filled from this chat. The link stays inside this app.
            </p>
            <div className="mt-4 space-y-2">
              {participants.map((participant) => (
                <div
                  key={String(participant?._id || participant?.id || participant || "")}
                  className="rounded-2xl border border-white bg-white px-3 py-2"
                >
                  <p className="truncate text-sm font-bold text-slate-900">
                    {participant?.name || "Participant"}
                  </p>
                  <p className="truncate text-xs font-medium text-slate-500">
                    {participant?.email || participant?.role || "Workspace member"}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="items-stretch sm:items-center sm:justify-between">
          <p className="text-xs font-medium text-rose-500">{error || ""}</p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onClose(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={onSave} disabled={isSaving}>
              {isSaving ? "Saving..." : "Save Meeting"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ChatMeetingDialog;
