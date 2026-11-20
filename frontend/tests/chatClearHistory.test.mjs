import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { create } from "zustand";
import { latestClear, isVisibleMessage, applyHistoryBoundary } from "../src/lib/chat-history.js";
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const boundary = "2026-11-20T10:00:00.000Z";
const old = { _id: "old", conversationId: "chat", message: "Call ended", createdAt: "2026-11-20T09:00:00.000Z", senderId: "other" };
const fresh = { ...old, _id: "new", message: "New message", createdAt: "2026-11-20T10:00:00.001Z" };
const fixture = (api = {}) => {
  const source = fs.readFileSync(new URL("../src/lib/chatStore.js", import.meta.url), "utf8")
    .replace(/import[\s\S]*?from ["'][^"']+["'];/g, "")
    .replace("export const useChatStore", "const useChatStore") + "\nglobalThis.store = useChatStore;";
  const context = { create, latestClear, isVisibleMessage, applyHistoryBoundary, console,
    clearChatConversationHistory: async () => ({ conversationId: "chat", clearedAt: boundary }),
    fetchChatConversations: async () => [], fetchChatMessages: async () => ({ messages: [], pagination: {} }),
    getChatSocket: () => null, ...api };
  vm.runInNewContext(source, context);
  const store = context.store;
  store.getState().setCurrentUserId("me");
  store.setState({ conversations: [{ _id: "chat", lastMessage: old.message, lastMessageAt: old.createdAt,
    unreadCount: 3, isPinned: true, isStarred: true, isArchived: true }], messagesByConversation: { chat: [old] } });
  return store;
};
test("confirmed clear updates history, preview, unread and pagination while retaining preferences", async () => {
  const store = fixture();
  assert.equal(await store.getState().clearConversationHistory("chat"), true);
  const state = store.getState();
  assert.equal(state.messagesByConversation.chat.length, 0);
  assert.equal(state.conversations[0].lastMessage, "");
  assert.equal(state.conversations[0].unreadCount, 0);
  assert.equal(state.conversations[0].isPinned, true);
  assert.equal(state.conversations[0].isStarred, true);
  assert.equal(state.conversations[0].isArchived, true);
  assert.equal(state.hasMoreByConversation.chat, false);
  assert.equal(state.nextCursorByConversation.chat, null);
});
test("duplicate submissions are blocked and failed clears keep history and propagate errors", async () => {
  const request = deferred(); let calls = 0;
  const store = fixture({ clearChatConversationHistory: () => { calls++; return request.promise; } });
  const pending = store.getState().clearConversationHistory("chat");
  assert.equal(store.getState().clearingByConversation.chat, true);
  assert.equal(await store.getState().clearConversationHistory("chat"), false);
  assert.equal(calls, 1);
  request.reject(Error("Network unavailable"));
  await assert.rejects(pending, /Network unavailable/);
  assert.equal(store.getState().clearingByConversation.chat, false);
  assert.equal(store.getState().messagesByConversation.chat[0]._id, "old");
  assert.equal(store.getState().conversations[0].unreadCount, 3);
});
test("session events reject delayed old realtime and history responses, preserving new messages", async () => {
  const request = deferred();
  const store = fixture({ fetchChatMessages: () => request.promise });
  const pending = store.getState().loadMessages("chat");
  store.getState().applyConversationCleared({ conversationId: "chat", clearedAt: boundary });
  store.getState().receiveMessage({ conversationId: "chat", message: old });
  assert.equal(store.getState().messagesByConversation.chat.length, 0);
  store.getState().receiveMessage({ conversationId: "chat", message: fresh });
  request.resolve({ messages: [old], pagination: { hasMore: true, nextCursor: old.createdAt } });
  await pending;
  assert.deepEqual(Array.from(store.getState().messagesByConversation.chat, (message) => message._id), ["new"]);
  assert.equal(store.getState().conversations[0].lastMessage, "New message");
  assert.equal(store.getState().hasMoreByConversation.chat, false);
  // Duplicate and out-of-order session events cannot restore earlier history.
  store.getState().applyConversationCleared({ conversationId: "chat", clearedAt: old.createdAt });
  assert.equal(store.getState().clearedAtByConversation.chat, boundary);
});
test("refresh and reconnect ingest persisted boundaries and filter cached history", async () => {
  const store = fixture({ fetchChatConversations: async () => [{ _id: "chat", clearedAt: boundary,
    lastMessage: "", lastMessageAt: null, unreadCount: 0 }] });
  await store.getState().loadConversations({ force: true });
  assert.equal(store.getState().messagesByConversation.chat.length, 0);
  assert.equal(store.getState().clearedAtByConversation.chat, boundary);
  store.getState().receiveMessage({ conversationId: "chat", message: fresh });
  assert.equal(store.getState().messagesByConversation.chat[0]._id, "new");
});
test("pagination remains available without a clear and stops at persisted clear boundary", async () => {
  const store = fixture({ fetchChatMessages: async () => ({ messages: [old], pagination: { hasMore: true, nextCursor: old.createdAt } }) });
  await store.getState().loadMessages("chat");
  assert.equal(store.getState().hasMoreByConversation.chat, true);
});
test("logout discards user visibility state and ignores in-flight history responses", async () => {
  const request = deferred();
  const store = fixture({ fetchChatMessages: () => request.promise });
  const pending = store.getState().loadMessages("chat");
  store.getState().setCurrentUserId("someone-else");
  request.resolve({ messages: [old], clearedAt: boundary, pagination: {} });
  await pending;
  assert.equal(Object.keys(store.getState().messagesByConversation).length, 0);
  assert.equal(Object.keys(store.getState().clearedAtByConversation).length, 0);
});

test("a racing new message keeps only its own unread contribution after a clear", () => {
  const store = fixture();
  store.getState().receiveMessage({ conversationId: "chat", message: fresh });
  assert.equal(store.getState().conversations[0].unreadCount, 4);
  store.getState().applyConversationCleared({ conversationId: "chat", clearedAt: boundary });
  assert.equal(store.getState().conversations[0].unreadCount, 1);
  assert.equal(store.getState().conversations[0].lastMessage, "New message");
});
test("a reconnect queues an authoritative reload behind an older conversation request", async () => {
  const request = deferred(); let calls = 0;
  const store = fixture({ fetchChatConversations: () => ++calls === 1 ? request.promise : Promise.resolve([
    { _id: "chat", clearedAt: boundary, lastMessageAt: null, unreadCount: 0 }]) });
  const pending = store.getState().loadConversations({ force: true });
  await store.getState().loadConversations({ force: true });
  request.resolve([{ _id: "chat", lastMessageAt: old.createdAt, lastMessage: old.message }]);
  await pending;
  assert.equal(calls, 2);
  assert.equal(store.getState().messagesByConversation.chat.length, 0);
});
test("malformed clear responses are errors and never remove history", async () => {
  const store = fixture({ clearChatConversationHistory: async () => ({}) });
  await assert.rejects(store.getState().clearConversationHistory("chat"), /Unable to confirm/);
  assert.equal(store.getState().messagesByConversation.chat[0]._id, "old");
});
