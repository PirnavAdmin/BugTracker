import { memo, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Camera,
  Clock3,
  ExternalLink,
  Hash,
  Menu,
  Phone,
  Search,
  Trash2,
  UsersRound,
} from "lucide-react";
import UserAvatar from "@/components/shared/UserAvatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useCall } from "@/components/chat/CallProvider";
import { fetchChatMeetings, scheduleChatMeeting, searchChatUsers } from "@/lib/api";
import { useChatStore } from "@/lib/chatStore";
import { cn, formatDateTime, toDateTimeInputValue } from "@/lib/utils";

const getId = (value) => String(value?._id || value?.id || value || "");
const DEFAULT_MEETING_DURATION = 30;

const buildDefaultMeetingStart = () => {
  const next = new Date();
  next.setMinutes(0, 0, 0);
  next.setHours(next.getHours() + 1);
  return toDateTimeInputValue(next);
};

const getConversationName = (conversation, currentUserId) => {
  if (!conversation) {
    return "Chat";
  }

  if (conversation.type === "direct") {
    const teammate = (conversation.participants || []).find(
      (participant) => getId(participant) !== String(currentUserId)
    );
    return teammate?.name || "Direct message";
  }

  return conversation.name || conversation.projectId?.name || conversation.teamId?.name || "Group chat";
};

const presenceLabel = (status, isOnline) => {
  if (status === "in-group-call") {
    return "In Group Call";
  }

  if (status === "in-call") {
    return "In Call";
  }

  if (status === "ringing") {
    return "Ringing";
  }

  return isOnline ? "Online" : "Offline";
};

const presenceDotClass = (status, isOnline) => {
  if (status === "in-group-call") {
    return "bg-violet-500";
  }

  if (status === "in-call") {
    return "bg-amber-500";
  }

  if (status === "ringing") {
    return "bg-sky-500";
  }

  return isOnline ? "bg-emerald-500" : "bg-slate-300";
};

