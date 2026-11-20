const assert = require("node:assert/strict");
const test = require("node:test");
const User = require("../models/User");
const { getManagedUsers } = require("../controllers/userController");

test("managed users applies tenant-scoped filters and database pagination", async () => {
  const originals = {
    find: User.find,
    countDocuments: User.countDocuments,
    aggregate: User.aggregate,
  };
  let findFilter;
  let skipValue;
  let limitValue;
  let aggregatePipeline;

  User.countDocuments = async (filter) => {
    findFilter = filter;
    return 12;
  };
  User.aggregate = async (pipeline) => {
    aggregatePipeline = pipeline;
    return [
      { _id: "Admin", count: 2 },
      { _id: "Developer", count: 3 },
    ];
  };
  User.find = (filter) => {
    findFilter = filter;
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
      lean: async () => [{ _id: "user-6", name: "Developer User", role: "Developer" }],
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

    await getManagedUsers(
      {
        query: {
          page: "2",
          limit: "5",
          search: "developer",
          role: "Developer",
        },
        user: {
          _id: "admin",
          workspaceId: "workspace-1",
          tenantId: "TENANT_001",
        },
      },
      response,
      (error) => {
        throw error;
      }
    );

    assert.equal(response.statusCode, 200);
    assert.equal(skipValue, 5);
    assert.equal(limitValue, 5);
    assert.equal(findFilter.role, "Developer");
    assert.equal(findFilter.$or[0].name.test("Developer User"), true);
    assert.equal(aggregatePipeline[0].$match.tenantId, "TENANT_001");
    assert.equal(response.body.totalUsers, 12);
    assert.equal(response.body.totalPages, 3);
    assert.equal(response.body.currentPage, 2);
    assert.equal(response.body.users.length, 1);
    assert.deepEqual(response.body.roleCounts, {
      total: 5,
      Admin: 2,
      Developer: 3,
    });
  } finally {
    User.find = originals.find;
    User.countDocuments = originals.countDocuments;
    User.aggregate = originals.aggregate;
  }
});
