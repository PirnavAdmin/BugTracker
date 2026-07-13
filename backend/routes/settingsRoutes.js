const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const mailSettingsAccess = require("../middleware/mailSettingsAccess");
const {
  getEmailConfig,
  saveEmailConfig,
  testEmailConfig,
  getScreenPermissions,
  saveScreenPermissions,
  getModuleOwnerships,
  saveModuleOwnerships,
  getWorkspaceSender,
  saveWorkspaceSender,
  getEligibleSenders,
} = require("../controllers/settingsController");

const router = express.Router();

router.get("/screen-permissions", protect, getScreenPermissions);

router.use(protect, mailSettingsAccess);

router.get("/email-config", getEmailConfig);
router.post("/email-config", saveEmailConfig);
router.post("/test-email", testEmailConfig);
router.post("/screen-permissions", saveScreenPermissions);
router.get("/module-ownerships", getModuleOwnerships);
router.post("/module-ownerships", saveModuleOwnerships);
router.get("/workspace-sender", getWorkspaceSender);
router.post("/workspace-sender", saveWorkspaceSender);
router.get("/eligible-senders", getEligibleSenders);

module.exports = router;
