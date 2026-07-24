import { memo, useEffect, useMemo, useRef } from "react";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import ChatHeader from "@/components/chat/ChatHeader";
import MessageBubble from "@/components/chat/MessageBubble";
import MessageInput from "@/components/chat/MessageInput";
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
    nextMeeting,
    onlineUsers,
    onDelete,
    onJoinMeeting,
    onLoadOlder,
    onOpenMeetingDialog,
    onSend,
    onToggleSidebar,
    typingUsers,
  }) => {
    const scrollRef = useRef(null);
    const currentUserId = getId(currentUser);

    useEffect(() => {
      const node = scrollRef.current;

      if (!node) {
        return;
      }

      node.scrollTop = node.scrollHeight;
    }, [conversation?._id, messages.length]);

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
        <section className="flex h-full flex-1 flex-col items-center justify-center overflow-hidden bg-[#f0f2f5]">
          <div className="max-w-sm px-6 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[24px] border border-blue-100 bg-blue-50 text-blue-600">
              <MessageCircle className="h-6 w-6" />
            </div>
            <h1 className="mt-4 text-xl font-extrabold text-slate-950">
              Select a conversation
            </h1>
            <p className="mt-2 text-sm font-medium leading-6 text-slate-500">
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
      <section className="flex h-full flex-1 flex-col overflow-hidden bg-white">
        <ChatHeader
          canScheduleMeetings={canScheduleMeetings}
          conversation={conversation}
          currentUserId={currentUserId}
          nextMeeting={nextMeeting}
          onlineUsers={onlineUsers}
          onDelete={onDelete}
          onJoinMeeting={onJoinMeeting}
          onOpenMeetingDialog={onOpenMeetingDialog}
          onToggleSidebar={onToggleSidebar}
        />

        <div
          ref={scrollRef}
          className="dashboard-scrollbar min-h-0 flex-1 overflow-y-auto bg-[#e5ddd5] px-3 py-4 sm:px-6 sm:py-5"
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
                  <span className="rounded-full border border-emerald-100 bg-white/88 px-3 py-1 text-xs font-bold text-slate-500 shadow-sm">
                    {row.label}
                  </span>
                </div>
              ) : (
                <MessageBubble
                  key={row.id}
                  message={row.message}
                  currentUserId={currentUserId}
                />
              )
            )}
          </div>

          {typingUsers.length ? (
            <div className="mt-4 rounded-full border border-emerald-100 bg-white/88 px-4 py-2 text-xs font-semibold text-slate-500 shadow-sm">
              {typingUsers.map((user) => user.name).join(", ")} typing...
            </div>
          ) : null}
        </div>

        <MessageInput
          conversationId={getId(conversation)}
          currentUser={currentUser}
          onSend={onSend}
        />
      </section>
    );
  }
);

ChatWindow.displayName = "ChatWindow";

export default ChatWindow;
