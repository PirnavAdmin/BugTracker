const User = require("../models/User");
const asyncHandler = require("../utils/asyncHandler");
const { withTenantFilter } = require("../utils/tenant");
const {
  hasWorkspaceAccess,
  normalizeWorkspaceId,
  resolveRequestedWorkspaceId,
} = require("../utils/workspace");

const getWorkspaceUsers = asyncHandler(async (req, res) => {
  const currentWorkspaceId = normalizeWorkspaceId(req.user.workspaceId);
  const requestedWorkspaceId = resolveRequestedWorkspaceId(
    req.params.workspaceId,
    currentWorkspaceId
  );

  if (!hasWorkspaceAccess(requestedWorkspaceId, currentWorkspaceId)) {
    res.status(403);
    throw new Error("You do not have access to that workspace");
  }

  const users = await User.find(withTenantFilter({
    workspaceId: requestedWorkspaceId,
  }, req.user))
    .select("name email role avatarUrl employeeId designation createdAt workspaceId tenantId")
    .sort({ name: 1 })
    .lean();

  res.status(200).json(users);
});

module.exports = {
  getWorkspaceUsers,
};
