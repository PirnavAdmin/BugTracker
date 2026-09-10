const PlatformPricing = require("../models/PlatformPricing");
const DEFAULTS = Object.freeze([{ planId: "free", monthly: 0, annual: 0 }, { planId: "starter", monthly: 799, annual: 7990 }, { planId: "professional", monthly: 1999, annual: 19990 }, { planId: "business", monthly: 3999, annual: 39990 }, { planId: "enterprise", monthly: null, annual: null }]);
const configurationError = (message) => Object.assign(new Error(message), { code: "PLATFORM_PRICING_CONFIGURATION_ERROR", status: 503 });
const initializePlatformPricing = async (repository = PlatformPricing) => Promise.all(DEFAULTS.map((price) => repository.updateOne({ planId: price.planId }, { $setOnInsert: { ...price, currency: "INR" } }, { upsert: true })));
const resolveEffectivePrice = async (planId, billingCycle, repository = PlatformPricing) => {
  const id = String(planId || "").trim().toLowerCase(); const cycle = String(billingCycle || "").trim().toLowerCase();
  if (!DEFAULTS.some((price) => price.planId === id)) throw configurationError("Invalid CureCode plan");
  if (!["monthly", "annual"].includes(cycle)) throw configurationError("Invalid billing cycle");
  if (id === "enterprise") throw configurationError("Enterprise is not available for self-service billing");
  const price = await repository.findOne({ planId: id }).lean();
  const amount = price?.[cycle === "monthly" ? "monthly" : "annual"];
  if (!price || price.currency !== "INR" || !Number.isFinite(amount) || amount < 0 || (id !== "free" && amount <= 0) || (id === "free" && amount !== 0)) throw configurationError("Persisted INR pricing is missing or invalid");
  return { planId: id, billingCycle: cycle, amount, currency: "INR" };
};
module.exports = { DEFAULTS, initializePlatformPricing, resolveEffectivePrice };
