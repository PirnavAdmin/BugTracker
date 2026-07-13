const express = require("express");
const multer = require("multer");
const {
  login,
  adminLogin,
  register,
  getCurrentUser,
  updateCurrentUserAvatar,
  getUsers,
  changePassword,
  requestPasswordReset,
  resetPasswordWithOtp,
} = require("../controllers/authController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();
const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 2 * 1024 * 1024,
  },
});

router.post("/register", register);
router.post("/login", login);
router.post("/admin-login", adminLogin);
router.post("/forgot-password", requestPasswordReset);
router.post("/reset-password", resetPasswordWithOtp);
router.get("/me", protect, getCurrentUser);
router.post("/me/avatar", protect, avatarUpload.single("avatar"), updateCurrentUserAvatar);
router.get("/users", protect, getUsers);
router.post("/change-password", protect, changePassword);

module.exports = router;
