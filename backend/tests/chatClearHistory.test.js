const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const mongoose = require("mongoose");
const { createRequire } = require("node:module");
const controllerRequire = createRequire(require.resolve("../controllers/chat.controller"));
const ids = { conversation: "aaaaaaaaaaaaaaaaaaaaaaaa", alice: "bbbbbbbbbbbbbbbbbbbbbbbb", bob: "cccccccccccccccccccccccc" };
const same = (a, b) => String(a) === String(b);
const matches = (row, filter) => Object.entries(filter).every(([key, value]) => {
  if (key === "$or") return value.some((part) => matches(row, part));
  const actual = row[key];
  if (value?.$in) return value.$in.some((item) => same(actual, item));
  if (value?.$ne) return !same(actual, value.$ne);
  if (value?.$not) return !(actual || []).some((item) => matches(item, value.$not.$elemMatch));
  if (value?.$gt || value?.$lt) return (!value.$gt || new Date(actual) > new Date(value.$gt)) && (!value.$lt || new Date(actual) < new Date(value.$lt));
  return Array.isArray(actual) ? actual.some((item) => same(item, value)) : same(actual, value);
});
const query = (rows, single = false) => {
  let selected = rows;
  return { select() { return this; }, populate() { return this; },
    sort() { selected = [...selected].sort((a, b) => b.createdAt - a.createdAt); return this; },
    limit(n) { selected = selected.slice(0, n); return this; },
    lean: async () => single ? selected[0] || null : selected,
    then(resolve, reject) { return this.lean().then(resolve, reject); },
  };
};
const fixture = () => {
  const conversation = { _id: ids.conversation, workspaceId: "tenant-one", type: "group", channelType: "project",
    participants: [ids.alice, ids.bob], historyClearedAt: {}, lastMessage: "Call ended", lastMessageAt: new Date(1000) };
  const messages = ["text", "attachment", "call", "meeting"].map((type, i) => ({
    _id: type === "attachment" ? "eeeeeeeeeeeeeeeeeeeeeeee" : String(i), conversationId: ids.conversation, senderId: ids.bob, message: type,
    metadata: { type }, attachments: type === "attachment" ? [{ fileUrl: "synthetic.txt" }] : [],
    createdAt: new Date(100 + i), deleted: false, seenBy: [],
  }));
  const events = [];
  let failWrite = false;
  const Conversation = {
    updateOne: async (_filter, update) => Object.assign(conversation, update),
    findOne: (filter) => query(matches(conversation, filter) ? [conversation] : [], true),
    find: (filter) => query(matches(conversation, filter) ? [conversation] : []),
    async findOneAndUpdate(filter, update, options) {
      if (failWrite) throw Error("Database unavailable");
      assert.equal(options.timestamps, false);
      if (!matches(conversation, filter)) return null;
      for (const [key, expression] of Object.entries(update[0].$set)) {
        const userId = key.split(".")[1];
        assert.deepEqual(Array.from(expression.$max), ["$$NOW", "$lastMessageAt", "$" + key]);
        conversation.historyClearedAt[userId] = new Date(Math.max(Date.now(),
          new Date(conversation.lastMessageAt || 0).getTime(),
          new Date(conversation.historyClearedAt[userId] || 0).getTime()));
      }
      return conversation;
    },
  };
  const Message = {
    create: async (data) => {
      const row = { _id: "synthetic-new", deleted: false, ...data };
      messages.push(row);
      return row;
    },
    findById: (id) => query(messages.filter((row) => row._id === id), true),
    find: (filter) => query(messages.filter((row) => matches(row, filter))),
    findOne: (filter) => query(messages.filter((row) => matches(row, filter)), true),
    aggregate: async ([{ $match: filter }]) => {
      const count = messages.filter((row) => matches(row, filter)).length;
      return count ? [{ _id: ids.conversation, count }] : [];
    },
  };
  const load = (Clock = Date) => {
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(require.resolve("../controllers/chat.controller"), "utf8"), {
      module, console, Date: Clock, Map, Set, process,
      require(name) {
        if (name === "fs") return { mkdirSync() {} };
        if (name === "path" || name === "multer" || name === "mongoose" || name.startsWith("../utils/")) return controllerRequire(name);
        if (name === "../models/Conversation.model") return Conversation;
        if (name === "../models/Message.model") return Message;
        if (name === "../socket") return { emitToUser: (...args) => events.push(args) };
        return {};
      },
      __dirname: require("node:path").dirname(require.resolve("../controllers/chat.controller")),
    });
    return module.exports;
  };
  const invoke = async (controller, action, userId = ids.alice, workspaceId = "tenant-one", extra = {}) => {
    const req = { user: userId ? { _id: userId, role: "Developer", workspaceId } : null,
      params: { id: ids.conversation, conversationId: ids.conversation, messageId: "eeeeeeeeeeeeeeeeeeeeeeee", attachmentIndex: "0" }, query: {}, ...extra };
    const result = { status: 200 };
    const res = { status(value) { result.status = value; return this; }, json(data) { result.data = data; } };
    await controller[action](req, res, (error) => { result.error = error; });
    return result;
  };
  return { conversation, messages, events, load, invoke, fail: () => { failWrite = true; } };
};

