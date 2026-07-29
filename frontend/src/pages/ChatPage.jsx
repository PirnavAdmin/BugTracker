import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, CalendarDays, FolderKanban, Pin, Star } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import ChatMeetingDialog from "@/components/chat/ChatMeetingDialog";
import ChatMeetingsPanel from "@/components/chat/ChatMeetingsPanel";
import ChatModuleNav from "@/components/chat/ChatModuleNav";
import ChatSidebar from "@/components/chat/ChatSidebar";
import ChatWindow from "@/components/chat/ChatWindow";
import { useCall } from "@/components/chat/CallProvider";
import EmptyState from "@/components/shared/EmptyState";
import ToastNotice from "@/components/shared/ToastNotice";
import { useAuth } from "@/hooks/use-auth";
import {
  buildMeetingDraft,
  canCreateMeeting,
  filterMeetingsByPreset,
  getMeetingStatus,
  meetingToDraft,
  toMeetingPayload,
} from "@/lib/chat-meetings";
import {
  deleteChatMeeting,
  fetchAllChatMeetings,
  scheduleChatMeeting,
  updateChatMeeting,
} from "@/lib/api";
import { useChatStore } from "@/lib/chatStore";
import { getChatSocket } from "@/lib/socket";

const getId = (value) => String(value?._id || value?.id || value || "");

