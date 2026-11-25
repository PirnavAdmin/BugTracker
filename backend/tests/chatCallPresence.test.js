const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

// Run the real socket handlers with in-memory sockets and model doubles only.
const fixture = () => {
  let connection;
  let call;
  const queries = [];
  const sockets = new Map();
  const io = {
    sockets: { sockets }, use() {},
    on(event, handler) { if (event === "connection") connection = handler; },
    to(rooms) {
      const targets = Array.isArray(rooms) ? rooms : [rooms];
      return { emit(event, payload) {
        for (const socket of sockets.values()) {
          if (targets.some((room) => socket.rooms.has(room) || socket.id === room)) socket.emit(event, payload);
        }
      } };
    },
  };
  const query = (value) => ({
    select() { return this; }, populate() { return this; },
    lean: async () => value,
    then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); },
  });
  const matches = (filter) => call && Object.entries(filter).every(([key, value]) => {
    if (key === "$or") return value.some((row) => Object.entries(row).every(([field, id]) => call[field] === id));
    if (key === "participants") return call.participants.includes(value);
    if (value?.$in) return value.$in.includes(call[key]);
    return call[key] === value;
  });
  const dependencies = {
    jsonwebtoken: {},
    "socket.io": { Server: function () { return io; } },
    "./models/CallLog.model": {
      findOne(filter) { queries.push(filter); return query(matches(filter) ? call : null); },
      findById: () => query(call),
    },
    "./models/CallParticipant.model": {
      findOneAndUpdate: async () => ({}), updateMany: async () => ({}), find: () => query([]),
    },
    "./models/Conversation.model": {}, "./models/Message.model": {}, "./models/User": {},
    "./controllers/chat.controller": {
      CHAT_ACCESS_ROLES: [],
      loadConversationForUser: async () => ({ _id: "conversation", participants: call?.participants || [] }),
      createSystemMessageDocument: async () => ({ _id: "synthetic-message" }),
    },
    "./services/presenceService": {
      setPresence: async ({ user, status }) => ({ userId: user._id, workspaceId: user.workspaceId, status }),
    },
    "./utils/workspace": { normalizeWorkspaceId: (value) => value || "default" },
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve("../socket"), "utf8"), {
    module, require: (name) => {
      assert.ok(name in dependencies, name);
      return dependencies[name];
    },
    console: { log() {}, warn() {}, error() {} }, process: { env: {} },
    setTimeout: () => 0, clearTimeout() {},
  });
  module.exports.setupChatSocket({});
  const connect = async (id, userId, workspaceId = "one") => {
    const socket = {
      id, user: { _id: userId, name: userId, role: "Developer", workspaceId },
      rooms: new Set(), handlers: {}, received: [],
      on(event, handler) { this.handlers[event] = handler; },
      emit(event, payload) { this.received.push({ event, payload: structuredClone(payload) }); },
      join(room) { this.rooms.add(room); }, leave(room) { this.rooms.delete(room); },
      to: (room) => io.to(room),
    };
    sockets.set(id, socket);
    await connection(socket);
    return socket;
  };
  const setCall = (scope = "direct", status = "Ringing") => {
    call = {
      _id: "cccccccccccccccccccccccc", conversationId: "conversation", workspaceId: "one",
      callerId: "caller", receiverId: "receiver", createdBy: "caller",
      participants: ["caller", "receiver"], scope, status, callType: "audio",
      activeParticipantIds: [], createdAt: new Date(), async save() {},
    };
    return call;
  };
  const presencePayload = (socket) => socket.received.filter((row) => row.event === "call:presence").at(-1)?.payload;
  const snapshot = (socket) => presencePayload(socket)?.presence;
  const invoke = async (socket, event, payload) => {
    let response;
    await socket.handlers[event](payload, (result) => { response = result; });
    assert.equal(response?.ok, true, response?.error);
  };
  return { connect, setCall, snapshot, presencePayload, invoke, queries };
};

test("accepted audio/video calls broadcast per-user state to remote observers and clear on hangup", async () => {
  for (const callType of ["audio", "video"]) {
    const f = fixture();
    const caller = await f.connect("caller-tab", "caller");
    const receiver = await f.connect("receiver-tab", "receiver");
    const observer = await f.connect("observer", "observer");
    const otherWorkspace = await f.connect("isolated", "isolated", "two");
    const call = f.setCall(); call.callType = callType;
    await f.invoke(receiver, "call:accept", { callId: call._id });
    assert.deepEqual(f.snapshot(observer), { caller: "in-call", receiver: "in-call" });
    assert.equal(f.snapshot(otherWorkspace), undefined);
    const lateObserver = await f.connect("late", "late");
    await f.invoke(lateObserver, "call:presence:sync", {});
    assert.deepEqual(f.snapshot(lateObserver), f.snapshot(observer));
    await f.invoke(caller, "call:end", { callId: call._id });
    assert.deepEqual(f.snapshot(observer), {});
    await f.invoke(receiver, "call:presence:sync", { callId: call._id });
    assert.deepEqual(f.snapshot(receiver), {}); // Ended calls cannot be resurrected.
  }
});

