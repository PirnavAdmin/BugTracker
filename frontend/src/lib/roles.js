export const ROLE_ADMIN = "Admin";
export const ROLE_MANAGER = "Manager";
export const ROLE_TEAM_LEAD = "Team Lead";
export const ROLE_QA_LEAD = "Q/A Lead";
export const ROLE_DEVELOPER = "Developer";
export const ROLE_TESTER = "Tester";

export const WORKSPACE_ROLE_OPTIONS = [
  ROLE_ADMIN,
  ROLE_MANAGER,
  ROLE_TEAM_LEAD,
  ROLE_QA_LEAD,
  ROLE_DEVELOPER,
  ROLE_TESTER,
];

export const ADMIN_PANEL_ROLES = [ROLE_ADMIN, ROLE_MANAGER];
export const TESTER_PANEL_ROLES = [ROLE_TESTER, ROLE_QA_LEAD];
export const TASK_STORY_LEAD_ROLES = [ROLE_TEAM_LEAD, ROLE_QA_LEAD];

export const SCREEN_PERMISSION_ROLES = [
  ROLE_TEAM_LEAD,
  ROLE_QA_LEAD,
  ROLE_DEVELOPER,
  ROLE_TESTER,
];

export const SCREEN_PERMISSION_PAGE_OPTIONS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "stories", label: "Stories" },
  { id: "tasks", label: "Tasks" },
  { id: "bugs", label: "Bugs" },
  { id: "reports", label: "Reports" },
  { id: "chat", label: "Chat" },
];

const DEFAULT_SCREEN_PERMISSION_IDS = SCREEN_PERMISSION_PAGE_OPTIONS.map(
  (page) => page.id
);

export const DEFAULT_SCREEN_PERMISSIONS = SCREEN_PERMISSION_ROLES.reduce(
  (permissions, role) => ({
    ...permissions,
    [role]: DEFAULT_SCREEN_PERMISSION_IDS,
  }),
  {}
);

export const hasAdminPanelAccess = (role) => ADMIN_PANEL_ROLES.includes(role);
export const hasTesterPanelAccess = (role) => TESTER_PANEL_ROLES.includes(role);
export const hasTaskStoryLeadAccess = (role) => TASK_STORY_LEAD_ROLES.includes(role);
export const hasWorkspaceMailAccess = (role) =>
  hasAdminPanelAccess(role) || hasTaskStoryLeadAccess(role);

export const dashboardPathByRole = {
  [ROLE_ADMIN]: "/admin/dashboard",
  [ROLE_MANAGER]: "/admin/dashboard",
  [ROLE_TEAM_LEAD]: "/dev/dashboard",
  [ROLE_QA_LEAD]: "/tester/dashboard",
  [ROLE_DEVELOPER]: "/dev/dashboard",
  [ROLE_TESTER]: "/tester/dashboard",
};

export const getDashboardPathByRole = (role) =>
  dashboardPathByRole[role] || "/login";

export const getRoleNavigation = (role) => {
  if (hasAdminPanelAccess(role)) {
    const navigation = [
      { id: "dashboard", label: "Dashboard", href: dashboardPathByRole[ROLE_ADMIN], icon: "dashboard" },
      { id: "projects", label: "Projects", href: "/projects", icon: "projects" },
      { id: "backlog", label: "Backlog", href: "/backlog", icon: "backlog" },
      { id: "stories", label: "Stories", href: "/stories", icon: "stories" },
      { id: "tasks", label: "Tasks", href: "/tasks", icon: "tasks" },
      { id: "bugs", label: "Bugs", href: "/admin/bugs", icon: "bugs" },
      { id: "reports", label: "Reports", href: "/reports", icon: "reports" },
      { id: "chat", label: "Chat", href: "/chat", icon: "chat" },
    ];

    if (role === ROLE_ADMIN) {
      navigation.splice(7, 0, {
        id: "activity",
        label: "Team Activity",
        href: "/admin/team-activity",
        icon: "activity",
      });
    }

    return navigation;
  }

  if (hasTesterPanelAccess(role)) {
    return [
      { id: "dashboard", label: "Workspace", href: dashboardPathByRole[role] || dashboardPathByRole[ROLE_TESTER], icon: "dashboard" },
      { id: "stories", label: "Stories", href: "/stories", icon: "stories" },
      { id: "tasks", label: "Tasks", href: "/tasks", icon: "tasks" },
      { id: "bugs", label: "Bugs", href: "/bugs", icon: "bugs" },
      { id: "reports", label: "Analytics", href: "/analytics", icon: "reports" },
      { id: "chat", label: "Chat", href: "/chat", icon: "chat" },
    ];
  }

  return [
    { id: "dashboard", label: "Dashboard", href: dashboardPathByRole[ROLE_DEVELOPER], icon: "dashboard" },
    { id: "stories", label: "Stories", href: "/stories", icon: "stories" },
    { id: "tasks", label: "Tasks", href: "/tasks", icon: "tasks" },
    { id: "bugs", label: "Bugs", href: "/dev/bugs", icon: "bugs" },
    { id: "reports", label: "Reports", href: "/reports", icon: "reports" },
    { id: "chat", label: "Chat", href: "/chat", icon: "chat" },
  ];
};

