const express = require("express");
const {
  createEpic,
  deleteEpic,
  getEpics,
  updateEpic,
} = require("../controllers/epicController");
const { protect } = require("../middleware/authMiddleware");
const { tenantCache, tenantCacheInvalidation } = require("../middleware/tenantCache");

const router = express.Router();

const EPIC_CACHE_RESOURCES = ["dashboard", "tasks", "bugs", "triage-board", "projects", "epics", "sprints"];

router
  .route("/")
  .get(protect, tenantCache({ resource: "epics" }), getEpics)
  .post(protect, tenantCacheInvalidation(EPIC_CACHE_RESOURCES), createEpic);
router
  .route("/:id")
  .patch(protect, tenantCacheInvalidation(EPIC_CACHE_RESOURCES), updateEpic)
  .delete(protect, tenantCacheInvalidation(EPIC_CACHE_RESOURCES), deleteEpic);

module.exports = router;
