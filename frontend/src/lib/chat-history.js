export const latestClear = (...values) => values.filter(Boolean).sort((a, b) => new Date(b) - new Date(a))[0] || null;
export const isVisibleMessage = (message, clearedAt) => !clearedAt || message.pending || new Date(message.createdAt) > new Date(clearedAt);
export const applyHistoryBoundary = (conversation, clearedAt) => ({
  ...conversation, clearedAt,
  ...(clearedAt && (!conversation.lastMessageAt || new Date(conversation.lastMessageAt) <= new Date(clearedAt))
    ? { lastMessage: "", lastMessageAt: null, unreadCount: 0 } : {}),
});
