process.env.NODE_ENV = "test";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  createTenantCacheService,
  getTenantCacheKey,
  stableSerialize,
} = require("../services/tenantCacheService");

class FakeRedis {
  constructor() {
    this.isOpen = true;
    this.isReady = true;
    this.values = new Map();
    this.sets = new Map();
  }

  async get(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  async set(key, value) {
    this.values.set(key, value);
  }

  async sAdd(key, values) {
    const set = this.sets.get(key) || new Set();
    for (const value of Array.isArray(values) ? values : [values]) set.add(value);
    this.sets.set(key, set);
  }

  async sMembers(key) {
    return [...(this.sets.get(key) || [])];
  }

  async sRem(key, values) {
    const set = this.sets.get(key) || new Set();
    for (const value of Array.isArray(values) ? values : [values]) set.delete(value);
  }

  async del(values) {
    let deleted = 0;
    for (const value of Array.isArray(values) ? values : [values]) {
      deleted += this.values.delete(value) ? 1 : 0;
    }
    return deleted;
  }

  async expire() {
    return true;
  }
}

const createKey = (resource, tenantId = "TENANT_001", filters = {}) =>
  getTenantCacheKey({
    tenantId,
    resource,
    filters,
    access: { userId: "user-1", role: "Admin", workspaceId: "workspace-1" },
  });

test("filter normalization is stable regardless of query parameter ordering", () => {
  assert.equal(
    stableSerialize({ status: "OPEN", page: 1, nested: { sprintId: "sprint-1", limit: 20 } }),
    stableSerialize({ nested: { limit: 20, sprintId: "sprint-1" }, page: 1, status: "OPEN" })
  );
  assert.equal(
    createKey("tasks", "TENANT_001", { page: 1, status: "OPEN" }),
    createKey("tasks", "TENANT_001", { status: "OPEN", page: 1 })
  );
});

test("different filters and authenticated access contexts generate different keys", () => {
  assert.notEqual(
    createKey("bugs", "TENANT_001", { priority: "High" }),
    createKey("bugs", "TENANT_001", { priority: "Low" })
  );
  assert.notEqual(
    createKey("tasks"),
    getTenantCacheKey({
      tenantId: "TENANT_001",
      resource: "tasks",
      access: { userId: "user-2", role: "Developer", workspaceId: "workspace-1" },
    })
  );
});

test("Tenant A cannot receive Tenant B cache entries", async () => {
  const redis = new FakeRedis();
  const cache = createTenantCacheService(redis);
  const tenantOneKey = createKey("bugs", "TENANT_001");
  const tenantTwoKey = createKey("bugs", "TENANT_002");

  await cache.setCached({ key: tenantOneKey, tenantId: "TENANT_001", value: [{ id: "A" }], ttlSeconds: 20 });
  assert.deepEqual(await cache.getCached({ key: tenantOneKey, tenantId: "TENANT_001", resource: "bugs" }), {
    hit: true,
    value: [{ id: "A" }],
  });
  assert.deepEqual(await cache.getCached({ key: tenantTwoKey, tenantId: "TENANT_002", resource: "bugs" }), {
    hit: false,
    value: null,
  });
  assert.match(tenantOneKey, /^tenant:TENANT_001:bugs:v1:/);
  assert.match(tenantTwoKey, /^tenant:TENANT_002:bugs:v1:/);
});

for (const resource of ["dashboard", "tasks", "bugs", "triage-board"]) {
  test(`${resource} cache MISS then HIT, including an empty response`, async () => {
    const redis = new FakeRedis();
    const cache = createTenantCacheService(redis);
    const key = createKey(resource, "TENANT_001", { page: 1, limit: 20 });
    const initial = await cache.getCached({ key, resource, tenantId: "TENANT_001" });
    assert.equal(initial.hit, false);

    await cache.setCached({ key, tenantId: "TENANT_001", value: [], ttlSeconds: 30 });
    assert.deepEqual(await cache.getCached({ key, resource, tenantId: "TENANT_001" }), {
      hit: true,
      value: [],
    });
  });
}

test("mutation invalidation removes only selected resources for the affected tenant", async () => {
  const redis = new FakeRedis();
  const cache = createTenantCacheService(redis);
  const tenantOneBug = createKey("bugs", "TENANT_001");
  const tenantOneProject = createKey("projects", "TENANT_001");
  const tenantTwoBug = createKey("bugs", "TENANT_002");

  await cache.setCached({ key: tenantOneBug, tenantId: "TENANT_001", value: [1], ttlSeconds: 20 });
  await cache.setCached({ key: tenantOneProject, tenantId: "TENANT_001", value: [2], ttlSeconds: 20 });
  await cache.setCached({ key: tenantTwoBug, tenantId: "TENANT_002", value: [3], ttlSeconds: 20 });

  assert.equal(await cache.invalidateTenantCache("TENANT_001", ["bugs", "triage-board"]), 1);
  assert.equal((await cache.getCached({ key: tenantOneBug, tenantId: "TENANT_001", resource: "bugs" })).hit, false);
  assert.equal((await cache.getCached({ key: tenantOneProject, tenantId: "TENANT_001", resource: "projects" })).hit, true);
  assert.equal((await cache.getCached({ key: tenantTwoBug, tenantId: "TENANT_002", resource: "bugs" })).hit, true);
});

test("Redis unavailable falls back to a cache MISS without throwing", async () => {
  const redis = new FakeRedis();
  redis.isOpen = false;
  const cache = createTenantCacheService(redis);
  const key = createKey("dashboard");

  assert.deepEqual(await cache.getCached({ key, resource: "dashboard", tenantId: "TENANT_001" }), {
    hit: false,
    value: null,
  });
  assert.equal(await cache.setCached({ key, tenantId: "TENANT_001", value: {}, ttlSeconds: 30 }), false);
  assert.equal(await cache.invalidateTenantCache("TENANT_001", ["dashboard"]), 0);
});

test("Redis read errors fall back to a cache MISS", async () => {
  const redis = new FakeRedis();
  redis.get = async () => {
    throw new Error("connection lost");
  };
  const cache = createTenantCacheService(redis);

  assert.deepEqual(
    await cache.getCached({ key: createKey("tasks"), resource: "tasks", tenantId: "TENANT_001" }),
    { hit: false, value: null }
  );
});

test("a Redis command timeout falls back to a cache MISS", async () => {
  const redis = new FakeRedis();
  redis.get = () => new Promise(() => {});
  const recoveries = [];
  const cache = createTenantCacheService(redis, {
    recover: async (reason) => {
      recoveries.push(reason);
    },
  });
  const startedAt = Date.now();

  assert.deepEqual(
    await cache.getCached({ key: createKey("dashboard"), resource: "dashboard", tenantId: "TENANT_001" }),
    { hit: false, value: null }
  );
  assert.ok(Date.now() - startedAt >= 90);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(recoveries, ["cache command timeout"]);
});

test("a cache MISS does not issue tracked-key cleanup as a second Redis command", async () => {
  const redis = new FakeRedis();
  let trackedKeyRemovals = 0;
  redis.sRem = async () => {
    trackedKeyRemovals += 1;
  };
  const cache = createTenantCacheService(redis);

  await cache.getCached({ key: createKey("tasks"), resource: "tasks", tenantId: "TENANT_001" });
  assert.equal(trackedKeyRemovals, 0);
});
