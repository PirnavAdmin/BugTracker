const { PLAN_IDS: PLATFORM_PLAN_IDS, PLANS, PLAN_LIST: PLATFORM_PLANS } = require("../config/plans");

const getPlatformPlan = (planId = "") =>
  PLANS[String(planId || "").trim().toLowerCase()] || null;

module.exports = {
  PLATFORM_PLAN_IDS,
  PLATFORM_PLANS,
  getPlatformPlan,
};
