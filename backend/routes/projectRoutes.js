const express = require("express");
const { tenantCache, tenantCacheInvalidation } = require("../middleware/tenantCache");
const {
  getProjects,
  getProjectTeams,
  createProject,
  updateProject,
  updateProjectLeadership,
  updateProjectDeliveryWorkflow,
  testProjectGitConnection,
  syncProjectGitRepository,
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

const PROJECT_CACHE_RESOURCES = [
  "dashboard",
  "tasks",
  "bugs",
  "triage-board",
  "projects",
  "epics",
  "sprints",
];

router.get("/", auth, tenantCache({ resource: "projects" }), getProjects);
router.post("/", auth, tenantCacheInvalidation(PROJECT_CACHE_RESOURCES), createProject);
router.patch("/:id", auth, tenantCacheInvalidation(PROJECT_CACHE_RESOURCES), updateProject);
router.patch("/:id/leadership", auth, tenantCacheInvalidation(PROJECT_CACHE_RESOURCES), updateProjectLeadership);
router.patch("/:id/delivery-workflow", auth, tenantCacheInvalidation(PROJECT_CACHE_RESOURCES), updateProjectDeliveryWorkflow);
router.post("/:id/git/test", auth, testProjectGitConnection);
router.post("/:id/git/sync", auth, syncProjectGitRepository);
router.post("/:id/members", auth, tenantCacheInvalidation(PROJECT_CACHE_RESOURCES), addProjectMember);
router.delete("/:id/members/:userId", auth, tenantCacheInvalidation(PROJECT_CACHE_RESOURCES), removeProjectMember);
router.delete("/:id", auth, tenantCacheInvalidation(PROJECT_CACHE_RESOURCES), deleteProject);
router.get("/:id/teams", auth, getProjectTeams);
router.post("/:id/teams", auth, tenantCacheInvalidation(PROJECT_CACHE_RESOURCES), attachProjectTeam);
router.delete("/:id/teams/:teamId", auth, tenantCacheInvalidation(PROJECT_CACHE_RESOURCES), detachProjectTeam);
router.patch("/:id/status", auth, tenantCacheInvalidation(PROJECT_CACHE_RESOURCES), updateProjectStatus);
router.get("/:id/meetings", auth, getProjectMeetings);
router.post("/:id/meetings", auth, scheduleProjectMeeting);

module.exports = router;
