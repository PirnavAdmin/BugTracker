process.env.NODE_ENV = "test";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const {
  createTenantCacheMiddleware,
  createTenantInvalidationMiddleware,
} = require("../middleware/tenantCache");

const createRequest = (overrides = {}) => ({
  method: "GET",
  baseUrl: "/api/issues",
  path: "/",
  params: {},
  query: { page: "1", limit: "20" },
  tenantId: "TENANT_001",
  user: {
    _id: "user-1",
    role: "Admin",
    workspaceId: "workspace-1",
    tenantId: "TENANT_001",
  },
  ...overrides,
});

const createResponse = () => {
  const response = new EventEmitter();
  response.statusCode = 200;
  response.headers = {};
  response.status = (statusCode) => {
    response.statusCode = statusCode;
    return response;
  };
  response.setHeader = (name, value) => {
    response.headers[name] = value;
  };
  response.sent = new Promise((resolve) => {
    response.json = (body) => {
      response.body = body;
      resolve(body);
      return response;
    };
  });
  return response;
};

test("cache HIT returns without invoking the MongoDB-backed controller", async () => {
  const cacheService = {
    getCached: async () => ({ hit: true, value: [{ id: "cached" }] }),
  };
  const middleware = createTenantCacheMiddleware(cacheService)({ resource: "tasks" });
  const response = createResponse();
  let controllerCalls = 0;

  await middleware(createRequest(), response, () => {
    controllerCalls += 1;
  });
  await response.sent;

  assert.equal(controllerCalls, 0);
  assert.equal(response.headers["X-Cache"], "HIT");
  assert.deepEqual(response.body, [{ id: "cached" }]);
});

test("cache MISS stores the successful controller response", async () => {
  const writes = [];
  const cacheService = {
    getCached: async () => ({ hit: false, value: null }),
    setCached: async (entry) => {
      writes.push(entry);
      return true;
    },
  };
  const middleware = createTenantCacheMiddleware(cacheService)({ resource: "dashboard" });
  const response = createResponse();

  await middleware(createRequest({ baseUrl: "/api/analytics", path: "/overview" }), response, () => {
    response.status(200).json({ total: 7 });
  });
  await response.sent;

  assert.equal(response.headers["X-Cache"], "MISS");
  assert.equal(writes.length, 1);
  assert.equal(writes[0].tenantId, "TENANT_001");
  assert.match(writes[0].key, /^tenant:TENANT_001:dashboard:v1:/);
  assert.deepEqual(writes[0].value, { total: 7 });
});

test("simultaneous identical misses are coalesced to one controller load", async () => {
  const cacheService = {
    getCached: async () => ({ hit: false, value: null }),
    setCached: async () => true,
  };
  const middleware = createTenantCacheMiddleware(cacheService)({ resource: "triage-board" });
  const firstResponse = createResponse();
  const secondResponse = createResponse();
  let controllerCalls = 0;
  const load = (response) => {
    controllerCalls += 1;
    setTimeout(() => response.status(200).json([{ id: "bug-1" }]), 10);
  };

  const first = middleware(createRequest(), firstResponse, () => load(firstResponse));
  const second = middleware(createRequest(), secondResponse, () => load(secondResponse));
  await Promise.all([first, second, firstResponse.sent, secondResponse.sent]);

  assert.equal(controllerCalls, 1);
  assert.deepEqual(firstResponse.body, [{ id: "bug-1" }]);
  assert.deepEqual(secondResponse.body, [{ id: "bug-1" }]);
  assert.equal(secondResponse.headers["X-Cache"], "HIT");
});

test("missing authenticated tenant context is rejected before cache access", async () => {
  let cacheReads = 0;
  const cacheService = {
    getCached: async () => {
      cacheReads += 1;
      return { hit: false, value: null };
    },
  };
  const middleware = createTenantCacheMiddleware(cacheService)({ resource: "bugs" });
  const response = createResponse();
  let nextError;

  await middleware(
    createRequest({ tenantId: "", user: { _id: "user-1", tenantId: "" } }),
    response,
    (error) => {
      nextError = error;
    }
  );

  assert.match(nextError.message, /Tenant context is required/);
  assert.equal(response.statusCode, 403);
  assert.equal(cacheReads, 0);
});

test("successful mutation invalidates before sending its response", async () => {
  const calls = [];
  const cacheService = {
    invalidateTenantCache: async (tenantId, resources) => {
      calls.push({ tenantId, resources });
      return 2;
    },
  };
  const middleware = createTenantInvalidationMiddleware(cacheService)(["bugs", "dashboard"]);
  const response = createResponse();

  middleware(createRequest({ method: "PUT" }), response, () => {
    response.status(200).json({ updated: true });
  });
  await response.sent;

  assert.deepEqual(calls, [
    { tenantId: "TENANT_001", resources: ["bugs", "dashboard"] },
  ]);
  assert.deepEqual(response.body, { updated: true });
});
