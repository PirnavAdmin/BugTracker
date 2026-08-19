const express = require("express");
const {
  getCurrentPlatformAdmin,
  loginPlatformAdmin,
  logoutPlatformAdmin,
} = require("../controllers/platformAuthController");
const platformCompanyController = require("../controllers/platformCompanyController");
const platformDashboardController = require("../controllers/platformDashboardController");
const { platformAuth } = require("../middleware/platformAuth");
const { getInfrastructureUsageController } = require("../controllers/infrastructureUsageController");

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
router.get("/subscriptions", platformAuth, platformCompanyController.listSubscriptions);
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
