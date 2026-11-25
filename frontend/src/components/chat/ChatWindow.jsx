import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import ChatHeader from "@/components/chat/ChatHeader";
import MessageBubble from "@/components/chat/MessageBubble";
import MessageInput from "@/components/chat/MessageInput";
import { useChatStore } from "@/lib/chatStore";
import { formatRelativeDateLabel, getIndianDateKey } from "@/lib/utils";

const getId = (value) => String(value?._id || value?.id || value || "");

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
    const scrollRef = useRef(null);
    const currentUserId = getId(currentUser);
    const conversationId = getId(conversation);

    // Microsoft Teams-inspired states
    const [replyingTo, setReplyingTo] = useState(null);
    const [editingMessage, setEditingMessage] = useState(null);
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [searchMatchIndex, setSearchMatchIndex] = useState(0);

    const toggleReaction = useChatStore((state) => state.toggleReaction);
    const editMessageStore = useChatStore((state) => state.editMessage);
    const deleteMessageStore = useChatStore((state) => state.deleteMessage);

    // Reset interaction state on conversation switch
    useEffect(() => {
      setReplyingTo(null);
      setEditingMessage(null);
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

    const messageRows = useMemo(() => {
      const rows = [];
      let previousDate = "";

      messages.forEach((message) => {
        const dateKey = getIndianDateKey(message.createdAt);

        if (dateKey !== previousDate) {
          rows.push({
            type: "date",
            id: `date-${dateKey}`,
            label: formatRelativeDateLabel(message.createdAt),
          });
          previousDate = dateKey;
        }

        rows.push({
          type: "message",
          id: getId(message),
          message,
        });
      });

      return rows;
    }, [messages]);

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
              ) : (
                <MessageBubble
                  key={row.id}
                  message={row.message}
                  currentUserId={currentUserId}
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
      </section>
    );
  }
);

ChatWindow.displayName = "ChatWindow";

export default ChatWindow;
