const express = require("express");
const {
  completeSprint,
  createSprint,
  deleteSprint,
  getSprintIssues,
  getSprints,
  reopenSprint,
  startSprint,
  updateSprint,
} = require("../controllers/sprintController");
const { protect } = require("../middleware/authMiddleware");
const { tenantCache, tenantCacheInvalidation } = require("../middleware/tenantCache");

const router = express.Router();

const SPRINT_CACHE_RESOURCES = ["dashboard", "tasks", "bugs", "triage-board", "projects", "epics", "sprints"];

router
  .route("/")
  .get(protect, tenantCache({ resource: "sprints" }), getSprints)
  .post(protect, tenantCacheInvalidation(SPRINT_CACHE_RESOURCES), createSprint);
router.get("/:id/issues", protect, tenantCache({ resource: "tasks" }), getSprintIssues);
router.patch("/:id", protect, tenantCacheInvalidation(SPRINT_CACHE_RESOURCES), updateSprint);
router.delete("/:id", protect, tenantCacheInvalidation(SPRINT_CACHE_RESOURCES), deleteSprint);
router.post("/:id/start", protect, tenantCacheInvalidation(SPRINT_CACHE_RESOURCES), startSprint);
router.post("/:id/complete", protect, tenantCacheInvalidation(SPRINT_CACHE_RESOURCES), completeSprint);
router.post("/:id/reopen", protect, tenantCacheInvalidation(SPRINT_CACHE_RESOURCES), reopenSprint);

module.exports = router;
