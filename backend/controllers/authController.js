const crypto = require("crypto");
const User = require("../models/User");
const { sendWorkspaceEmail } = require("../services/emailService");
const asyncHandler = require("../utils/asyncHandler");
const { DEFAULT_USER } = require("../utils/defaultUser");
const generateToken = require("../utils/generateToken");
const {
  createWorkspaceId,
  normalizeWorkspaceId,
} = require("../utils/workspace");

const passwordHasLetter = /[A-Za-z]/;
const passwordHasNumber = /\d/;
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_RESET_OTP_TTL_MS = 10 * 60 * 1000;
const PASSWORD_RESET_RESEND_COOLDOWN_MS = 60 * 1000;

const isAdminDefaultLoginAllowed = () =>
  process.env.ENABLE_ADMIN_DEFAULT_LOGIN === "true";

const getAdminDefaultPassword = () =>
  typeof process.env.ADMIN_DEFAULT_PASSWORD === "string"
    ? process.env.ADMIN_DEFAULT_PASSWORD
    : "";

const getOtpSecret = () =>
  process.env.JWT_SECRET || process.env.EMAIL_CONFIG_SECRET || "password-reset-otp";

const hashPasswordResetOtp = ({ email, otp }) =>
  crypto
    .createHmac("sha256", getOtpSecret())
    .update(`${String(email || "").toLowerCase().trim()}:${String(otp || "").trim()}`)
    .digest("hex");

const generatePasswordResetOtp = () =>
  String(crypto.randomInt(100000, 1000000));

const isSameHash = (left = "", right = "") => {
  const leftBuffer = Buffer.from(String(left), "hex");
  const rightBuffer = Buffer.from(String(right), "hex");

  return (
    leftBuffer.length === rightBuffer.length &&
    leftBuffer.length > 0 &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer)
  );
};

const isDefaultAdminCredentialAttempt = (email, password) =>
  email === DEFAULT_USER.email &&
  Boolean(getAdminDefaultPassword()) &&
  password === getAdminDefaultPassword();

const getPasswordValidationMessage = (password) => {
  const normalizedPassword = typeof password === "string" ? password : "";

  if (normalizedPassword.length < 8) {
    return "Password must be at least 8 characters long";
  }

  if (
    !passwordHasLetter.test(normalizedPassword) ||
    !passwordHasNumber.test(normalizedPassword)
  ) {
    return "Password must include at least one letter and one number";
  }

  return "";
};

const normalizeRememberMe = (value) =>
  value === true || value === "true" || value === "1";

const buildAuthPayload = (user, { rememberMe = false } = {}) => {
  const normalizedWorkspaceId = normalizeWorkspaceId(user.workspaceId);
  const maxAgeSeconds = generateToken.getTokenMaxAgeSeconds({ rememberMe });

  return {
    token: generateToken(user._id, normalizedWorkspaceId, { rememberMe }),
    expiresAt: new Date(Date.now() + maxAgeSeconds * 1000).toISOString(),
    rememberMe,
    user: {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      workspaceId: normalizedWorkspaceId,
    },
  };
};

const buildCurrentUserPayload = (user) => ({
  user: {
    _id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    workspaceId: normalizeWorkspaceId(user.workspaceId),
  },
});

const syncUserForAuth = async (user, password) => {
  let requiresSave = false;

  if (!user.workspaceId) {
    user.workspaceId = normalizeWorkspaceId();
    requiresSave = true;
  }

  if (!User.isPasswordHashed(user.password)) {
    user.password = password;
    requiresSave = true;
  }

  if (requiresSave) {
    await user.save();
  }

  return user;
};

