const asyncHandler = require("../utils/asyncHandler");
const { hasAdminAccess, hasTesterAccess } = require("../utils/roles");

const mailSettingsAccess = asyncHandler(async (req, res, next) => {
  if (!req.user) {
    res.status(401);
    throw new Error("Unauthorized");
  }

  if (!hasAdminAccess(req.user.role) && !hasTesterAccess(req.user.role)) {
    res.status(403);
    throw new Error("Admin, manager, or tester access required");
  }

  next();
});

module.exports = mailSettingsAccess;
