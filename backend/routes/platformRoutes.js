const express = require("express");
const {
  getCurrentPlatformAdmin,
  getPlatformDashboard,
  loginPlatformAdmin,
  logoutPlatformAdmin,
} = require("../controllers/platformAuthController");
const { platformAuth } = require("../middleware/platformAuth");

const router = express.Router();

router.post("/auth/login", loginPlatformAdmin);
router.get("/auth/me", platformAuth, getCurrentPlatformAdmin);
router.post("/auth/logout", platformAuth, logoutPlatformAdmin);
router.get("/dashboard", platformAuth, getPlatformDashboard);

module.exports = router;
