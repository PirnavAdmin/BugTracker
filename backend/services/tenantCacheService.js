const crypto = require("crypto");
const redisClient = require("../utils/redis");
const { normalizeTenantId } = require("../utils/tenant");

const CACHE_VERSION = "v1";
const TRACKED_KEYS_SUFFIX = "cache-keys:v1";
const REDIS_OPERATION_TIMEOUT_MS = Math.max(
  Number.parseInt(process.env.CACHE_REDIS_TIMEOUT_MS, 10) || 250,
  25
);

const normalizeValue = (value) => {
  if (Array.isArray(value)) {
    return value.map(normalizeValue);
  }

  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((normalized, key) => {
        if (typeof value[key] !== "undefined") {
          normalized[key] = normalizeValue(value[key]);
        }
        return normalized;
      }, {});
  }

  return typeof value === "string" ? value.trim() : value;
};

const stableSerialize = (value) => JSON.stringify(normalizeValue(value));
const hashCacheInput = (value) =>
  crypto.createHash("sha256").update(stableSerialize(value)).digest("hex").slice(0, 24);

const getTenantPrefix = (tenantId) => {
  const normalizedTenantId = normalizeTenantId(tenantId);
  if (!normalizedTenantId) {
    throw new Error("Tenant context is required for cache access");
  }
  return `tenant:${normalizedTenantId}`;
};

const getTenantCacheKey = ({ tenantId, resource, filters = {}, access = {} }) => {
  const safeResource = String(resource || "").trim().toLowerCase();
  if (!/^[a-z0-9-]+$/.test(safeResource)) {
    throw new Error("A valid cache resource is required");
  }

  return `${getTenantPrefix(tenantId)}:${safeResource}:${CACHE_VERSION}:${hashCacheInput({
    access,
    filters,
  })}`;
};

const getTrackedKeysKey = (tenantId) => `${getTenantPrefix(tenantId)}:${TRACKED_KEYS_SUFFIX}`;
const isRedisReady = (client) => Boolean(client?.isOpen && client?.isReady !== false);
const cacheLoggingEnabled = () =>
  String(process.env.CACHE_LOGGING_ENABLED || "").trim().toLowerCase() === "true";

const logCache = (message) => {
  if (cacheLoggingEnabled()) {
    console.info(message);
  }
};

const withRedisTimeout = (operation) =>
  new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`Redis operation timed out after ${REDIS_OPERATION_TIMEOUT_MS}ms`)),
      REDIS_OPERATION_TIMEOUT_MS
    );
    timeout.unref?.();

    Promise.resolve(operation).then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      }
    );
  });

const createTenantCacheService = (client = redisClient) => {
  const getCached = async ({ key, resource, tenantId }) => {
    if (!isRedisReady(client)) {
      return { hit: false, value: null };
    }

    try {
      const rawValue = await withRedisTimeout(client.get(key));
      if (rawValue === null) {
        await withRedisTimeout(client.sRem(getTrackedKeysKey(tenantId), key)).catch(() => {});
        logCache(`[cache] ${resource} MISS tenant=${normalizeTenantId(tenantId)}`);
        return { hit: false, value: null };
      }

      logCache(`[cache] ${resource} HIT tenant=${normalizeTenantId(tenantId)}`);
      return { hit: true, value: JSON.parse(rawValue) };
    } catch (error) {
      console.warn(`[cache] ${resource} read failed; using MongoDB: ${error.message}`);
      return { hit: false, value: null };
    }
  };

  const setCached = async ({ key, tenantId, value, ttlSeconds }) => {
    if (!isRedisReady(client)) return false;

    try {
      const trackedKeysKey = getTrackedKeysKey(tenantId);
      await withRedisTimeout(client.set(key, JSON.stringify(value), { EX: ttlSeconds }));
      await withRedisTimeout(client.sAdd(trackedKeysKey, key));
      await withRedisTimeout(client.expire(trackedKeysKey, Math.max(ttlSeconds * 2, 3600)));
      return true;
    } catch (error) {
      console.warn(`[cache] write failed; response remains available: ${error.message}`);
      return false;
    }
  };

  const invalidateTenantCache = async (tenantId, resources = []) => {
    if (!isRedisReady(client)) return 0;

    const normalizedResources = [...new Set(resources.map((value) => String(value).trim().toLowerCase()))]
      .filter(Boolean);
    if (!normalizedResources.length) return 0;

    try {
      const trackedKeysKey = getTrackedKeysKey(tenantId);
      const trackedKeys = await withRedisTimeout(client.sMembers(trackedKeysKey));
      const prefixes = normalizedResources.map(
        (resource) => `${getTenantPrefix(tenantId)}:${resource}:${CACHE_VERSION}:`
      );
      const keysToDelete = trackedKeys.filter((key) =>
        prefixes.some((prefix) => key.startsWith(prefix))
      );

      if (keysToDelete.length) {
        await withRedisTimeout(client.del(keysToDelete));
        await withRedisTimeout(client.sRem(trackedKeysKey, keysToDelete));
      }

      logCache(
        `[cache] invalidated tenant=${normalizeTenantId(tenantId)} resources=${normalizedResources.join(",")} keys=${keysToDelete.length}`
      );
      return keysToDelete.length;
    } catch (error) {
      console.warn(`[cache] invalidation failed; TTL fallback remains active: ${error.message}`);
      return 0;
    }
  };

  return {
    getCached,
    invalidateTenantCache,
    setCached,
  };
};

const tenantCacheService = createTenantCacheService();

module.exports = {
  ...tenantCacheService,
  createTenantCacheService,
  getTenantCacheKey,
  getTrackedKeysKey,
  hashCacheInput,
  normalizeValue,
  stableSerialize,
};
