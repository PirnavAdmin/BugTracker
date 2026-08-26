const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { createSubscription } = require("../controllers/cashfreeBillingController");

const router = express.Router();

router.post("/create-subscription", protect, createSubscription);

module.exports = router;
