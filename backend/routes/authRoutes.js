const express = require("express");
const {
  login,
  adminLogin,
  register,
  getCurrentUser,
  getUsers,
  changePassword,
  requestPasswordReset,
  resetPasswordWithOtp,
} = require("../controllers/authController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.post("/admin-login", adminLogin);
router.post("/forgot-password", requestPasswordReset);
router.post("/reset-password", resetPasswordWithOtp);
router.get("/me", protect, getCurrentUser);
router.get("/users", protect, getUsers);
router.post("/change-password", protect, changePassword);

module.exports = router;
