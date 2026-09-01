const express = require("express");
const {
  createBug,
  deleteBug,
  ensureBugRecord,
  getBugs,
  updateBug,
} = require("../controllers/bugController");
const { protect } = require("../middleware/authMiddleware");
const { tenantCache, tenantCacheInvalidation } = require("../middleware/tenantCache");

const router = express.Router();

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
const getBugCacheResource = (req) =>
  ["true", "1", "yes"].includes(String(req.query?.paginate || "").trim().toLowerCase())
    ? "triage-board"
    : "bugs";

router
  .route("/")
  .get(protect, tenantCache({ resource: getBugCacheResource }), getBugs)
  .post(protect, tenantCacheInvalidation(ISSUE_CACHE_RESOURCES), createBug);
router
  .route("/:id")
  .put(protect, ensureBugRecord, tenantCacheInvalidation(ISSUE_CACHE_RESOURCES), updateBug)
  .delete(protect, ensureBugRecord, tenantCacheInvalidation(ISSUE_CACHE_RESOURCES), deleteBug);

module.exports = router;
