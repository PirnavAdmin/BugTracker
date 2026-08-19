const PlatformCompany = require("../models/PlatformCompany");
const { PLANS } = require("../config/plans");
const normalizePlanId = (planId) => String(planId || "").trim().toLowerCase();
const configurationError = (message) => Object.assign(new Error(message), { code: "PLAN_CONFIGURATION_ERROR" });
const getPlan = (planId) => PLANS[normalizePlanId(planId)] || null;
const getSafePlan = (planId) => {
  const plan = getPlan(planId);
  if (plan) return plan;
  const message = `Invalid or missing CureCode plan configuration: ${String(planId || "(missing)")}`;
  if (process.env.NODE_ENV !== "production") throw configurationError(message);
  console.error(`[plan-service] ${message}; using Free plan as the safe fallback.`);
  return PLANS.free;
};
const getCompanyPlan = (company) => getSafePlan(company?.planId);
const getPlanLimits = (planId) => getSafePlan(planId).limits;
const getCompanyPlanLimits = (company) => getCompanyPlan(company).limits;
const hasFeature = (planId, feature) => Boolean(getSafePlan(planId).capabilities[feature]);
const getLimit = (planId, limitName) => getPlanLimits(planId)[limitName];
const getCompanyPlanByTenantId = async (tenantId) => {
  const normalizedTenantId = String(tenantId || "").trim().toUpperCase();
  if (!normalizedTenantId) throw configurationError("Authenticated user has no tenant id.");
  const company = await PlatformCompany.findOne({ tenantId: normalizedTenantId }).lean();
  if (!company) throw configurationError(`No PlatformCompany exists for tenant ${normalizedTenantId}.`);
  return { company, plan: getCompanyPlan(company) };
};
const getPlanMetadata = (plan) => ({ id: plan.id, name: plan.name, priceMonthly: plan.priceMonthly, priceAnnual: plan.priceAnnual, currency: plan.currency, ...(plan.mostPopular ? { mostPopular: true } : {}), limits: plan.limits, capabilities: plan.capabilities });
module.exports = { getPlan, getCompanyPlan, getPlanLimits, getCompanyPlanLimits, hasFeature, getLimit, getCompanyPlanByTenantId, getPlanMetadata };
