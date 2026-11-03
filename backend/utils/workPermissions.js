const WorkspaceSetting = require("../models/WorkspaceSetting");
const {
  ROLE_TEAM_LEAD,
  ROLE_QA_LEAD,
  ROLE_DEVELOPER,
  ROLE_TESTER,
  hasAdminAccess,
} = require("./roles");
const { normalizeWorkspaceId } = require("./workspace");

const WORK_PERMISSION_ROLES = Object.freeze([
  ROLE_TEAM_LEAD,
  ROLE_QA_LEAD,
  ROLE_DEVELOPER,
  ROLE_TESTER,
]);

// Existing work-management access remains enabled by default. Administrators
// and managers can later narrow it per role without changing application code.
const DEFAULT_WORK_PERMISSIONS = Object.freeze({
  [ROLE_TEAM_LEAD]: { manageTasks: true, manageBugs: true },
  [ROLE_QA_LEAD]: { manageTasks: true, manageBugs: false },
  [ROLE_DEVELOPER]: { manageTasks: false, manageBugs: false },
  [ROLE_TESTER]: { manageTasks: false, manageBugs: false },
});

const normalizeWorkPermissions = (workPermissions = {}) =>
  WORK_PERMISSION_ROLES.reduce((permissions, role) => {
    const submitted = workPermissions?.[role] || {};
    const defaults = DEFAULT_WORK_PERMISSIONS[role];

    permissions[role] = {
      manageTasks:
        typeof submitted.manageTasks === "boolean" ? submitted.manageTasks : defaults.manageTasks,
      manageBugs:
        typeof submitted.manageBugs === "boolean" ? submitted.manageBugs : defaults.manageBugs,
    };
    return permissions;
  }, {});

const getWorkspaceWorkPermissions = async (user) => {
  const workspaceId = normalizeWorkspaceId(user?.workspaceId);
  if (!workspaceId) return normalizeWorkPermissions();

  const settings = await WorkspaceSetting.findOne({ workspaceId })
    .select("workPermissions")
    .lean();
  return normalizeWorkPermissions(settings?.workPermissions || {});
};

const hasWorkPermission = async (user, permission) => {
  if (hasAdminAccess(user?.role)) return true;
  const permissions = await getWorkspaceWorkPermissions(user);
  return Boolean(permissions?.[user?.role]?.[permission]);
};

module.exports = {
  DEFAULT_WORK_PERMISSIONS,
  WORK_PERMISSION_ROLES,
  getWorkspaceWorkPermissions,
  hasWorkPermission,
  normalizeWorkPermissions,
};
