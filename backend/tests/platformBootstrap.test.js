const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert");
const PlatformAdmin = require("../models/PlatformAdmin");
const PlatformAuditLog = require("../models/PlatformAuditLog");
const {
  resetInitialPlatformAdmin,
  validateBootstrapPassword,
} = require("../utils/platformBootstrap");
const { PLATFORM_ROLES } = require("../constants/platformRoles");

const originalEnv = {
  PLATFORM_ADMIN_EMAIL: process.env.PLATFORM_ADMIN_EMAIL,
  PLATFORM_ADMIN_NAME: process.env.PLATFORM_ADMIN_NAME,
  PLATFORM_ADMIN_PASSWORD: process.env.PLATFORM_ADMIN_PASSWORD,
};
const originalFindOne = PlatformAdmin.findOne;
const originalCreate = PlatformAdmin.create;
const originalAuditCreate = PlatformAuditLog.create;

beforeEach(() => {
  process.env.PLATFORM_ADMIN_EMAIL = "owner@gmail.com";
  process.env.PLATFORM_ADMIN_NAME = "CureCode SaaS Owner";
  process.env.PLATFORM_ADMIN_PASSWORD = "Owner@123";
  PlatformAuditLog.create = async (payload) => payload;
});

afterEach(() => {
  process.env.PLATFORM_ADMIN_EMAIL = originalEnv.PLATFORM_ADMIN_EMAIL;
  process.env.PLATFORM_ADMIN_NAME = originalEnv.PLATFORM_ADMIN_NAME;
  process.env.PLATFORM_ADMIN_PASSWORD = originalEnv.PLATFORM_ADMIN_PASSWORD;
  PlatformAdmin.findOne = originalFindOne;
  PlatformAdmin.create = originalCreate;
  PlatformAuditLog.create = originalAuditCreate;
});

test("platform bootstrap accepts existing 8 character password policy", () => {
  assert.strictEqual(validateBootstrapPassword("Owner@123"), "");
});

test("resetInitialPlatformAdmin refreshes an existing platform admin password", async () => {
  let saved = false;
  const admin = {
    _id: "507f1f77bcf86cd799439012",
    email: "owner@gmail.com",
    name: "Old Name",
    passwordHash: "old-hash",
    role: "SaaS Admin",
    status: "disabled",
    save: async function save() {
      saved = true;
      return this;
    },
  };

  PlatformAdmin.findOne = () => ({
    select: async () => admin,
  });

  const result = await resetInitialPlatformAdmin();

  assert.strictEqual(result.email, "owner@gmail.com");
  assert.strictEqual(result.name, "CureCode SaaS Owner");
  assert.strictEqual(result.passwordHash, "Owner@123");
  assert.strictEqual(result.role, PLATFORM_ROLES.OWNER);
  assert.strictEqual(result.status, "active");
  assert.strictEqual(saved, true);
});
