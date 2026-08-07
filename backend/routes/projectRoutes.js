const express = require("express");
const {
  getProjects,
  getProjectTeams,
  createProject,
  updateProject,
  updateProjectLeadership,
  updateProjectDeliveryWorkflow,
  addProjectMember,
  removeProjectMember,
  deleteProject,
  attachProjectTeam,
  detachProjectTeam,
  updateProjectStatus,
  scheduleProjectMeeting,
  getProjectMeetings,
} = require("../controllers/projectController");
const auth = require("../middleware/auth");

const router = express.Router();

router.get("/", auth, getProjects);
router.post("/", auth, createProject);
router.patch("/:id", auth, updateProject);
router.patch("/:id/leadership", auth, updateProjectLeadership);
router.patch("/:id/delivery-workflow", auth, updateProjectDeliveryWorkflow);
router.post("/:id/members", auth, addProjectMember);
router.delete("/:id/members/:userId", auth, removeProjectMember);
router.delete("/:id", auth, deleteProject);
router.get("/:id/teams", auth, getProjectTeams);
router.post("/:id/teams", auth, attachProjectTeam);
router.delete("/:id/teams/:teamId", auth, detachProjectTeam);
router.patch("/:id/status", auth, updateProjectStatus);
router.get("/:id/meetings", auth, getProjectMeetings);
router.post("/:id/meetings", auth, scheduleProjectMeeting);

module.exports = router;