test("disconnect cleanup respects call ownership and reconnect restores only an authorized active participant", async () => {
  const f = fixture();
  const receiver = await f.connect("call-tab", "receiver");
  const observer = await f.connect("observer", "observer");
  const call = f.setCall();
  await f.invoke(receiver, "call:accept", { callId: call._id });
  const unrelatedTab = await f.connect("other-tab", "receiver");
  unrelatedTab.handlers.disconnect("transport close");
  assert.equal(f.snapshot(observer).receiver, "in-call");
  // Reconnect can arrive before the old socket's disconnect event.
  const reconnected = await f.connect("resumed", "receiver");
  await f.invoke(reconnected, "call:presence:sync", { callId: call._id });
  receiver.handlers.disconnect("late disconnect");
  assert.equal(f.snapshot(observer).receiver, "in-call");
  reconnected.handlers.disconnect("transport close");
  assert.equal(f.snapshot(observer).receiver, undefined);
  const fresh = await f.connect("fresh", "receiver");
  await f.invoke(fresh, "call:presence:sync", {});
  assert.equal(f.snapshot(fresh).receiver, undefined); // A fresh tab does not claim a call.
  await f.invoke(fresh, "call:presence:sync", { callId: call._id });
  assert.equal(f.snapshot(observer).receiver, "in-call");
  await f.invoke(observer, "call:presence:sync", { callId: call._id });
  assert.equal(f.snapshot(observer).observer, undefined);
  const lookup = f.queries.at(-1);
  assert.equal(lookup.workspaceId, "one");
  assert.equal(lookup.scope, "direct");
  assert.equal(lookup.status, "Answered");
  assert.deepEqual(structuredClone(lookup.$or), [{ callerId: "observer" }, { receiverId: "observer" }]);
});

test("group participation clears on disconnect/leave and restores through the existing join event", async () => {
  const f = fixture();
  const member = await f.connect("member", "receiver");
  const observer = await f.connect("observer", "observer");
  const call = f.setCall("group", "Active");
  await f.invoke(member, "call:join", { callId: call._id });
  assert.equal(f.snapshot(observer).receiver, "in-group-call");
  member.handlers.disconnect("transport close");
  assert.equal(f.snapshot(observer).receiver, undefined);
  const resumed = await f.connect("resumed", "receiver");
  await f.invoke(resumed, "call:join", { callId: call._id });
  assert.equal(f.snapshot(observer).receiver, "in-group-call");
  await f.invoke(resumed, "call:leave", { callId: call._id });
  assert.equal(f.snapshot(observer).receiver, undefined);
});

test("presentation status reaches non-call observers, snapshots, and stops without clearing the call", async () => {
  const f = fixture();
  const receiver = await f.connect("receiver", "receiver");
  const observer = await f.connect("observer", "observer");
  const isolated = await f.connect("isolated", "isolated", "two");
  const call = f.setCall();
  await f.invoke(receiver, "call:accept", { callId: call._id });
  await receiver.handlers["call:screen-share-started"]({ callId: call._id });
  assert.deepEqual(f.presencePayload(observer).presenting, { receiver: true });
  assert.equal(f.snapshot(observer).receiver, "in-call");
  assert.equal(f.presencePayload(isolated), undefined);
  const late = await f.connect("late", "late");
  await f.invoke(late, "call:presence:sync", {});
  assert.deepEqual(f.presencePayload(late).presenting, { receiver: true });
  await receiver.handlers["call:screen-share-stopped"]({ callId: call._id });
  assert.deepEqual(f.presencePayload(observer).presenting, {});
  assert.equal(f.snapshot(observer).receiver, "in-call");
  await observer.handlers["call:screen-share-started"]({ callId: call._id });
  assert.deepEqual(f.presencePayload(observer).presenting, {}); // Not a participant.
  await receiver.handlers["call:screen-share-started"]({ callId: call._id });
  await f.invoke(receiver, "call:end", { callId: call._id });
  assert.deepEqual(f.presencePayload(observer).presenting, {});
  await receiver.handlers["call:screen-share-started"]({ callId: call._id });
  assert.deepEqual(f.presencePayload(observer).presenting, {}); // An ended call cannot present.
});

test("disconnect clears presentation; live direct/group reconnect restores it only for joined participants", async () => {
  const f = fixture();
  const member = await f.connect("member", "receiver");
  const observer = await f.connect("observer", "observer");
  const call = f.setCall();
  await f.invoke(member, "call:accept", { callId: call._id });
  await member.handlers["call:screen-share-started"]({ callId: call._id });
  member.handlers.disconnect("transport close");
  assert.deepEqual(f.presencePayload(observer).presenting, {});
  const resumed = await f.connect("resumed", "receiver");
  await f.invoke(resumed, "call:presence:sync", { callId: call._id, presenting: true });
  assert.deepEqual(f.presencePayload(observer).presenting, { receiver: true });
  await f.invoke(resumed, "call:presence:sync", { callId: call._id, presenting: false });
  assert.deepEqual(f.presencePayload(observer).presenting, {});
  const group = f.setCall("group", "Active");
  await observer.handlers["call:screen-share-started"]({ callId: group._id });
  assert.deepEqual(f.presencePayload(observer).presenting, {});
  await f.invoke(resumed, "call:join", { callId: group._id, presenting: true });
  assert.deepEqual(f.presencePayload(observer).presenting, { receiver: true });
  await f.invoke(resumed, "call:leave", { callId: group._id });
  assert.deepEqual(f.presencePayload(observer).presenting, {});
});
