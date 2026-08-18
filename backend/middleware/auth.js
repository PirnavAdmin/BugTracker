const jwt = require("jsonwebtoken");
const User = require("../models/User");
const asyncHandler = require("../utils/asyncHandler");
const { normalizeTenantId } = require("../utils/tenant");
const { normalizeWorkspaceId } = require("../utils/workspace");

const auth = asyncHandler(async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1]?.trim();

  if (!token) {
    res.status(401);
    throw new Error("No token provided");
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
    throw new Error("Invalid token");
  }

  if (!decoded?.id) {
    res.status(401);
    throw new Error("Invalid token");
  }

  const user = await User.findById(decoded.id).select("-password").lean();

  if (!user) {
    res.status(401);
    throw new Error("Unauthorized");
  }

  const workspaceId = normalizeWorkspaceId(user.workspaceId || decoded.workspaceId);
  const tenantId = normalizeTenantId(user.tenantId || decoded.tenantId);

  req.user = {
    ...decoded,
    ...user,
    id: user._id.toString(),
    _id: user._id,
    workspaceId,
    tenantId,
  };
  req.workspaceId = workspaceId;
  req.tenantId = tenantId;

  next();
});

module.exports = auth;