const register = asyncHandler(async (req, res) => {
  const { name, email, password, role } = req.body;
  const normalizedName = typeof name === "string" ? name.trim() : "";
  const normalizedEmail = typeof email === "string" ? email.toLowerCase().trim() : "";
  const normalizedRole = typeof role === "string" ? role.trim() : "";

  console.log("[auth] Register request body:", {
    ...req.body,
    name: normalizedName || null,
    email: normalizedEmail || null,
    role: normalizedRole || null,
    password: password ? "[redacted]" : null,
  });

  if (!normalizedName || !normalizedEmail || !password || !normalizedRole) {
    res.status(400);
    throw new Error("Name, email, password, and role are required");
  }

  const passwordValidationMessage = getPasswordValidationMessage(password);

  if (passwordValidationMessage) {
    res.status(400);
    throw new Error(passwordValidationMessage);
  }

  if (!User.availableRoles.includes(normalizedRole)) {
    res.status(400);
    throw new Error(`Role must be one of ${User.availableRoles.join(", ")}`);
  }

  const existingUser = await User.findOne({ email: normalizedEmail });

  if (existingUser) {
    res.status(409);
    throw new Error("An account with that email already exists");
  }

  const workspaceId = createWorkspaceId();

  const user = await User.create({
    name: normalizedName,
    email: normalizedEmail,
    password,
    role: normalizedRole,
    workspaceId,
  });

  res.status(201).json({
    message: "Account created successfully. Please sign in.",
    ...buildAuthPayload(user),
  });
});

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const normalizedEmail = email?.toLowerCase().trim();
  const rememberMe = normalizeRememberMe(req.body?.rememberMe);

  console.log("[auth] Login request:", {
    email: normalizedEmail || null,
  });

  if (!normalizedEmail || !password) {
    res.status(400);
    throw new Error("Email and password are required");
  }

  if (isDefaultAdminCredentialAttempt(normalizedEmail, password)) {
    res.status(403);
    throw new Error("Default admin password is only available via /admin access");
  }

  const user = await User.findOne({ email: normalizedEmail }).select("+password");

  console.log("[auth] User found:", Boolean(user));

  const passwordMatches = user ? await user.comparePassword(password) : false;

  console.log("[auth] Password match:", passwordMatches);

  if (!user || !passwordMatches) {
    res.status(401);
    throw new Error("Invalid credentials");
  }

  await syncUserForAuth(user, password);
  res.status(200).json(buildAuthPayload(user, { rememberMe }));
});

const adminLogin = asyncHandler(async (req, res) => {
  const rememberMe = normalizeRememberMe(req.body?.rememberMe);

  if (!isAdminDefaultLoginAllowed()) {
    res.status(403);
    throw new Error("Admin default password access is disabled");
  }

  const adminDefaultPassword = getAdminDefaultPassword();

  if (!adminDefaultPassword) {
    res.status(500);
    throw new Error("Admin default password is not configured");
  }

  const user = await User.findOne({
    email: DEFAULT_USER.email,
    role: "Admin",
  }).select("+password");

  if (!user) {
    res.status(404);
    throw new Error("Default admin account is unavailable");
  }

  const passwordMatches = await user.comparePassword(adminDefaultPassword);

  if (!passwordMatches) {
    res.status(403);
    throw new Error("Default admin password is not available");
  }

  await syncUserForAuth(user, adminDefaultPassword);
  res.status(200).json(buildAuthPayload(user, { rememberMe }));
});

const getUsers = asyncHandler(async (req, res) => {
  const users = await User.find({
    workspaceId: normalizeWorkspaceId(req.user.workspaceId),
  })
    .select("name email role createdAt workspaceId")
    .sort({ name: 1 });

  console.log(
    "[auth] Returning users:",
    users.map((user) => ({
      id: String(user._id),
      name: user.name,
      role: user.role,
    }))
  );

  res.status(200).json(users);
});

const getCurrentUser = asyncHandler(async (req, res) => {
  res.status(200).json(buildCurrentUserPayload(req.user));
});

const changePassword = asyncHandler(async (req, res) => {
  const currentPassword =
    typeof req.body.currentPassword === "string" ? req.body.currentPassword : "";
  const newPassword =
    typeof req.body.newPassword === "string" ? req.body.newPassword : "";

  if (!currentPassword || !newPassword) {
    res.status(400);
    throw new Error("Current password and new password are required");
  }

  if (currentPassword === newPassword) {
    res.status(400);
    throw new Error("New password must be different from the current password");
  }

  const passwordValidationMessage = getPasswordValidationMessage(newPassword);

  if (passwordValidationMessage) {
    res.status(400);
    throw new Error(passwordValidationMessage);
  }

  const user = await User.findById(req.user._id).select("+password");

  if (!user) {
    res.status(401);
    throw new Error("Unauthorized");
  }

  const currentPasswordMatches = await user.comparePassword(currentPassword);

  if (!currentPasswordMatches) {
    res.status(400);
    throw new Error("Current password is incorrect");
  }

  user.password = newPassword;
  await user.save();

  res.status(200).json({
    message: "Password updated successfully",
  });
});

