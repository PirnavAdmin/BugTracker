import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, CalendarDays, FolderKanban, Pin, Star } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import ChatMeetingDialog from "@/components/chat/ChatMeetingDialog";
import ChatMeetingsPanel from "@/components/chat/ChatMeetingsPanel";
import ChatMeetingsSidebar from "@/components/chat/ChatMeetingsSidebar";
import ChatModuleNav from "@/components/chat/ChatModuleNav";
import ChatSidebar from "@/components/chat/ChatSidebar";
import ChatWindow from "@/components/chat/ChatWindow";
import EmptyState from "@/components/shared/EmptyState";
import ToastNotice from "@/components/shared/ToastNotice";
import { useAuth } from "@/hooks/use-auth";
import {
  buildMeetingDraft,
  canCreateMeeting,
  filterMeetingsByPreset,
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
  const [toast, setToast] = useState(null);
  const activeConversationId = useChatStore((state) => state.activeConversationId);
  const conversations = useChatStore((state) => state.conversations);
  const hasMoreByConversation = useChatStore((state) => state.hasMoreByConversation);
  const isLoadingMessages = useChatStore((state) => state.isLoadingMessages);
  const messagesByConversation = useChatStore((state) => state.messagesByConversation);
  const onlineUsers = useChatStore((state) => state.onlineUsers);
  const searchResults = useChatStore((state) => state.searchResults);
  const typingByConversation = useChatStore((state) => state.typingByConversation);
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
  const activeMessages = activeConversationId
    ? messagesByConversation[activeConversationId] || []
    : [];
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
    if (!queryConversationId || !conversations.length) {
      return;
    }

    if (activeConversationId !== queryConversationId) {
      setActiveConversation(queryConversationId).catch(() => {});
    }

    setActiveModule("chats");
    setIsSidebarOpen(false);
  }, [activeConversationId, conversations.length, queryConversationId, setActiveConversation]);

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
      await setActiveConversation(conversationId);
      setActiveModule("chats");
      setIsSidebarOpen(false);
    },
    [setActiveConversation]
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

  const handleJoinMeeting = useCallback((meeting) => {
    if (!meeting?.meetingUrl) {
      return;
    }

    setActiveModule("chats");
    setIsSidebarOpen(false);
    navigate(meeting.meetingUrl);
  }, [navigate]);

  const handleCopyMeeting = useCallback(async (meeting) => {
    try {
      const absoluteUrl = new URL(
        meeting?.meetingUrl || "/chat",
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
  }, []);

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

      try {
        const response = await deleteChatMeeting(getId(meeting));
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
      setActiveModule("chats");
      setIsSidebarOpen(false);
      setToast({
        id: Date.now(),
        type: "success",
        message: response?.message || "Meeting saved successfully.",
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

  const activeSidebarMeetings =
    activeModule === "chats"
      ? filterMeetingsByPreset(conversationMeetings, "upcoming").slice(0, 8)
      : filterMeetingsByPreset(meetings, "upcoming").slice(0, 8);

  const renderModuleContent = () => {
    if (activeModule === "meetings") {
      return (
        <ChatMeetingsPanel
          currentUser={user}
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

    if (["pinned", "files", "starred", "archives"].includes(activeModule)) {
      const metaByModule = {
        pinned: {
          title: "Pinned items",
          description: "Pinned chats and meetings will appear here once that workflow is added.",
          icon: <Pin className="h-6 w-6" />,
        },
        files: {
          title: "Shared files",
          description: "Shared files will live here so the chat module feels closer to Teams.",
          icon: <FolderKanban className="h-6 w-6" />,
        },
        starred: {
          title: "Starred",
          description: "Starred messages and meetings will be grouped here for quick access.",
          icon: <Star className="h-6 w-6" />,
        },
        archives: {
          title: "Archives",
          description: "Archived chats and meeting history will be shown here.",
          icon: <Archive className="h-6 w-6" />,
        },
      };
      const meta = metaByModule[activeModule];

      return (
        <div className="flex h-full flex-1 flex-col overflow-hidden bg-white px-5 py-5">
          <EmptyState title={meta.title} description={meta.description} icon={meta.icon} />
        </div>
      );
    }

    return (
      <ChatWindow
        canScheduleMeetings={canScheduleMeetings}
        conversation={activeConversation}
        currentUser={user}
        hasMore={Boolean(hasMoreByConversation[activeConversationId])}
        isLoadingMessages={isLoadingMessages}
        messages={activeMessages}
        nextMeeting={nextMeeting}
        onlineUsers={onlineUsers}
        onDelete={deleteConversation}
        onJoinMeeting={handleJoinMeeting}
        onLoadOlder={() =>
          activeConversationId &&
          loadMessages(activeConversationId, {
            older: true,
          })
        }
        onOpenMeetingDialog={openCreateMeetingDialog}
        onSend={sendMessage}
        onToggleSidebar={() => setIsSidebarOpen(true)}
        typingUsers={typingUsers}
      />
    );
  };

  return (
    <div className="flex h-full w-full overflow-hidden bg-[linear-gradient(180deg,#f7fbff_0%,#eef4ff_100%)]">
      <ChatModuleNav activeModule={activeModule} onSelect={setActiveModule} />
      <ChatSidebar
        activeConversationId={activeConversationId}
        conversations={conversations}
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
      <ChatMeetingsSidebar
        currentUser={user}
        meetings={activeSidebarMeetings}
        onCopy={handleCopyMeeting}
        onDelete={handleDeleteMeeting}
        onEdit={handleEditMeeting}
        onJoin={handleJoinMeeting}
        onNewMeeting={openCreateMeetingDialog}
        title={activeModule === "meetings" ? "Meetings" : "Meetings Sidebar"}
      />
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
