process.env.NODE_ENV = "test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret";
process.env.SUBSCRIPTION_LIMITS_BYPASS_FOR_TESTS = "true";

const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const User = require("../models/User");
const UserEmailConfig = require("../models/UserEmailConfig");
const TeamMember = require("../models/TeamMember");
const WorkspaceSetting = require("../models/WorkspaceSetting");
const { inviteUser } = require("../controllers/userController");

const adminId = new mongoose.Types.ObjectId().toString();
const standaloneUserId = new mongoose.Types.ObjectId().toString();
const currentWorkspaceId = "workspace-company";
const standaloneWorkspaceId = "workspace-self-registered";
const currentTenantId = "TENANT_001";

const query = (value) => ({
  select() {
    return this;
  },
  async lean() {
    return value;
  },
});

test("inviteUser rejects with 409 if user exists in the current workspace", async () => {
  const originalUserFindOne = User.findOne;
  try {
    User.findOne = () =>
      query({
        _id: new mongoose.Types.ObjectId(),
        email: "existing@pirnav.com",
        workspaceId: currentWorkspaceId,
        tenantId: currentTenantId,
      });

    const req = {
      user: {
        _id: adminId,
        role: "Admin",
        workspaceId: currentWorkspaceId,
        tenantId: currentTenantId,
      },
      body: {
        email: "existing@pirnav.com",
        role: "Tester",
      },
    };

    let statusCode = 200;
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json() {
        return this;
      },
    };

    await assert.rejects(
      async () => {
        await inviteUser(req, res, (error) => {
          if (error) throw error;
        });
      },
      /A user with that email already exists/
    );
    assert.equal(statusCode, 409);
  } finally {
    User.findOne = originalUserFindOne;
  }
});

test("inviteUser automatically deletes self-registered standalone user and creates a fresh user in the current workspace", async () => {
  const originalUserFindOne = User.findOne;
  const originalUserDeleteOne = User.deleteOne;
  const originalUserCreate = User.create;
  const originalUserUpdateMany = User.updateMany;
  const originalConfigDeleteMany = UserEmailConfig.deleteMany;
  const originalTeamDeleteMany = TeamMember.deleteMany;
  const originalSettingsFindOne = WorkspaceSetting.findOne;
  const originalSettingsFindOneAndUpdate = WorkspaceSetting.findOneAndUpdate;

  let deletedStandaloneUserId = null;
  let createdUserPayload = null;

  try {
    let callCount = 0;
    User.findOne = (filter) => {
      callCount++;
      if (filter.email === "varshitha@pirnav.com") {
        return query({
          _id: standaloneUserId,
          email: "varshitha@pirnav.com",
          workspaceId: standaloneWorkspaceId,
          tenantId: "",
        });
      }
      return query(null);
    };

    User.deleteOne = async (filter) => {
      deletedStandaloneUserId = String(filter._id);
      return { deletedCount: 1 };
    };

    User.updateMany = async () => ({ modifiedCount: 0 });
    UserEmailConfig.deleteMany = async () => ({ deletedCount: 0 });
    TeamMember.deleteMany = async () => ({ deletedCount: 0 });
    WorkspaceSetting.findOne = () => query(null);
    WorkspaceSetting.findOneAndUpdate = () => query(null);

    User.create = async (payload) => {
      createdUserPayload = payload;
      return {
        _id: new mongoose.Types.ObjectId(),
        ...payload,
        toObject() {
          return this;
        },
      };
    };

    const req = {
      user: {
        _id: adminId,
        role: "Admin",
        workspaceId: currentWorkspaceId,
        tenantId: currentTenantId,
      },
      body: {
        email: "varshitha@pirnav.com",
        role: "Tester",
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

    await inviteUser(req, res, (error) => {
      if (error) throw error;
    });

    assert.equal(statusCode, 201);
    assert.equal(deletedStandaloneUserId, standaloneUserId);
    assert.equal(createdUserPayload.email, "varshitha@pirnav.com");
    assert.equal(createdUserPayload.workspaceId, currentWorkspaceId);
    assert.equal(createdUserPayload.tenantId, currentTenantId);
    assert.equal(createdUserPayload.role, "Tester");
    assert.equal(jsonPayload.invitedUser.email, "varshitha@pirnav.com");
    assert.equal(jsonPayload.invitedUser.role, "Tester");
  } finally {
    User.findOne = originalUserFindOne;
    User.deleteOne = originalUserDeleteOne;
    User.create = originalUserCreate;
    User.updateMany = originalUserUpdateMany;
    UserEmailConfig.deleteMany = originalConfigDeleteMany;
    TeamMember.deleteMany = originalTeamDeleteMany;
    WorkspaceSetting.findOne = originalSettingsFindOne;
    WorkspaceSetting.findOneAndUpdate = originalSettingsFindOneAndUpdate;
  }
});