const sendPasswordResetEmail = ({ email, name, otp, workspaceId }) => {
  const subject = "Your Pirnav password reset OTP";
  const text = [
    `Hello ${name || "there"},`,
    `Your password reset OTP is ${otp}.`,
    "This OTP expires in 10 minutes.",
    "If you did not request this, you can ignore this email.",
  ].join("\n");

  return sendWorkspaceEmail({
    workspaceId,
    to: email,
    subject,
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #0F172A;">
        <h2 style="margin: 0 0 12px; color: #2563EB;">Reset your password</h2>
        <p style="margin: 0 0 16px;">Use this OTP to reset your Pirnav workspace password.</p>
        <div style="display: inline-block; letter-spacing: 8px; background: #F1F5F9; border: 1px solid #CBD5E1; border-radius: 10px; padding: 14px 18px; font-size: 28px; font-weight: 800; color: #0F172A;">${otp}</div>
        <p style="margin: 16px 0 0; color: #475569;">This OTP expires in 10 minutes.</p>
        <p style="margin: 10px 0 0; color: #64748B; font-size: 13px;">If you did not request this, you can ignore this email.</p>
      </div>
    `,
    text,
  });
};

const requestPasswordReset = asyncHandler(async (req, res) => {
  const normalizedEmail =
    typeof req.body.email === "string" ? req.body.email.toLowerCase().trim() : "";

  if (!normalizedEmail) {
    res.status(400);
    throw new Error("Email is required");
  }

  if (!emailRegex.test(normalizedEmail)) {
    res.status(400);
    throw new Error("Please enter a valid email address");
  }

  const user = await User.findOne({ email: normalizedEmail }).select(
    "+passwordResetRequestedAt +passwordResetOtpHash +passwordResetOtpExpiresAt"
  );

  const responseMessage =
    "If an account exists for this email, an OTP has been sent.";

  if (!user) {
    res.status(200).json({ message: responseMessage });
    return;
  }

  const requestedAt = user.passwordResetRequestedAt?.getTime?.() || 0;

  if (requestedAt && Date.now() - requestedAt < PASSWORD_RESET_RESEND_COOLDOWN_MS) {
    res.status(429);
    throw new Error("Please wait a minute before requesting another OTP");
  }

  const otp = generatePasswordResetOtp();
  user.passwordResetOtpHash = hashPasswordResetOtp({
    email: normalizedEmail,
    otp,
  });
  user.passwordResetOtpExpiresAt = new Date(Date.now() + PASSWORD_RESET_OTP_TTL_MS);
  user.passwordResetRequestedAt = new Date();
  await user.save();

  try {
    await sendPasswordResetEmail({
      email: user.email,
      name: user.name,
      otp,
      workspaceId: user.workspaceId,
    });
  } catch (error) {
    user.passwordResetOtpHash = "";
    user.passwordResetOtpExpiresAt = null;
    await user.save();
    throw error;
  }

  res.status(200).json({ message: responseMessage });
});

const resetPasswordWithOtp = asyncHandler(async (req, res) => {
  const normalizedEmail =
    typeof req.body.email === "string" ? req.body.email.toLowerCase().trim() : "";
  const otp = typeof req.body.otp === "string" ? req.body.otp.trim() : "";
  const newPassword =
    typeof req.body.newPassword === "string" ? req.body.newPassword : "";

  if (!normalizedEmail || !otp || !newPassword) {
    res.status(400);
    throw new Error("Email, OTP, and new password are required");
  }

  if (!emailRegex.test(normalizedEmail)) {
    res.status(400);
    throw new Error("Please enter a valid email address");
  }

  if (!/^\d{6}$/.test(otp)) {
    res.status(400);
    throw new Error("OTP must be 6 digits");
  }

  const passwordValidationMessage = getPasswordValidationMessage(newPassword);

  if (passwordValidationMessage) {
    res.status(400);
    throw new Error(passwordValidationMessage);
  }

  const user = await User.findOne({ email: normalizedEmail }).select(
    "+password +passwordResetOtpHash +passwordResetOtpExpiresAt"
  );

  const expectedHash = hashPasswordResetOtp({
    email: normalizedEmail,
    otp,
  });
  const isExpired =
    !user?.passwordResetOtpExpiresAt ||
    user.passwordResetOtpExpiresAt.getTime() < Date.now();
  const otpMatches =
    user?.passwordResetOtpHash &&
    isSameHash(user.passwordResetOtpHash, expectedHash);

  if (!user || isExpired || !otpMatches) {
    res.status(400);
    throw new Error("Invalid or expired OTP");
  }

  const matchesCurrentPassword = await user.comparePassword(newPassword);

  if (matchesCurrentPassword) {
    res.status(400);
    throw new Error("New password must be different from the current password");
  }

  user.password = newPassword;
  user.passwordResetOtpHash = "";
  user.passwordResetOtpExpiresAt = null;
  user.passwordResetRequestedAt = null;
  await user.save();

  res.status(200).json({
    message: "Password updated successfully. Please sign in.",
  });
});

module.exports = {
  register,
  login,
  adminLogin,
  getCurrentUser,
  getUsers,
  changePassword,
  requestPasswordReset,
  resetPasswordWithOtp,
};
