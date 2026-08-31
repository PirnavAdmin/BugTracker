const express = require("express");
const { createCompanyAccount } = require("../controllers/onboardingController");

const router = express.Router();
router.post("/company", createCompanyAccount);

module.exports = router;
