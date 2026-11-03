import { useEffect, useRef, useState } from "react";
import { MessageCircle } from "lucide-react";
import { useLocation } from "react-router-dom";
import ToastNotice from "@/components/shared/ToastNotice";
import { useAuth } from "@/hooks/use-auth";
import { useChatStore } from "@/lib/chatStore";
import { getChatSocket } from "@/lib/socket";

const getId = (value) => String(value?._id || value?.id || value || "");

const getSenderName = (message) =>
  message?.senderId?.name || message?.sender?.name || "New chat message";

const getMessagePreview = (message) => {
  const text = String(message?.message || "").trim();

  if (text) {
    return text;
  }

  return Array.isArray(message?.attachments) && message.attachments.length
    ? "Sent an attachment"
    : "Sent a message";
};

const ChatRealtimeBridge = () => {
  const location = useLocation();
  const { token, user } = useAuth();
  const [toast, setToast] = useState(null);
  const activeConversationId = useChatStore((state) => state.activeConversationId);
  const loadConversations = useChatStore((state) => state.loadConversations);
  const markSeenLocal = useChatStore((state) => state.markSeenLocal);
  const receiveMessage = useChatStore((state) => state.receiveMessage);
  const setCurrentUserId = useChatStore((state) => state.setCurrentUserId);
  const setOnlineUsers = useChatStore((state) => state.setOnlineUsers);
  const setTyping = useChatStore((state) => state.setTyping);
  const currentUserId = getId(user);
  const activeConversationRef = useRef("");
  const currentUserIdRef = useRef("");
  const pathnameRef = useRef(location.pathname);

  useEffect(() => {
    activeConversationRef.current = String(activeConversationId || "");
  }, [activeConversationId]);

  useEffect(() => {
    currentUserIdRef.current = currentUserId;
  }, [currentUserId]);

  useEffect(() => {
    pathnameRef.current = location.pathname;
  }, [location.pathname]);

  useEffect(() => {
    setCurrentUserId(currentUserId);
  }, [currentUserId, setCurrentUserId]);

  useEffect(() => {
    if (!token) {
      return undefined;
    }

    loadConversations({ force: true });

    const socket = getChatSocket(token);

    if (!socket) {
      return undefined;
    }

    const handleReceiveMessage = (payload) => {
      const message = payload?.message;
      const conversationId = String(payload?.conversationId || message?.conversationId || "");
      const senderId = getId(message?.senderId);
      const isOwnMessage = senderId === currentUserIdRef.current;
      const isOpenConversation =
        pathnameRef.current === "/chat" && conversationId === activeConversationRef.current;

      receiveMessage(payload);

      if (!isOwnMessage && !isOpenConversation) {
        setToast({
          id: `${conversationId}-${getId(message)}-${Date.now()}`,
          type: "chat",
          title: getSenderName(message),
          message: getMessagePreview(message),
        });
      }
    };

    const handleOnlineUsers = (users) => setOnlineUsers(users);
    const handleTyping = (payload) =>
      setTyping({
        conversationId: payload.conversationId,
        user: payload.user,
        stopped: payload.stopped,
      });
    const handleMessageSeen = (payload) => markSeenLocal(payload);
    const handleConnect = () => {
      const currentConversationId = useChatStore.getState().activeConversationId;

      if (currentConversationId) {
        socket.emit("join_conversation", { conversationId: currentConversationId });
        socket.emit("mark_seen", { conversationId: currentConversationId });
      }
    };

    socket.on("receive_message", handleReceiveMessage);
    socket.on("online_users", handleOnlineUsers);
    socket.on("user_typing", handleTyping);
    socket.on("message_seen", handleMessageSeen);
    socket.on("connect", handleConnect);
    socket.connect();

    return () => {
      socket.off("receive_message", handleReceiveMessage);
      socket.off("online_users", handleOnlineUsers);
      socket.off("user_typing", handleTyping);
      socket.off("message_seen", handleMessageSeen);
      socket.off("connect", handleConnect);
    };
  }, [
    loadConversations,
    markSeenLocal,
    receiveMessage,
    setOnlineUsers,
    setTyping,
    token,
  ]);

  useEffect(() => {
    if (!toast) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => setToast(null), 5000);

    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  return (
    <ToastNotice
      icon={<MessageCircle className="h-5 w-5" />}
      toast={toast}
      onDismiss={() => setToast(null)}
    />
  );
};

export default ChatRealtimeBridge;
