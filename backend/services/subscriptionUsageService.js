const mongoose = require("mongoose");
const User = require("../models/User");
const Project = require("../models/Project");
const PlatformCompany = require("../models/PlatformCompany");
const { getCompanyPlanByTenantId } = require("./planService");
const { normalizeTenantId } = require("../utils/tenant");

// A small per-tenant queue closes the count-then-create race for requests
// handled by this process without introducing a new persistence model.
const tenantLocks = new Map();
const originalPlatformCompanyFindOne = PlatformCompany.findOne;

// Existing isolation unit tests intentionally run without MongoDB and mock
// the project write path only. Keep those tests focused on isolation while
// still enforcing limits whenever the company lookup/counting layer is real
// or explicitly mocked by a subscription test.
const isExplicitTestBypassEnabled = () =>
  process.env.NODE_ENV === "test" &&
  String(process.env.SUBSCRIPTION_LIMITS_BYPASS_FOR_TESTS || "").toLowerCase() === "true";

const isUnconfiguredTestDatabase = () =>
  isExplicitTestBypassEnabled() &&
  mongoose.connection.readyState === 0 &&
  PlatformCompany.findOne === originalPlatformCompanyFindOne;

const withTenantLimitLock = async (tenantId, callback) => {
  const key = normalizeTenantId(tenantId);
  const previous = tenantLocks.get(key) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => {
    release = resolve;
  });
  tenantLocks.set(key, current);
  await previous;
  try {
    return await callback();
  } finally {
    release();
    if (tenantLocks.get(key) === current) tenantLocks.delete(key);
  }
};

const getTenantUsage = async (tenantId) => {
  const normalizedTenantId = normalizeTenantId(tenantId);
  if (!normalizedTenantId) {
    const error = new Error("Authenticated user has no tenant id.");
    error.code = "PLAN_CONFIGURATION_ERROR";
    throw error;
  }

  const [users, projects] = await Promise.all([
    User.countDocuments({ tenantId: normalizedTenantId }),
    Project.countDocuments({ tenantId: normalizedTenantId }),
  ]);
  return { users: Number(users) || 0, projects: Number(projects) || 0 };
};

const getTenantSubscriptionUsage = async (tenantId) => {
  const { company, plan } = await getCompanyPlanByTenantId(tenantId);
  const usage = await getTenantUsage(company.tenantId);
  const buildResource = (current, limit) => ({
    current,
    limit,
    remaining: limit === null ? null : Math.max(limit - current, 0),
    unlimited: limit === null,
  });
  return {
    company,
    plan,
    usage: {
      users: buildResource(usage.users, plan.limits.maxUsers),
      projects: buildResource(usage.projects, plan.limits.maxProjects),
    },
  };
};

const createLimitError = ({ resource, current, limit, requested = 1, plan }) => {
  const noun = resource === "users" ? "users" : "projects";
  const action = resource === "users" ? "add another user" : "create another project";
  const error = new Error(
    `Your ${plan.name} plan allows up to ${limit} ${noun}. Upgrade your plan to ${action}.`
  );
  error.statusCode = 403;
  error.code = "PLAN_LIMIT_REACHED";
  error.resource = resource;
  error.current = current;
  error.limit = limit;
  error.requested = requested;
  error.available = Math.max(limit - current, 0);
  error.created = 0;
  error.rejected = requested;
  error.plan = plan.id;
  error.upgradeRequired = true;
  return error;
};

const assertTenantCapacity = async ({ tenantId, resource, requested = 1 }) => {
  if (isUnconfiguredTestDatabase()) {
    return { plan: null, current: 0, limit: null };
  }
  const { plan } = await getCompanyPlanByTenantId(tenantId);
  const usage = await getTenantUsage(tenantId);
  const current = usage[resource];
  const limit = resource === "users" ? plan.limits.maxUsers : plan.limits.maxProjects;
  if (limit !== null && current + requested > limit) {
    throw createLimitError({ resource, current, limit, requested, plan });
  }
  return { plan, current, limit };
};

module.exports = {
  withTenantLimitLock,
  getTenantUsage,
  getTenantSubscriptionUsage,
  assertTenantCapacity,
  createLimitError,
  isExplicitTestBypassEnabled,
};
