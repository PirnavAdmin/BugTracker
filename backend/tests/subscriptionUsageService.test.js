const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const PlatformCompany = require("../models/PlatformCompany");
const User = require("../models/User");
const Project = require("../models/Project");
const {
  assertTenantCapacity,
  getTenantSubscriptionUsage,
  withTenantLimitLock,
  isExplicitTestBypassEnabled,
} = require("../services/subscriptionUsageService");

const originals = {
  findOne: PlatformCompany.findOne,
  userCount: User.countDocuments,
  projectCount: Project.countDocuments,
};

afterEach(() => {
  PlatformCompany.findOne = originals.findOne;
  User.countDocuments = originals.userCount;
  Project.countDocuments = originals.projectCount;
});

const mockCompany = (planId = "starter") => {
  PlatformCompany.findOne = () => ({
    lean: async () => ({ tenantId: "TENANT_002", planId }),
  });
};

test("tenant usage is scoped by tenant and returns remaining capacity", async () => {
  let userFilter;
  let projectFilter;
  mockCompany("starter");
  User.countDocuments = async (filter) => {
    userFilter = filter;
    return 3;
  };
  Project.countDocuments = async (filter) => {
    projectFilter = filter;
    return 2;
  };
  const result = await getTenantSubscriptionUsage("tenant_002");
  assert.deepEqual(userFilter, { tenantId: "TENANT_002" });
  assert.deepEqual(projectFilter, { tenantId: "TENANT_002" });
  assert.deepEqual(result.usage.users, { current: 3, limit: 10, remaining: 7, unlimited: false });
  assert.deepEqual(result.usage.projects, { current: 2, limit: 5, remaining: 3, unlimited: false });
});

test("subscription bypass requires explicit test environment and flag", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalFlag = process.env.SUBSCRIPTION_LIMITS_BYPASS_FOR_TESTS;
  try {
    for (const environment of ["development", "staging", "production"]) {
      process.env.NODE_ENV = environment;
      process.env.SUBSCRIPTION_LIMITS_BYPASS_FOR_TESTS = "true";
      assert.equal(isExplicitTestBypassEnabled(), false);
    }
    process.env.NODE_ENV = "test";
    process.env.SUBSCRIPTION_LIMITS_BYPASS_FOR_TESTS = "false";
    assert.equal(isExplicitTestBypassEnabled(), false);
    process.env.SUBSCRIPTION_LIMITS_BYPASS_FOR_TESTS = "true";
    assert.equal(isExplicitTestBypassEnabled(), true);
  } finally {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    if (originalFlag === undefined) delete process.env.SUBSCRIPTION_LIMITS_BYPASS_FOR_TESTS;
    else process.env.SUBSCRIPTION_LIMITS_BYPASS_FOR_TESTS = originalFlag;
  }
});

test("enterprise usage is unlimited and over-limit requests are structured", async () => {
  mockCompany("enterprise");
  User.countDocuments = async () => 157;
  Project.countDocuments = async () => 12;
  const result = await getTenantSubscriptionUsage("TENANT_001");
  assert.equal(result.usage.users.unlimited, true);
  assert.equal(result.usage.users.remaining, null);
  assert.equal(result.usage.projects.unlimited, true);

  mockCompany("free");
  User.countDocuments = async () => 5;
  Project.countDocuments = async () => 0;
  await assert.rejects(
    () => assertTenantCapacity({ tenantId: "TENANT_002", resource: "users" }),
    (error) => {
      assert.equal(error.code, "PLAN_LIMIT_REACHED");
      assert.equal(error.resource, "users");
      assert.equal(error.current, 5);
      assert.equal(error.limit, 5);
      assert.equal(error.plan, "free");
      return true;
    }
  );
});

test("tenant limit lock serializes concurrent callbacks", async () => {
  const events = [];
  await Promise.all([
    withTenantLimitLock("TENANT_002", async () => {
      events.push("first-start");
      await new Promise((resolve) => setTimeout(resolve, 10));
      events.push("first-end");
    }),
    withTenantLimitLock("TENANT_002", async () => events.push("second")),
  ]);
  assert.deepEqual(events, ["first-start", "first-end", "second"]);
});
