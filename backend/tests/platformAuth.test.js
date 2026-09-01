const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert");
const jwt = require("jsonwebtoken");
const PlatformAdmin = require("../models/PlatformAdmin");
const PlatformAuditLog = require("../models/PlatformAuditLog");
const {
  getPlatformDashboard,
  loginPlatformAdmin,
  logoutPlatformAdmin,
} = require("../controllers/platformAuthController");
const { platformAuth, requirePlatformRole } = require("../middleware/platformAuth");
const { PLATFORM_ADMIN_STATUSES, PLATFORM_ROLES } = require("../constants/platformRoles");

const originalJwtSecret = process.env.JWT_SECRET;
const originalFindOne = PlatformAdmin.findOne;
const originalFindById = PlatformAdmin.findById;
const originalAuditCreate = PlatformAuditLog.create;

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

const createPlatformAdmin = (overrides = {}) => ({
  _id: "507f1f77bcf86cd799439012",
  name: "Platform Owner",
  email: "owner@example.com",
  role: PLATFORM_ROLES.OWNER,
  status: PLATFORM_ADMIN_STATUSES.ACTIVE,
  lastLoginAt: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  comparePassword: async (password) => password === "StrongPass123",
  save: async function save() {
    return this;
  },
  ...overrides,
});

beforeEach(() => {
  process.env.JWT_SECRET = "test-secret";
  PlatformAuditLog.create = async (payload) => payload;
});

afterEach(() => {
  process.env.JWT_SECRET = originalJwtSecret;
  PlatformAdmin.findOne = originalFindOne;
  PlatformAdmin.findById = originalFindById;
  PlatformAuditLog.create = originalAuditCreate;
});

test("valid SaaS Owner login returns a platform token", async () => {
  const admin = createPlatformAdmin();

  PlatformAdmin.findOne = () => ({
    select: async () => admin,
  });

  const { res, nextError } = await callHandler(loginPlatformAdmin, {
    body: {
      email: "OWNER@EXAMPLE.COM",
      password: "StrongPass123",
    },
  });

  assert.ifError(nextError);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.platformAdmin.role, PLATFORM_ROLES.OWNER);

  const decoded = jwt.verify(res.body.token, process.env.JWT_SECRET);
  assert.strictEqual(decoded.tokenType, "platform-admin");
  assert.strictEqual(decoded.platformAdminId, String(admin._id));
});

test("platform login rejects invalid password", async () => {
  PlatformAdmin.findOne = () => ({
    select: async () => createPlatformAdmin(),
  });

  const { res, nextError } = await callHandler(loginPlatformAdmin, {
    body: {
      email: "owner@example.com",
      password: "wrong-password",
    },
  });

  assert.strictEqual(res.statusCode, 401);
  assert.match(nextError?.message || "", /Invalid platform credentials/);
});

test("platform login rejects unknown admins", async () => {
  PlatformAdmin.findOne = () => ({
    select: async () => null,
  });

  const { res, nextError } = await callHandler(loginPlatformAdmin, {
    body: {
      email: "missing@example.com",
      password: "StrongPass123",
    },
  });

  assert.strictEqual(res.statusCode, 401);
  assert.match(nextError?.message || "", /Invalid platform credentials/);
});

test("platform login rejects disabled admins", async () => {
  PlatformAdmin.findOne = () => ({
    select: async () =>
      createPlatformAdmin({
        status: PLATFORM_ADMIN_STATUSES.DISABLED,
      }),
  });

  const { res, nextError } = await callHandler(loginPlatformAdmin, {
    body: {
      email: "owner@example.com",
      password: "StrongPass123",
    },
  });

  assert.strictEqual(res.statusCode, 403);
  assert.match(nextError?.message || "", /disabled/);
});

test("platform logout records a successful response", async () => {
  const admin = createPlatformAdmin();
  const { res, nextError } = await callHandler(logoutPlatformAdmin, {
    platformAdmin: admin,
  });

  assert.ifError(nextError);
  assert.strictEqual(res.statusCode, 200);
  assert.match(res.body.message, /Signed out/);
});

test("SaaS Owner can access platform dashboard payload", async () => {
  const { res, nextError } = await callHandler(getPlatformDashboard, {
    platformAdmin: createPlatformAdmin(),
  });

  assert.ifError(nextError);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.platformAdmin.role, PLATFORM_ROLES.OWNER);
  assert.ok(res.body.permissions.includes("platform.dashboard"));
});

test("SaaS Admin can access permitted platform dashboard route", async () => {
  const { res, nextError } = await callHandler(getPlatformDashboard, {
    platformAdmin: createPlatformAdmin({
      role: PLATFORM_ROLES.ADMIN,
    }),
  });

  assert.ifError(nextError);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.platformAdmin.role, PLATFORM_ROLES.ADMIN);
  assert.ok(res.body.permissions.includes("platform.companies"));
  assert.ok(!res.body.permissions.includes("platform.payments"));
});

test("company deletion role guard allows only the SaaS Owner", async () => {
  const ownerResult = await callHandler(requirePlatformRole([PLATFORM_ROLES.OWNER]), {
    platformAdmin: createPlatformAdmin({ role: PLATFORM_ROLES.OWNER }),
  });
  assert.ifError(ownerResult.nextError);

  const adminResult = await callHandler(requirePlatformRole([PLATFORM_ROLES.OWNER]), {
    platformAdmin: createPlatformAdmin({ role: PLATFORM_ROLES.ADMIN }),
  });
  assert.strictEqual(adminResult.res.statusCode, 403);
  assert.match(adminResult.nextError?.message || "", /role is not allowed/);
});

test("unauthenticated platform API request is rejected", async () => {
  const { res, nextError } = await callHandler(platformAuth);

  assert.strictEqual(res.statusCode, 401);
  assert.match(nextError?.message || "", /Platform authentication required/);
});

test("normal CureCode user token cannot access platform APIs", async () => {
  const token = jwt.sign(
    {
      id: "507f1f77bcf86cd799439013",
      workspaceId: "workspace-1",
    },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );

  const { res, nextError } = await callHandler(platformAuth, {
    headers: {
      authorization: `Bearer ${token}`,
    },
  });

  assert.strictEqual(res.statusCode, 403);
  assert.match(nextError?.message || "", /Platform authorization required/);
});

test("expired platform token cannot access platform APIs", async () => {
  const token = jwt.sign(
    {
      id: "507f1f77bcf86cd799439012",
      platformAdminId: "507f1f77bcf86cd799439012",
      role: PLATFORM_ROLES.OWNER,
      tokenType: "platform-admin",
    },
    process.env.JWT_SECRET,
    { expiresIn: "-1s" }
  );

  const { res, nextError } = await callHandler(platformAuth, {
    headers: {
      authorization: `Bearer ${token}`,
    },
  });

  assert.strictEqual(res.statusCode, 401);
  assert.match(nextError?.message || "", /Invalid platform token/);
});
