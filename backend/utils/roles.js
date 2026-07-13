const ROLE_ADMIN = "Admin";
const ROLE_MANAGER = "Manager";
const ROLE_TEAM_LEAD = "Team Lead";
const ROLE_QA_LEAD = "Q/A Lead";
const ROLE_DEVELOPER = "Developer";
const ROLE_TESTER = "Tester";

const USER_ROLE_OPTIONS = [
  ROLE_ADMIN,
  ROLE_MANAGER,
  ROLE_TEAM_LEAD,
  ROLE_QA_LEAD,
  ROLE_DEVELOPER,
  ROLE_TESTER,
];

const ADMIN_ACCESS_ROLES = [ROLE_ADMIN, ROLE_MANAGER];
const TESTER_ACCESS_ROLES = [ROLE_TESTER, ROLE_QA_LEAD];
const TASK_STORY_LEAD_ROLES = [ROLE_TEAM_LEAD, ROLE_QA_LEAD];

const hasAdminAccess = (role) => ADMIN_ACCESS_ROLES.includes(role);
const hasTesterAccess = (role) => TESTER_ACCESS_ROLES.includes(role);
const hasTaskStoryLeadAccess = (role) => TASK_STORY_LEAD_ROLES.includes(role);

const hasWorkspaceMailAccess = (role) =>
  hasAdminAccess(role) || hasTaskStoryLeadAccess(role);
const isEligibleWorkspaceSenderRole = hasWorkspaceMailAccess;

module.exports = {
  ROLE_ADMIN,
  ROLE_MANAGER,
  ROLE_TEAM_LEAD,
  ROLE_QA_LEAD,
  ROLE_DEVELOPER,
  ROLE_TESTER,
  USER_ROLE_OPTIONS,
  ADMIN_ACCESS_ROLES,
  TESTER_ACCESS_ROLES,
  TASK_STORY_LEAD_ROLES,
  hasAdminAccess,
  hasTesterAccess,
  hasTaskStoryLeadAccess,
  hasWorkspaceMailAccess,
  isEligibleWorkspaceSenderRole,
};
