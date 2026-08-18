const jwt = require("jsonwebtoken");
const PlatformAdmin = require("../models/PlatformAdmin");
const { PLATFORM_ADMIN_STATUSES } = require("../constants/platformRoles");
const asyncHandler = require("../utils/asyncHandler");
const generatePlatformToken = require("../utils/generatePlatformToken");

const platformAuth = asyncHandler(async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1]?.trim();

  if (!token) {
    res.status(401);
    throw new Error("Platform authentication required");
  }

  if (!process.env.JWT_SECRET) {
    res.status(500);
    throw new Error("JWT secret is not configured");
  }

  let decoded;

  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    res.status(401);
    throw new Error("Invalid platform token");
  }

  if (
    decoded?.tokenType !== generatePlatformToken.PLATFORM_TOKEN_TYPE ||
    !decoded?.platformAdminId
  ) {
    res.status(403);
    throw new Error("Platform authorization required");
  }

  const platformAdmin = await PlatformAdmin.findById(decoded.platformAdminId).lean();

  if (!platformAdmin) {
    res.status(401);
    throw new Error("Platform administrator not found");
  }

  if (platformAdmin.status !== PLATFORM_ADMIN_STATUSES.ACTIVE) {
    res.status(403);
    throw new Error("Platform administrator account is disabled");
  }

  req.platformAdmin = {
    ...platformAdmin,
    id: String(platformAdmin._id),
    _id: platformAdmin._id,
  };

  next();
});

const requirePlatformRole = (roles = []) =>
  asyncHandler(async (req, res, next) => {
    if (!req.platformAdmin) {
      res.status(401);
      throw new Error("Platform authentication required");
    }

    if (roles.length && !roles.includes(req.platformAdmin.role)) {
      res.status(403);
      throw new Error("Platform role is not allowed");
    }

    next();
  });

module.exports = {
  platformAuth,
  requirePlatformRole,
};
