const express = require("express");
const {
  generateWorkItemDescription,
} = require("../controllers/aiController");
const { aiDescriptionRateLimit } = require("../middleware/aiRateLimit");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.post(
  "/generate-description",
  protect,
  aiDescriptionRateLimit,
  generateWorkItemDescription
);
router.post(
  "/generate-work-item-description",
  protect,
  aiDescriptionRateLimit,
  generateWorkItemDescription
);

module.exports = router;
