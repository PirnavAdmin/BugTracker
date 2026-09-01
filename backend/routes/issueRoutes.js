const express = require("express");
const {
  getIssues,
  getIssueById,
  getStories,
  getIssueStats,
  getMyReportedBugs,
  getMyIssues,
  getBugBucket,
  downloadTaskImportSample,
  getRecentIssueActivity,
  getNotifications,
  getUnreadNotificationCount,
  importTasksFromSpreadsheet,
  markNotificationRead,
  markAllNotificationsRead,
  createIssue,
  updateIssue,
  pickIssue,
  uploadTaskImportMiddleware,
  deleteIssue,
} = require("../controllers/issueController");
const {
  createIssueWorklog,
  deleteIssueAttachment,
  getIssueAttachments,
  downloadIssueAttachment,
  getIssueHistory,
  getIssueWorklogs,
  moveIssueToSprint,
  removeIssueFromSprint,
  suggestIssuePriority,
  updateIssuePlanning,
  uploadIssueAttachment,
  uploadIssueAttachmentMiddleware,
} = require("../controllers/issuePlanningController");
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
const getIssueListCacheResource = (req) => {
  const type = String(req.query?.type || "").trim().toLowerCase();
  if (type === "bug") {
    return ["true", "1", "yes"].includes(
      String(req.query?.paginate || "").trim().toLowerCase()
    )
      ? "triage-board"
      : "bugs";
  }
  return "tasks";
};

router.get("/my", protect, tenantCache({ resource: "tasks" }), getMyIssues);
router.get("/reported/me", protect, tenantCache({ resource: "bugs" }), getMyReportedBugs);
router.get("/bucket", protect, tenantCache({ resource: "triage-board" }), getBugBucket);
router.get("/activity", protect, tenantCache({ resource: "dashboard" }), getRecentIssueActivity);
router.get("/notifications", protect, tenantCache({ resource: "notifications" }), getNotifications);
router.get(
  "/notifications/unread-count",
  protect,
  tenantCache({ resource: "notifications" }),
  getUnreadNotificationCount
);
router.patch(
  "/notifications/:id/read",
  protect,
  tenantCacheInvalidation(["notifications", "dashboard"]),
  markNotificationRead
);
router.post(
  "/notifications/read-all",
  protect,
  tenantCacheInvalidation(["notifications", "dashboard"]),
  markAllNotificationsRead
);
router.get("/stats", protect, tenantCache({ resource: "dashboard" }), getIssueStats);
router.get("/stories", protect, tenantCache({ resource: "tasks" }), getStories);
router.get("/import/tasks/sample", protect, downloadTaskImportSample);
router.post("/import/tasks", protect, uploadTaskImportMiddleware, tenantCacheInvalidation(ISSUE_CACHE_RESOURCES), importTasksFromSpreadsheet);
router.patch("/:id/planning", protect, tenantCacheInvalidation(ISSUE_CACHE_RESOURCES), updateIssuePlanning);
router.post("/:id/sprint", protect, tenantCacheInvalidation(ISSUE_CACHE_RESOURCES), moveIssueToSprint);
router.delete("/:id/sprint", protect, tenantCacheInvalidation(ISSUE_CACHE_RESOURCES), removeIssueFromSprint);
router.get("/:id/attachments", protect, getIssueAttachments);
router.get("/:issueId/attachments/:attachmentId/download", protect, downloadIssueAttachment);
router.delete("/:id/attachments/:attachmentId", protect, tenantCacheInvalidation(ISSUE_CACHE_RESOURCES), deleteIssueAttachment);
router.post(
  "/:id/attachments",
  protect,
  uploadIssueAttachmentMiddleware,
  tenantCacheInvalidation(ISSUE_CACHE_RESOURCES),
  uploadIssueAttachment
);
router.get("/:id/worklogs", protect, getIssueWorklogs);
router.post("/:id/worklogs", protect, tenantCacheInvalidation(ISSUE_CACHE_RESOURCES), createIssueWorklog);
router.get("/:id/history", protect, getIssueHistory);
router.post("/:id/suggest-priority", protect, suggestIssuePriority);
router.post("/:id/pick", protect, tenantCacheInvalidation(ISSUE_CACHE_RESOURCES), pickIssue);
router
  .route("/")
  .get(protect, tenantCache({ resource: getIssueListCacheResource }), getIssues)
  .post(protect, tenantCacheInvalidation(ISSUE_CACHE_RESOURCES), createIssue);
router
  .route("/:id")
  .get(protect, tenantCache({ resource: "tasks" }), getIssueById)
  .put(protect, tenantCacheInvalidation(ISSUE_CACHE_RESOURCES), updateIssue)
  .delete(protect, tenantCacheInvalidation(ISSUE_CACHE_RESOURCES), deleteIssue);

module.exports = router;
