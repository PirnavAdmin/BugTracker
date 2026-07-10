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

const router = express.Router();

router.route("/").get(protect, getSprints).post(protect, createSprint);
router.get("/:id/issues", protect, getSprintIssues);
router.patch("/:id", protect, updateSprint);
router.delete("/:id", protect, deleteSprint);
router.post("/:id/start", protect, startSprint);
router.post("/:id/complete", protect, completeSprint);
router.post("/:id/reopen", protect, reopenSprint);

module.exports = router;
