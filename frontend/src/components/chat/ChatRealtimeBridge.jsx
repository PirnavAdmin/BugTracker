import { useEffect, useRef, useState } from "react";
import { MessageCircle } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import ToastNotice from "@/components/shared/ToastNotice";
import { useAuth } from "@/hooks/use-auth";
import { useChatStore } from "@/lib/chatStore";
import { getChatSocket } from "@/lib/socket";

const NOTIFICATION_SOUND_URL = `${import.meta.env.BASE_URL}audio/notification.mp3`;
const NOTIFICATION_ICON_URL = `${import.meta.env.BASE_URL}icons/icon-192x192.png`;

const playNotificationSound = () => {
  try {
    const audio = new Audio(NOTIFICATION_SOUND_URL);
    audio.preload = "auto";
    audio.play().catch((playError) => {
      console.debug("Notification sound playback delayed:", playError?.message || playError);
    });
  } catch (err) {
    console.debug("Notification audio error:", err?.message || err);
  }
};

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
  const navigate = useNavigate();
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
  const unreadBackgroundCountRef = useRef(0);
  const originalTitleRef = useRef(document.title || "CureCode");

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

  // Request browser notification permission once user is authenticated
  useEffect(() => {
    if (token && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, [token]);

  // Restore document title when user focuses back to the tab
  useEffect(() => {
    if (!document.title.startsWith("(")) {
      originalTitleRef.current = document.title || "CureCode";
    }

    const resetTitleAndCount = () => {
      unreadBackgroundCountRef.current = 0;
      if (document.title !== originalTitleRef.current) {
        document.title = originalTitleRef.current;
      }
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        resetTitleAndCount();
      }
    };

    window.addEventListener("focus", resetTitleAndCount);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", resetTitleAndCount);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (document.title !== originalTitleRef.current) {
        document.title = originalTitleRef.current;
      }
    };
  }, []);

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

      const isTabHidden = document.hidden || !document.hasFocus();
      const isOpenConversation =
        pathnameRef.current === "/chat" && conversationId === activeConversationRef.current;
      const isActivelyViewing = isOpenConversation && !isTabHidden;

      receiveMessage(payload);

      if (!isOwnMessage && !isActivelyViewing) {
        const senderName = getSenderName(message);
        const messagePreview = getMessagePreview(message);

        // 1. Play custom notification sound
        playNotificationSound();

        const openTargetConversation = () => {
          window.focus();
          if (conversationId) {
            useChatStore.getState().setActiveConversation(conversationId);
          }
          navigate("/chat");
        };

        // 2. If tab is in background (other tab or minimized), show native OS notification & update tab title
        if (isTabHidden) {
          unreadBackgroundCountRef.current += 1;
          document.title = `(${unreadBackgroundCountRef.current}) 💬 ${senderName}: ${messagePreview}`;

          if ("Notification" in window) {
            const showNotification = () => {
              try {
                const desktopNotification = new Notification(senderName, {
                  body: messagePreview,
                  icon: NOTIFICATION_ICON_URL,
                  badge: NOTIFICATION_ICON_URL,
                  tag: `chat-${conversationId}`,
                  renotify: true,
                });

                desktopNotification.onclick = () => {
                  desktopNotification.close();
                  openTargetConversation();
                };
              } catch (err) {
                console.debug("Desktop notification error:", err?.message || err);
              }
            };

            if (Notification.permission === "granted") {
              showNotification();
            } else if (Notification.permission === "default") {
              Notification.requestPermission().then((perm) => {
                if (perm === "granted") {
                  showNotification();
                }
              });
            }
          }
        } else {
          // If in website on another page (e.g. /projects or different conversation)
          setToast({
            id: `${conversationId}-${getId(message)}-${Date.now()}`,
            type: "chat",
            title: senderName,
            message: messagePreview,
            onClick: openTargetConversation,
          });
        }
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
    navigate,
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
