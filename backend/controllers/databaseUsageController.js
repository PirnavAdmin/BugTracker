const asyncHandler = require("../utils/asyncHandler");
const { getTenantDatabaseUsage } = require("../services/databaseUsageService");
const { ROLE_ADMIN, ROLE_MANAGER } = require("../utils/roles");

const getDatabaseUsage = asyncHandler(async (req, res) => {
  if (![ROLE_ADMIN, ROLE_MANAGER].includes(req.user?.role)) {
    res.status(403);
    throw new Error("Only admins and managers can view database utilization");
  }
  res.status(200).json(await getTenantDatabaseUsage(req.user.tenantId));
});

module.exports = { getDatabaseUsage };