const ChatPage = () => {
  const { token, user } = useAuth();
  const { channelCalls, joinCall, startCall } = useCall();
  const location = useLocation();
  const navigate = useNavigate();
  const [activeModule, setActiveModule] = useState("chats");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isMeetingDialogOpen, setIsMeetingDialogOpen] = useState(false);
  const [meetingDialogMode, setMeetingDialogMode] = useState("create");
  const [meetingDraft, setMeetingDraft] = useState(buildMeetingDraft(null));
  const [meetingError, setMeetingError] = useState("");
  const [isSavingMeeting, setIsSavingMeeting] = useState(false);
  const [meetingSearch, setMeetingSearch] = useState("");
  const [meetingFilter, setMeetingFilter] = useState("upcoming");
  const [meetings, setMeetings] = useState([]);
  const [isLoadingMeetings, setIsLoadingMeetings] = useState(false);
  const [editingMeetingId, setEditingMeetingId] = useState("");
  const [deletingMeetingIds, setDeletingMeetingIds] = useState([]);
  const [waitingMeetingIds, setWaitingMeetingIds] = useState([]);
  const [toast, setToast] = useState(null);
  const activeConversationId = useChatStore((state) => state.activeConversationId);
  const conversations = useChatStore((state) => state.conversations);
  const hasMoreByConversation = useChatStore((state) => state.hasMoreByConversation);
  const isLoadingMessages = useChatStore((state) => state.isLoadingMessages);
  const messagesByConversation = useChatStore((state) => state.messagesByConversation);
  const onlineUsers = useChatStore((state) => state.onlineUsers);
  const searchResults = useChatStore((state) => state.searchResults);
  const typingByConversation = useChatStore((state) => state.typingByConversation);
  const toggleConversationPreference = useChatStore(
    (state) => state.toggleConversationPreference
  );
  const createDirectConversation = useChatStore(
    (state) => state.createDirectConversation
  );
  const createGroupConversation = useChatStore(
    (state) => state.createGroupConversation
  );
  const deleteConversation = useChatStore((state) => state.deleteConversation);
  const loadMessages = useChatStore((state) => state.loadMessages);
  const searchUsers = useChatStore((state) => state.searchUsers);
  const sendMessage = useChatStore((state) => state.sendMessage);
  const receiveMessage = useChatStore((state) => state.receiveMessage);
  const setActiveConversation = useChatStore((state) => state.setActiveConversation);
  const setCurrentUserId = useChatStore((state) => state.setCurrentUserId);
  const canScheduleMeetings = canCreateMeeting(user?.role);
  const queryConversationId = useMemo(
    () => new URLSearchParams(location.search).get("conversation") || "",
    [location.search]
  );

  const activeConversation = useMemo(
    () =>
      conversations.find(
        (conversation) => getId(conversation) === activeConversationId
      ) || null,
    [activeConversationId, conversations]
  );
  const filteredConversations = useMemo(() => {
    if (activeModule === "archives") {
      return conversations.filter((conversation) => conversation.isArchived);
    }

    if (activeModule === "pinned") {
      return conversations.filter(
        (conversation) => conversation.isPinned && !conversation.isArchived
      );
    }

    if (activeModule === "starred") {
      return conversations.filter(
        (conversation) => conversation.isStarred && !conversation.isArchived
      );
    }

    if (activeModule === "chats") {
      return conversations.filter((conversation) => !conversation.isArchived);
    }

    return conversations;
  }, [activeModule, conversations]);
  const activeMessages = useMemo(
    () =>
      activeConversationId
        ? (messagesByConversation[activeConversationId] || []).filter(
            (message) => message?.metadata?.type !== "meeting"
          )
        : [],
    [activeConversationId, messagesByConversation]
  );
  const conversationMeetings = useMemo(
    () =>
      meetings
        .filter((meeting) => getId(meeting.conversationId) === activeConversationId)
        .sort((left, right) => {
          const leftDate = new Date(left.startTime || left.createdAt || 0);
          const rightDate = new Date(right.startTime || right.createdAt || 0);
          return leftDate.getTime() - rightDate.getTime();
        }),
    [activeConversationId, meetings]
  );
  const nextMeeting = useMemo(
    () => filterMeetingsByPreset(conversationMeetings, "upcoming")[0] || null,
    [conversationMeetings]
  );
  const typingUsers = useMemo(() => {
    const typing = typingByConversation[activeConversationId] || {};
    const currentUserId = getId(user);

    return Object.values(typing).filter(
      (typingUser) =>
        getId(typingUser) !== currentUserId &&
        Date.now() - Number(typingUser.lastTypedAt || 0) < 4500
    );
  }, [activeConversationId, typingByConversation, user]);

  const refreshMeetings = useCallback(async () => {
    setIsLoadingMeetings(true);
    try {
      const nextMeetings = await fetchAllChatMeetings();
      setMeetings(nextMeetings);
    } finally {
      setIsLoadingMeetings(false);
    }
  }, []);

  useEffect(() => {
    setCurrentUserId(getId(user));
  }, [setCurrentUserId, user]);

  useEffect(() => {
    refreshMeetings().catch(() => {});
  }, [refreshMeetings]);

  useEffect(() => {
    if (activeModule !== "chats") {
      return;
    }

    if (!queryConversationId || !conversations.length) {
      return;
    }

    if (activeConversationId !== queryConversationId) {
      setActiveConversation(queryConversationId).catch(() => {});
    }

    setIsSidebarOpen(false);
  }, [
    activeConversationId,
    activeModule,
    conversations.length,
    queryConversationId,
    setActiveConversation,
  ]);

  useEffect(() => {
    if (!toast?.id) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timeoutId);
  }, [toast?.id]);

  useEffect(() => {
    const socket = getChatSocket();

    if (!token || !socket || !activeConversationId) {
      return;
    }

    socket.emit("join_conversation", { conversationId: activeConversationId });
    socket.emit("mark_seen", { conversationId: activeConversationId });
  }, [activeConversationId, token]);

  const handleSelectConversation = useCallback(
    async (conversationId) => {
      navigate(`/chat?conversation=${encodeURIComponent(conversationId)}`);
      await setActiveConversation(conversationId);
      setActiveModule("chats");
      setIsSidebarOpen(false);
    },
    [navigate, setActiveConversation]
  );

  useEffect(() => {
    if (!activeConversation) {
      setMeetingDraft(buildMeetingDraft(null));
      return;
    }

    if (!editingMeetingId) {
      setMeetingDraft(buildMeetingDraft(activeConversation));
    }
  }, [activeConversation, editingMeetingId]);

  useEffect(() => {
    if (!["pinned", "starred", "archives"].includes(activeModule)) {
      return;
    }

    if (!filteredConversations.length) {
      return;
    }

    const activeConversationStillVisible = filteredConversations.some(
      (conversation) => getId(conversation) === activeConversationId
    );

    if (!activeConversationStillVisible) {
      setActiveConversation(getId(filteredConversations[0])).catch(() => {});
    }
  }, [activeConversationId, activeModule, filteredConversations, setActiveConversation]);

  const openCreateMeetingDialog = useCallback(() => {
    if (!activeConversation || !canScheduleMeetings) {
      return;
    }

    setMeetingDialogMode("create");
    setEditingMeetingId("");
    setMeetingDraft(buildMeetingDraft(activeConversation));
    setMeetingError("");
    setIsMeetingDialogOpen(true);
  }, [activeConversation, canScheduleMeetings]);

  const handleMeetingChange = useCallback((field, value) => {
    setMeetingDraft((current) => ({
      ...current,
      [field]: value,
    }));
  }, []);

  const buildMeetingLink = useCallback(
    (meeting) =>
      `/chat?conversation=${encodeURIComponent(getId(meeting?.conversationId))}&meeting=${encodeURIComponent(getId(meeting))}`,
    []
  );

  const handleJoinMeeting = useCallback(
    async (meeting) => {
      const conversationId = getId(meeting?.conversationId);
      const meetingId = getId(meeting);

      if (!conversationId || !meetingId) {
        return;
      }

      const activeConversationCall = channelCalls[conversationId] || null;
      const isHost = getId(meeting?.scheduledBy) === getId(user);
      const status = getMeetingStatus(meeting);
      const meetingStartTime = meeting?.startTime ? new Date(meeting.startTime).getTime() : null;
      const isStartWindowOpen = !meetingStartTime || meetingStartTime <= Date.now();

      await setActiveConversation(conversationId).catch(() => {});
      navigate(`/chat?conversation=${encodeURIComponent(conversationId)}`);
      setActiveModule("chats");
      setIsSidebarOpen(false);

      if (activeConversationCall?.callId) {
        setWaitingMeetingIds((current) => current.filter((id) => id !== meetingId));
        await joinCall(activeConversationCall);
        return;
      }

      if (isHost && status !== "completed" && isStartWindowOpen) {
        const conversation =
          conversations.find((item) => getId(item) === conversationId) || activeConversation;

        if (!conversation) {
          setToast({
            id: Date.now(),
            type: "error",
            message: "Open the chat first before starting the meeting.",
          });
          return;
        }

        await startCall({
          conversation,
          callType: "video",
          meetingId,
          notifyMessage: `${user?.name || "A teammate"} started the meeting "${meeting.title || "Meeting"}"`,
        });
        setToast({
          id: Date.now(),
          type: "success",
          message: "Meeting started in app.",
        });
        return;
      }

      setWaitingMeetingIds((current) =>
        current.includes(meetingId) ? current : [...current, meetingId]
      );
      setToast({
        id: Date.now(),
        type: "info",
        message: "Waiting for the host to start the meeting.",
      });
    },
    [
      activeConversation,
      channelCalls,
      conversations,
      joinCall,
      navigate,
      setActiveConversation,
      startCall,
      user,
    ]
  );

  const handleCopyMeeting = useCallback(async (meeting) => {
    try {
      const absoluteUrl = new URL(
        buildMeetingLink(meeting),
        window.location.origin
      ).toString();
      await navigator.clipboard.writeText(absoluteUrl);
      setToast({
        id: Date.now(),
        type: "success",
        message: "Meeting link copied to clipboard.",
      });
    } catch {
      setToast({
        id: Date.now(),
        type: "error",
        message: "Unable to copy the meeting link.",
      });
    }
  }, [buildMeetingLink]);

  const handleEditMeeting = useCallback((meeting) => {
    setMeetingDialogMode("edit");
    setEditingMeetingId(getId(meeting));
    setMeetingDraft(meetingToDraft(meeting));
    setMeetingError("");
    setIsMeetingDialogOpen(true);
  }, []);

  const handleDeleteMeeting = useCallback(
    async (meeting) => {
      if (!window.confirm(`Delete "${meeting?.title || "this meeting"}"?`)) {
        return;
      }

      const meetingId = getId(meeting);
      setDeletingMeetingIds((current) =>
        current.includes(meetingId) ? current : [...current, meetingId]
      );

      try {
        await new Promise((resolve) => window.setTimeout(resolve, 220));
        const response = await deleteChatMeeting(meetingId);
        if (response?.chatMessage) {
          receiveMessage({
            conversationId: getId(meeting.conversationId),
            message: response.chatMessage,
          });
        }
        await refreshMeetings();
        setToast({
          id: Date.now(),
          type: "success",
          message: response?.message || "Meeting deleted successfully.",
        });
      } catch (error) {
        setToast({
          id: Date.now(),
          type: "error",
          message: error?.response?.data?.message || error?.message || "Unable to delete meeting.",
        });
      } finally {
        setDeletingMeetingIds((current) => current.filter((id) => id !== meetingId));
      }
    },
    [receiveMessage, refreshMeetings]
  );

  const handleSaveMeeting = useCallback(async () => {
    if (!activeConversation && meetingDialogMode === "create") {
      setMeetingError("Select a chat before creating a meeting.");
      return;
    }

    const payload = toMeetingPayload(meetingDraft);

    if (!payload.title) {
      setMeetingError("Meeting title is required.");
      return;
    }

    setIsSavingMeeting(true);
    setMeetingError("");

    try {
      const response =
        meetingDialogMode === "edit" && editingMeetingId
          ? await updateChatMeeting(editingMeetingId, payload)
          : await scheduleChatMeeting(activeConversationId, payload);

      if (response?.chatMessage) {
        receiveMessage({
          conversationId:
            activeConversationId || getId(response?.meeting?.conversationId),
          message: response.chatMessage,
        });
      }

      await refreshMeetings();
      setIsMeetingDialogOpen(false);
      setEditingMeetingId("");
      setActiveModule("meetings");
      setIsSidebarOpen(false);
      setToast({
        id: Date.now(),
        type: response?.warning ? "warning" : "success",
        message: [response?.message || "Meeting saved successfully.", response?.warning]
          .filter(Boolean)
          .join(" "),
      });
    } catch (error) {
      setMeetingError(
        error?.response?.data?.message || error?.message || "Unable to save meeting."
      );
    } finally {
      setIsSavingMeeting(false);
    }
  }, [
    activeConversation,
    activeConversationId,
    editingMeetingId,
    meetingDialogMode,
    meetingDraft,
    receiveMessage,
    refreshMeetings,
  ]);

  useEffect(() => {
    if (!waitingMeetingIds.length) {
      return;
    }

    const nextWaitingIds = waitingMeetingIds.filter((meetingId) => {
      const waitingMeeting = meetings.find((item) => getId(item) === meetingId);
      const conversationId = getId(waitingMeeting?.conversationId);
      return !channelCalls[conversationId]?.callId;
    });

    if (nextWaitingIds.length !== waitingMeetingIds.length) {
      setWaitingMeetingIds(nextWaitingIds);
      setToast({
        id: Date.now(),
        type: "success",
        message: "Meeting started. Join the in-app call now.",
      });
    }
  }, [channelCalls, meetings, waitingMeetingIds]);

  const getMeetingActionMeta = useCallback(
    (meeting) => {
      const conversationId = getId(meeting?.conversationId);
      const meetingId = getId(meeting);
      const activeConversationCall = channelCalls[conversationId] || null;
      const isHost = getId(meeting?.scheduledBy) === getId(user);
      const status = getMeetingStatus(meeting);
      const meetingStartTime = meeting?.startTime ? new Date(meeting.startTime).getTime() : null;
      const isStartWindowOpen = !meetingStartTime || meetingStartTime <= Date.now();

      if (activeConversationCall?.callId) {
        return {
          label: "Join",
          disabled: false,
        };
      }

      if (isHost) {
        if (status === "completed") {
          return {
            label: "Completed",
            disabled: true,
          };
        }

        if (!isStartWindowOpen) {
          return {
            label: "Starts Soon",
            disabled: true,
          };
        }

        return {
          label: "Start Meeting",
          disabled: false,
        };
      }

      return {
        label: waitingMeetingIds.includes(meetingId) ? "Waiting for Host" : "Waiting for Host",
        disabled: false,
      };
    },
    [channelCalls, user, waitingMeetingIds]
  );

  const renderModuleContent = () => {
    if (activeModule === "meetings") {
      return (
        <ChatMeetingsPanel
          currentUser={user}
          deletingMeetingIds={deletingMeetingIds}
          getMeetingActionMeta={getMeetingActionMeta}
          meetings={meetings}
          search={meetingSearch}
          selectedFilter={meetingFilter}
          onCopy={handleCopyMeeting}
          onDelete={handleDeleteMeeting}
          onEdit={handleEditMeeting}
          onJoin={handleJoinMeeting}
          onNewMeeting={openCreateMeetingDialog}
          onSearchChange={setMeetingSearch}
          onFilterChange={setMeetingFilter}
        />
      );
    }

    if (activeModule === "files") {
      const metaByModule = {
        files: {
          title: "Shared files",
          description: "Shared files will live here so the chat module feels closer to Teams.",
          icon: <FolderKanban className="h-6 w-6" />,
        },
      };
      const meta = metaByModule[activeModule];

      return (
        <div className="flex h-full flex-1 flex-col overflow-hidden bg-white px-6 py-6">
          <EmptyState title={meta.title} description={meta.description} icon={meta.icon} />
        </div>
      );
    }

    if (
      ["pinned", "starred", "archives"].includes(activeModule) &&
      !filteredConversations.length
    ) {
      const metaByModule = {
        pinned: {
          title: "No pinned chats",
          description: "Pin important chats from the 3-dot menu in the chat header.",
          icon: <Pin className="h-6 w-6" />,
        },
        starred: {
          title: "No starred chats",
          description: "Star chats from the 3-dot menu so they appear here.",
          icon: <Star className="h-6 w-6" />,
        },
        archives: {
          title: "No archived chats",
          description: "Archived chats will appear here until you restore them.",
          icon: <Archive className="h-6 w-6" />,
        },
      };
      const meta = metaByModule[activeModule];

      return (
        <div className="flex h-full flex-1 flex-col overflow-hidden bg-white px-6 py-6">
          <EmptyState title={meta.title} description={meta.description} icon={meta.icon} />
        </div>
      );
    }

    return (
      <ChatWindow
        conversation={activeConversation}
        currentUser={user}
        hasMore={Boolean(hasMoreByConversation[activeConversationId])}
        isLoadingMessages={isLoadingMessages}
        messages={activeMessages}
        onlineUsers={onlineUsers}
        onDelete={deleteConversation}
        onLoadOlder={() =>
          activeConversationId &&
          loadMessages(activeConversationId, {
            older: true,
          })
        }
        onOpenMeetingDialog={openCreateMeetingDialog}
        onSend={sendMessage}
        onToggleConversationPreference={(field) =>
          activeConversationId && toggleConversationPreference(activeConversationId, field)
        }
        onToggleSidebar={() => setIsSidebarOpen(true)}
        typingUsers={typingUsers}
      />
    );
  };

  return (
    <div className="flex h-full w-full overflow-hidden bg-slate-100">
      <ChatModuleNav activeModule={activeModule} onSelect={setActiveModule} />
      <ChatSidebar
        activeConversationId={activeConversationId}
        conversations={filteredConversations}
        currentUserId={getId(user)}
        isOpen={isSidebarOpen}
        onlineUsers={onlineUsers}
        onClose={() => setIsSidebarOpen(false)}
        onCreateDirect={createDirectConversation}
        onCreateGroup={createGroupConversation}
        onDelete={deleteConversation}
        onSearch={searchUsers}
        onSelect={handleSelectConversation}
        searchResults={searchResults}
      />
      {renderModuleContent()}
      <ChatMeetingDialog
        conversation={activeConversation}
        draft={meetingDraft}
        error={meetingError}
        isOpen={isMeetingDialogOpen}
        isSaving={isSavingMeeting}
        mode={meetingDialogMode}
        onChange={handleMeetingChange}
        onClose={setIsMeetingDialogOpen}
        onSave={handleSaveMeeting}
      />
      <ToastNotice toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
};

export default ChatPage;
