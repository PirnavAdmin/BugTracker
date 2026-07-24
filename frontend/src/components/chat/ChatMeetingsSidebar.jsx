import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Copy,
  Edit3,
  ExternalLink,
  Trash2,
  UserCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  canManageMeeting,
  getMeetingDateLine,
  getMeetingStatus,
  getMeetingStatusLabel,
} from "@/lib/chat-meetings";
import { cn, getInitials } from "@/lib/utils";

const statusClassName = (status) => {
  if (status === "live") {
    return "bg-slate-900 text-white";
  }

  if (status === "completed") {
    return "bg-slate-100 text-slate-500";
  }

  return "bg-slate-200 text-slate-700";
};

const ChatMeetingsSidebar = ({
  collapsed = false,
  currentUser,
  meetings,
  onCollapseToggle,
  onCopy,
  onDelete,
  onEdit,
  onJoin,
  onNewMeeting,
  title = "Meetings",
}) => (
  <aside
    className={cn(
      "hidden h-full shrink-0 border-l border-slate-200 bg-white transition-all duration-300 lg:flex lg:flex-col",
      collapsed ? "w-[72px]" : "w-[340px]"
    )}
  >
    <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
      {collapsed ? null : (
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-slate-500">
            Meetings
          </p>
          <h2 className="mt-1 text-lg font-extrabold text-slate-950">{title}</h2>
        </div>
      )}
      <div className="flex items-center gap-2">
        {!collapsed ? (
          <Button
            type="button"
            size="sm"
            className="bg-slate-950 text-white hover:bg-slate-800"
            onClick={onNewMeeting}
          >
            <CalendarDays className="h-4 w-4" />
            New
          </Button>
        ) : null}
        <Button type="button" variant="ghost" size="icon" onClick={onCollapseToggle}>
          {collapsed ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </Button>
      </div>
    </div>

    {collapsed ? (
      <div className="flex min-h-0 flex-1 flex-col items-center gap-4 px-2 py-4">
        <button
          type="button"
          onClick={onNewMeeting}
          className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-slate-950 text-white shadow-sm transition hover:bg-slate-800"
          title="New meeting"
          aria-label="New meeting"
        >
          <CalendarDays className="h-5 w-5" />
        </button>
        <div className="flex flex-col items-center gap-3">
          {meetings.slice(0, 4).map((meeting) => (
            <button
              key={meeting._id}
              type="button"
              onClick={() => onJoin(meeting)}
              className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-100 hover:text-slate-950"
              title={meeting.title}
              aria-label={meeting.title}
            >
              <CalendarDays className="h-5 w-5" />
            </button>
          ))}
        </div>
      </div>
    ) : (
      <div className="dashboard-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
      <div className="space-y-1">
        <p className="text-sm font-bold text-slate-900">Upcoming Meetings</p>
        <p className="text-xs font-medium text-slate-500">
          Join, copy, or manage meetings from the current chat.
        </p>
      </div>

      {meetings.length ? (
        meetings.map((meeting) => {
          const status = getMeetingStatus(meeting);
          const canManage = canManageMeeting(meeting, currentUser);

          return (
            <div
              key={meeting._id}
              className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_24px_50px_-38px_rgba(15,23,42,0.18)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-extrabold text-slate-950">{meeting.title}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    {getMeetingDateLine(meeting)}
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-extrabold",
                    statusClassName(status)
                  )}
                >
                  {getMeetingStatusLabel(meeting)}
                </span>
              </div>

              <div className="mt-4 space-y-3">
                <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                  <UserCircle2 className="h-4 w-4 text-slate-400" />
                  Created by {meeting?.scheduledBy?.name || "Workspace user"}
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex -space-x-2">
                    {(meeting.participants || []).slice(0, 4).map((participant) => (
                      <span
                        key={String(participant?.userId || participant?.email || participant?.name || "")}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-slate-200 text-[11px] font-extrabold text-slate-700"
                        title={participant?.name || "Participant"}
                      >
                        {getInitials(participant?.name || "P")}
                      </span>
                    ))}
                  </div>
                  <span className="text-xs font-semibold text-slate-500">
                    Participants: {(meeting.participants || []).length}
                  </span>
                </div>
                {meeting.description ? (
                  <p className="line-clamp-3 text-xs leading-5 text-slate-600">{meeting.description}</p>
                ) : null}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  className="bg-slate-950 text-white hover:bg-slate-800"
                  onClick={() => onJoin(meeting)}
                >
                  <ExternalLink className="h-4 w-4" />
                  Join Meeting
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-slate-300 text-slate-700 hover:bg-slate-100 hover:text-slate-950"
                  onClick={() => onCopy(meeting)}
                >
                  <Copy className="h-4 w-4" />
                  Copy Link
                </Button>
                {canManage ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="border-slate-300 text-slate-700 hover:bg-slate-100 hover:text-slate-950"
                    onClick={() => onEdit(meeting)}
                  >
                    <Edit3 className="h-4 w-4" />
                    Edit
                  </Button>
                ) : null}
                {canManage ? (
                  <Button type="button" variant="ghost" size="sm" className="text-rose-600 hover:bg-rose-50 hover:text-rose-700" onClick={() => onDelete(meeting)}>
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </Button>
                ) : null}
              </div>
            </div>
          );
        })
      ) : (
        <div className="rounded-[24px] border border-dashed border-slate-200 bg-white/75 px-5 py-10 text-center">
          <CalendarDays className="mx-auto h-10 w-10 text-slate-700" />
          <p className="mt-4 text-sm font-bold text-slate-900">No meetings scheduled</p>
          <p className="mt-1 text-xs font-medium text-slate-500">
            Schedule a chat meeting to keep the conversation aligned.
          </p>
        </div>
      )}
      </div>
    )}
  </aside>
);

export default ChatMeetingsSidebar;
