const TENANT_ID_PREFIX = "TENANT";
const TENANT_ID_PATTERN = /^TENANT_\d{3,}$/;

const normalizeTenantId = (value = "") => String(value || "").trim().toUpperCase();

const createTenantIdFromNumber = (value) =>
  `${TENANT_ID_PREFIX}_${String(Math.max(Number(value) || 1, 1)).padStart(3, "0")}`;

const parseTenantSequence = (tenantId = "") => {
  const normalizedTenantId = normalizeTenantId(tenantId);

  if (!TENANT_ID_PATTERN.test(normalizedTenantId)) {
    return 0;
  }

  return Number(normalizedTenantId.replace(`${TENANT_ID_PREFIX}_`, "")) || 0;
};

const getTenantId = (reqOrUser = {}) =>
  normalizeTenantId(reqOrUser.tenantId || reqOrUser.user?.tenantId || "");

const requireTenant = (reqOrUser = {}, res) => {
  const tenantId = getTenantId(reqOrUser);

  if (!tenantId) {
    if (res) {
      res.status(403);
    }
    throw new Error("Tenant context is required");
  }

  return tenantId;
};

const assertTenantAccess = (reqOrUser = {}, tenantId, res) => {
  const authenticatedTenantId = requireTenant(reqOrUser, res);
  const requestedTenantId = normalizeTenantId(tenantId);

  if (!requestedTenantId || authenticatedTenantId !== requestedTenantId) {
    if (res) {
      res.status(403);
    }
    throw new Error("Tenant access denied");
  }

  return authenticatedTenantId;
};

const buildTenantFilter = (reqOrUser = {}) => {
  const tenantId = getTenantId(reqOrUser);

  return tenantId ? { tenantId } : {};
};

const withTenantFilter = (filter = {}, reqOrUser = {}) => ({
  ...filter,
  ...buildTenantFilter(reqOrUser),
});

module.exports = {
  TENANT_ID_PATTERN,
  assertTenantAccess,
  buildTenantFilter,
  createTenantIdFromNumber,
  getTenantId,
  normalizeTenantId,
  parseTenantSequence,
  requireTenant,
  withTenantFilter,
};
