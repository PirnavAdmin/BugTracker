const PLATFORM_PLAN_IDS = Object.freeze({
  STARTER: "starter",
  PROFESSIONAL: "professional",
  BUSINESS: "business",
  ENTERPRISE: "enterprise",
});

const PLATFORM_PLANS = Object.freeze([
  {
    id: PLATFORM_PLAN_IDS.STARTER,
    name: "Starter",
    limits: {
      users: 10,
      projects: 5,
      storageGb: 5,
      aiRequestsPerMonth: 250,
    },
  },
  {
    id: PLATFORM_PLAN_IDS.PROFESSIONAL,
    name: "Professional",
    limits: {
      users: 50,
      projects: 20,
      storageGb: 25,
      aiRequestsPerMonth: 1000,
    },
  },
  {
    id: PLATFORM_PLAN_IDS.BUSINESS,
    name: "Business",
    limits: {
      users: 150,
      projects: 75,
      storageGb: 100,
      aiRequestsPerMonth: 5000,
    },
  },
  {
    id: PLATFORM_PLAN_IDS.ENTERPRISE,
    name: "Enterprise",
    limits: {
      users: 500,
      projects: 250,
      storageGb: 500,
      aiRequestsPerMonth: 25000,
    },
  },
]);

const getPlatformPlan = (planId = "") =>
  PLATFORM_PLANS.find((plan) => plan.id === String(planId || "").trim().toLowerCase()) || null;

module.exports = {
  PLATFORM_PLAN_IDS,
  PLATFORM_PLANS,
  getPlatformPlan,
};
