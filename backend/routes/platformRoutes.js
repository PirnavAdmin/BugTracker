const express = require("express");
const {
  getCurrentPlatformAdmin,
  loginPlatformAdmin,
  logoutPlatformAdmin,
} = require("../controllers/platformAuthController");
const platformDashboardController = require("../controllers/platformDashboardController");
const { platformAuth } = require("../middleware/platformAuth");

const router = express.Router();

router.post("/auth/login", loginPlatformAdmin);
router.get("/auth/me", platformAuth, getCurrentPlatformAdmin);
router.post("/auth/logout", platformAuth, logoutPlatformAdmin);
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
