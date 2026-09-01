const express = require("express");
const {
  getIssueAnalyticsRows,
  getOverview,
  getPriorities,
  getProjects,
  getRecentActivity,
  getTeams,
  getTrends,
} = require("../controllers/analyticsController");
const { protect } = require("../middleware/authMiddleware");
const { tenantCache } = require("../middleware/tenantCache");

const router = express.Router();

router.get("/overview", protect, tenantCache({ resource: "dashboard" }), getOverview);
router.get("/trends", protect, tenantCache({ resource: "dashboard" }), getTrends);
router.get("/priorities", protect, tenantCache({ resource: "dashboard" }), getPriorities);
router.get("/projects", protect, tenantCache({ resource: "dashboard" }), getProjects);
router.get("/teams", protect, tenantCache({ resource: "dashboard" }), getTeams);
router.get("/recent-activity", protect, tenantCache({ resource: "dashboard" }), getRecentActivity);
router.get("/issues", protect, tenantCache({ resource: "dashboard" }), getIssueAnalyticsRows);

module.exports = router;
