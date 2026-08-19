const asyncHandler = require("../utils/asyncHandler");
const { getPlanMetadata } = require("../services/planService");
const { getTenantSubscriptionUsage } = require("../services/subscriptionUsageService");
const { getTenantStorageUsage } = require("../services/storageUsageService");
const getCurrentPlan = asyncHandler(async (req, res) => {
  const { plan, usage } = await getTenantSubscriptionUsage(req.user.tenantId);
  const storage = await getTenantStorageUsage(req.user.tenantId);
  const metadata = getPlanMetadata(plan);
  res.status(200).json({
    plan: {
      id: metadata.id,
      name: metadata.name,
      priceMonthly: metadata.priceMonthly,
      priceAnnual: metadata.priceAnnual,
      currency: metadata.currency,
      ...(metadata.mostPopular ? { mostPopular: true } : {}),
    },
    usage,
    storage,
    limits: metadata.limits,
    capabilities: metadata.capabilities,
  });
});
module.exports = { getCurrentPlan };
