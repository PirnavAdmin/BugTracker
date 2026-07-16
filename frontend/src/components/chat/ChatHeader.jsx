import { memo, useState } from "react";
import { Camera, Hash, Menu, Phone, Trash2, UsersRound } from "lucide-react";
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
import { useCall } from "@/components/chat/CallProvider";
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

const ChatHeader = memo(({ conversation, currentUserId, onlineUsers, onDelete, onToggleSidebar }) => {
  const { activeCall, callPresence, channelCalls, joinCall, startCall } = useCall();
  const [isParticipantsOpen, setIsParticipantsOpen] = useState(false);
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
        </div>
      </div>

      {conversation?.type === "direct" ? (
        <div className="flex shrink-0 items-center gap-2">
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
                </div>
              ))}
            </div>
            <DialogFooter className="items-stretch sm:items-center sm:justify-between">
              <p className="text-xs font-medium text-slate-500">
                Add participants will be enabled after chat member management is wired on the backend.
              </p>
              <Button type="button" disabled>
                Add participants
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </header>
  );
});

ChatHeader.displayName = "ChatHeader";

export default ChatHeader;