export const normalizeScreenPermissions = (permissions = {}) =>
  SCREEN_PERMISSION_ROLES.reduce((normalized, role) => {
    const pageIds = Array.isArray(permissions?.[role])
      ? permissions[role]
      : DEFAULT_SCREEN_PERMISSIONS[role];

    normalized[role] = Array.from(
      new Set(
        pageIds.filter((pageId) =>
          SCREEN_PERMISSION_PAGE_OPTIONS.some((page) => page.id === pageId)
        )
      )
    );

    return normalized;
  }, {});

export const filterRoleNavigation = (navigation = [], role, permissions = null) => {
  if (hasAdminPanelAccess(role) || !SCREEN_PERMISSION_ROLES.includes(role)) {
    return navigation;
  }

  const normalizedPermissions = normalizeScreenPermissions(permissions || {});
  const allowedPages = normalizedPermissions[role] || DEFAULT_SCREEN_PERMISSIONS[role];

  return navigation.filter((item) => allowedPages.includes(item.id || item.icon));
};

export const getPageMeta = (pathname, role) => {
  if (pathname.startsWith("/stories/")) {
    return {
      title: "Story Details",
      description: "Review Story scope, linked work, discussion, files, and delivery activity.",
    };
  }

  if (pathname === "/dev/settings") {
    if (hasTesterPanelAccess(role)) {
      return {
        title: "Mail Settings",
        description:
          "Manage your personal tester mail sender, SMTP configuration, and password in one place.",
      };
    }

    return {
      title: "Account Settings",
      description:
        "Manage your account security and update your password with confidence.",
    };
  }

  const metaByPath = {
    [dashboardPathByRole[ROLE_ADMIN]]: {
      title: "Admin Command Center",
      description:
        "Review users, projects, and delivery health across the full workspace.",
    },
    [dashboardPathByRole[ROLE_DEVELOPER]]: {
      title: "Developer Dashboard",
      description:
        "Stay focused on your assigned work items, active priorities, and release-ready delivery.",
    },
    "/dev/bugs": {
      title: "Bug Board",
      description:
        "Pick available bugs and move bug fixes through a workflow that stays separate from tasks and sprints.",
    },
    [dashboardPathByRole[ROLE_TESTER]]: {
      title: "Workspace",
      description:
        "Review assigned projects and track project-wise testing performance.",
    },
    "/bugs": {
      title: "Bugs",
      description:
        "Report assigned project bugs and track status, comments, attachments, and developer progress.",
    },
    "/admin/bugs": {
      title: "Bug Tracker",
      description:
        "Track tester-reported bugs project-wise, manage lifecycle, and monitor QA verification.",
    },
    "/projects": {
      title: "Projects & Teams",
      description:
        "Create projects, attach teams, and keep delivery ownership in one workspace view.",
    },
    "/teams": {
      title: "Projects & Teams",
      description:
        "Team management now lives inside the combined Projects page.",
    },
    "/backlog": {
      title: "Backlog Planning",
      description:
        "Plan sprint work, organize epics, and keep backlog priorities aligned before execution starts.",
    },
    "/teams/create": {
      title: "Projects & Teams",
      description:
        "Create teams from the combined Projects page sidebar.",
    },
    "/tasks": {
      title: "Tasks",
      description:
        "Track your assigned work, move statuses forward, and stay focused on delivery.",
    },
    "/reports": {
      title: "Reports",
      description:
        "Review work item analytics, distribution trends, and project-level workload signals.",
    },
    "/analytics": {
      title: "Analytics",
      description:
        "Review QA activity, defect quality, build coverage, and project-level testing signals.",
    },
    "/chat": {
      title: "Chat",
      description:
        "Message teammates, project teams, and group channels in realtime.",
    },
    "/settings/users": {
      title: "User Management",
      description:
        "Invite teammates, update workspace roles, configure mail senders, and manage workspace access controls.",
    },
    "/stories": {
      title: "Stories",
      description: "Track Story outcomes and open focused delivery details for Tasks, Bugs, and collaboration.",
    },
    "/admin/team-activity": {
      title: "Team Activity",
      description:
        "Review current active, idle, and offline presence across workspace users.",
    },
  };

  if (pathname === "/issues") {
    if (hasAdminPanelAccess(role)) {
      return {
        title: "Issue Workspace",
        description:
          "Filter work across projects, rebalance priorities, and move items through a structured delivery workflow.",
      };
    }

    if (hasTesterPanelAccess(role)) {
      return {
        title: "Assigned Project Bugs",
        description:
          "Review assigned project bugs, update status, and keep QA feedback visible by project.",
      };
    }

    return {
      title: "My Assigned Work",
      description:
        "Move your assigned work forward, keep status fresh, and stay on top of active delivery work.",
    };
  }

  return (
    metaByPath[pathname] || {
      title: "Workspace",
      description: "Plan projects, move work, and keep the team aligned.",
    }
  );
};

export const canManageUsers = (role) => hasAdminPanelAccess(role);
export const canManageProjects = (role) =>
  hasAdminPanelAccess(role);
export const canAssignIssues = (role) =>
  hasAdminPanelAccess(role) || hasTaskStoryLeadAccess(role);
export const canDeleteIssues = (role) => hasAdminPanelAccess(role);
export const canCreateIssues = (role) =>
  hasAdminPanelAccess(role) || hasTesterPanelAccess(role);
