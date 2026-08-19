const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { getCurrentPlan } = require("../controllers/subscriptionController");
const router = express.Router();
router.get("/plan", protect, getCurrentPlan);
module.exports = router;
