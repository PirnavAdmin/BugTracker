const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const PlatformCompany = require("../models/PlatformCompany");
const StorageUsage = require("../models/StorageUsage");
const { BYTES_PER_GB, getTenantStorageUsage, reserveStorage, shapeUsage } = require("../services/storageUsageService");

const originalFindOneCompany = PlatformCompany.findOne;
const originalFindOneUsage = StorageUsage.findOne;
const originalFindOneAndUpdate = StorageUsage.findOneAndUpdate;

afterEach(() => {
  PlatformCompany.findOne = originalFindOneCompany;
  StorageUsage.findOne = originalFindOneUsage;
  StorageUsage.findOneAndUpdate = originalFindOneAndUpdate;
});

test("storage usage normalizes bounded and unlimited plans", () => {
  const bounded = shapeUsage({ usedBytes: BYTES_PER_GB / 2, limitBytes: BYTES_PER_GB, limitGB: 1 });
  assert.equal(bounded.remainingBytes, BYTES_PER_GB / 2);
  assert.equal(bounded.unlimited, false);
  const unlimited = shapeUsage({ usedBytes: BYTES_PER_GB * 4, limitBytes: null, limitGB: null });
  assert.equal(unlimited.remainingBytes, null);
  assert.equal(unlimited.unlimited, true);
});

test("tenant storage usage resolves from the tenant company plan", async () => {
  PlatformCompany.findOne = () => ({ lean: async () => ({ tenantId: "TENANT_002", planId: "starter" }) });
  StorageUsage.findOne = () => ({ lean: async () => ({ totalBytes: 1024 }) });
  const usage = await getTenantStorageUsage("tenant_002");
  assert.equal(usage.limitGB, 5);
  assert.equal(usage.usedBytes, 1024);
  assert.equal(usage.unlimited, false);
});

test("storage reservation uses an atomic quota predicate", async () => {
  PlatformCompany.findOne = () => ({ lean: async () => ({ tenantId: "TENANT_002", planId: "starter" }) });
  const filters = [];
  StorageUsage.findOneAndUpdate = (filter, _update, options = {}) => {
    filters.push({ filter, options });
    return { lean: async () => ({ tenantId: "TENANT_002", totalBytes: 0, reservedBytes: 1024 }) };
  };
  await reserveStorage("TENANT_002", 1024, "chatAttachmentBytes");
  assert.ok(filters.some(({ filter }) => filter.$expr));
});
