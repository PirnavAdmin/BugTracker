const PlatformAdmin = require("../models/PlatformAdmin");
const { PLATFORM_ROLES } = require("../constants/platformRoles");
const { recordPlatformAudit } = require("../services/platformAuditService");

const passwordHasLetter = /[A-Za-z]/;
const passwordHasNumber = /\d/;
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const getPlatformBootstrapConfig = () => ({
  email: String(process.env.PLATFORM_ADMIN_EMAIL || "").toLowerCase().trim(),
  name: String(process.env.PLATFORM_ADMIN_NAME || "CureCode SaaS Owner").trim(),
  password: String(process.env.PLATFORM_ADMIN_PASSWORD || ""),
});

const validateBootstrapPassword = (password = "") => {
  if (password.length < 8) {
    return "PLATFORM_ADMIN_PASSWORD must be at least 8 characters long";
  }

  if (!passwordHasLetter.test(password) || !passwordHasNumber.test(password)) {
    return "PLATFORM_ADMIN_PASSWORD must include at least one letter and one number";
  }

  return "";
};

const ensureInitialPlatformAdmin = async () => {
  const { email, name, password } = getPlatformBootstrapConfig();

  if (!email && !password) {
    return null;
  }

  if (!email || !password) {
    throw new Error("Both PLATFORM_ADMIN_EMAIL and PLATFORM_ADMIN_PASSWORD are required to bootstrap a platform admin");
  }

  if (!emailRegex.test(email)) {
    throw new Error("PLATFORM_ADMIN_EMAIL must be a valid email address");
  }

  const passwordValidationMessage = validateBootstrapPassword(password);

  if (passwordValidationMessage) {
    throw new Error(passwordValidationMessage);
  }

  const existingAdmin = await PlatformAdmin.findOne({ email });

  if (existingAdmin) {
    return existingAdmin;
  }

  const admin = await PlatformAdmin.create({
    name,
    email,
    passwordHash: password,
    role: PLATFORM_ROLES.OWNER,
  });

  await recordPlatformAudit({
    action: "platform.admin.created",
    actor: admin,
    metadata: {
      source: "bootstrap",
      role: PLATFORM_ROLES.OWNER,
    },
  });

  console.log("[platform] Initial SaaS Owner created from environment configuration");
  return admin;
};

const resetInitialPlatformAdmin = async () => {
  const { email, name, password } = getPlatformBootstrapConfig();

  if (!email || !password) {
    throw new Error("Both PLATFORM_ADMIN_EMAIL and PLATFORM_ADMIN_PASSWORD are required to reset a platform admin");
  }

  if (!emailRegex.test(email)) {
    throw new Error("PLATFORM_ADMIN_EMAIL must be a valid email address");
  }

  const passwordValidationMessage = validateBootstrapPassword(password);

  if (passwordValidationMessage) {
    throw new Error(passwordValidationMessage);
  }

  const admin = await PlatformAdmin.findOne({ email }).select("+passwordHash");

  if (admin) {
    admin.name = name || admin.name;
    admin.passwordHash = password;
    admin.role = PLATFORM_ROLES.OWNER;
    admin.status = "active";
    await admin.save();
    await recordPlatformAudit({
      action: "platform.admin.created",
      actor: admin,
      metadata: {
        source: "reset-script",
        role: PLATFORM_ROLES.OWNER,
        refreshed: true,
      },
    });
    return admin;
  }

  return ensureInitialPlatformAdmin();
};

module.exports = {
  ensureInitialPlatformAdmin,
  getPlatformBootstrapConfig,
  resetInitialPlatformAdmin,
  validateBootstrapPassword,
};
