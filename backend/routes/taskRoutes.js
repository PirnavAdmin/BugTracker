const express = require("express");
const {
  getRecentTasks,
  updateTaskStatus,
} = require("../controllers/taskController");
const { protect } = require("../middleware/authMiddleware");
const { tenantCache, tenantCacheInvalidation } = require("../middleware/tenantCache");

const ISSUE_CACHE_RESOURCES = [
  "dashboard",
  "tasks",
  "bugs",
  "triage-board",
  "projects",
  "epics",
  "sprints",
  "notifications",
];

const router = express.Router();

router.get("/recent", protect, tenantCache({ resource: "tasks" }), getRecentTasks);
router.patch(
  "/:id/status",
  protect,
  tenantCacheInvalidation(ISSUE_CACHE_RESOURCES),
  updateTaskStatus
);

module.exports = router;