test("clearing persists across controller reloads and pagination, including call and attachment history, without changing membership", async () => {
  const f = fixture();
  const original = structuredClone(f.messages);
  const result = await f.invoke(f.load(), "clearConversationHistory");
  assert.equal(result.status, 200);
  assert.ok(result.data.clearedAt);
  assert.deepEqual(f.messages, original);
  assert.deepEqual(f.conversation.participants, [ids.alice, ids.bob]);
  assert.equal(f.conversation.lastMessage, "Call ended");
  for (const before of [undefined, new Date(Date.now() + 1000).toISOString()]) {
    const history = await f.invoke(f.load(), "getMessages", ids.alice, "tenant-one", { query: { before, limit: 1 } });
    assert.equal(history.data.messages.length, 0);
    assert.equal(history.data.pagination.hasMore, false);
  }
  const attachment = await f.invoke(f.load(), "downloadChatAttachment");
  assert.equal(attachment.status, 404);
  const own = await f.invoke(f.load(), "getConversationById");
  assert.equal(own.data.conversation.lastMessage, "");
  assert.equal(own.data.conversation.unreadCount, 0);
  assert.equal(own.data.conversation.historyClearedAt, undefined);
});

test("other participants retain history, preview, unread state; only clearing user's sessions receive the event", async () => {
  const f = fixture();
  await f.invoke(f.load(), "clearConversationHistory");
  const history = await f.invoke(f.load(), "getMessages", ids.bob);
  assert.equal(history.data.messages.length, 4);
  // Treat Alice as the sender to give Bob unread messages.
  f.messages.forEach((message) => { message.senderId = ids.alice; });
  const bob = await f.invoke(f.load(), "getConversationById", ids.bob);
  assert.equal(bob.data.conversation.lastMessage, "Call ended");
  assert.equal(bob.data.conversation.unreadCount, 4);
  assert.equal(bob.data.conversation.clearedAt, null);
  assert.equal(f.events.length, 1);
  assert.equal(f.events[0][0], ids.alice);
  assert.equal(f.events[0][1], "conversation_cleared");
});

test("new messages after clear appear, supply the preview, and count as unread", async () => {
  const f = fixture();
  const result = await f.invoke(f.load(), "clearConversationHistory");
  f.messages.push({ _id: "new", conversationId: ids.conversation, senderId: ids.bob, message: "New message",
    createdAt: new Date(result.data.clearedAt.getTime() + 1), deleted: false, seenBy: [] });
  const history = await f.invoke(f.load(), "getMessages");
  assert.deepEqual(Array.from(history.data.messages, (row) => row._id), ["new"]);
  const preview = await f.invoke(f.load(), "getConversationById");
  assert.equal(preview.data.conversation.lastMessage, "New message");
  assert.equal(preview.data.conversation.unreadCount, 1);
});

test("clear rejects unauthenticated, forbidden, non-member, cross-tenant, and invalid requests; write errors never emit success", async () => {
  const f = fixture();
  for (const [userId, workspaceId, extra, expected] of [
    [null, "tenant-one", {}, 401],
    [ids.alice, "tenant-one", { user: { _id: ids.alice, workspaceId: "tenant-one", role: "Customer" } }, 403],
    ["dddddddddddddddddddddddd", "tenant-one", {}, 404],
    [ids.alice, "tenant-two", {}, 404],
    [ids.alice, "tenant-one", { params: { id: "invalid" } }, 400],
  ]) {
    const result = await f.invoke(f.load(), "clearConversationHistory", userId, workspaceId, extra);
    assert.equal(result.status, expected);
    assert.ok(result.error);
    assert.equal(result.data, undefined);
  }
  f.fail();
  const failed = await f.invoke(f.load(), "clearConversationHistory");
  assert.match(failed.error.message, /Database unavailable/);
  assert.equal(failed.data, undefined);
  assert.equal(f.events.length, 0);
  assert.deepEqual(f.conversation.historyClearedAt, {});
});

test("same-millisecond sends remain visible and a subsequent clear covers the latest persisted message", async () => {
  const f = fixture();
  const cleared = await f.invoke(f.load(), "clearConversationHistory");
  const instant = cleared.data.clearedAt.getTime();
  class Clock extends Date { static now() { return instant; } }
  const message = await f.load(Clock).createMessageDocument({ conversationId: ids.conversation,
    sender: { _id: ids.bob, workspaceId: "tenant-one" }, message: "Same millisecond" });
  assert.equal(message.createdAt.getTime(), instant + 1);
  assert.equal((await f.invoke(f.load(), "getMessages")).data.messages.length, 1);
  await f.invoke(f.load(), "clearConversationHistory");
  assert.equal((await f.invoke(f.load(), "getMessages")).data.messages.length, 0);
});
