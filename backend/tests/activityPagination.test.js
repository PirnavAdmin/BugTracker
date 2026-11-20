const assert = require("node:assert/strict");
const { after, test } = require("node:test");
const User = require("../models/User");
const UserActivity = require("../models/UserActivity");
const presenceService = require("../services/presenceService");

const controllerPath = require.resolve("../controllers/activityController");
const originalGetPresenceForUsers = presenceService.getPresenceForUsers;
const presenceByUserId = {
  "user-1": { status: "active", lastSeen: null },
  "user-2": { status: "idle", lastSeen: null },
  "user-3": { status: "active", lastSeen: null },
  "user-4": { status: "offline", lastSeen: null },
};

presenceService.getPresenceForUsers = async () => presenceByUserId;
delete require.cache[controllerPath];
const { getTeamActivity } = require("../controllers/activityController");

after(() => {
  presenceService.getPresenceForUsers = originalGetPresenceForUsers;
  delete require.cache[controllerPath];
});

test("team activity applies search, status, and database pagination", async () => {
  const originals = {
    find: User.find,
    countDocuments: User.countDocuments,
    distinct: User.distinct,
    activityFind: UserActivity.find,
  };
  let userFilter;
  let skipValue;
  let limitValue;
  let activityFilter;

  User.countDocuments = async (filter) => {
    userFilter = filter;
    return 12;
  };
  User.distinct = async () => Object.keys(presenceByUserId);
  User.find = (filter) => {
    userFilter = filter;
    return {
      select() {
        return this;
      },
      sort() {
        return this;
      },
      skip(value) {
        skipValue = value;
        return this;
      },
      limit(value) {
        limitValue = value;
        return this;
      },
      lean: async () => [{ _id: "user-3", name: "Team Developer", role: "Developer" }],
    };
  };
  UserActivity.find = (filter) => {
    activityFilter = filter;
    return {
      populate() {
        return this;
      },
      sort() {
        return this;
      },
      lean: async () => [],
    };
  };

  try {
    const response = {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        this.body = body;
        return this;
      },
    };

    await getTeamActivity(
      {
        query: { page: "2", limit: "5", search: "developer", status: "active" },
        user: { _id: "admin", role: "Admin", workspaceId: "workspace-1", tenantId: "TENANT_001" },
      },
      response,
      (error) => {
        throw error;
      }
    );

    assert.equal(response.statusCode, 200);
    assert.equal(skipValue, 5);
    assert.equal(limitValue, 5);
    assert.deepEqual(userFilter._id.$in, ["user-1", "user-3"]);
    assert.equal(userFilter.$or[0].name.test("Team Developer"), true);
    assert.deepEqual(activityFilter.userId.$in, ["user-3"]);
    assert.equal(response.body.totalUsers, 12);
    assert.equal(response.body.totalPages, 3);
    assert.equal(response.body.currentPage, 2);
    assert.equal(response.body.users.length, 1);
    assert.deepEqual(response.body.summary, { active: 2, idle: 1, offline: 1 });
  } finally {
    User.find = originals.find;
    User.countDocuments = originals.countDocuments;
    User.distinct = originals.distinct;
    UserActivity.find = originals.activityFind;
  }
});
