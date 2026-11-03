const crypto = require("crypto");
const redisClient = require("../utils/redis");
const { normalizeTenantId } = require("../utils/tenant");

const CACHE_VERSION = "v1";
const TRACKED_KEYS_SUFFIX = "cache-keys:v1";
// Redis is ~3ms from the production container. 100ms leaves room for normal
// Node.js scheduling under load while keeping a failed cache from delaying a
// MongoDB fallback for a noticeable part of the request.
const REDIS_OPERATION_TIMEOUT_MS = Math.max(
  Number.parseInt(process.env.CACHE_REDIS_TIMEOUT_MS, 10) || 100,
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

const getTenantCacheKey = ({ tenantId, resource, filters = {}, access = {}, generation = 0 }) => {
  const safeResource = String(resource || "").trim().toLowerCase();
  if (!/^[a-z0-9-]+$/.test(safeResource)) {
    throw new Error("A valid cache resource is required");
  }

  return `${getTenantPrefix(tenantId)}:${safeResource}:${CACHE_VERSION}:${generation}:${hashCacheInput({
    access,
    filters,
  })}`;
};

const getTrackedKeysKey = (tenantId) => `${getTenantPrefix(tenantId)}:${TRACKED_KEYS_SUFFIX}`;
const getGenerationKey = (tenantId, resource) =>
  `${getTenantPrefix(tenantId)}:cache-generation:v1:${String(resource).trim().toLowerCase()}`;
const isRedisReady = (client) => Boolean(client?.isOpen && client?.isReady !== false);
const cacheLoggingEnabled = () =>
  String(process.env.CACHE_LOGGING_ENABLED || "").trim().toLowerCase() === "true";

const logCache = (message) => {
  if (cacheLoggingEnabled()) {
    console.info(message);
  }
};

const durationMs = (startedAt) => Number((performance.now() - startedAt).toFixed(1));

// This bounds the request's wait only. Redis commands are not cancellable, so
// redis.js is configured not to queue commands while disconnected.
const withRedisTimeout = (operation) =>
  new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`Redis operation timed out after ${REDIS_OPERATION_TIMEOUT_MS}ms`)),
      REDIS_OPERATION_TIMEOUT_MS
    );
    timeout.unref?.();

    Promise.resolve()
      .then(operation)
      .then(
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

const defaultCacheClient = redisClient.cacheClient || redisClient;

const createTenantCacheService = (client = defaultCacheClient, { recover } = {}) => {
  const recoverCache = recover || (client === defaultCacheClient ? redisClient.recoverCacheRedis : null);
  const recoverAfterTimeout = (error) => {
    if (!/Redis operation timed out/.test(String(error?.message || "")) || typeof recoverCache !== "function") {
      return;
    }

    // The timed-out node-redis command cannot be cancelled. Resetting only the
    // isolated cache client flushes that stale command and restores cache reads
    // for subsequent requests without affecting presence or rate limiting.
    Promise.resolve(recoverCache("cache command timeout")).catch((recoveryError) => {
      console.warn(`[cache] recovery ERROR { reason: "${recoveryError.message}" }`);
    });
  };

  const getCached = async ({ key, resource, tenantId }) => {
    if (!isRedisReady(client)) {
      if (typeof recoverCache === "function") {
        Promise.resolve(recoverCache("cache client not ready")).catch(() => {});
      }
      return { hit: false, value: null };
    }

    try {
      const startedAt = performance.now();
      const rawValue = await withRedisTimeout(() => client.get(key));
      if (rawValue === null) {
        // Let the tracked-key set expire naturally. Removing a missing key here
        // added a second, serial Redis command to every cache miss and could
        // turn a successful GET into a misleading "read failed" cache fallback.
        logCache(`[cache] ${resource} MISS { operation: "GET", durationMs: ${durationMs(startedAt)} }`);
        return { hit: false, value: null };
      }

      logCache(`[cache] ${resource} HIT { operation: "GET", durationMs: ${durationMs(startedAt)} }`);
      return { hit: true, value: JSON.parse(rawValue) };
    } catch (error) {
      recoverAfterTimeout(error);
      console.warn(`[cache] ${resource} ERROR { operation: "GET", reason: "${error.message}" }; using MongoDB`);
      return { hit: false, value: null };
    }
  };

  const getTenantCacheGeneration = async (tenantId, resource) => {
    if (!isRedisReady(client)) return 0;
    const value = await withRedisTimeout(() => client.get(getGenerationKey(tenantId, resource)));
    const generation = Number.parseInt(value || "0", 10);
    return Number.isFinite(generation) && generation >= 0 ? generation : 0;
  };

  const setCached = async ({ key, tenantId, value, ttlSeconds }) => {
    if (!isRedisReady(client)) return false;

    try {
      const startedAt = performance.now();
      const trackedKeysKey = getTrackedKeysKey(tenantId);
      // Issue independent commands in the same tick so redis.js can pipeline
      // them, instead of incurring three serial round trips.
      await withRedisTimeout(() =>
        Promise.all([
          client.set(key, JSON.stringify(value), { EX: ttlSeconds }),
          client.sAdd(trackedKeysKey, key),
          client.expire(trackedKeysKey, Math.max(ttlSeconds * 2, 3600)),
        ])
      );
      logCache(`[cache] ${key.split(":")[2]} WRITE { durationMs: ${durationMs(startedAt)} }`);
      return true;
    } catch (error) {
      recoverAfterTimeout(error);
      console.warn(`[cache] write ERROR { reason: "${error.message}" }; response remains available`);
      return false;
    }
  };

  const invalidateTenantCache = async (tenantId, resources = []) => {
    if (!isRedisReady(client)) return 0;

    const normalizedResources = [...new Set(resources.map((value) => String(value).trim().toLowerCase()))]
      .filter(Boolean);
    if (!normalizedResources.length) return 0;

    try {
      const startedAt = performance.now();
      const trackedKeysKey = getTrackedKeysKey(tenantId);
      // Move future reads to a new key namespace before clearing current keys.
      // An older in-flight miss may finish later, but its stale write is no
      // longer addressable by requests started after this mutation.
      await withRedisTimeout(() => Promise.all(normalizedResources.map(async (resource) => {
        const generationKey = getGenerationKey(tenantId, resource);
        if (typeof client.incr === "function") {
          await client.incr(generationKey);
          return;
        }
        const current = Number.parseInt((await client.get(generationKey)) || "0", 10) || 0;
        await client.set(generationKey, String(current + 1));
      })));
      const trackedKeys = await withRedisTimeout(() => client.sMembers(trackedKeysKey));
      const prefixes = normalizedResources.map(
        (resource) => `${getTenantPrefix(tenantId)}:${resource}:${CACHE_VERSION}:`
      );
      const keysToDelete = trackedKeys.filter((key) =>
        prefixes.some((prefix) => key.startsWith(prefix))
      );

      if (keysToDelete.length) {
        await withRedisTimeout(() =>
          Promise.all([client.del(keysToDelete), client.sRem(trackedKeysKey, keysToDelete)])
        );
      }

      logCache(
        `[cache] invalidated { resources: "${normalizedResources.join(",")}", keys: ${keysToDelete.length}, durationMs: ${durationMs(startedAt)} }`
      );
      return keysToDelete.length;
    } catch (error) {
      recoverAfterTimeout(error);
      console.warn(`[cache] invalidation ERROR { reason: "${error.message}" }; TTL fallback remains active`);
      return 0;
    }
  };

  return {
    getCached,
    getTenantCacheGeneration,
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
