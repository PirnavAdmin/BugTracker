const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const auth = require("../middleware/auth");
const generateToken = require("../utils/generateToken");
const { createTenantIdFromNumber, parseTenantSequence } = require("../utils/tenant");

const originalJwtSecret = process.env.JWT_SECRET;
const originalFindById = User.findById;

const createResponse = () => ({
  statusCode: 200,
  status(code) {
    this.statusCode = code;
    return this;
  },
});

beforeEach(() => {
  process.env.JWT_SECRET = "tenant-test-secret";
});

afterEach(() => {
  process.env.JWT_SECRET = originalJwtSecret;
  User.findById = originalFindById;
});

test("tenant helpers create stable sequential tenant ids", () => {
  assert.strictEqual(createTenantIdFromNumber(1), "TENANT_001");
  assert.strictEqual(createTenantIdFromNumber(23), "TENANT_023");
  assert.strictEqual(parseTenantSequence("tenant_123"), 123);
  assert.strictEqual(parseTenantSequence("workspace-1"), 0);
});

test("normal user tokens include tenant id only when the user has one", () => {
  const tokenWithTenant = generateToken("507f1f77bcf86cd799439011", "workspace-a", {
    tenantId: "TENANT_001",
  });
  const tokenWithoutTenant = generateToken("507f1f77bcf86cd799439022", "workspace-a");

  assert.strictEqual(jwt.verify(tokenWithTenant, process.env.JWT_SECRET).tenantId, "TENANT_001");
  assert.strictEqual(jwt.verify(tokenWithoutTenant, process.env.JWT_SECRET).tenantId, undefined);
});

test("auth middleware derives tenant context from the stored user before token payload", async () => {
  const token = jwt.sign(
    {
      id: "507f1f77bcf86cd799439011",
      workspaceId: "workspace-from-token",
      tenantId: "TENANT_999",
    },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );
  const req = {
    headers: {
      authorization: `Bearer ${token}`,
    },
  };
  const res = createResponse();
  let nextCalled = false;

  User.findById = () => ({
    select: () => ({
      lean: async () => ({
        _id: {
          toString: () => "507f1f77bcf86cd799439011",
        },
        name: "Tenant Admin",
        email: "admin@example.test",
        role: "Admin",
        workspaceId: "workspace-from-db",
        tenantId: "TENANT_001",
      }),
    }),
  });

  await auth(req, res, (error) => {
    assert.ifError(error);
    nextCalled = true;
  });

  assert.strictEqual(nextCalled, true);
  assert.strictEqual(req.user.workspaceId, "workspace-from-db");
  assert.strictEqual(req.user.tenantId, "TENANT_001");
  assert.strictEqual(req.tenantId, "TENANT_001");
});
