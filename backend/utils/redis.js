const { createClient } = require("redis");

const client = createClient({
  url: process.env.REDIS_URL || "redis://redis:6379",
  // Do not queue cache commands while Redis is reconnecting. A queued command
  // cannot be cancelled by the cache operation timeout and can otherwise make
  // healthy requests wait behind stale work after a connection interruption.
  disableOfflineQueue: true,
  socket: {
    connectTimeout: 5_000,
    reconnectStrategy: (retries) => Math.min(100 * (retries + 1), 1_000),
  },
});

// Cache commands must not share a connection with presence and rate-limiter
// traffic. A stalled TCP connection leaves node-redis "ready" while command
// promises wait forever; an isolated cache connection can be safely reset.
const cacheClient = client.duplicate();

const logRedisEvent = (name, event, details = "") => {
  console.info(`[redis:${name}] ${event}${details ? ` ${details}` : ""}`);
};

const attachLifecycleLogging = (target, name) => {
  target.on("error", (error) => {
    // Redis errors do not include command values or application credentials.
    console.error(`[redis:${name}] error`, error.message);
  });
  target.on("ready", () => logRedisEvent(name, "ready"));
  target.on("reconnecting", () => logRedisEvent(name, "reconnecting"));
  target.on("end", () => logRedisEvent(name, "end"));
};

attachLifecycleLogging(client, "primary");
attachLifecycleLogging(cacheClient, "cache");

const connectClient = async (target, name) => {
  if (target.isReady || target.isOpen) {
    return target;
  }

  try {
    await target.connect();
    logRedisEvent(name, "connected");
  } catch (err) {
    console.error(`[redis:${name}] connection failed`, err.message);
  }

  return target;
};

let cacheRecovery;

const recoverCacheRedis = async (reason = "cache command timeout") => {
  if (cacheRecovery) return cacheRecovery;

  cacheRecovery = (async () => {
    logRedisEvent("cache", "resetting", `{ reason: "${reason}" }`);
    if (cacheClient.isOpen) {
      try {
        cacheClient.destroy();
      } catch (error) {
        // A concurrent close is already a recovered state.
        console.warn("[redis:cache] reset close failed", error.message);
      }
    }
    await connectClient(cacheClient, "cache");
    return cacheClient;
  })().finally(() => {
    cacheRecovery = null;
  });

  return cacheRecovery;
};

const connectRedis = () => connectClient(client, "primary");
const connectCacheRedis = () => connectClient(cacheClient, "cache");

client.cacheClient = cacheClient;
client.connectRedis = connectRedis;
client.connectCacheRedis = connectCacheRedis;
client.recoverCacheRedis = recoverCacheRedis;
module.exports = client;
