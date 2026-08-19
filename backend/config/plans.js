const PLAN_IDS = Object.freeze({
  FREE: "free", STARTER: "starter", PROFESSIONAL: "professional", BUSINESS: "business", ENTERPRISE: "enterprise",
});
const createPlan = ({ id, name, priceMonthly, priceAnnual, mostPopular = false, ...details }) => Object.freeze({ id, name, priceMonthly, priceAnnual, currency: "INR", ...(mostPopular ? { mostPopular: true } : {}), limits: Object.freeze(details.limits), capabilities: Object.freeze(details.capabilities) });
const common = (overrides) => ({ basicReports: true, advancedReports: true, qaWorkflow: "advanced", gitIntegration: true, teamChat: true, projectChat: true, directMessages: true, quickChat: true, fileSharing: "full", voiceVideoCalls: true, meetings: true, advancedAI: true, auditLogs: true, prioritySupport: true, sso: false, onPremise: false, customIntegrations: false, ...overrides });
const PLANS = Object.freeze({
  free: createPlan({ id: "free", name: "Free", priceMonthly: 0, priceAnnual: 0, limits: { maxUsers: 5, maxProjects: 2, maxIssues: 200, storageGB: 1, maxAIRequestsPerMonth: 25 }, capabilities: common({ advancedReports: false, qaWorkflow: "basic", gitIntegration: false, projectChat: false, quickChat: false, fileSharing: "limited", voiceVideoCalls: false, meetings: false, advancedAI: false, auditLogs: false, prioritySupport: false }) }),
  starter: createPlan({ id: "starter", name: "Starter", priceMonthly: 799, priceAnnual: 7990, limits: { maxUsers: 10, maxProjects: 5, maxIssues: 10000, storageGB: 5, maxAIRequestsPerMonth: 100 }, capabilities: common({ advancedReports: false, qaWorkflow: "standard", fileSharing: "standard", voiceVideoCalls: false, meetings: false, advancedAI: false, auditLogs: false, prioritySupport: false }) }),
  professional: createPlan({ id: "professional", name: "Professional", priceMonthly: 1999, priceAnnual: 19990, mostPopular: true, limits: { maxUsers: 25, maxProjects: 25, maxIssues: null, storageGB: 20, maxAIRequestsPerMonth: 500 }, capabilities: common({ prioritySupport: false }) }),
  business: createPlan({ id: "business", name: "Business", priceMonthly: 3999, priceAnnual: 39990, limits: { maxUsers: 50, maxProjects: null, maxIssues: null, storageGB: 100, maxAIRequestsPerMonth: 2000 }, capabilities: common({}) }),
  enterprise: createPlan({ id: "enterprise", name: "Enterprise", priceMonthly: null, priceAnnual: null, limits: { maxUsers: null, maxProjects: null, maxIssues: null, storageGB: null, maxAIRequestsPerMonth: null }, capabilities: common({ sso: true, onPremise: true, customIntegrations: true }) }),
});
const PLAN_LIST = Object.freeze(Object.values(PLANS));
module.exports = { PLAN_IDS, PLANS, PLAN_LIST };
