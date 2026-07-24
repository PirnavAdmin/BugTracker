import { memo, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Camera,
  Hash,
  Menu,
  Phone,
  Search,
  Trash2,
  UsersRound,
  ExternalLink,
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
import { searchChatUsers } from "@/lib/api";
import { getMeetingDayTimeLabel } from "@/lib/chat-meetings";
import { useChatStore } from "@/lib/chatStore";
import { cn } from "@/lib/utils";

const getId = (value) => String(value?._id || value?.id || value || "");

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

const ChatHeader = memo(
  ({
    conversation,
    currentUserId,
    nextMeeting,
    onlineUsers,
    onDelete,
    onJoinMeeting,
    onOpenMeetingDialog,
    onToggleSidebar,
  }) => {
    const { activeCall, callPresence, channelCalls, joinCall, startCall } = useCall();
    const addParticipantsToConversation = useChatStore(
      (state) => state.addParticipantsToConversation
    );
    const removeParticipantFromConversation = useChatStore(
      (state) => state.removeParticipantFromConversation
    );
    const [isParticipantsOpen, setIsParticipantsOpen] = useState(false);
    const [participantQuery, setParticipantQuery] = useState("");
    const [participantResults, setParticipantResults] = useState([]);
    const [selectedParticipantIds, setSelectedParticipantIds] = useState([]);
    const [isSearchingParticipants, setIsSearchingParticipants] = useState(false);
    const [isSavingParticipants, setIsSavingParticipants] = useState(false);
    const [removingParticipantId, setRemovingParticipantId] = useState("");
    const [participantActionError, setParticipantActionError] = useState("");
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

    const handleDelete = async () => {
      if (!conversation || !onDelete) {
        return;
      }

      const actionLabel =
        conversation.type === "direct" ? "delete this chat" : "remove this group chat";

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

    return (
      <header className="flex min-h-[86px] shrink-0 items-center gap-3 border-b border-slate-200 bg-white/88 px-3 py-3 backdrop-blur-xl sm:px-5">
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
            className="h-11 w-11 shrink-0 rounded-2xl border border-white/70 shadow-sm"
          />
        ) : (
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/70 bg-gradient-to-r from-blue-100 to-cyan-100 text-blue-700 shadow-sm">
            <Hash className="h-5 w-5" />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h1 className="truncate text-base font-extrabold text-slate-950 sm:text-lg">{title}</h1>
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
                {activeChannelCall ? `${groupJoinedCount} in call` : "Workspace channel"}
              </span>
            ) : null}
          </div>

          <div
            className={cn(
              "mt-3 flex items-center justify-between gap-3 rounded-[18px] border px-3 py-2.5",
              nextMeeting
                ? "border-emerald-200 bg-emerald-50/80"
                : "border-slate-200 bg-slate-50/80"
            )}
          >
            <div className="min-w-0">
              {nextMeeting ? (
                <>
                  <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-emerald-700">
                    Meeting Scheduled
                  </p>
                  <p className="truncate text-sm font-bold text-slate-900">{nextMeeting.title}</p>
                  <p className="truncate text-xs font-medium text-slate-500">
                    {getMeetingDayTimeLabel(nextMeeting)}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-bold text-slate-900">No meetings scheduled</p>
                  <p className="text-xs font-medium text-slate-500">
                    Schedule an in-app meeting for this chat to keep everyone aligned.
                  </p>
                </>
              )}
            </div>

            {nextMeeting ? (
              <Button type="button" size="sm" onClick={() => onJoinMeeting(nextMeeting)}>
                <ExternalLink className="h-4 w-4" />
                Join Meeting
              </Button>
            ) : (
              <Button type="button" size="sm" onClick={onOpenMeetingDialog}>
                <CalendarDays className="h-4 w-4" />
                Schedule Meeting
              </Button>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {conversation?.type === "direct" ? (
            <>
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
            </>
          ) : (
            <>
              {activeChannelCall && !activeCall ? (
                <Button
                  type="button"
                  size="sm"
                  className="text-white"
                  onClick={() => joinCall(activeChannelCall)}
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
                onClick={() => startCall({ conversation, callType: "audio" })}
                disabled={!isGroupCallAvailable}
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
              >
                <Camera className="h-4 w-4" />
                Video
              </Button>
            </>
          )}

          {canDelete ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0 text-slate-500 hover:bg-rose-50 hover:text-rose-600"
              onClick={handleDelete}
              title={conversation?.type === "direct" ? "Delete chat" : "Remove group chat"}
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
                      !canManageParticipants || !selectedParticipantIds.length || isSavingParticipants
                    }
                    onClick={handleAddParticipants}
                  >
                    {isSavingParticipants ? "Adding..." : "Add participants"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          ) : null}
        </div>
      </header>
    );
  }
);

ChatHeader.displayName = "ChatHeader";

export default ChatHeader;
