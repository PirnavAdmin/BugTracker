process.env.NODE_ENV = "test";
process.env.SUBSCRIPTION_LIMITS_BYPASS_FOR_TESTS = "true";

const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert");
const bcrypt = require("bcrypt");
const PlatformAdmin = require("../models/PlatformAdmin");
const PlatformAuditLog = require("../models/PlatformAuditLog");
const PlatformCompany = require("../models/PlatformCompany");
const PlatformSubscription = require("../models/PlatformSubscription");
const ProviderSubscription = require("../models/Subscription");
const TeamMember = require("../models/TeamMember");
const User = require("../models/User");
const { loginPlatformAdmin } = require("../controllers/platformAuthController");
const { login } = require("../controllers/authController");
const { createCompanyAdminUser } = require("../services/platformCompanyService");
const { PLATFORM_ADMIN_STATUSES, PLATFORM_ROLES } = require("../constants/platformRoles");

const originalJwtSecret = process.env.JWT_SECRET;
const originalPlatformAdminFindOne = PlatformAdmin.findOne;
const originalPlatformAuditCreate = PlatformAuditLog.create;
const originalCompanyFindById = PlatformCompany.findById;
const originalSubscriptionFindOne = PlatformSubscription.findOne;
const originalProviderSubscriptionFindOne = ProviderSubscription.findOne;
const originalTeamMemberFind = TeamMember.find;
const originalUserCreate = User.create;
const originalUserFindOne = User.findOne;

const runUserSaveHooks = (user) =>
  new Promise((resolve, reject) => {
    User.schema.s.hooks.execPre("save", user, [], (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(user);
    });
  });

const createResponse = () => {
  let body;

  return {
    get body() {
      return body;
    },
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader() {},
    json(payload) {
      body = payload;
      return this;
    },
  };
};

const callHandler = async (handler, req = {}) => {
  const res = createResponse();
  let nextError;

  await handler(
    {
      body: {},
      headers: {},
      ...req,
    },
    res,
    (error) => {
      nextError = error;
    }
  );

  return { res, nextError };
};

const createCompanyDocument = () => ({
  _id: "507f1f77bcf86cd799439011",
  name: "Pirnav Software Solutions",
  email: "hr@pirnav.com",
  tenantId: "TENANT_001",
  contactPerson: "HR Admin",
  contactEmail: "hr@pirnav.com",
  planId: "professional",
  status: "Active",
  adminUserId: null,
  save: async function save() {
    return this;
  },
});

beforeEach(() => {
  process.env.JWT_SECRET = "company-admin-password-test-secret";
  PlatformAuditLog.create = async (payload) => payload;
  PlatformSubscription.findOne = () => ({
    sort: () => ({
      lean: async () => null,
    }),
  });
  ProviderSubscription.findOne = () => ({
    sort: () => ({
      lean: async () => null,
    }),
  });
  TeamMember.find = () => ({
    populate: () => ({
      sort: () => ({
        lean: async () => [],
      }),
    }),
  });
});

afterEach(() => {
  process.env.JWT_SECRET = originalJwtSecret;
  PlatformAdmin.findOne = originalPlatformAdminFindOne;
  PlatformAuditLog.create = originalPlatformAuditCreate;
  PlatformCompany.findById = originalCompanyFindById;
  PlatformSubscription.findOne = originalSubscriptionFindOne;
  ProviderSubscription.findOne = originalProviderSubscriptionFindOne;
  TeamMember.find = originalTeamMemberFind;
  User.create = originalUserCreate;
  User.findOne = originalUserFindOne;
});

