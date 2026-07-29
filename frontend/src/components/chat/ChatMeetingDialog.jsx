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

    const imageUrl = participant?.avatarUrl || participant?.profilePicture || participant?.photo || "";

    return {
      imageUrl,
      initials,
    };
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    onSave();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="box-border w-[min(1040px,95vw)] max-w-none overflow-hidden rounded-[20px] border border-slate-200 bg-white p-5 shadow-[0_24px_80px_rgba(15,23,42,0.16)] sm:p-6">
        <form className="grid max-h-[calc(95vh-48px)] gap-4 overflow-hidden" onSubmit={handleSubmit}>
          <div className="grid min-h-0 gap-4 overflow-hidden">
            <DialogHeader className="space-y-1 pr-12">
              <DialogTitle>{mode === "edit" ? "Edit meeting" : "Schedule meeting"}</DialogTitle>
              <DialogDescription className="leading-5">
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
                className="h-11"
                aria-label="Meeting Title"
                required
              />
            </div>

            <div className="grid min-h-0 gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.85fr)]">
              <div className="grid gap-2">
                <label htmlFor="meeting-description" className="text-sm font-semibold text-slate-700">
                  Description
                </label>
                <Textarea
                  id="meeting-description"
                  value={draft.description}
                  onChange={(event) => onChange("description", event.target.value)}
                  placeholder="Optional agenda or notes"
                  className="h-[212px] min-h-[212px] resize-none rounded-[16px] border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-5"
                  aria-label="Meeting Description"
                />
              </div>

              <div className="grid gap-3">
                <div className="grid gap-2">
                  <label htmlFor="meeting-date" className="text-sm font-semibold text-slate-700">
                    Date
                  </label>
                  <Input
                    id="meeting-date"
                    type="date"
                    value={startDate}
                    onChange={(event) => updateStartDateTime(event.target.value, startTime)}
                    className="h-11"
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
                    className="h-11"
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
                    className="h-11"
                    aria-label="Duration in minutes"
                    required
                  />
                </div>
              </div>
            </div>

            <div className="grid min-h-0 gap-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-700">Participants</p>
                <p className="text-xs font-medium text-slate-500">Auto-filled from this chat</p>
              </div>
              <div className="min-h-[104px] rounded-[16px] border border-slate-200 bg-slate-50 p-3">
                <div className="flex flex-wrap gap-2">
                  {participants.map((participant) => {
                    const avatar = getParticipantAvatar(participant);
                    const name = participant?.name || participant?.email || "Participant";
                    const imageUrl = avatar.imageUrl || "";
                    const hasImage =
                      imageUrl.startsWith("http") ||
                      imageUrl.startsWith("/") ||
                      imageUrl.startsWith("data:");

                    return (
                      <div
                        key={String(participant?._id || participant?.id || participant || "")}
                        className="flex min-w-0 max-w-[240px] items-center gap-2 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-3 text-sm shadow-sm"
                      >
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-xs font-semibold text-slate-700">
                          {hasImage ? (
                            <img
                              src={imageUrl}
                              alt={name}
                              className="h-full w-full rounded-full object-cover"
                            />
                          ) : (
                            avatar.initials
                          )}
                        </div>
                        <span className="min-w-0 truncate text-sm font-medium text-slate-900">
                          {name}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="flex flex-col-reverse gap-3 border-t border-slate-200 bg-white pt-3 sm:flex-row sm:items-center sm:justify-between">
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
