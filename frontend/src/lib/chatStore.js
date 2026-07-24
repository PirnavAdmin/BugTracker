import { create } from "zustand";
import {
  addChatConversationParticipants,
  createChatConversation,
  deleteChatConversation,
  fetchChatConversations,
  fetchChatMessages,
  removeChatConversationParticipant,
  searchChatUsers,
  sendChatMessage,
} from "@/lib/api";
import { getChatSocket } from "@/lib/socket";

const getId = (value) => String(value?._id || value?.id || value || "");
const CHAT_PREFERENCES_STORAGE_KEY = "chat-conversation-preferences";

const readConversationPreferences = () => {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const storedValue = window.localStorage.getItem(CHAT_PREFERENCES_STORAGE_KEY);
    const parsedValue = storedValue ? JSON.parse(storedValue) : {};
    return parsedValue && typeof parsedValue === "object" ? parsedValue : {};
  } catch {
    return {};
  }
};

const writeConversationPreferences = (preferences) => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      CHAT_PREFERENCES_STORAGE_KEY,
      JSON.stringify(preferences || {})
    );
  } catch {
    // Ignore local persistence failures so chat stays usable.
  }
};

const applyConversationPreferences = (conversation, preferences = readConversationPreferences()) => {
  const conversationId = getId(conversation);
  const preference = preferences[conversationId] || {};

  return {
    ...conversation,
    isPinned: Boolean(preference.isPinned),
    isStarred: Boolean(preference.isStarred),
    isArchived: Boolean(preference.isArchived),
  };
};

const normalizeConversation = (conversation) => ({
  ...applyConversationPreferences(conversation),
  _id: getId(conversation),
  participants: Array.isArray(conversation?.participants)
    ? conversation.participants
    : [],
  unreadCount: Number(conversation?.unreadCount || 0),
});

const sortConversations = (items) =>
  [...items].sort((left, right) => {
    const leftDate = new Date(left.lastMessageAt || left.updatedAt || left.createdAt || 0);
    const rightDate = new Date(right.lastMessageAt || right.updatedAt || right.createdAt || 0);
    return rightDate.getTime() - leftDate.getTime();
  });

const mergeMessage = (messages = [], incomingMessage, tempId) => {
  const incomingId = getId(incomingMessage);
  const existingIndex = messages.findIndex(
    (message) => getId(message) === incomingId || (tempId && getId(message) === tempId)
  );

  if (existingIndex >= 0) {
    const copy = [...messages];
    copy[existingIndex] = {
      ...incomingMessage,
      pending: false,
    };
    return copy;
  }

  return [...messages, incomingMessage].sort(
    (left, right) => new Date(left.createdAt) - new Date(right.createdAt)
  );
};

