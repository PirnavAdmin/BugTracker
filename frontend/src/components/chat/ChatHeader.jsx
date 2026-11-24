import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  Video,
  Check,
  Hash,
  Menu,
  MoreHorizontal,
  Phone,
  Pin,
  Search,
  Star,
  Trash2,
  UsersRound,
} from "lucide-react";
import ChatActionsMenu from "@/components/chat/ChatActionsMenu";
import UserAvatar from "@/components/shared/UserAvatar";
import ChatPresenceIndicator, { PresentationIndicator } from "@/components/chat/ChatPresenceIndicator";
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

const ChatHeader = memo(
  ({
    conversation,
    currentUserId,
    nextMeeting,
    onlineUsers,
    onJoinMeeting,
    onOpenMeetingDialog,
    onToggleConversationPreference,
    onToggleSidebar,
  }) => {
    const { activeCall, callPresence, presentingUsers, channelCalls, joinCall, startCall } = useCall();
    const addParticipantsToConversation = useChatStore(
      (state) => state.addParticipantsToConversation
    );
    const removeParticipantFromConversation = useChatStore(
      (state) => state.removeParticipantFromConversation
    );
    const clearConversationHistory = useChatStore((state) => state.clearConversationHistory);
    const isClearing = useChatStore((state) => Boolean(state.clearingByConversation[getId(conversation)]));
    const hasVisibleHistory = useChatStore((state) => Boolean(
      state.messagesByConversation[getId(conversation)]?.some((message) => !message.pending) || conversation?.lastMessageAt));
    const [clearDialogConversation, setClearDialogConversation] = useState(null);
    const [clearError, setClearError] = useState("");
    const canClear = Boolean(currentUserId && conversation &&
      conversation.participants?.some((participant) => getId(participant) === String(currentUserId)) && hasVisibleHistory);
    const handleClear = async () => {
      if (!clearDialogConversation || isClearing) return;
      setClearError("");
      try {
        if (await clearConversationHistory(clearDialogConversation)) setClearDialogConversation(null);
      } catch (error) {
        setClearError(error?.response?.data?.message || error?.message || "Unable to clear conversation. Please try again.");
      }
    };
    const [isParticipantsOpen, setIsParticipantsOpen] = useState(false);
    const [participantQuery, setParticipantQuery] = useState("");
    const [participantResults, setParticipantResults] = useState([]);
    const [selectedParticipantIds, setSelectedParticipantIds] = useState([]);
    const [isSearchingParticipants, setIsSearchingParticipants] = useState(false);
    const [isSavingParticipants, setIsSavingParticipants] = useState(false);
    const [removingParticipantId, setRemovingParticipantId] = useState("");
    const [participantActionError, setParticipantActionError] = useState("");
    const [isActionsMenuOpen, setIsActionsMenuOpen] = useState(false);
    const actionsTriggerRef = useRef(null);
    const actionsInitialFocusRef = useRef("first");
    const participants = conversation?.participants || [];
    const title = getConversationName(conversation, currentUserId);
    const directUser = participants.find(
      (participant) => getId(participant) !== String(currentUserId)
    );
    const isOnline =
      conversation?.type === "direct" && onlineUsers.includes(getId(directUser));
    const currentUserPresence = callPresence[String(currentUserId)] || "";
    const isDirectCallAvailable =
      conversation?.type === "direct" && directUser && !activeCall && currentUserPresence !== "in-call";
    const activeChannelCall = channelCalls[getId(conversation)] || null;
    const groupJoinedCount = activeChannelCall?.activeParticipantIds?.length || 0;
    const presentingParticipants = participants.filter((participant) =>
      presentingUsers[getId(participant)] &&
      activeChannelCall?.activeParticipantIds?.some((id) => getId(id) === getId(participant))
    );
    const isGroupCallAvailable =
      conversation?.type !== "direct" && conversation && !activeCall && !activeChannelCall;
    const canManageParticipants =
      conversation?.type === "group" && conversation?.channelType === "custom";
    const isPinned = Boolean(conversation?.isPinned);
    const isStarred = Boolean(conversation?.isStarred);
    const isArchived = Boolean(conversation?.isArchived);
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

    const handleTogglePreference = (field) => {
      if (!conversation || !onToggleConversationPreference) {
        return;
      }

      onToggleConversationPreference(field);
      setIsActionsMenuOpen(false);
      actionsTriggerRef.current?.focus({ preventScroll: true });
    };

    const handleToggleActionsMenu = () => {
      actionsInitialFocusRef.current = "first";
      setIsActionsMenuOpen((current) => !current);
    };

    useEffect(() => {
      setIsActionsMenuOpen(false);
      setClearDialogConversation(null);
      setClearError("");
    }, [conversation?._id]);

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
      <header className="flex min-h-[86px] shrink-0 items-center gap-3 border-b border-slate-200 bg-white/88 px-3 py-3 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 sm:px-5">
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
            className="h-11 w-11 shrink-0 rounded-2xl border border-white/70 shadow-sm dark:border-slate-700"
          />
        ) : (
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-slate-100 text-slate-900 shadow-sm dark:border-slate-800 dark:bg-slate-800 dark:text-slate-100">
            <Hash className="h-5 w-5" />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h1 className="truncate text-base font-extrabold text-slate-950 dark:text-slate-100 sm:text-lg">{title}</h1>
            <Badge
              variant={conversation?.type === "direct" ? "success" : "default"}
              className="shrink-0"
            >
              {conversation?.type === "direct" ? "Direct" : conversation?.channelType || "Group"}
            </Badge>
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
            {conversation?.type === "direct" ? (
              <>
                <ChatPresenceIndicator userId={getId(directUser)} isOnline={isOnline} showLabel />
                <PresentationIndicator userId={getId(directUser)} />
              </>
            ) : (
              <span className="inline-flex items-center gap-1.5">
                {`${participants.length} participants`}
              </span>
            )}
            {conversation?.type !== "direct" ? (
              <span className="inline-flex items-center gap-1">
                <UsersRound className="h-3.5 w-3.5" />
                {activeChannelCall ? `${groupJoinedCount} in call` : "Workspace channel"}
              </span>
            ) : null}
            {conversation?.type !== "direct" && presentingParticipants.map((participant) => (
              <span key={getId(participant)} className="inline-flex items-center gap-1.5">
                <span>{participant.name || "Participant"}</span>
                <ChatPresenceIndicator userId={getId(participant)} isOnline={onlineUsers.includes(getId(participant))} />
                <PresentationIndicator userId={getId(participant)} />
              </span>
            ))}
          </div>

        </div>

        <div className="relative flex shrink-0 items-center gap-2">
          {conversation?.type === "direct" ? (
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-slate-700 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
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
                className="text-slate-700 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                onClick={() => startCall({ conversation, callType: "video" })}
                disabled={!isDirectCallAvailable}
                title="Start video call"
                aria-label="Start video call"
              >
                <Video className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <>
              {activeChannelCall && !activeCall ? (
                <Button
                  type="button"
                  size="sm"
                  className="bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-sm hover:from-blue-600 hover:to-blue-700"
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
                className="hidden border-slate-300 text-slate-700 hover:bg-slate-100 hover:text-slate-950 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-slate-100 sm:inline-flex"
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
                className="hidden border-slate-300 text-slate-700 hover:bg-slate-100 hover:text-slate-950 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-slate-100 sm:inline-flex"
                onClick={() => startCall({ conversation, callType: "video" })}
                title="Start video call"
                aria-label="Start video call"
                disabled={!isGroupCallAvailable}
              >
                <Video className="h-4 w-4" />
                Video
              </Button>
            </>
          )}

          <div className="relative">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
              ref={actionsTriggerRef}
              id="chat-actions-trigger"
              aria-haspopup="menu"
              onKeyDown={(event) => {
                if (["ArrowDown", "ArrowUp"].includes(event.key)) {
                  event.preventDefault();
                  actionsInitialFocusRef.current = event.key === "ArrowUp" ? "last" : "first";
                  setIsActionsMenuOpen(true);
                }
              }}
              onClick={handleToggleActionsMenu}
              title="More actions"
              aria-label="More actions"
              aria-expanded={isActionsMenuOpen}
              aria-controls="chat-actions-menu"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>

            {isActionsMenuOpen ? (
              <ChatActionsMenu
                triggerRef={actionsTriggerRef}
                initialFocus={actionsInitialFocusRef.current}
                onClose={() => setIsActionsMenuOpen(false)}
              >
                <button
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                  onClick={() => handleTogglePreference("isPinned")}
                >
                  <span className="inline-flex items-center gap-2 whitespace-nowrap">
                    <Pin className="h-4 w-4" />
                    {isPinned ? "Unpin chat" : "Pin chat"}
                  </span>
                  {isPinned ? <Check className="h-4 w-4 text-slate-900 dark:text-slate-100" /> : null}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                  onClick={() => handleTogglePreference("isStarred")}
                >
                  <span className="inline-flex items-center gap-2 whitespace-nowrap">
                    <Star className="h-4 w-4" />
                    {isStarred ? "Remove star" : "Star chat"}
                  </span>
                  {isStarred ? <Check className="h-4 w-4 text-slate-900 dark:text-slate-100" /> : null}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                  onClick={() => handleTogglePreference("isArchived")}
                >
                  <span className="inline-flex items-center gap-2 whitespace-nowrap">
                    <Archive className="h-4 w-4" />
                    {isArchived ? "Restore chat" : "Archive chat"}
                  </span>
                  {isArchived ? <Check className="h-4 w-4 text-slate-900 dark:text-slate-100" /> : null}
                </button>
                {conversation ? (
                  <button
                    type="button"
                    role="menuitem"
                    tabIndex={-1}
                    disabled={!canClear || isClearing}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                    onClick={() => { setIsActionsMenuOpen(false); setClearError(""); setClearDialogConversation(getId(conversation)); }}
                  >
                    <Trash2 className="h-4 w-4" />
                    Clear Conversation
                  </button>
                ) : null}
              </ChatActionsMenu>
            ) : null}
          </div>

          <Dialog open={Boolean(clearDialogConversation)} onOpenChange={(open) => { if (!open && !isClearing) setClearDialogConversation(null); }}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Clear Conversation?</DialogTitle>
                <DialogDescription>This clears the conversation history for you only. Other participants will keep their messages.</DialogDescription>
              </DialogHeader>
              {clearError ? <p role="alert" className="text-sm text-rose-600">{clearError}</p> : null}
              <DialogFooter>
                <Button variant="outline" disabled={isClearing} onClick={() => setClearDialogConversation(null)}>Cancel</Button>
                <Button disabled={isClearing} onClick={handleClear}>{isClearing ? "Clearing..." : "Clear Conversation"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
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
                                    ? "border-slate-400 bg-slate-100"
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
                                      ? "bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-sm"
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
                    className="bg-slate-950 text-white hover:bg-slate-800"
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