test("company admin creation stores generated password as one bcrypt hash usable by normal login", async () => {
  const companyDocument = createCompanyDocument();
  let createdUser;
  let firstFindById = true;

  PlatformCompany.findById = () => {
    if (firstFindById) {
      firstFindById = false;
      return companyDocument;
    }

    return {
      populate: () => ({
        lean: async () => ({
          ...companyDocument,
          adminUserId: createdUser,
        }),
      }),
    };
  };
  User.findOne = async () => null;
  User.create = async (payload) => {
    createdUser = new User(payload);
    await runUserSaveHooks(createdUser);
    return createdUser;
  };

  const res = createResponse();
  const result = await createCompanyAdminUser(
    "507f1f77bcf86cd799439011",
    {
      email: "hr@pirnav.com",
      name: "HR Admin",
    },
    res
  );
  const generatedPassword = result.temporaryPassword;

  assert.ok(generatedPassword);
  assert.match(createdUser.password, /^\$2[aby]\$\d{2}\$/);
  assert.notStrictEqual(createdUser.password, generatedPassword);
  assert.strictEqual(await bcrypt.compare(generatedPassword, createdUser.password), true);
  assert.strictEqual(await createdUser.verifyPassword(generatedPassword), true);
  assert.strictEqual(createdUser.role, "Admin");
  assert.strictEqual(createdUser.tenantId, "TENANT_001");
  assert.strictEqual(createdUser.workspaceId, "legacy-workspace");

  User.findOne = () => ({
    select: async () => createdUser,
  });

  const { res: loginRes, nextError } = await callHandler(login, {
    body: {
      email: "hr@pirnav.com",
      password: generatedPassword,
    },
  });

  assert.ifError(nextError);
  assert.strictEqual(loginRes.statusCode, 200);
  assert.strictEqual(loginRes.body.user.email, "hr@pirnav.com");
  assert.strictEqual(loginRes.body.user.tenantId, "TENANT_001");
  assert.ok(loginRes.body.token);
});

test("company admin relink updates existing normal user password through the User save hook", async () => {
  const companyDocument = createCompanyDocument();
  const existingUser = new User({
    _id: "507f1f77bcf86cd799439033",
    name: "HR Admin",
    email: "hr@pirnav.com",
    password: await bcrypt.hash("OldPass123", 10),
    role: "Developer",
    workspaceId: "legacy-workspace",
    tenantId: "TENANT_001",
  });
  let firstFindById = true;

  existingUser.save = async function save() {
    await runUserSaveHooks(this);
    return this;
  };
  PlatformCompany.findById = () => {
    if (firstFindById) {
      firstFindById = false;
      return companyDocument;
    }

    return {
      populate: () => ({
        lean: async () => ({
          ...companyDocument,
          adminUserId: existingUser,
        }),
      }),
    };
  };
  User.findOne = async () => existingUser;

  const res = createResponse();
  const result = await createCompanyAdminUser(
    "507f1f77bcf86cd799439011",
    {
      email: "hr@pirnav.com",
      name: "HR Admin",
    },
    res
  );

  assert.ok(result.temporaryPassword);
  assert.match(existingUser.password, /^\$2[aby]\$\d{2}\$/);
  assert.strictEqual(await existingUser.verifyPassword(result.temporaryPassword), true);
  assert.strictEqual(await existingUser.verifyPassword("OldPass123"), false);
  assert.strictEqual(existingUser.role, "Admin");
  assert.strictEqual(existingUser.tenantId, "TENANT_001");
  assert.strictEqual(existingUser.workspaceId, "legacy-workspace");
});

test("platform admin login path remains separate from company admin password handling", async () => {
  PlatformAdmin.findOne = () => ({
    select: async () => ({
      _id: "507f1f77bcf86cd799439044",
      name: "Platform Owner",
      email: "owner@example.com",
      role: PLATFORM_ROLES.OWNER,
      status: PLATFORM_ADMIN_STATUSES.ACTIVE,
      lastLoginAt: null,
      comparePassword: async (password) => password === "StrongPass123",
      save: async function save() {
        return this;
      },
    }),
  });

  const { res, nextError } = await callHandler(loginPlatformAdmin, {
    body: {
      email: "owner@example.com",
      password: "StrongPass123",
    },
  });

  assert.ifError(nextError);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.platformAdmin.email, "owner@example.com");
  assert.ok(res.body.token);
});
