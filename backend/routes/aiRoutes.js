const express = require("express");
const {
  generateWorkItemDescription,
  reviewCodeForCommit,
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
router.post(
  "/code-review",
  protect,
  aiDescriptionRateLimit,
  reviewCodeForCommit
);

module.exports = router;
