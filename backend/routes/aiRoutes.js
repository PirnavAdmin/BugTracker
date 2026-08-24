const express = require("express");
const {
  generateProjectInsights,
  generateWorkItemDescription,
  reviewCodeForCommit,
} = require("../controllers/aiController");
const { aiDescriptionRateLimit } = require("../middleware/aiRateLimit");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.post(
  "/projects/:projectId/insights",
  protect,
  aiDescriptionRateLimit,
  generateProjectInsights
);
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
