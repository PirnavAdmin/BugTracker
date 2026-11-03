const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const mailSettingsAccess = require("../middleware/mailSettingsAccess");
const {
  getEmailConfig,
  saveEmailConfig,
  testEmailConfig,
  getScreenPermissions,
  saveScreenPermissions,
  getWorkPermissions,
  saveWorkPermissions,
  getAISettings,
  saveAISettings,
  getAIUsage,
  getModuleOwnerships,
  saveModuleOwnerships,
  getWorkspaceSender,
  saveWorkspaceSender,
  getEligibleSenders,
} = require("../controllers/settingsController");

const router = express.Router();

router.get("/screen-permissions", protect, getScreenPermissions);
router.get("/work-permissions", protect, getWorkPermissions);
router.get("/ai", protect, getAISettings);
router.post("/ai", protect, saveAISettings);
router.get("/ai/usage", protect, getAIUsage);

router.use(protect, mailSettingsAccess);

router.get("/email-config", getEmailConfig);
router.post("/email-config", saveEmailConfig);
router.post("/test-email", testEmailConfig);
router.post("/screen-permissions", saveScreenPermissions);
router.post("/work-permissions", saveWorkPermissions);
router.get("/module-ownerships", getModuleOwnerships);
router.post("/module-ownerships", saveModuleOwnerships);
router.get("/workspace-sender", getWorkspaceSender);
router.post("/workspace-sender", saveWorkspaceSender);
router.get("/eligible-senders", getEligibleSenders);

module.exports = router;
