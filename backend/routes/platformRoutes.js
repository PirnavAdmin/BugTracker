const express = require("express");
const {
  getCurrentPlatformAdmin,
  loginPlatformAdmin,
  logoutPlatformAdmin,
} = require("../controllers/platformAuthController");
const platformCompanyController = require("../controllers/platformCompanyController");
const platformDashboardController = require("../controllers/platformDashboardController");
const { platformAuth, requirePlatformRole } = require("../middleware/platformAuth");
const { PLATFORM_ROLES } = require("../constants/platformRoles");
const { getInfrastructureUsageController } = require("../controllers/infrastructureUsageController");
const billingController = require("../controllers/billingController");

const router = express.Router();

router.post("/auth/login", loginPlatformAdmin);
router.get("/auth/me", platformAuth, getCurrentPlatformAdmin);
router.post("/auth/logout", platformAuth, logoutPlatformAdmin);
router.get("/plans", platformAuth, platformCompanyController.listPlans);
router.get("/infrastructure-usage", platformAuth, getInfrastructureUsageController);
router.get("/companies", platformAuth, platformCompanyController.listCompanies);
router.post("/companies", platformAuth, platformCompanyController.createCompany);
router.post(
  "/companies/:id/admin-user",
  platformAuth,
  platformCompanyController.createCompanyAdminUser
);
router.get("/companies/:id", platformAuth, platformCompanyController.getCompany);
router.put("/companies/:id", platformAuth, platformCompanyController.updateCompany);
router.delete(
  "/companies/:id",
  platformAuth,
  requirePlatformRole([PLATFORM_ROLES.OWNER]),
  platformCompanyController.deleteCompany
);
router.get("/subscriptions", platformAuth, platformCompanyController.listSubscriptions);
router.get("/billing/subscriptions", platformAuth, billingController.platformSubscriptions);
router.get("/billing/payments", platformAuth, billingController.platformPayments);
router.get("/billing/invoices", platformAuth, billingController.platformInvoices);
router.get("/billing/companies/:id/status", platformAuth, billingController.platformCompanyStatus);
router.post("/subscriptions", platformAuth, platformCompanyController.createSubscription);
router.put("/subscriptions/:id", platformAuth, platformCompanyController.updateSubscription);
router.get("/dashboard", platformAuth, platformDashboardController.getDashboard);
router.get("/dashboard/summary", platformAuth, platformDashboardController.getSummary);
router.get("/dashboard/revenue", platformAuth, platformDashboardController.getRevenueOverview);
router.get(
  "/dashboard/subscriptions",
  platformAuth,
  platformDashboardController.getSubscriptionOverview
);
router.get("/dashboard/ai-usage", platformAuth, platformDashboardController.getAIUsage);
router.get(
  "/dashboard/ai-cost-by-company",
  platformAuth,
  platformDashboardController.getAICostByCompany
);
router.get("/dashboard/payments", platformAuth, platformDashboardController.getPayments);
router.get("/dashboard/growth", platformAuth, platformDashboardController.getCompanyGrowth);
router.get("/dashboard/activity", platformAuth, platformDashboardController.getActivity);
router.get("/dashboard/alerts", platformAuth, platformDashboardController.getAlerts);

module.exports = router;