const ChatHeader = memo(({ conversation, currentUserId, onlineUsers, onDelete, onToggleSidebar }) => {
  const { activeCall, callPresence, channelCalls, joinCall, startCall } = useCall();
  const addParticipantsToConversation = useChatStore(
    (state) => state.addParticipantsToConversation
  );
  const removeParticipantFromConversation = useChatStore(
    (state) => state.removeParticipantFromConversation
  );
  const receiveMessage = useChatStore((state) => state.receiveMessage);
  const [isParticipantsOpen, setIsParticipantsOpen] = useState(false);
  const [participantQuery, setParticipantQuery] = useState("");
  const [participantResults, setParticipantResults] = useState([]);
  const [selectedParticipantIds, setSelectedParticipantIds] = useState([]);
  const [isSearchingParticipants, setIsSearchingParticipants] = useState(false);
  const [isSavingParticipants, setIsSavingParticipants] = useState(false);
  const [removingParticipantId, setRemovingParticipantId] = useState("");
  const [participantActionError, setParticipantActionError] = useState("");
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [meetingForm, setMeetingForm] = useState({
    subject: "",
    startDateTime: buildDefaultMeetingStart(),
    durationMinutes: DEFAULT_MEETING_DURATION,
  });
  const [meetingError, setMeetingError] = useState("");
  const [meetingSuccess, setMeetingSuccess] = useState("");
  const [meetingWarning, setMeetingWarning] = useState("");
  const [isLoadingMeetings, setIsLoadingMeetings] = useState(false);
  const [isSchedulingMeeting, setIsSchedulingMeeting] = useState(false);
  const [upcomingMeetings, setUpcomingMeetings] = useState([]);
  const participants = conversation?.participants || [];
  const title = getConversationName(conversation, currentUserId);
  const directUser = participants.find(
    (participant) => getId(participant) !== String(currentUserId)
  );
  const isOnline =
    conversation?.type === "direct" && onlineUsers.includes(getId(directUser));
  const directUserPresence = callPresence[getId(directUser)] || "";
  const currentUserPresence = callPresence[String(currentUserId)] || "";
  const isDirectCallAvailable =
    conversation?.type === "direct" && directUser && !activeCall && currentUserPresence !== "in-call";
  const activeChannelCall = channelCalls[getId(conversation)] || null;
  const groupJoinedCount = activeChannelCall?.activeParticipantIds?.length || 0;
  const isGroupCallAvailable =
    conversation?.type !== "direct" && conversation && !activeCall && !activeChannelCall;
  const canDelete = conversation && !["project", "team"].includes(conversation.channelType);
  const canManageParticipants =
    conversation?.type === "group" && conversation?.channelType === "custom";
  const participantIds = useMemo(
    () => new Set(participants.map((participant) => getId(participant))),
    [participants]
  );
  const availableParticipantResults = useMemo(
    () =>
      participantResults.filter(
        (user) =>
          getId(user) &&
          !participantIds.has(getId(user)) &&
          getId(user) !== String(currentUserId)
      ),
    [currentUserId, participantIds, participantResults]
  );
  const participantStatusText = participantActionError
    ? participantActionError
    : !canManageParticipants
      ? "Participants for workspace channels are managed from their project or team."
      : removingParticipantId
        ? "Updating participants..."
        : selectedParticipantIds.length
          ? `${selectedParticipantIds.length} participant(s) selected`
          : "Search workspace users to add them to this custom chat.";
  const scheduleTitle =
    conversation?.type === "direct"
      ? `Meeting with ${title}`
      : `${title} sync`;
  const nextMeeting = upcomingMeetings[0] || null;

  const handleDelete = async () => {
    if (!conversation || !onDelete) {
      return;
    }

    const actionLabel = conversation.type === "direct" ? "delete this chat" : "remove this group chat";

    if (!window.confirm(`Are you sure you want to ${actionLabel}?`)) {
      return;
    }

    await onDelete(getId(conversation));
  };

  useEffect(() => {
    if (!isParticipantsOpen) {
      setParticipantQuery("");
      setParticipantResults([]);
      setSelectedParticipantIds([]);
      setParticipantActionError("");
      setIsSearchingParticipants(false);
      return undefined;
    }

    if (!canManageParticipants) {
      return undefined;
    }

    const normalizedQuery = participantQuery.trim();
    if (normalizedQuery.length < 2) {
      setParticipantResults([]);
      setIsSearchingParticipants(false);
      return undefined;
    }

    let isActive = true;
    setIsSearchingParticipants(true);
    const timeoutId = window.setTimeout(async () => {
      try {
        const users = await searchChatUsers(normalizedQuery);
        if (isActive) {
          setParticipantResults(users);
          setParticipantActionError("");
        }
      } catch (error) {
        if (isActive) {
          setParticipantActionError(
            error?.response?.data?.message || error?.message || "Unable to search participants."
          );
          setParticipantResults([]);
        }
      } finally {
        if (isActive) {
          setIsSearchingParticipants(false);
        }
      }
    }, 250);

    return () => {
      isActive = false;
      window.clearTimeout(timeoutId);
    };
  }, [canManageParticipants, isParticipantsOpen, participantQuery]);

  useEffect(() => {
    setMeetingForm({
      subject: scheduleTitle,
      startDateTime: buildDefaultMeetingStart(),
      durationMinutes: DEFAULT_MEETING_DURATION,
    });
    setMeetingError("");
    setMeetingSuccess("");
    setMeetingWarning("");
    setUpcomingMeetings([]);
  }, [conversation?._id, scheduleTitle]);

  useEffect(() => {
    if (!conversation?._id) {
      return;
    }

    let isActive = true;

    const loadMeetings = async () => {
      setIsLoadingMeetings(true);

      try {
        const meetings = await fetchChatMeetings(getId(conversation));

        if (isActive) {
          setUpcomingMeetings(meetings);
          setMeetingError("");
        }
      } catch (error) {
        if (isActive) {
          setMeetingError(
            error?.response?.data?.message || error?.message || "Unable to load meetings."
          );
        }
      } finally {
        if (isActive) {
          setIsLoadingMeetings(false);
        }
      }
    };

    loadMeetings();

    return () => {
      isActive = false;
    };
  }, [conversation?._id, conversation]);

  const toggleParticipantSelection = (userId) => {
    setSelectedParticipantIds((current) =>
      current.includes(userId)
        ? current.filter((item) => item !== userId)
        : [...current, userId]
    );
  };

  const handleAddParticipants = async () => {
    if (!canManageParticipants || !selectedParticipantIds.length) {
      return;
    }

    setIsSavingParticipants(true);
    setParticipantActionError("");
    try {
      await addParticipantsToConversation(getId(conversation), selectedParticipantIds);
      setSelectedParticipantIds([]);
      setParticipantQuery("");
      setParticipantResults([]);
    } catch (error) {
      setParticipantActionError(
        error?.response?.data?.message || error?.message || "Unable to add participants."
      );
    } finally {
      setIsSavingParticipants(false);
    }
  };

  const handleRemoveParticipant = async (participantId) => {
    if (!canManageParticipants || !participantId || participantId === String(currentUserId)) {
      return;
    }

    setRemovingParticipantId(participantId);
    setParticipantActionError("");
    try {
      await removeParticipantFromConversation(getId(conversation), participantId);
    } catch (error) {
      setParticipantActionError(
        error?.response?.data?.message || error?.message || "Unable to remove participant."
      );
    } finally {
      setRemovingParticipantId("");
    }
  };

  const handleScheduleMeeting = async () => {
    if (!conversation?._id) {
      return;
    }

    setIsSchedulingMeeting(true);
    setMeetingError("");
    setMeetingSuccess("");
    setMeetingWarning("");

    try {
      const response = await scheduleChatMeeting(getId(conversation), meetingForm);

      if (response?.chatMessage) {
        receiveMessage({
          conversationId: getId(conversation),
          message: response.chatMessage,
        });
      }

      const meetings = await fetchChatMeetings(getId(conversation));
      setUpcomingMeetings(meetings);
      setMeetingSuccess(response?.message || "Meeting scheduled successfully.");
      setMeetingWarning(response?.warning || "");
      setMeetingForm({
        subject: scheduleTitle,
        startDateTime: buildDefaultMeetingStart(),
        durationMinutes: DEFAULT_MEETING_DURATION,
      });
    } catch (error) {
      setMeetingError(
        error?.response?.data?.message || error?.message || "Unable to schedule meeting."
      );
    } finally {
      setIsSchedulingMeeting(false);
    }
  };

  const scheduleStatusText =
    meetingError ||
    meetingWarning ||
    meetingSuccess ||
    (isLoadingMeetings
      ? "Loading scheduled meetings..."
      : upcomingMeetings.length
        ? `${upcomingMeetings.length} upcoming meeting(s)`
        : "No scheduled meetings yet.");

  return (
    <header className="flex min-h-[68px] shrink-0 items-center gap-2 border-b border-white/55 bg-white/52 px-3 py-2.5 backdrop-blur-2xl sm:min-h-[76px] sm:gap-3 sm:px-5 sm:py-3">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={onToggleSidebar}
      >
        <Menu className="h-4 w-4" />
      </Button>

      {conversation?.type === "direct" ? (
        <UserAvatar
          user={directUser}
          name={directUser?.name || title}
          className="h-10 w-10 shrink-0 rounded-2xl border border-white/70 shadow-sm sm:h-12 sm:w-12"
        />
      ) : (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/70 bg-gradient-to-r from-blue-100 to-cyan-100 text-blue-700 shadow-sm sm:h-12 sm:w-12">
          <Hash className="h-5 w-5" />
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h1 className="truncate text-base font-extrabold text-slate-950 sm:text-lg">
            {title}
          </h1>
          <Badge
            variant={conversation?.type === "direct" ? "success" : "default"}
            className="shrink-0"
          >
            {conversation?.type === "direct" ? "Direct" : conversation?.channelType || "Group"}
          </Badge>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                presenceDotClass(directUserPresence, isOnline)
              )}
            />
            {conversation?.type === "direct"
              ? presenceLabel(directUserPresence, isOnline)
              : `${participants.length} participants`}
          </span>
          {conversation?.type !== "direct" ? (
            <span className="inline-flex items-center gap-1">
              <UsersRound className="h-3.5 w-3.5" />
              {activeChannelCall
                ? `${groupJoinedCount} in call`
                : "Workspace channel"}
            </span>
          ) : null}
          {activeChannelCall ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-extrabold text-amber-700">
              Live call
            </span>
          ) : null}
          {nextMeeting ? (
            <button
              type="button"
              onClick={() => setIsScheduleOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-extrabold text-sky-700 transition hover:border-sky-300 hover:bg-sky-100"
            >
              <CalendarDays className="h-3.5 w-3.5" />
              {formatDateTime(nextMeeting.startDateTime)}
            </button>
          ) : null}
        </div>
      </div>

      {conversation?.type === "direct" ? (
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-blue-600 hover:bg-blue-50 hover:text-blue-700"
            onClick={() => setIsScheduleOpen(true)}
            title="Schedule Teams meeting"
            aria-label="Schedule Teams meeting"
          >
            <CalendarDays className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-blue-600 hover:bg-blue-50 hover:text-blue-700"
            onClick={() => startCall({ conversation, callType: "audio" })}
            disabled={!isDirectCallAvailable}
            title="Audio call"
            aria-label="Audio call"
          >
            <Phone className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-blue-600 hover:bg-blue-50 hover:text-blue-700"
            onClick={() => startCall({ conversation, callType: "video" })}
            disabled={!isDirectCallAvailable}
            title="Video call"
            aria-label="Video call"
          >
            <Camera className="h-4 w-4" />
          </Button>
        </div>
      ) : null}

      {conversation?.type !== "direct" ? (
        <div className="flex shrink-0 items-center gap-2">
          {activeChannelCall && !activeCall ? (
            <Button
              type="button"
              size="sm"
              className="text-white"
              onClick={() => joinCall(activeChannelCall)}
              title="Join group call"
              aria-label="Join group call"
            >
              <Phone className="h-4 w-4" />
              Join
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="hidden text-blue-600 hover:bg-blue-50 hover:text-blue-700 sm:inline-flex"
            onClick={() => setIsScheduleOpen(true)}
            title="Schedule Teams meeting"
            aria-label="Schedule Teams meeting"
          >
            <CalendarDays className="h-4 w-4" />
            Schedule
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="hidden text-blue-600 hover:bg-blue-50 hover:text-blue-700 sm:inline-flex"
            onClick={() => startCall({ conversation, callType: "audio" })}
            disabled={!isGroupCallAvailable}
            title="Start group audio call"
            aria-label="Start group audio call"
          >
            <Phone className="h-4 w-4" />
            Audio
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="hidden text-blue-600 hover:bg-blue-50 hover:text-blue-700 sm:inline-flex"
            onClick={() => startCall({ conversation, callType: "video" })}
            disabled={!isGroupCallAvailable}
            title="Start group video call"
            aria-label="Start group video call"
          >
            <Camera className="h-4 w-4" />
            Video
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-blue-600 hover:bg-blue-50 hover:text-blue-700 sm:hidden"
            onClick={() => setIsScheduleOpen(true)}
            title="Schedule Teams meeting"
            aria-label="Schedule Teams meeting"
          >
            <CalendarDays className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-blue-600 hover:bg-blue-50 hover:text-blue-700 sm:hidden"
            onClick={() => startCall({ conversation, callType: "audio" })}
            disabled={!isGroupCallAvailable}
            title="Start group audio call"
            aria-label="Start group audio call"
          >
            <Phone className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-blue-600 hover:bg-blue-50 hover:text-blue-700 sm:hidden"
            onClick={() => startCall({ conversation, callType: "video" })}
            disabled={!isGroupCallAvailable}
            title="Start group video call"
            aria-label="Start group video call"
          >
            <Camera className="h-4 w-4" />
          </Button>
        </div>
      ) : null}

      {canDelete ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0 text-slate-500 hover:bg-rose-50 hover:text-rose-600"
          onClick={handleDelete}
          title={conversation?.type === "direct" ? "Delete chat" : "Remove group chat"}
          aria-label={conversation?.type === "direct" ? "Delete chat" : "Remove group chat"}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      ) : null}

      {conversation?.type !== "direct" ? (
        <Dialog open={isParticipantsOpen} onOpenChange={setIsParticipantsOpen}>
          <DialogTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="hidden shrink-0 rounded-2xl border border-white/70 text-slate-600 shadow-sm hover:bg-slate-50 hover:text-slate-900 sm:inline-flex"
              title="View participants"
              aria-label="View participants"
            >
              <UsersRound className="h-5 w-5" />
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{title} participants</DialogTitle>
              <DialogDescription>
                View participants in this {conversation?.channelType || "group"} chat.
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
              {participants.map((participant) => (
                <div
                  key={getId(participant)}
                  className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3"
                >
                  <UserAvatar
                    user={participant}
                    className="h-11 w-11 rounded-2xl border border-white"
                    fallbackClassName="text-sm"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-slate-900">
                      {participant?.name || "Participant"}
                    </p>
                    <p className="truncate text-xs font-medium text-slate-500">
                      {participant?.email || participant?.role || "Workspace member"}
                    </p>
                  </div>
                  {canManageParticipants && getId(participant) !== String(currentUserId) ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="shrink-0 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                      onClick={() => handleRemoveParticipant(getId(participant))}
                      disabled={removingParticipantId === getId(participant)}
                    >
                      {removingParticipantId === getId(participant) ? "Removing..." : "Remove"}
                    </Button>
                  ) : null}
                </div>
              ))}
              {canManageParticipants ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-3">
                  <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                    <Search className="h-4 w-4 text-slate-500" />
                    Add participants
                  </div>
                  <Input
                    value={participantQuery}
                    onChange={(event) => setParticipantQuery(event.target.value)}
                    placeholder="Search workspace users"
                    className="mt-3"
                  />
                  {isSearchingParticipants ? (
                    <p className="mt-2 text-xs font-medium text-slate-500">Searching...</p>
                  ) : null}
                  {availableParticipantResults.length ? (
                    <div className="mt-3 space-y-2">
                      {availableParticipantResults.map((user) => {
                        const userId = getId(user);
                        const isSelected = selectedParticipantIds.includes(userId);

                        return (
                          <button
                            key={userId}
                            type="button"
                            onClick={() => toggleParticipantSelection(userId)}
                            className={cn(
                              "flex w-full items-center gap-3 rounded-2xl border px-3 py-2 text-left transition",
                              isSelected
                                ? "border-blue-300 bg-blue-50"
                                : "border-slate-200 bg-white hover:border-slate-300"
                            )}
                          >
                            <UserAvatar
                              user={user}
                              className="h-10 w-10 rounded-2xl border border-white"
                              fallbackClassName="text-sm"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-bold text-slate-900">
                                {user?.name || "Workspace member"}
                              </p>
                              <p className="truncate text-xs font-medium text-slate-500">
                                {user?.email || user?.role || "Workspace member"}
                              </p>
                            </div>
                            <span
                              className={cn(
                                "rounded-full px-2 py-1 text-[11px] font-extrabold",
                                isSelected
                                  ? "bg-blue-600 text-white"
                                  : "bg-slate-100 text-slate-500"
                              )}
                            >
                              {isSelected ? "Selected" : "Add"}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : participantQuery.trim().length >= 2 && !isSearchingParticipants ? (
                    <p className="mt-2 text-xs font-medium text-slate-500">
                      No new workspace users found for this search.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
            <DialogFooter className="items-stretch sm:items-center sm:justify-between">
              <p className="text-xs font-medium text-slate-500">{participantStatusText}</p>
              <Button
                type="button"
                disabled={
                  !canManageParticipants ||
                  !selectedParticipantIds.length ||
                  isSavingParticipants
                }
                onClick={handleAddParticipants}
              >
                {isSavingParticipants ? "Adding..." : "Add participants"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}

      <Dialog open={isScheduleOpen} onOpenChange={setIsScheduleOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Schedule Teams meeting</DialogTitle>
            <DialogDescription>
              Create a meeting schedule for this chat and share the Teams join link with participants.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(260px,0.8fr)]">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Meeting title</label>
                <Input
                  value={meetingForm.subject}
                  onChange={(event) =>
                    setMeetingForm((current) => ({
                      ...current,
                      subject: event.target.value,
                    }))
                  }
                  placeholder="Enter meeting title"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Start date & time</label>
                <Input
                  type="datetime-local"
                  value={meetingForm.startDateTime}
                  onChange={(event) =>
                    setMeetingForm((current) => ({
                      ...current,
                      startDateTime: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Duration (minutes)</label>
                <Input
                  type="number"
                  min="5"
                  step="5"
                  value={meetingForm.durationMinutes}
                  onChange={(event) =>
                    setMeetingForm((current) => ({
                      ...current,
                      durationMinutes: event.target.value,
                    }))
                  }
                />
              </div>
            </div>

            <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <CalendarDays className="h-4 w-4 text-blue-600" />
                Upcoming meetings
              </div>
              <div className="mt-4 space-y-3">
                {upcomingMeetings.length ? (
                  upcomingMeetings.map((meeting) => (
                    <div
                      key={meeting._id}
                      className="rounded-2xl border border-white bg-white p-3 shadow-sm"
                    >
                      <p className="text-sm font-bold text-slate-900">{meeting.subject}</p>
                      <div className="mt-2 flex items-center gap-2 text-xs font-semibold text-slate-500">
                        <Clock3 className="h-3.5 w-3.5" />
                        {formatDateTime(meeting.startDateTime)}
                      </div>
                      <div className="mt-1 text-xs font-medium text-slate-500">
                        {meeting.durationMinutes} minutes
                      </div>
                      <a
                        href={meeting.joinUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700"
                      >
                        Join in Teams
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-white/70 p-4 text-sm font-medium text-slate-500">
                    No scheduled meetings yet for this chat.
                  </div>
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="items-stretch sm:items-center sm:justify-between">
            <p
              className={cn(
                "text-xs font-medium",
                meetingError
                  ? "text-rose-500"
                  : meetingWarning
                    ? "text-amber-600"
                    : meetingSuccess
                      ? "text-emerald-600"
                      : "text-slate-500"
              )}
            >
              {scheduleStatusText}
            </p>
            <Button type="button" onClick={handleScheduleMeeting} disabled={isSchedulingMeeting}>
              {isSchedulingMeeting ? "Scheduling..." : "Create schedule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </header>
  );
});

ChatHeader.displayName = "ChatHeader";

export default ChatHeader;
