const StorageUsage = require("../models/StorageUsage");
const { getCompanyPlanByTenantId } = require("./planService");
const { normalizeTenantId } = require("../utils/tenant");

const BYTES_PER_GB = 1024 ** 3;
const BYTES_PER_MB = 1024 ** 2;
const CATEGORIES = new Set(["issueAttachmentBytes", "chatAttachmentBytes", "avatarBytes"]);

const normalizeCategory = (category) => {
  if (!CATEGORIES.has(category)) throw new Error("Invalid storage category");
  return category;
};

const normalizeTenant = (tenantId) => {
  const normalized = normalizeTenantId(tenantId);
  if (!normalized) throw new Error("Tenant context is required for storage usage");
  return normalized;
};

const getTenantStorageLimit = async (tenantId) => {
  const { plan } = await getCompanyPlanByTenantId(normalizeTenant(tenantId));
  const limitGB = plan.limits.storageGB;
  return { limitGB, limitBytes: limitGB === null ? null : limitGB * BYTES_PER_GB, plan };
};

const shapeUsage = ({ usedBytes = 0, limitBytes, limitGB }) => {
  const remainingBytes = limitBytes === null ? null : Math.max(limitBytes - usedBytes, 0);
  return {
    usedBytes,
    usedMB: usedBytes / BYTES_PER_MB,
    usedGB: usedBytes / BYTES_PER_GB,
    limitBytes,
    limitGB,
    remainingBytes,
    usagePercent: limitBytes === null || limitBytes === 0 ? null : Math.min((usedBytes / limitBytes) * 100, 100),
    unlimited: limitBytes === null,
  };
};

const getTenantStorageUsage = async (tenantId) => {
  const normalized = normalizeTenant(tenantId);
  const [{ limitBytes, limitGB }, usage] = await Promise.all([
    getTenantStorageLimit(normalized),
    StorageUsage.findOne({ tenantId: normalized }).lean(),
  ]);
  return shapeUsage({ usedBytes: Number(usage?.totalBytes) || 0, limitBytes, limitGB });
};

const storageLimitError = ({ current, requested, available, plan }) => {
  const error = new Error(`Your ${plan.name} plan storage limit would be exceeded by this upload.`);
  error.statusCode = 403;
  error.code = "PLAN_LIMIT_REACHED";
  error.resource = "storage";
  error.current = current;
  error.limit = plan.limits.storageGB === null ? null : plan.limits.storageGB * BYTES_PER_GB;
  error.requested = requested;
  error.available = available;
  error.plan = plan.id;
  error.upgradeRequired = true;
  return error;
};

const reserveStorage = async (tenantId, requestedBytes, category) => {
  const normalized = normalizeTenant(tenantId);
  const bytes = Math.max(0, Number(requestedBytes) || 0);
  const field = normalizeCategory(category);
  const { limitBytes, plan } = await getTenantStorageLimit(normalized);
  await StorageUsage.findOneAndUpdate(
    { tenantId: normalized },
    { $setOnInsert: { tenantId: normalized } },
    { upsert: true, setDefaultsOnInsert: true }
  );
  const filter = limitBytes === null
    ? { tenantId: normalized }
    : { tenantId: normalized, $expr: { $lte: [{ $add: ["$totalBytes", "$reservedBytes"] }, limitBytes - bytes] } };
  const reserved = await StorageUsage.findOneAndUpdate(
    filter,
    { $inc: { reservedBytes: bytes } },
    { new: true }
  ).lean();
  if (!reserved) {
    const current = await StorageUsage.findOne({ tenantId: normalized }).lean();
    const used = Number(current?.totalBytes) || 0;
    const held = Number(current?.reservedBytes) || 0;
    throw storageLimitError({ current: used + held, requested: bytes, available: Math.max((limitBytes || 0) - used - held, 0), plan });
  }
  return { tenantId: normalized, bytes, category: field };
};

const assertStorageCapacity = async (tenantId, requestedBytes) => {
  const normalized = normalizeTenant(tenantId);
  const bytes = Math.max(0, Number(requestedBytes) || 0);
  const usage = await getTenantStorageUsage(normalized);
  if (!usage.unlimited && bytes > usage.remainingBytes) {
    const { plan } = await getTenantStorageLimit(normalized);
    throw storageLimitError({
      current: usage.usedBytes,
      requested: bytes,
      available: usage.remainingBytes,
      plan,
    });
  }
  return usage;
};

const confirmStorage = async ({ tenantId, bytes, category }) => {
  const field = normalizeCategory(category);
  await StorageUsage.updateOne(
    { tenantId: normalizeTenant(tenantId), reservedBytes: { $gte: bytes } },
    { $inc: { reservedBytes: -bytes, [field]: bytes, totalBytes: bytes } }
  );
};

const releaseStorage = async ({ tenantId, bytes, category, reservation = false }) => {
  const field = normalizeCategory(category);
  const normalized = normalizeTenant(tenantId);
  const amount = Math.max(0, Number(bytes) || 0);
  const fields = reservation ? ["reservedBytes"] : [field, "totalBytes"];
  await StorageUsage.updateOne(
    { tenantId: normalized },
    [{
      $set: Object.fromEntries(
        fields.map((name) => [name, { $max: [{ $subtract: [{ $ifNull: [`$${name}`, 0] }, amount] }, 0] }])
      ),
    }]
  );
};

const reconcileTenantStorage = async (tenantId, { issueBytes = 0, chatBytes = 0, avatarBytes = 0 } = {}) => {
  const normalized = normalizeTenant(tenantId);
  const totalBytes = Math.max(0, issueBytes) + Math.max(0, chatBytes) + Math.max(0, avatarBytes);
  return StorageUsage.findOneAndUpdate(
    { tenantId: normalized },
    { $set: { tenantId: normalized, issueAttachmentBytes: issueBytes, chatAttachmentBytes: chatBytes, avatarBytes, totalBytes, reservedBytes: 0 } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();
};

const reconcileAllTenantStorage = async (rows = []) => Promise.all(rows.map((row) => reconcileTenantStorage(row.tenantId, row)));
const getTenantStorageRemaining = async (tenantId) => (await getTenantStorageUsage(tenantId)).remainingBytes;

module.exports = { getTenantStorageUsage, getTenantStorageLimit, getTenantStorageRemaining, assertStorageCapacity, reserveStorage, confirmStorage, releaseStorage, reconcileTenantStorage, reconcileAllTenantStorage, shapeUsage, BYTES_PER_GB };
