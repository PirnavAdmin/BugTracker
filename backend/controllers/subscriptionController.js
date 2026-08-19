const asyncHandler = require("../utils/asyncHandler");
const { getCompanyPlanByTenantId, getPlanMetadata } = require("../services/planService");
const getCurrentPlan = asyncHandler(async (req, res) => {
  const { plan } = await getCompanyPlanByTenantId(req.user.tenantId);
  const metadata = getPlanMetadata(plan);
  res.status(200).json({ plan: { id: metadata.id, name: metadata.name, priceMonthly: metadata.priceMonthly, priceAnnual: metadata.priceAnnual, currency: metadata.currency, ...(metadata.mostPopular ? { mostPopular: true } : {}) }, limits: metadata.limits, capabilities: metadata.capabilities });
});
module.exports = { getCurrentPlan };
