const express = require("express");
const {
  generateWorkItemDescription,
} = require("../controllers/aiController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/generate-work-item-description", protect, generateWorkItemDescription);

module.exports = router;
