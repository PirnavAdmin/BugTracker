const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { createRequire } = require("node:module");

test("Teams Chat Enhancements", async (t) => {
  const ids = {
    conversation: "507f1f77bcf86cd799439011",
    user1: "507f1f77bcf86cd799439012",
    user2: "507f1f77bcf86cd799439013",
  };

  const user1 = {
    _id: ids.user1,
    name: "User One",
    email: "user1@teams.local",
    role: "Developer",
    workspaceId: "test-teams-ws",
  };

  const user2 = {
    _id: ids.user2,
    name: "User Two",
    email: "user2@teams.local",
    role: "Developer",
    workspaceId: "test-teams-ws",
  };

  const conversation = {
    _id: ids.conversation,
    workspaceId: "test-teams-ws",
    type: "direct",
    participants: [ids.user1, ids.user2],
    historyClearedAt: {},
  };

  let messages = [];

  const Message = {
    create: async (data) => {
      const msg = {
        _id: `507f1f77bcf86cd7994390${14 + messages.length}`,
        metadata: null,
        edited: false,
        deleted: false,
        ...data,
        createdAt: data.createdAt || new Date(),
        markModified() {},
        save: async function () {
          return this;
        },
      };
      messages.push(msg);
      return msg;
    },
    findById: (id) => {
      const found = messages.find((m) => String(m._id) === String(id));
      if (!found) {
        return {
          populate: () => ({ lean: async () => null }),
          then: (resolve) => resolve(null),
        };
      }
      return {
        ...found,
        markModified() {},
        save: async function () {
          return this;
        },
        populate: () => ({
          lean: async () => found,
        }),
        then: (resolve) => resolve(found),
      };
    },
    findOne: () => ({
      populate: () => ({
        lean: async () => null,
      }),
      then: (resolve) => resolve(null),
    }),
  };

  const query = (val) => ({
    select: () => query(val),
    populate: () => query(val),
    lean: async () => val,
    then: (resolve) => resolve(val),
  });

  const Conversation = {
    findOne: () => query(conversation),
    updateOne: async () => ({ modifiedCount: 1 }),
  };

  const dependencies = {
    express: require("express"),
    mongoose: require("mongoose"),
    multer: require("multer"),
    "../models/Conversation.model": Conversation,
    "../models/Message.model": Message,
    "../models/ChatMeeting": {},
    "../models/CallLog.model": {},
    "../models/QuickChatHandled.model": {},
    "../models/User": {},
    "../utils/asyncHandler": (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next),
    "../utils/workspace": { normalizeWorkspaceId: (id) => id || "test-teams-ws" },
    "../services/storage": {
      uploadBuffer: async () => ({}),
      getStream: async () => ({}),
    },
  };

  const module = { exports: {} };
  const controllerPath = require.resolve("../controllers/chat.controller");
  const controllerCode = fs.readFileSync(controllerPath, "utf8");

  const path = require("node:path");
  vm.runInNewContext(controllerCode, {
    module,
    exports: module.exports,
    __dirname: path.dirname(controllerPath),
    __filename: controllerPath,
    require: (name) => {
      if (name in dependencies) return dependencies[name];
      return require(name);
    },
    console,
    process,
    Buffer,
    setTimeout,
    clearTimeout,
  });

  const {
    createMessageDocument,
    toggleMessageReaction,
    editChatMessage,
    deleteChatMessage,
  } = module.exports;

  await t.test("creates message with quoted reply metadata", async () => {
    const parentMsg = await createMessageDocument({
      conversationId: conversation._id,
      sender: user1,
      message: "Hey, can you review the sprint backlog?",
    });

    const replyMsg = await createMessageDocument({
      conversationId: conversation._id,
      sender: user2,
      message: "Sure, looking at it now!",
      metadata: {
        replyTo: {
          id: String(parentMsg._id),
          senderName: user1.name,
          text: parentMsg.message,
        },
      },
    });

    assert.ok(replyMsg);
    assert.equal(replyMsg.message, "Sure, looking at it now!");
    assert.ok(replyMsg.metadata?.replyTo);
    assert.equal(replyMsg.metadata.replyTo.id, String(parentMsg._id));
    assert.equal(replyMsg.metadata.replyTo.senderName, "User One");
  });

  await t.test("toggles reactions on messages", async () => {
    const msg = await createMessageDocument({
      conversationId: conversation._id,
      sender: user1,
      message: "Deploy succeeded! 🚀",
    });

    // User 2 reacts with 👍
    const req1 = {
      params: { messageId: String(msg._id) },
      body: { emoji: "👍" },
      user: user2,
    };
    let jsonResult1 = null;
    const res1 = {
      status() {
        return this;
      },
      json(data) {
        jsonResult1 = data;
      },
    };

    await toggleMessageReaction(req1, res1);
    assert.ok(jsonResult1);
    assert.equal(jsonResult1.reactions.length, 1);
    assert.equal(jsonResult1.reactions[0].emoji, "👍");
    assert.equal(String(jsonResult1.reactions[0].userId), String(user2._id));

    // User 2 reacts with 👍 again (should remove reaction)
    let jsonResult2 = null;
    const res2 = {
      status() {
        return this;
      },
      json(data) {
        jsonResult2 = data;
      },
    };
    await toggleMessageReaction(req1, res2);
    assert.ok(jsonResult2);
    assert.equal(jsonResult2.reactions.length, 0);
  });

  await t.test("edits message and marks it as edited", async () => {
    const msg = await createMessageDocument({
      conversationId: conversation._id,
      sender: user1,
      message: "Typo here...",
    });

    const req = {
      params: { messageId: String(msg._id) },
      body: { message: "Corrected message text!" },
      user: user1,
    };
    let jsonResult = null;
    const res = {
      status() {
        return this;
      },
      json(data) {
        jsonResult = data;
      },
    };

    await editChatMessage(req, res);
    assert.ok(jsonResult);
    assert.equal(jsonResult.message.message, "Corrected message text!");
    assert.equal(jsonResult.message.edited, true);
    assert.ok(jsonResult.message.metadata?.editedAt);
  });

  await t.test("deletes message safely (soft delete)", async () => {
    const msg = await createMessageDocument({
      conversationId: conversation._id,
      sender: user1,
      message: "Secret to be deleted",
    });

    const req = {
      params: { messageId: String(msg._id) },
      user: user1,
    };
    let jsonResult = null;
    const res = {
      status() {
        return this;
      },
      json(data) {
        jsonResult = data;
      },
    };

    await deleteChatMessage(req, res);
    assert.ok(jsonResult);
    assert.equal(jsonResult.success, true);
    assert.equal(msg.deleted, true);
    assert.equal(msg.message, "");
  });
});
