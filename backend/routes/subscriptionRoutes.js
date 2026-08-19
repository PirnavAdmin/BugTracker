const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { getCurrentPlan } = require("../controllers/subscriptionController");
const { getDatabaseUsage } = require("../controllers/databaseUsageController");
const router = express.Router();
router.get("/plan", protect, getCurrentPlan);
router.get("/database-usage", protect, getDatabaseUsage);
module.exports = router;
