import { latestClear, isVisibleMessage, applyHistoryBoundary } from "@/lib/chat-history";
import { create } from "zustand";
import {
  clearChatConversationHistory,
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
  clearedAtByConversation: {},
  clearingByConversation: {},
  hasLoadedConversations: false,
  messagesByConversation: {},
  nextCursorByConversation: {},
  hasMoreByConversation: {},
  onlineUsers: [],
  typingByConversation: {},
  searchResults: [],
  isSearching: false,
  isLoadingConversations: false,
  conversationReloadRequested: false,
  isLoadingMessages: false,
  error: "",

  getTotalUnread: () =>
    get().conversations.reduce(
      (total, conversation) => total + Number(conversation.unreadCount || 0),
      0
    ),

  setCurrentUserId: (userId) => {
    const nextId = String(userId || "");
    if (nextId !== get().currentUserId) {
      set({ conversations: [], messagesByConversation: {}, clearedAtByConversation: {},
        nextCursorByConversation: {}, hasMoreByConversation: {}, activeConversationId: null,
        isLoadingConversations: false, isLoadingMessages: false, clearingByConversation: {},
        conversationReloadRequested: false,
        hasLoadedConversations: false });
    }
    set({ currentUserId: nextId });
  },

  applyConversationCleared: ({ conversationId, clearedAt }) => {
    if (!conversationId || !clearedAt) return;
    set((state) => {
      const previousBoundary = state.clearedAtByConversation[conversationId];
      if (previousBoundary && new Date(clearedAt) <= new Date(previousBoundary)) return {};
      const boundary = latestClear(clearedAt, state.clearedAtByConversation[conversationId]);
      const retained = (state.messagesByConversation[conversationId] || [])
        .filter((message) => isVisibleMessage(message, boundary));
      const unreadCount = state.activeConversationId === conversationId ? 0 : retained.filter((message) =>
        !message.pending && getId(message.senderId) !== state.currentUserId &&
        !(message.seenBy || []).some((receipt) => getId(receipt.userId) === state.currentUserId)).length;
      return {
        clearedAtByConversation: { ...state.clearedAtByConversation, [conversationId]: boundary },
        messagesByConversation: { ...state.messagesByConversation,
          [conversationId]: retained },
        nextCursorByConversation: { ...state.nextCursorByConversation, [conversationId]: null },
        hasMoreByConversation: { ...state.hasMoreByConversation, [conversationId]: false },
        conversations: state.conversations.map((conversation) => getId(conversation) === conversationId
          ? { ...applyHistoryBoundary(conversation, boundary), unreadCount } : conversation),
      };
    });
  },
  clearConversationHistory: async (conversationId) => {
    if (get().clearingByConversation[conversationId]) return false;
    set((state) => ({ clearingByConversation: { ...state.clearingByConversation, [conversationId]: true } }));
    const requestingUserId = get().currentUserId;
    try {
      const result = await clearChatConversationHistory(conversationId);
      if (get().currentUserId !== requestingUserId) return false;
      if (String(result?.conversationId) !== String(conversationId) || !result?.clearedAt ||
          Number.isNaN(new Date(result.clearedAt).getTime())) {
        throw new Error("Unable to confirm that conversation history was cleared. Please try again.");
      }
      get().applyConversationCleared(result);
      return true;
    } finally {
      set((state) => ({ clearingByConversation: { ...state.clearingByConversation, [conversationId]: false } }));
    }
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
    if (get().isLoadingConversations) {
      if (force) set({ conversationReloadRequested: true });
      return;
    }
    if (get().hasLoadedConversations && !force) return;

    const requestingUserId = get().currentUserId;
    set({ isLoadingConversations: true, error: "" });

    try {
      const preferences = readConversationPreferences();
      const conversations = (await fetchChatConversations()).map((conversation) =>
        normalizeConversation(applyHistoryBoundary(applyConversationPreferences(conversation, preferences),
          latestClear(conversation.clearedAt, get().clearedAtByConversation[getId(conversation)])))
      );
      if (get().currentUserId !== requestingUserId) return;
      for (const conversation of conversations) {
        if (conversation.clearedAt) get().applyConversationCleared({ conversationId: getId(conversation), clearedAt: conversation.clearedAt });
      }
      set({
        conversations: sortConversations(conversations.map((conversation) => applyHistoryBoundary(conversation,
          latestClear(conversation.clearedAt, get().clearedAtByConversation[getId(conversation)])))),
        hasLoadedConversations: true,
        isLoadingConversations: false,
      });

      if (activateFirst && !get().activeConversationId && conversations.length) {
        await get().setActiveConversation(getId(conversations[0]));
      }
    } catch (error) {
      if (get().currentUserId !== requestingUserId) return;
      set({
        error: error?.response?.data?.message || error?.message || "Unable to load chat",
        isLoadingConversations: false,
      });
    } finally {
      if (get().currentUserId === requestingUserId && get().conversationReloadRequested) {
        set({ conversationReloadRequested: false });
        await get().loadConversations({ force: true, activateFirst });
      }
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

    const requestingUserId = get().currentUserId;
    const requestBoundary = get().clearedAtByConversation[conversationId];
    set({ isLoadingMessages: true, error: "" });

    try {
      const data = await fetchChatMessages({
        conversationId,
        before,
      });
      if (get().currentUserId !== requestingUserId) return;
      if (data?.clearedAt) get().applyConversationCleared({ conversationId, clearedAt: data.clearedAt });
      const incomingMessages = Array.isArray(data?.messages) ? data.messages : [];

      set((state) => ({
        messagesByConversation: {
          ...state.messagesByConversation,
          [conversationId]: (older
            ? [...incomingMessages, ...(state.messagesByConversation[conversationId] || [])]
            : [...incomingMessages, ...(state.messagesByConversation[conversationId] || []).filter((message) => message.pending || new Date(message.createdAt) > new Date(incomingMessages.at(-1)?.createdAt || 0))])
              .filter((message) => isVisibleMessage(message, state.clearedAtByConversation[conversationId])),
        },
        nextCursorByConversation: {
          ...state.nextCursorByConversation,
          [conversationId]: latestClear(requestBoundary, data?.clearedAt) === (state.clearedAtByConversation[conversationId] || null)
            ? data?.pagination?.nextCursor || null : null,
        },
        hasMoreByConversation: {
          ...state.hasMoreByConversation,
          [conversationId]: latestClear(requestBoundary, data?.clearedAt) === (state.clearedAtByConversation[conversationId] || null)
            && Boolean(data?.pagination?.hasMore),
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
      return false;
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
      return new Promise((resolve) => {
        let didResolve = false;
        const finish = (value) => {
          if (didResolve) {
            return;
          }

          didResolve = true;
          resolve(value);
        };
        const deliverWithHttpFallback = async () => {
          try {
            const createdMessage = await sendChatMessage({
              conversationId,
              message: text,
              attachments,
              clientMessageId: tempId,
            });
            get().receiveMessage({
              conversationId,
              message: createdMessage,
              tempId,
            });
            finish(createdMessage || true);
          } catch (error) {
            get().markMessageFailed(
              conversationId,
              tempId,
              error?.response?.data?.message ||
                error?.message ||
                "Unable to send message after Socket.IO confirmation timed out"
            );
            finish(false);
          }
        };
        const timeoutId = window.setTimeout(() => {
          deliverWithHttpFallback();
        }, 12000);

        socket.emit(
          "send_message",
          {
            conversationId,
            message: text,
            attachments,
            tempId,
          },
          (response) => {
            window.clearTimeout(timeoutId);

            if (!response?.ok) {
              get().markMessageFailed(
                conversationId,
                tempId,
                response?.error || "Unable to send message"
              );
              finish(false);
              return;
            }

            get().receiveMessage({
              conversationId,
              conversation: response.conversation,
              message: response.message,
              tempId,
            });
            finish(response.message || true);
          }
        );
      });
    }

    try {
      const createdMessage = await sendChatMessage({
        conversationId,
        message: text,
        attachments,
        clientMessageId: tempId,
      });
      get().receiveMessage({
        conversationId,
        message: createdMessage,
        tempId,
      });
      return createdMessage || true;
    } catch (error) {
      get().markMessageFailed(
        conversationId,
        tempId,
        error?.response?.data?.message || error?.message || "Unable to send message"
      );
      return false;
    }
  },

  markMessageFailed: (conversationId, tempId, errorMessage = "Unable to send message") => {
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
                  errorMessage,
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

    if (!isVisibleMessage(message, get().clearedAtByConversation[normalizedConversationId])) return;
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
