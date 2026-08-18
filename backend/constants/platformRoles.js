const PLATFORM_ROLES = Object.freeze({
  OWNER: "SaaS Owner",
  ADMIN: "SaaS Admin",
});

const PLATFORM_ROLE_OPTIONS = Object.freeze([
  PLATFORM_ROLES.OWNER,
  PLATFORM_ROLES.ADMIN,
]);

const PLATFORM_PERMISSIONS = Object.freeze({
  [PLATFORM_ROLES.OWNER]: [
    "platform.dashboard",
    "platform.companies",
    "platform.subscriptions",
    "platform.payments",
    "platform.ai-usage",
    "platform.storage",
    "platform.settings",
    "platform.admins",
    "platform.audit-logs",
  ],
  [PLATFORM_ROLES.ADMIN]: [
    "platform.dashboard",
    "platform.companies",
    "platform.subscriptions",
    "platform.ai-usage",
    "platform.storage",
    "platform.support",
  ],
});

const PLATFORM_ADMIN_STATUSES = Object.freeze({
  ACTIVE: "active",
  DISABLED: "disabled",
});

module.exports = {
  PLATFORM_ADMIN_STATUSES,
  PLATFORM_PERMISSIONS,
  PLATFORM_ROLE_OPTIONS,
  PLATFORM_ROLES,
};
