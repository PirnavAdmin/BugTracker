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
  const startDate = draft.startDateTime ? draft.startDateTime.split("T")[0] : "";
  const startTime = draft.startDateTime ? draft.startDateTime.split("T")[1]?.slice(0, 5) : "";

  const updateStartDateTime = (nextDate, nextTime) => {
    if (!nextDate) {
      onChange("startDateTime", "");
      return;
    }

    const timeValue = nextTime || "00:00";
    onChange("startDateTime", `${nextDate}T${timeValue}`);
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    onSave();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="box-border max-w-[960px] w-[min(960px,95vw)] max-h-[90vh] overflow-hidden rounded-[20px] border border-slate-200 bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.16)] sm:p-8">
        <form className="grid max-h-[calc(90vh-80px)] overflow-hidden" onSubmit={handleSubmit}>
          <div className="overflow-y-auto pr-2">
            <DialogHeader>
              <DialogTitle>{mode === "edit" ? "Edit meeting" : "Schedule meeting"}</DialogTitle>
              <DialogDescription>
                The meeting link is generated automatically inside this chat module.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-2">
              <label htmlFor="meeting-title" className="text-sm font-semibold text-slate-700">
                Meeting Title
              </label>
              <Input
                id="meeting-title"
                value={draft.title}
                onChange={(event) => onChange("title", event.target.value)}
                placeholder="Sprint Planning"
                className="h-12"
                aria-label="Meeting Title"
                required
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
              <div className="grid gap-2">
                <label htmlFor="meeting-description" className="text-sm font-semibold text-slate-700">
                  Description
                </label>
                <Textarea
                  id="meeting-description"
                  value={draft.description}
                  onChange={(event) => onChange("description", event.target.value)}
                  placeholder="Optional agenda or notes"
                  className="h-[140px] min-h-[140px] resize-none rounded-[18px] border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6"
                  aria-label="Meeting Description"
                />
              </div>

              <div className="grid gap-2">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-700">Participants</p>
                    <p className="text-xs font-medium text-slate-500">Auto-filled from this chat</p>
                  </div>
                </div>
                <div className="h-[140px] min-h-[140px] overflow-hidden rounded-[18px] border border-slate-200 bg-slate-50 p-4">
                  <div className="flex h-full flex-col overflow-hidden">
                    <div className="flex-1 overflow-y-auto pr-1">
                      <div className="flex flex-wrap gap-2">
                        {participants.map((participant) => (
                          <span
                            key={String(participant?._id || participant?.id || participant || "")}
                            className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm"
                          >
                            {participant?.name || participant?.email || "Participant"}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <div className="grid gap-2">
                <label htmlFor="meeting-date" className="text-sm font-semibold text-slate-700">
                  Start Date
                </label>
                <Input
                  id="meeting-date"
                  type="date"
                  value={startDate}
                  onChange={(event) => updateStartDateTime(event.target.value, startTime)}
                  className="h-12"
                  aria-label="Start Date"
                  required
                />
              </div>
              <div className="grid gap-2">
                <label htmlFor="meeting-time" className="text-sm font-semibold text-slate-700">
                  Start Time
                </label>
                <Input
                  id="meeting-time"
                  type="time"
                  value={startTime}
                  onChange={(event) => updateStartDateTime(startDate, event.target.value)}
                  className="h-12"
                  aria-label="Start Time"
                  required
                />
              </div>
              <div className="grid gap-2">
                <label htmlFor="meeting-duration" className="text-sm font-semibold text-slate-700">
                  Duration
                </label>
                <Input
                  id="meeting-duration"
                  type="number"
                  min="5"
                  step="5"
                  value={draft.durationMinutes}
                  onChange={(event) => onChange("durationMinutes", event.target.value)}
                  placeholder="30"
                  className="h-12"
                  aria-label="Duration in minutes"
                  required
                />
              </div>
              <div className="grid gap-2">
                <label htmlFor="meeting-timezone" className="text-sm font-semibold text-slate-700">
                  Time Zone
                </label>
                <Input
                  id="meeting-timezone"
                  type="text"
                  value={draft.timeZone || ""}
                  onChange={(event) => onChange("timeZone", event.target.value)}
                  placeholder="Optional"
                  className="h-12"
                  aria-label="Time Zone"
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                { field: "recordMeeting", label: "Record Meeting" },
                { field: "waitingRoom", label: "Waiting Room" },
                { field: "allowScreenShare", label: "Allow Screen Share" },
                { field: "muteOnJoin", label: "Mute Participants on Join" },
              ].map(({ field, label }) => (
                <label
                  key={field}
                  htmlFor={field}
                  className="flex items-center justify-between rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700"
                >
                  <span>{label}</span>
                  <span className="relative inline-flex h-6 w-12 items-center rounded-full bg-slate-300 transition-colors duration-200 peer-checked:bg-slate-900">
                    <input
                      id={field}
                      type="checkbox"
                      checked={Boolean(draft[field])}
                      onChange={(event) => onChange(field, event.target.checked)}
                      className="peer sr-only"
                      aria-label={label}
                    />
                    <span className="pointer-events-none absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 peer-checked:translate-x-6" />
                  </span>
                </label>
              ))}
            </div>
          </div>

          <DialogFooter className="sticky bottom-0 z-10 flex flex-col-reverse gap-3 border-t border-slate-200 bg-white/90 px-0 py-4 backdrop-blur-sm sm:static sm:flex-row sm:items-center sm:justify-end sm:bg-transparent sm:border-none sm:py-0">
            <p className="text-xs font-medium text-rose-500">{error || ""}</p>
            <div className="flex flex-wrap items-center justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                className="min-w-[120px] border-slate-300 text-slate-700 hover:bg-slate-100 hover:text-slate-950"
                onClick={() => onClose(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="min-w-[160px] bg-slate-950 px-6 text-white hover:bg-slate-800"
                disabled={isSaving}
              >
                {isSaving ? "Saving..." : "Save Meeting"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ChatMeetingDialog;
