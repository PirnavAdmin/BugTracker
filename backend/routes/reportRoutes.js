const express = require("express");
const {
  getReports,
  getProjectReports,
  getUserReports,
  getTeamReports,
} = require("../controllers/issueController");
const {
  getSprintReportById,
  getSprintReports,
} = require("../controllers/sprintReportController");
const {
  getDeveloperDashboardAnalytics,
} = require("../controllers/reportController");
const { protect } = require("../middleware/authMiddleware");
const { tenantCache } = require("../middleware/tenantCache");

const router = express.Router();

router.get("/", protect, getReports);
router.get(
  "/developer/dashboard",
  protect,
  tenantCache({ resource: "dashboard" }),
  getDeveloperDashboardAnalytics
);
router.get("/projects", protect, getProjectReports);
router.get("/users", protect, getUserReports);
router.get("/team", protect, getTeamReports);
router.get("/sprints", protect, getSprintReports);
router.get("/sprints/:id", protect, getSprintReportById);

module.exports = router;
