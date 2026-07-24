import { CalendarDays, Copy, Edit3, ExternalLink, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import EmptyState from "@/components/shared/EmptyState";
import {
  canManageMeeting,
  filterMeetingsByPreset,
  getMeetingDateLine,
  getMeetingStatus,
  getMeetingStatusLabel,
} from "@/lib/chat-meetings";
import { cn } from "@/lib/utils";

const FILTERS = [
  { id: "upcoming", label: "Upcoming" },
  { id: "today", label: "Today" },
  { id: "week", label: "This Week" },
  { id: "completed", label: "Completed" },
];

const statusClassName = (status) => {
  if (status === "live") {
    return "bg-emerald-100 text-emerald-700";
  }

  if (status === "completed") {
    return "bg-slate-100 text-slate-500";
  }

  return "bg-blue-100 text-blue-700";
};

const ChatMeetingsPanel = ({
  currentUser,
  meetings,
  search,
  selectedFilter,
  onCopy,
  onDelete,
  onEdit,
  onJoin,
  onNewMeeting,
  onSearchChange,
  onFilterChange,
}) => {
  const visibleMeetings = filterMeetingsByPreset(
    meetings.filter((meeting) =>
      !search.trim()
        ? true
        : String(meeting?.title || "").toLowerCase().includes(search.trim().toLowerCase())
    ),
    selectedFilter
  );
  const completedMeetings = filterMeetingsByPreset(meetings, "completed");

  return (
    <section className="flex h-full flex-1 flex-col overflow-hidden bg-white">
      <div className="border-b border-slate-200 bg-white/85 px-5 py-4 backdrop-blur-xl">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h1 className="text-xl font-extrabold text-slate-950">Meetings</h1>
            <p className="mt-1 text-sm font-medium text-slate-500">
              Browse upcoming, live, and completed meetings across your chats.
            </p>
          </div>
          <Button type="button" onClick={onNewMeeting}>
            <CalendarDays className="h-4 w-4" />
            New Meeting
          </Button>
        </div>

        <div className="mt-4 flex flex-col gap-3 xl:flex-row xl:items-center">
          <div className="relative max-w-md flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              className="pl-10"
              placeholder="Search meetings"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((filter) => (
              <Button
                key={filter.id}
                type="button"
                variant={selectedFilter === filter.id ? "default" : "outline"}
                size="sm"
                onClick={() => onFilterChange(filter.id)}
              >
                {filter.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div className="dashboard-scrollbar min-h-0 flex-1 overflow-y-auto bg-[linear-gradient(180deg,#f8fbff_0%,#eef4ff_100%)] px-5 py-5">
        {visibleMeetings.length ? (
          <div className="grid gap-4 xl:grid-cols-2">
            {visibleMeetings.map((meeting) => {
              const status = getMeetingStatus(meeting);
              const canManage = canManageMeeting(meeting, currentUser);

              return (
                <article
                  key={meeting._id}
                  className="rounded-[28px] border border-white/80 bg-white/86 p-5 shadow-[0_30px_70px_-46px_rgba(15,23,42,0.5)] backdrop-blur-xl"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-lg font-extrabold text-slate-950">
                        {meeting.title}
                      </p>
                      <p className="mt-2 text-sm font-medium text-slate-500">
                        {getMeetingDateLine(meeting)}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "rounded-full px-3 py-1 text-xs font-extrabold",
                        statusClassName(status)
                      )}
                    >
                      {getMeetingStatusLabel(meeting)}
                    </span>
                  </div>

                  {meeting.description ? (
                    <p className="mt-4 line-clamp-3 text-sm leading-6 text-slate-600">
                      {meeting.description}
                    </p>
                  ) : null}

                  <div className="mt-4 text-sm font-medium text-slate-500">
                    {meeting?.scheduledBy?.name || "Workspace user"} • {(meeting.participants || []).length} participants
                  </div>

                  <div className="mt-5 flex flex-wrap gap-2">
                    <Button type="button" size="sm" onClick={() => onJoin(meeting)}>
                      <ExternalLink className="h-4 w-4" />
                      Join
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => onCopy(meeting)}>
                      <Copy className="h-4 w-4" />
                      Copy Link
                    </Button>
                    {canManage ? (
                      <Button type="button" variant="outline" size="sm" onClick={() => onEdit(meeting)}>
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
                </article>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={<CalendarDays className="h-6 w-6" />}
            title="No meetings found"
            description="Create a meeting or adjust the filters to see scheduled chat meetings."
            action={
              <Button type="button" onClick={onNewMeeting}>
                <CalendarDays className="h-4 w-4" />
                New Meeting
              </Button>
            }
          />
        )}

        {completedMeetings.length && selectedFilter !== "completed" ? (
          <div className="mt-8">
            <h2 className="text-sm font-extrabold uppercase tracking-[0.18em] text-slate-500">
              Completed Meetings
            </h2>
            <div className="mt-4 grid gap-3 xl:grid-cols-2">
              {completedMeetings.slice(0, 4).map((meeting) => (
                <div key={meeting._id} className="rounded-[24px] border border-white/75 bg-white/70 px-4 py-4">
                  <p className="truncate text-sm font-extrabold text-slate-900">{meeting.title}</p>
                  <p className="mt-1 text-xs font-medium text-slate-500">{getMeetingDateLine(meeting)}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
};

export default ChatMeetingsPanel;
