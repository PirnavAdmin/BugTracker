const PlatformAdmin = require("../models/PlatformAdmin");
const {
  PLATFORM_ADMIN_STATUSES,
  PLATFORM_PERMISSIONS,
  PLATFORM_ROLES,
} = require("../constants/platformRoles");
const asyncHandler = require("../utils/asyncHandler");
const generatePlatformToken = require("../utils/generatePlatformToken");
const { recordPlatformAudit } = require("../services/platformAuditService");

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normalizeEmail = (value = "") => String(value || "").toLowerCase().trim();
const serializePlatformAdmin = (admin = {}) => ({
  _id: admin._id,
  name: admin.name,
  email: admin.email,
  role: admin.role,
  status: admin.status,
  permissions: PLATFORM_PERMISSIONS[admin.role] || [],
  lastLoginAt: admin.lastLoginAt || null,
  createdAt: admin.createdAt,
});

const buildPlatformAuthPayload = (admin) => {
  const maxAgeSeconds = generatePlatformToken.getTokenMaxAgeSeconds();

  return {
    token: generatePlatformToken(admin),
    expiresAt: new Date(Date.now() + maxAgeSeconds * 1000).toISOString(),
    platformAdmin: serializePlatformAdmin(admin),
  };
};

const loginPlatformAdmin = asyncHandler(async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = typeof req.body?.password === "string" ? req.body.password : "";

  if (!email || !password) {
    res.status(400);
    throw new Error("Email and password are required");
  }

  if (!emailRegex.test(email)) {
    res.status(400);
    throw new Error("Please provide a valid email address");
  }

  const admin = await PlatformAdmin.findOne({ email }).select("+passwordHash");
  const passwordMatches = admin ? await admin.comparePassword(password) : false;

  if (!admin || !passwordMatches) {
    await recordPlatformAudit({
      action: "platform.login.failed",
      actorEmail: email,
      req,
      status: "FAILED",
      metadata: { reason: "invalid_credentials" },
    });
    res.status(401);
    throw new Error("Invalid platform credentials");
  }

  if (admin.status !== PLATFORM_ADMIN_STATUSES.ACTIVE) {
    await recordPlatformAudit({
      action: "platform.login.failed",
      actor: admin,
      req,
      status: "FAILED",
      metadata: { reason: "disabled_account" },
    });
    res.status(403);
    throw new Error("Platform administrator account is disabled");
  }

  admin.lastLoginAt = new Date();
  await admin.save();
  await recordPlatformAudit({
    action: "platform.login",
    actor: admin,
    req,
  });

  res.status(200).json(buildPlatformAuthPayload(admin));
});

const getCurrentPlatformAdmin = asyncHandler(async (req, res) => {
  res.status(200).json({
    platformAdmin: serializePlatformAdmin(req.platformAdmin),
  });
});

const logoutPlatformAdmin = asyncHandler(async (req, res) => {
  await recordPlatformAudit({
    action: "platform.logout",
    actor: req.platformAdmin,
    req,
  });

  res.status(200).json({
    message: "Signed out of CureCode Platform.",
  });
});

const getPlatformDashboard = asyncHandler(async (req, res) => {
  res.status(200).json({
    platformAdmin: serializePlatformAdmin(req.platformAdmin),
    overview: [
      { key: "companies", label: "Companies", status: "Placeholder" },
      { key: "subscriptions", label: "Subscriptions", status: "Placeholder" },
      { key: "payments", label: "Payments", status: "Placeholder" },
      { key: "ai-usage", label: "AI Usage", status: "Placeholder" },
      { key: "storage", label: "Storage", status: "Placeholder" },
    ],
    permissions: PLATFORM_PERMISSIONS[req.platformAdmin.role] || [],
    roles: [PLATFORM_ROLES.OWNER, PLATFORM_ROLES.ADMIN],
  });
});

module.exports = {
  getCurrentPlatformAdmin,
  getPlatformDashboard,
  loginPlatformAdmin,
  logoutPlatformAdmin,
  serializePlatformAdmin,
};
