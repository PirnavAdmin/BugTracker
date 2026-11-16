process.env.NODE_ENV = "test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret";
process.env.EMAIL_CONFIG_SECRET = process.env.EMAIL_CONFIG_SECRET || "test-email-secret";

const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const User = require("../models/User");
const UserEmailConfig = require("../models/UserEmailConfig");
const WorkspaceSetting = require("../models/WorkspaceSetting");
const { saveWorkspaceSender } = require("../controllers/settingsController");

const adminId = new mongoose.Types.ObjectId().toString();
const senderId = new mongoose.Types.ObjectId().toString();
const workspaceId = "workspace-test-123";

const query = (value) => ({
  select() {
    return this;
  },
  sort() {
    return this;
  },
  async lean() {
    return value;
  },
});

test("saveWorkspaceSender updates both user preference and WorkspaceSetting when called by Admin", async () => {
  const originalUserFindOne = User.findOne;
  const originalUserFindOneAndUpdate = User.findOneAndUpdate;
  const originalConfigFindOne = UserEmailConfig.findOne;
  const originalSettingsFindOne = WorkspaceSetting.findOne;
  const originalSettingsFindOneAndUpdate = WorkspaceSetting.findOneAndUpdate;

  let savedUserPreference = null;
  let savedWorkspaceSender = null;

  try {
    User.findOne = (filter) => {
      const id = String(filter._id || "");
      if (id === senderId) {
        return query({
          _id: senderId,
          name: "Company Mailer",
          email: "support@pirnav.com",
          role: "Admin",
          workspaceId,
        });
      }
      if (id === adminId) {
        return query({
          _id: adminId,
          name: "Admin User",
          email: "admin@pirnav.com",
          role: "Admin",
          workspaceId,
          senderPreference: savedUserPreference ? { userId: savedUserPreference.senderUserId } : null,
        });
      }
      return query(null);
    };

    UserEmailConfig.findOne = () =>
      query({
        userId: senderId,
        workspaceId,
        host: "smtp.hostinger.com",
        port: 465,
        secure: true,
        username: "support@pirnav.com",
        fromEmail: "support@pirnav.com",
        fromName: "CureCode Support",
        passwordEncrypted: "encrypted-pass",
      });

    User.findOneAndUpdate = (filter, update) => {
      savedUserPreference = {
        ownerUserId: filter._id,
        senderUserId: update.$set?.senderPreference?.userId,
      };
      return query({
        _id: adminId,
        senderPreference: update.$set?.senderPreference,
      });
    };

    WorkspaceSetting.findOneAndUpdate = (filter, update) => {
      savedWorkspaceSender = {
        workspaceId: filter.workspaceId,
        ...update.$set?.workspaceSender,
      };
      return query({
        workspaceId: filter.workspaceId,
        workspaceSender: update.$set?.workspaceSender,
      });
    };

    WorkspaceSetting.findOne = () =>
      query({
        workspaceId,
        workspaceSender: savedWorkspaceSender,
      });

    const req = {
      user: {
        _id: adminId,
        name: "Admin User",
        email: "admin@pirnav.com",
        role: "Admin",
        workspaceId,
      },
      body: {
        userId: senderId,
        enabled: true,
      },
    };

    let statusCode = 200;
    let jsonPayload = null;
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(payload) {
        jsonPayload = payload;
        return this;
      },
    };

    await saveWorkspaceSender(req, res, (error) => {
      if (error) throw error;
    });

    assert.equal(statusCode, 200);
    assert.equal(savedUserPreference.senderUserId, senderId);
    assert.equal(savedWorkspaceSender.enabled, true);
    assert.equal(savedWorkspaceSender.userId, senderId);
    assert.match(jsonPayload.message, /Company Mailer is now the active sender for this workspace/);
    assert.equal(jsonPayload.workspaceDefault.enabled, true);
    assert.equal(jsonPayload.workspaceDefault.userId, senderId);
  } finally {
    User.findOne = originalUserFindOne;
    User.findOneAndUpdate = originalUserFindOneAndUpdate;
    UserEmailConfig.findOne = originalConfigFindOne;
    WorkspaceSetting.findOne = originalSettingsFindOne;
    WorkspaceSetting.findOneAndUpdate = originalSettingsFindOneAndUpdate;
  }
});

test("saveWorkspaceSender clears both user preference and WorkspaceSetting when cleared by Admin", async () => {
  const originalUserFindOne = User.findOne;
  const originalUserFindOneAndUpdate = User.findOneAndUpdate;
  const originalSettingsFindOne = WorkspaceSetting.findOne;
  const originalSettingsFindOneAndUpdate = WorkspaceSetting.findOneAndUpdate;

  let clearedUserPreference = false;
  let clearedWorkspaceSender = false;

  try {
    User.findOne = () =>
      query({
        _id: adminId,
        name: "Admin User",
        email: "admin@pirnav.com",
        role: "Admin",
        workspaceId,
        senderPreference: null,
      });

    User.findOneAndUpdate = () => {
      clearedUserPreference = true;
      return query({ _id: adminId, senderPreference: null });
    };

    WorkspaceSetting.findOneAndUpdate = (filter, update) => {
      clearedWorkspaceSender = update.$set?.workspaceSender?.enabled === false;
      return query({
        workspaceId: filter.workspaceId,
        workspaceSender: update.$set?.workspaceSender,
      });
    };

    WorkspaceSetting.findOne = () =>
      query({
        workspaceId,
        workspaceSender: { enabled: false, userId: null },
      });

    const req = {
      user: {
        _id: adminId,
        name: "Admin User",
        email: "admin@pirnav.com",
        role: "Admin",
        workspaceId,
      },
      body: {
        userId: "",
        enabled: false,
      },
    };

    let statusCode = 200;
    let jsonPayload = null;
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(payload) {
        jsonPayload = payload;
        return this;
      },
    };

    await saveWorkspaceSender(req, res, (error) => {
      if (error) throw error;
    });

    assert.equal(statusCode, 200);
    assert.equal(clearedUserPreference, true);
    assert.equal(clearedWorkspaceSender, true);
    assert.equal(jsonPayload.workspaceDefault.enabled, false);
  } finally {
    User.findOne = originalUserFindOne;
    User.findOneAndUpdate = originalUserFindOneAndUpdate;
    WorkspaceSetting.findOne = originalSettingsFindOne;
    WorkspaceSetting.findOneAndUpdate = originalSettingsFindOneAndUpdate;
  }
});
