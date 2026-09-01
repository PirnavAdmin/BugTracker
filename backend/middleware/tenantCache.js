const { requireTenant } = require("../utils/tenant");
const defaultCacheService = require("../services/tenantCacheService");

const getPositiveInteger = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const CACHE_TTLS = Object.freeze({
  dashboard: getPositiveInteger(process.env.CACHE_TTL_DASHBOARD_SECONDS, 45),
  tasks: getPositiveInteger(process.env.CACHE_TTL_TASKS_SECONDS, 20),
  bugs: getPositiveInteger(process.env.CACHE_TTL_BUGS_SECONDS, 20),
  "triage-board": getPositiveInteger(process.env.CACHE_TTL_TRIAGE_SECONDS, 30),
  projects: getPositiveInteger(process.env.CACHE_TTL_PROJECTS_SECONDS, 300),
  epics: getPositiveInteger(process.env.CACHE_TTL_EPICS_SECONDS, 180),
  sprints: getPositiveInteger(process.env.CACHE_TTL_SPRINTS_SECONDS, 45),
  notifications: getPositiveInteger(process.env.CACHE_TTL_NOTIFICATIONS_SECONDS, 15),
});

const getAccessContext = (req) => ({
  userId: String(req.user?._id || req.user?.id || ""),
  role: String(req.user?.role || ""),
  workspaceId: String(req.user?.workspaceId || req.workspaceId || ""),
});

const getRequestFilters = (req) => ({
  method: req.method,
  path: `${req.baseUrl || ""}${req.path || ""}`,
  params: req.params || {},
  query: req.query || {},
});

const resolveOption = (option, req) =>
  typeof option === "function" ? option(req) : option;

const createTenantCacheMiddleware = (cacheService = defaultCacheService) => {
  const pendingResponses = new Map();

  return ({ resource, ttlSeconds }) => async (req, res, next) => {
    let tenantId;
    let resolvedResource;
    let key;

    try {
      tenantId = requireTenant(req, res);
      resolvedResource = resolveOption(resource, req);
      key = defaultCacheService.getTenantCacheKey({
        tenantId,
        resource: resolvedResource,
        filters: getRequestFilters(req),
        access: getAccessContext(req),
      });
      const cached = await cacheService.getCached({
        key,
        resource: resolvedResource,
        tenantId,
      });

      if (cached.hit) {
        res.setHeader("X-Cache", "HIT");
        return res.status(200).json(cached.value);
      }

      if (pendingResponses.has(key)) {
        try {
          const pendingResponse = await pendingResponses.get(key);
          res.setHeader("X-Cache", "HIT");
          return res.status(pendingResponse.statusCode).json(pendingResponse.body);
        } catch (error) {
          // The leading request failed, so this request should use MongoDB itself.
        }
      }
    } catch (error) {
      if (!tenantId) return next(error);
      console.warn(`[cache] middleware fallback: ${error.message}`);
    }

    if (!key) return next();

    let resolvePending;
    let rejectPending;
    let pendingSettled = false;
    const pending = new Promise((resolve, reject) => {
      resolvePending = resolve;
      rejectPending = reject;
    });
    pending.catch(() => {});
    pendingResponses.set(key, pending);

    const settlePending = (callback, value) => {
      if (pendingSettled) return;
      pendingSettled = true;
      pendingResponses.delete(key);
      callback(value);
    };
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      res.json = originalJson;
      if (res.statusCode < 200 || res.statusCode >= 300 || !key) {
        settlePending(rejectPending, new Error("Response is not cacheable"));
        return originalJson(body);
      }

      const resolvedTtl = getPositiveInteger(
        resolveOption(ttlSeconds, req),
        CACHE_TTLS[resolvedResource] || 30
      );
      res.setHeader("X-Cache", "MISS");
      cacheService
        .setCached({
          key,
          tenantId,
          value: body,
          ttlSeconds: resolvedTtl,
        })
        .finally(() => {
          settlePending(resolvePending, { body, statusCode: res.statusCode });
          originalJson(body);
        });
      return res;
    };

    if (typeof res.once === "function") {
      res.once("close", () => {
        settlePending(rejectPending, new Error("Response closed before cache population"));
      });
    }

    return next();
  };
};

const createTenantInvalidationMiddleware = (cacheService = defaultCacheService) =>
  (resources) => (req, res, next) => {
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      res.json = originalJson;
      if (res.statusCode < 200 || res.statusCode >= 300) {
        return originalJson(body);
      }

      let tenantId;
      try {
        tenantId = requireTenant(req, res);
      } catch (error) {
        return originalJson(body);
      }

      cacheService
        .invalidateTenantCache(tenantId, resolveOption(resources, req))
        .finally(() => originalJson(body));
      return res;
    };
    return next();
  };

module.exports = {
  CACHE_TTLS,
  createTenantCacheMiddleware,
  createTenantInvalidationMiddleware,
  getAccessContext,
  getRequestFilters,
  tenantCache: createTenantCacheMiddleware(),
  tenantCacheInvalidation: createTenantInvalidationMiddleware(),
};
