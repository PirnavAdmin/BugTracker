import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Forward, MessageCircle, Pin, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import ChatHeader from "@/components/chat/ChatHeader";
import MessageBubble from "@/components/chat/MessageBubble";
import MessageInput from "@/components/chat/MessageInput";
import { useChatStore } from "@/lib/chatStore";
import { cn, formatRelativeDateLabel, getIndianDateKey } from "@/lib/utils";

const getId = (value) => String(value?._id || value?.id || value || "");

const getConversationTitle = (conv, currentUserId) => {
  if (!conv) return "Chat";
  if (conv.type === "direct") {
    const other = (conv.participants || []).find((p) => getId(p) !== String(currentUserId));
    return other?.name || "Direct message";
  }
  return conv.name || conv.projectId?.name || conv.teamId?.name || "Group chat";
};

const ChatWindow = memo(
  ({
    canScheduleMeetings,
    conversation,
    currentUser,
    hasMore,
    isLoadingMessages,
    messages,
    onlineUsers,
    onDelete,
    onLoadOlder,
    onOpenMeetingDialog,
    onSend,
    onToggleConversationPreference,
    onToggleSidebar,
    typingUsers,
  }) => {
    const navigate = useNavigate();
    const scrollRef = useRef(null);
    const currentUserId = getId(currentUser);
    const conversationId = getId(conversation);

    // Microsoft Teams-inspired states
    const [replyingTo, setReplyingTo] = useState(null);
    const [editingMessage, setEditingMessage] = useState(null);
    const [forwardingMessage, setForwardingMessage] = useState(null);
    const [forwardSearch, setForwardSearch] = useState("");
    const [forwardNote, setForwardNote] = useState("");
    const [pinnedIndex, setPinnedIndex] = useState(0);
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [searchMatchIndex, setSearchMatchIndex] = useState(0);

    const conversations = useChatStore((state) => state.conversations);
    const toggleReaction = useChatStore((state) => state.toggleReaction);
    const editMessageStore = useChatStore((state) => state.editMessage);
    const deleteMessageStore = useChatStore((state) => state.deleteMessage);
    const togglePinMessage = useChatStore((state) => state.togglePinMessage);
    const markUnreadFromMessage = useChatStore((state) => state.markUnreadFromMessage);
    const unreadFromMessageId = useChatStore(
      (state) => state.unreadFromMessageByConversation?.[conversationId] || ""
    );

    // Reset interaction state on conversation switch
    useEffect(() => {
      setReplyingTo(null);
      setEditingMessage(null);
      setForwardingMessage(null);
      setForwardSearch("");
      setForwardNote("");
      setPinnedIndex(0);
      setSearchQuery("");
      setIsSearchOpen(false);
      setSearchMatchIndex(0);
    }, [conversationId]);

    // Scroll to bottom on initial load and incoming messages
    useEffect(() => {
      const node = scrollRef.current;
      if (!node) return;
      node.scrollTop = node.scrollHeight;
    }, [conversationId, messages.length]);

    // Jump to specific message element (for quotes or search matches)
    const handleJumpToMessage = useCallback((targetMessageId) => {
      if (!targetMessageId) return;
      const el = document.getElementById(`msg-${targetMessageId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("ring-2", "ring-blue-500", "rounded-2xl", "transition-all");
        setTimeout(() => {
          el.classList.remove("ring-2", "ring-blue-500", "rounded-2xl", "transition-all");
        }, 2200);
      }
    }, []);

    // Search matches within active messages
    const matchingMessageIds = useMemo(() => {
      if (!searchQuery.trim()) return [];
      const query = searchQuery.trim().toLowerCase();
      return messages
        .filter((m) => !m.deleted && m.message?.toLowerCase().includes(query))
        .map((m) => getId(m));
    }, [messages, searchQuery]);

    const searchMatchTotal = matchingMessageIds.length;

    const handleSearchNext = useCallback(() => {
      if (!searchMatchTotal) return;
      const nextIdx = (searchMatchIndex + 1) % searchMatchTotal;
      setSearchMatchIndex(nextIdx);
      handleJumpToMessage(matchingMessageIds[nextIdx]);
    }, [handleJumpToMessage, matchingMessageIds, searchMatchIndex, searchMatchTotal]);

    const handleSearchPrev = useCallback(() => {
      if (!searchMatchTotal) return;
      const prevIdx = (searchMatchIndex - 1 + searchMatchTotal) % searchMatchTotal;
      setSearchMatchIndex(prevIdx);
      handleJumpToMessage(matchingMessageIds[prevIdx]);
    }, [handleJumpToMessage, matchingMessageIds, searchMatchIndex, searchMatchTotal]);

    // When search query produces matches, jump to first match
    useEffect(() => {
      if (matchingMessageIds.length > 0) {
        setSearchMatchIndex(0);
        handleJumpToMessage(matchingMessageIds[0]);
      }
    }, [handleJumpToMessage, matchingMessageIds]);

    const handleReact = useCallback(
      (messageId, emoji) => {
        toggleReaction({
          conversationId,
          messageId,
          emoji,
          currentUser,
        });
      },
      [conversationId, currentUser, toggleReaction]
    );

    const handleSaveEdit = useCallback(
      (messageId, text) => {
        editMessageStore({
          conversationId,
          messageId,
          text,
        });
        setEditingMessage(null);
      },
      [conversationId, editMessageStore]
    );

    const handleDeleteMessage = useCallback(
      (messageId) => {
        deleteMessageStore({
          conversationId,
          messageId,
        });
      },
      [conversationId, deleteMessageStore]
    );

    const handlePinMessage = useCallback(
      (messageId) => {
        togglePinMessage({
          conversationId,
          messageId,
          currentUser,
        });
      },
      [conversationId, currentUser, togglePinMessage]
    );

    const handleMarkUnread = useCallback(
      (messageId) => {
        markUnreadFromMessage({
          conversationId,
          messageId,
        });
      },
      [conversationId, markUnreadFromMessage]
    );

    const handleCreateIssue = useCallback(
      (message) => {
        const text = (message?.message || "").trim();
        const senderName = message?.senderId?.name || "Teammate";
        const targetRoute = currentUser?.role === "Tester" ? "/bugs" : "/issues";
        navigate(targetRoute, {
          state: {
            prefillFromChat: {
              title: text.slice(0, 90),
              description: `Reported from chat by ${senderName}:\n\n${text}`,
            },
          },
        });
      },
      [currentUser?.role, navigate]
    );

    const handleForwardToConversation = useCallback(
      (targetConvId) => {
        if (!forwardingMessage || !targetConvId) return;
        const senderName = forwardingMessage?.senderId?.name || "Teammate";
        const bodyText = forwardNote.trim()
          ? `${forwardNote.trim()}\n\n${forwardingMessage.message || ""}`.trim()
          : forwardingMessage.message || "Forwarded attachment";

        onSend?.({
          conversationId: targetConvId,
          message: bodyText,
          attachments: forwardingMessage.attachments || [],
          currentUser,
          metadata: {
            forwardedFrom: {
              id: getId(forwardingMessage),
              senderName,
              text: forwardingMessage.message || "Attachment",
              createdAt: forwardingMessage.createdAt,
            },
          },
        });
        setForwardingMessage(null);
        setForwardNote("");
        setForwardSearch("");
      },
      [currentUser, forwardNote, forwardingMessage, onSend]
    );

    const pinnedMessages = useMemo(
      () => messages.filter((m) => !m.deleted && m.metadata?.isPinned),
      [messages]
    );

    const activePinnedMessage = pinnedMessages.length
      ? pinnedMessages[pinnedIndex % pinnedMessages.length]
      : null;

    const filteredForwardConversations = useMemo(() => {
      const q = forwardSearch.trim().toLowerCase();
      return conversations.filter((c) => {
        if (c.isArchived) return false;
        if (!q) return true;
        return getConversationTitle(c, currentUserId).toLowerCase().includes(q);
      });
    }, [conversations, currentUserId, forwardSearch]);

    const messageRows = useMemo(() => {
      const rows = [];
      let previousDate = "";

      messages.forEach((message) => {
        const msgId = getId(message);
        const dateKey = getIndianDateKey(message.createdAt);

        if (dateKey !== previousDate) {
          rows.push({
            type: "date",
            id: `date-${dateKey}`,
            label: formatRelativeDateLabel(message.createdAt),
          });
          previousDate = dateKey;
        }

        if (unreadFromMessageId && msgId === unreadFromMessageId) {
          rows.push({
            type: "unread",
            id: `unread-${msgId}`,
          });
        }

        rows.push({
          type: "message",
          id: msgId,
          message,
        });
      });

      return rows;
    }, [messages, unreadFromMessageId]);

    if (!conversation) {
      return (
        <section className="flex h-full flex-1 flex-col items-center justify-center overflow-hidden bg-[#f0f2f5] dark:bg-slate-950">
          <div className="max-w-sm px-6 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[24px] border border-blue-100 bg-blue-50 text-blue-600 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-400">
              <MessageCircle className="h-6 w-6" />
            </div>
            <h1 className="mt-4 text-xl font-extrabold text-slate-950 dark:text-slate-100">
              Select a conversation
            </h1>
            <p className="mt-2 text-sm font-medium leading-6 text-slate-500 dark:text-slate-400">
              Search for a teammate or choose a project channel to start messaging.
            </p>
            <Button
              type="button"
              className="mt-4 lg:hidden"
              onClick={onToggleSidebar}
            >
              Open chats
            </Button>
          </div>
        </section>
      );
    }

    return (
      <section className="flex h-full flex-1 flex-col overflow-hidden bg-white dark:bg-slate-950">
        <ChatHeader
          canScheduleMeetings={canScheduleMeetings}
          conversation={conversation}
          currentUserId={currentUserId}
          onlineUsers={onlineUsers}
          onDelete={onDelete}
          onOpenMeetingDialog={onOpenMeetingDialog}
          onToggleConversationPreference={onToggleConversationPreference}
          onToggleSidebar={onToggleSidebar}
          isSearchOpen={isSearchOpen}
          setIsSearchOpen={setIsSearchOpen}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onSearchPrev={handleSearchPrev}
          onSearchNext={handleSearchNext}
          searchMatchIndex={searchMatchIndex}
          searchMatchTotal={searchMatchTotal}
        />

        {/* Pinned Message Banner (Teams-style) */}
        {activePinnedMessage ? (
          <div className="flex items-center justify-between gap-3 border-b border-blue-100 bg-blue-50/80 px-4 py-2 text-xs dark:border-blue-950 dark:bg-blue-950/30">
            <button
              type="button"
              onClick={() => {
                handleJumpToMessage(getId(activePinnedMessage));
                if (pinnedMessages.length > 1) {
                  setPinnedIndex((cur) => (cur + 1) % pinnedMessages.length);
                }
              }}
              className="flex min-w-0 flex-1 items-center gap-2 text-left"
              title="Click to jump to pinned message"
            >
              <Pin className="h-3.5 w-3.5 shrink-0 text-blue-600 dark:text-blue-400" />
              <span className="shrink-0 font-extrabold text-blue-700 dark:text-blue-300">
                Pinned{pinnedMessages.length > 1 ? ` (${(pinnedIndex % pinnedMessages.length) + 1}/${pinnedMessages.length})` : ""}:
              </span>
              <span className="truncate font-medium text-slate-700 dark:text-slate-200">
                {activePinnedMessage.senderId?.name ? `${activePinnedMessage.senderId.name}: ` : ""}
                {activePinnedMessage.message || "Attachment"}
              </span>
            </button>
            <button
              type="button"
              onClick={() => handlePinMessage(getId(activePinnedMessage))}
              className="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-slate-500 hover:bg-blue-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-blue-900"
              title="Unpin message"
            >
              Unpin
            </button>
          </div>
        ) : null}

        <div
          ref={scrollRef}
          className="dashboard-scrollbar min-h-0 flex-1 overflow-y-auto bg-[#e5ddd5]/60 dark:bg-[#0b101b] px-3 py-4 sm:px-6 sm:py-5"
        >
          {hasMore ? (
            <div className="mb-4 flex justify-center">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onLoadOlder}
                disabled={isLoadingMessages}
              >
                Load older
              </Button>
            </div>
          ) : null}

          <div className="space-y-4">
            {messageRows.map((row) =>
              row.type === "date" ? (
                <div key={row.id} className="flex items-center justify-center">
                  <span className="rounded-full border border-slate-200/80 bg-white/90 px-3 py-1 text-xs font-bold text-slate-600 shadow-sm dark:border-slate-800 dark:bg-slate-900/90 dark:text-slate-300">
                    {row.label}
                  </span>
                </div>
              ) : row.type === "unread" ? (
                <div key={row.id} className="flex items-center gap-3 py-1">
                  <div className="h-px flex-1 bg-rose-400/70" />
                  <span className="rounded-full bg-rose-500 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-white shadow-xs">
                    Unread messages
                  </span>
                  <div className="h-px flex-1 bg-rose-400/70" />
                </div>
              ) : (
                <MessageBubble
                  key={row.id}
                  message={row.message}
                  currentUserId={currentUserId}
                  participants={conversation?.participants || []}
                  onReply={(target) => {
                    setEditingMessage(null);
                    setReplyingTo(target);
                  }}
                  onEdit={(target) => {
                    setReplyingTo(null);
                    setEditingMessage(target);
                  }}
                  onDelete={handleDeleteMessage}
                  onReact={handleReact}
                  onPin={handlePinMessage}
                  onMarkUnread={handleMarkUnread}
                  onForward={(msg) => setForwardingMessage(msg)}
                  onCreateIssue={handleCreateIssue}
                  onJumpToMessage={handleJumpToMessage}
                  searchQuery={searchQuery}
                />
              )
            )}
          </div>

          {typingUsers.length ? (
            <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-slate-200/80 bg-white/88 px-4 py-2 text-xs font-semibold text-slate-600 shadow-sm dark:border-slate-800 dark:bg-slate-900/90 dark:text-slate-300">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-blue-500" />
              <span>{typingUsers.map((user) => user.name).join(", ")} typing...</span>
            </div>
          ) : null}
        </div>

        <MessageInput
          conversationId={conversationId}
          currentUser={currentUser}
          onSend={onSend}
          replyingTo={replyingTo}
          onCancelReply={() => setReplyingTo(null)}
          editingMessage={editingMessage}
          onCancelEdit={() => setEditingMessage(null)}
          onEditMessage={handleSaveEdit}
        />

        {/* Forward Message Dialog */}
        <Dialog
          open={Boolean(forwardingMessage)}
          onOpenChange={(open) => {
            if (!open) {
              setForwardingMessage(null);
              setForwardNote("");
              setForwardSearch("");
            }
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Forward className="h-4 w-4 text-blue-600" />
                Forward message
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              {forwardingMessage ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                  <p className="font-bold text-slate-800 dark:text-slate-100">
                    {forwardingMessage.senderId?.name || "Teammate"}
                  </p>
                  <p className="mt-0.5 line-clamp-2">{forwardingMessage.message || "Attachment"}</p>
                </div>
              ) : null}

              <Input
                value={forwardNote}
                onChange={(e) => setForwardNote(e.target.value)}
                placeholder="Add an optional note..."
              />

              <Input
                value={forwardSearch}
                onChange={(e) => setForwardSearch(e.target.value)}
                placeholder="Search chats or channels..."
              />

              <div className="dashboard-scrollbar max-h-56 space-y-1.5 overflow-y-auto pr-1">
                {filteredForwardConversations.map((conv) => {
                  const targetId = getId(conv);
                  const convTitle = getConversationTitle(conv, currentUserId);
                  return (
                    <div
                      key={targetId}
                      className="flex items-center justify-between rounded-xl border border-slate-200/80 px-3 py-2 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900"
                    >
                      <span className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                        {convTitle}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        className="h-7 rounded-lg px-3 text-xs"
                        onClick={() => handleForwardToConversation(targetId)}
                      >
                        Send
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setForwardingMessage(null)}
              >
                Cancel
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </section>
    );
  }
);

ChatWindow.displayName = "ChatWindow";

export default ChatWindow;