export const useChatStore = create((set, get) => ({
  activeConversationId: null,
  currentUserId: "",
  conversations: [],
  hasLoadedConversations: false,
  messagesByConversation: {},
  nextCursorByConversation: {},
  hasMoreByConversation: {},
  onlineUsers: [],
  typingByConversation: {},
  searchResults: [],
  isSearching: false,
  isLoadingConversations: false,
  isLoadingMessages: false,
  error: "",

  getTotalUnread: () =>
    get().conversations.reduce(
      (total, conversation) => total + Number(conversation.unreadCount || 0),
      0
    ),

  setCurrentUserId: (userId) => {
    set({ currentUserId: String(userId || "") });
  },

  toggleConversationPreference: (conversationId, field) => {
    const normalizedConversationId = String(conversationId || "");
    if (!normalizedConversationId || !["isPinned", "isStarred", "isArchived"].includes(field)) {
      return;
    }

    const preferences = readConversationPreferences();
    const currentPreference = preferences[normalizedConversationId] || {};
    const nextValue = !Boolean(currentPreference[field]);
    const nextPreference = {
      ...currentPreference,
      [field]: nextValue,
    };

    preferences[normalizedConversationId] = nextPreference;
    writeConversationPreferences(preferences);

    set((state) => ({
      conversations: state.conversations.map((conversation) =>
        getId(conversation) === normalizedConversationId
          ? {
              ...conversation,
              [field]: nextValue,
            }
          : conversation
      ),
    }));
  },

  setActiveConversation: async (conversationId) => {
    set({ activeConversationId: conversationId });
    const conversation = get().conversations.find(
      (item) => getId(item) === conversationId
    );

    if (conversation?.unreadCount) {
      set((state) => ({
        conversations: state.conversations.map((item) =>
          getId(item) === conversationId ? { ...item, unreadCount: 0 } : item
        ),
      }));
    }

    await get().loadMessages(conversationId);

    const socket = getChatSocket();
    socket?.emit("join_conversation", { conversationId });
    socket?.emit("mark_seen", { conversationId });
  },

  loadConversations: async ({ force = false, activateFirst = false } = {}) => {
    if (get().isLoadingConversations || (get().hasLoadedConversations && !force)) {
      return;
    }

    set({ isLoadingConversations: true, error: "" });

    try {
      const preferences = readConversationPreferences();
      const conversations = (await fetchChatConversations()).map((conversation) =>
        normalizeConversation(applyConversationPreferences(conversation, preferences))
      );
      set({
        conversations: sortConversations(conversations),
        hasLoadedConversations: true,
        isLoadingConversations: false,
      });

      if (activateFirst && !get().activeConversationId && conversations.length) {
        await get().setActiveConversation(getId(conversations[0]));
      }
    } catch (error) {
      set({
        error: error?.response?.data?.message || error?.message || "Unable to load chat",
        isLoadingConversations: false,
      });
    }
  },

  loadMessages: async (conversationId, { older = false } = {}) => {
    if (!conversationId || get().isLoadingMessages) {
      return;
    }

    const existingMessages = get().messagesByConversation[conversationId] || [];
    const before = older
      ? get().nextCursorByConversation[conversationId] ||
        existingMessages[0]?.createdAt
      : undefined;

    if (older && get().hasMoreByConversation[conversationId] === false) {
      return;
    }

    set({ isLoadingMessages: true, error: "" });

    try {
      const data = await fetchChatMessages({
        conversationId,
        before,
      });
      const incomingMessages = Array.isArray(data?.messages) ? data.messages : [];

      set((state) => ({
        messagesByConversation: {
          ...state.messagesByConversation,
          [conversationId]: older
            ? [...incomingMessages, ...(state.messagesByConversation[conversationId] || [])]
            : incomingMessages,
        },
        nextCursorByConversation: {
          ...state.nextCursorByConversation,
          [conversationId]: data?.pagination?.nextCursor || null,
        },
        hasMoreByConversation: {
          ...state.hasMoreByConversation,
          [conversationId]: Boolean(data?.pagination?.hasMore),
        },
        isLoadingMessages: false,
      }));
    } catch (error) {
      set({
        error:
          error?.response?.data?.message ||
          error?.message ||
          "Unable to load messages",
        isLoadingMessages: false,
      });
    }
  },

  searchUsers: async (query) => {
    if (!query || query.trim().length < 2) {
      set({ searchResults: [], isSearching: false });
      return;
    }

    set({ isSearching: true });

    try {
      const users = await searchChatUsers(query.trim());
      set({ searchResults: users, isSearching: false });
    } catch {
      set({ searchResults: [], isSearching: false });
    }
  },

  createDirectConversation: async (userId) => {
      const conversation = normalizeConversation(
      await createChatConversation({
        type: "direct",
        userId,
      })
    );

    set((state) => ({
      conversations: sortConversations([
        conversation,
        ...state.conversations.filter((item) => getId(item) !== getId(conversation)),
      ]),
      searchResults: [],
    }));

    await get().setActiveConversation(getId(conversation));
  },

  createGroupConversation: async ({ name, participants = [] }) => {
      const conversation = normalizeConversation(
      await createChatConversation({
        type: "group",
        channelType: "custom",
        name,
        participants,
      })
    );

    set((state) => ({
      conversations: sortConversations([
        conversation,
        ...state.conversations.filter((item) => getId(item) !== getId(conversation)),
      ]),
      searchResults: [],
    }));

    await get().setActiveConversation(getId(conversation));
  },

  addParticipantsToConversation: async (conversationId, participants = []) => {
    const normalizedConversationId = String(conversationId || "");
    if (!normalizedConversationId || !participants.length) {
      return null;
    }

      const conversation = normalizeConversation(
        await addChatConversationParticipants(normalizedConversationId, participants)
      );

    set((state) => ({
      conversations: sortConversations(
        state.conversations.map((item) =>
          getId(item) === normalizedConversationId ? conversation : item
        )
      ),
    }));

    return conversation;
  },

  removeParticipantFromConversation: async (conversationId, userId) => {
    const normalizedConversationId = String(conversationId || "");
    const normalizedUserId = String(userId || "");
    if (!normalizedConversationId || !normalizedUserId) {
      return null;
    }

      const conversation = normalizeConversation(
        await removeChatConversationParticipant(normalizedConversationId, normalizedUserId)
      );

    set((state) => ({
      conversations: sortConversations(
        state.conversations.map((item) =>
          getId(item) === normalizedConversationId ? conversation : item
        )
      ),
    }));

    return conversation;
  },

  deleteConversation: async (conversationId) => {
    const normalizedConversationId = String(conversationId || "");

    if (!normalizedConversationId) {
      return;
    }

    set({ error: "" });
    await deleteChatConversation(normalizedConversationId);
    const preferences = readConversationPreferences();
    if (preferences[normalizedConversationId]) {
      delete preferences[normalizedConversationId];
      writeConversationPreferences(preferences);
    }

    set((state) => {
      const {
        [normalizedConversationId]: _removedMessages,
        ...messagesByConversation
      } = state.messagesByConversation;
      const {
        [normalizedConversationId]: _removedCursor,
        ...nextCursorByConversation
      } = state.nextCursorByConversation;
      const {
        [normalizedConversationId]: _removedHasMore,
        ...hasMoreByConversation
      } = state.hasMoreByConversation;
      const {
        [normalizedConversationId]: _removedTyping,
        ...typingByConversation
      } = state.typingByConversation;

      return {
        activeConversationId:
          state.activeConversationId === normalizedConversationId
            ? null
            : state.activeConversationId,
        conversations: state.conversations.filter(
          (conversation) => getId(conversation) !== normalizedConversationId
        ),
        hasMoreByConversation,
        messagesByConversation,
        nextCursorByConversation,
        typingByConversation,
      };
    });
  },

  sendMessage: async ({ conversationId, message, attachments = [], currentUser }) => {
    const text = String(message || "").trim();

    if (!conversationId || (!text && !attachments.length)) {
      return;
    }

    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const optimisticMessage = {
      _id: tempId,
      conversationId,
      senderId: currentUser,
      message: text,
      attachments,
      seenBy: currentUser?._id
        ? [
            {
              userId: currentUser._id,
              seenAt: new Date().toISOString(),
            },
          ]
        : [],
      pending: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    set((state) => ({
      messagesByConversation: {
        ...state.messagesByConversation,
        [conversationId]: mergeMessage(
          state.messagesByConversation[conversationId] || [],
          optimisticMessage
        ),
      },
    }));

    const socket = getChatSocket();

    if (socket?.connected) {
      socket.emit(
        "send_message",
        {
          conversationId,
          message: text,
          attachments,
          tempId,
        },
        (response) => {
          if (!response?.ok) {
            get().markMessageFailed(conversationId, tempId);
            return;
          }

            get().receiveMessage({
              conversationId,
              conversation: response.conversation,
              message: response.message,
              tempId,
            });
        }
      );
      return;
    }

    try {
      const createdMessage = await sendChatMessage({
        conversationId,
        message: text,
        attachments,
      });
      get().receiveMessage({
        conversationId,
        message: createdMessage,
        tempId,
      });
    } catch {
      get().markMessageFailed(conversationId, tempId);
    }
  },

  markMessageFailed: (conversationId, tempId) => {
    set((state) => ({
      messagesByConversation: {
        ...state.messagesByConversation,
        [conversationId]: (state.messagesByConversation[conversationId] || []).map(
          (message) =>
            getId(message) === tempId
              ? {
                  ...message,
                  pending: false,
                  failed: true,
                }
              : message
        ),
      },
    }));
  },

  receiveMessage: ({
    conversationId,
    conversation,
    isViewingConversation,
    message,
    tempId,
  }) => {
    const normalizedConversationId = String(conversationId || message?.conversationId || "");

    if (!normalizedConversationId || !message) {
      return;
    }

    set((state) => {
      const activeConversationId = state.activeConversationId;
      const isActive =
        typeof isViewingConversation === "boolean"
          ? isViewingConversation
          : activeConversationId === normalizedConversationId;
      const senderId = getId(message.senderId);
      const currentConversation = state.conversations.find(
        (item) => getId(item) === normalizedConversationId
      );
      const incomingConversation = conversation || message?.conversation;
      const shouldIncrementUnread =
        !isActive && senderId !== state.currentUserId;
      const nextConversation = currentConversation ||
        (incomingConversation
          ? normalizeConversation({
              ...incomingConversation,
              _id: normalizedConversationId,
            })
          : null);
      const updatedConversation = nextConversation
        ? {
            ...nextConversation,
            lastMessage: message.message || "Attachment",
            lastMessageAt: message.createdAt,
            unreadCount: shouldIncrementUnread
              ? Number(nextConversation.unreadCount || 0) + 1
              : nextConversation.unreadCount || 0,
          }
        : null;
      const remainingConversations = state.conversations.filter(
        (conversation) => getId(conversation) !== normalizedConversationId
      );

      return {
        messagesByConversation: {
          ...state.messagesByConversation,
          [normalizedConversationId]: mergeMessage(
            state.messagesByConversation[normalizedConversationId] || [],
            message,
            tempId
          ),
        },
        conversations: updatedConversation
          ? sortConversations([updatedConversation, ...remainingConversations])
          : state.conversations,
      };
    });

    if (get().activeConversationId === normalizedConversationId) {
      getChatSocket()?.emit("mark_seen", { conversationId: normalizedConversationId });
    }
  },

  setOnlineUsers: (onlineUsers = []) => {
    set({ onlineUsers: onlineUsers.map(String) });
  },

  setTyping: ({ conversationId, user, stopped = false }) => {
    if (!conversationId || !user?._id) {
      return;
    }

    set((state) => {
      const currentTyping = state.typingByConversation[conversationId] || {};
      const nextTyping = {
        ...currentTyping,
      };

      if (stopped) {
        delete nextTyping[user._id];
      } else {
        nextTyping[user._id] = {
          ...user,
          lastTypedAt: Date.now(),
        };
      }

      return {
        typingByConversation: {
          ...state.typingByConversation,
          [conversationId]: nextTyping,
        },
      };
    });
  },

  markSeenLocal: ({ conversationId, userId, seenAt }) => {
    set((state) => ({
      messagesByConversation: {
        ...state.messagesByConversation,
        [conversationId]: (state.messagesByConversation[conversationId] || []).map(
          (message) => {
            const alreadySeen = (message.seenBy || []).some(
              (seen) => getId(seen.userId) === String(userId)
            );

            if (alreadySeen) {
              return message;
            }

            return {
              ...message,
              seenBy: [
                ...(message.seenBy || []),
                {
                  userId,
                  seenAt,
                },
              ],
            };
          }
        ),
      },
      conversations:
        String(userId) === String(state.currentUserId)
          ? state.conversations.map((conversation) =>
              getId(conversation) === String(conversationId)
                ? {
                    ...conversation,
                    unreadCount: 0,
                  }
                : conversation
            )
          : state.conversations,
    }));
  },
}));
