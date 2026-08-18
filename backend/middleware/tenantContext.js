const asyncHandler = require("../utils/asyncHandler");
const { getTenantId, requireTenant } = require("../utils/tenant");

const attachTenantContext = asyncHandler(async (req, res, next) => {
  req.tenantId = getTenantId(req);
  next();
});

const requireTenantContext = asyncHandler(async (req, res, next) => {
  req.tenantId = requireTenant(req, res);
  next();
});

module.exports = {
  attachTenantContext,
  requireTenantContext,
};
