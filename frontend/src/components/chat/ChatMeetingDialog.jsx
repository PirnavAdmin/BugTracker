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

  const getParticipantAvatar = (participant) => {
    const name = participant?.name || participant?.email || "";
    const initials = name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("")
      .slice(0, 2);

    return participant?.avatarUrl || participant?.profilePicture || participant?.photo || initials;
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    onSave();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="box-border max-w-[1000px] w-[min(1000px,95vw)] max-h-[90vh] overflow-hidden rounded-[20px] border border-slate-200 bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.16)] sm:p-8">
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

            <div className="grid gap-4 lg:grid-cols-[65%_35%]">
              <div className="grid gap-2">
                <label htmlFor="meeting-description" className="text-sm font-semibold text-slate-700">
                  Description
                </label>
                <Textarea
                  id="meeting-description"
                  value={draft.description}
                  onChange={(event) => onChange("description", event.target.value)}
                  placeholder="Optional agenda or notes"
                  className="h-[180px] min-h-[180px] resize-none rounded-[18px] border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6"
                  aria-label="Meeting Description"
                />
              </div>

              <div className="grid gap-4">
                <div className="grid gap-2">
                  <label htmlFor="meeting-date" className="text-sm font-semibold text-slate-700">
                    Date
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
                    Time
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
              </div>
            </div>

            <div className="mt-4 grid gap-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-700">Participants</p>
                <p className="text-xs font-medium text-slate-500">Auto-filled from this chat</p>
              </div>
              <div className="h-[200px] min-h-[180px] max-h-[220px] overflow-hidden rounded-[18px] border border-slate-200 bg-slate-50 p-4">
                <div className="h-full overflow-y-auto pr-1">
                  <div className="flex flex-wrap gap-3">
                    {participants.map((participant) => {
                      const avatar = getParticipantAvatar(participant);
                      const name = participant?.name || participant?.email || "Participant";

                      return (
                        <div
                          key={String(participant?._id || participant?.id || participant || "")}
                          className="flex min-w-[140px] max-w-[280px] items-center gap-3 rounded-[18px] border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm"
                        >
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-700">
                            {typeof avatar === "string" && avatar.startsWith("http") ? (
                              <img
                                src={avatar}
                                alt={name}
                                className="h-full w-full rounded-full object-cover"
                              />
                            ) : (
                              avatar
                            )}
                          </div>
                          <span className="whitespace-normal break-words text-sm font-medium text-slate-900">
                            {name}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
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
