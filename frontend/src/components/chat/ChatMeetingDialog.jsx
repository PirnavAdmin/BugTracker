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
      <DialogContent className="max-w-xl overflow-hidden border border-slate-200 bg-white p-6 shadow-lg">
        <DialogHeader>
          <DialogTitle>{mode === "edit" ? "Edit meeting" : "Schedule meeting"}</DialogTitle>
          <DialogDescription>
            The meeting link is generated automatically inside this chat module.
          </DialogDescription>
        </DialogHeader>

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

          <div className="space-y-3 rounded-[24px] border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-bold text-slate-900">Participants</p>
              <p className="text-xs font-medium text-slate-500">Auto-filled from this chat</p>
            </div>
            <div className="flex flex-wrap gap-2 overflow-x-auto">
              {participants.map((participant) => (
                <span
                  key={String(participant?._id || participant?.id || participant || "")}
                  className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm"
                >
                  {participant?.name || participant?.email || "Participant"}
                </span>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="items-stretch sm:items-center sm:justify-between">
          <p className="text-xs font-medium text-rose-500">{error || ""}</p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="border-slate-300 text-slate-700 hover:bg-slate-100 hover:text-slate-950"
              onClick={() => onClose(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-slate-950 text-white hover:bg-slate-800"
              onClick={onSave}
              disabled={isSaving}
            >
              {isSaving ? "Saving..." : "Save Meeting"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ChatMeetingDialog;
