const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const {
  createSubscription,
  cancelSubscription,
  getSubscriptionStatus,
  returnSubscription,
} = require("../controllers/cashfreeBillingController");

const router = express.Router();

router.post("/create-subscription", protect, createSubscription);
router.post("/subscription/cancel", protect, cancelSubscription);
router.post("/return", returnSubscription);
router.get("/subscription/status", protect, getSubscriptionStatus);

module.exports = router;
