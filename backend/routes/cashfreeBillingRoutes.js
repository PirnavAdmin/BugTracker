const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const {
  createSubscription,
  getSubscriptionStatus,
} = require("../controllers/cashfreeBillingController");

const router = express.Router();

router.post("/create-subscription", protect, createSubscription);
router.get("/subscription/status", protect, getSubscriptionStatus);

module.exports = router;
