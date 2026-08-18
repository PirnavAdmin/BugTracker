const ProjectTeam = require("../models/ProjectTeam");
const Project = require("../models/Project");
const ProjectMember = require("../models/ProjectMember");
const Team = require("../models/Team");
const TeamMember = require("../models/TeamMember");
const { ROLE_ADMIN } = require("./roles");
const { attachMembersToTeams, sanitizeUser } = require("./teamRelations");
const { normalizeTenantId, withTenantFilter } = require("./tenant");
const { normalizeWorkspaceId } = require("./workspace");
const {
  logProjectTeamsDebug,
  logProjectTeamsWarning,
  summarizeTeams,
} = require("./projectTeamDiagnostics");

const toPlainObject = (value) =>
  typeof value?.toObject === "function" ? value.toObject() : value;

const sanitizeProjectUser = (value) => sanitizeUser(value) || null;

const resolveTeamReferenceId = (value) => {
  if (!value) {
    return "";
  }

  if (typeof value === "object") {
    if (typeof value.toHexString === "function") {
      return value.toHexString();
    }

    if (value.$oid) {
      return String(value.$oid);
    }

    if (value._id && value._id !== value) {
      return resolveTeamReferenceId(value._id);
    }

    if (value.teamId && value.teamId !== value) {
      return resolveTeamReferenceId(value.teamId);
    }
  }

  return String(value);
};

const addUniqueTeamId = (teamIds, seenTeamIds, value) => {
  const teamId = resolveTeamReferenceId(value);

  if (!teamId || seenTeamIds.has(teamId)) {
    return;
  }

  seenTeamIds.add(teamId);
  teamIds.push(teamId);
};

const getInlineProjectTeamIds = (project = {}) => {
  const teamIds = [];
  const seenTeamIds = new Set();

  ["attachedTeams", "teamIds", "teams"].forEach((field) => {
    const values = Array.isArray(project?.[field]) ? project[field] : [];
    values.forEach((value) => addUniqueTeamId(teamIds, seenTeamIds, value));
  });

  return teamIds;
};

const mergeProjectTeamIds = (project = {}, projectTeams = []) => {
  const teamIds = [];
  const seenTeamIds = new Set();

  projectTeams.forEach((projectTeam) =>
    addUniqueTeamId(teamIds, seenTeamIds, projectTeam?.teamId)
  );
  getInlineProjectTeamIds(project).forEach((teamId) =>
    addUniqueTeamId(teamIds, seenTeamIds, teamId)
  );

  return teamIds;
};

const buildEffectiveProjectMembers = (teams = [], directMembers = []) => {
  const members = [];
  const seenIds = new Set();

  const pushMember = (member, source = "team") => {
    const user = sanitizeUser(member?.user || member?.userId || member) || member;
    const userId = String(user?._id || member?.userId || member?._id || "");

    if (!userId || seenIds.has(userId)) {
      return;
    }

    seenIds.add(userId);
    members.push({
      ...user,
      projectRole: member?.role || user?.role || "Developer",
      membershipSource: source,
      membershipId: member?._id || "",
    });
  };

  directMembers.forEach((member) => pushMember(member, "project"));
  teams.forEach((team) => (team.members || []).forEach((member) => pushMember(member, "team")));

  return members.filter(Boolean);
};

const attachTeamsToProjects = async (projects = []) => {
  if (!projects.length) {
    return [];
  }

  const normalizedProjects = projects.map(toPlainObject);
  const projectIds = normalizedProjects.map((project) => project._id);
  const workspaceIds = Array.from(
    new Set(normalizedProjects.map((project) => normalizeWorkspaceId(project.workspaceId)))
  );

  const projectTeams = await ProjectTeam.find({
    projectId: {
      $in: projectIds,
    },
  })
    .sort({ createdAt: 1 })
    .lean();

  const projectTeamsByProjectId = new Map(
    projectIds.map((projectId) => [String(projectId), []])
  );

  projectTeams.forEach((projectTeam) => {
    projectTeamsByProjectId
      .get(String(projectTeam.projectId))
      ?.push(projectTeam);
  });

  const teamIdsByProjectId = new Map(
    normalizedProjects.map((project) => [
      String(project._id),
      mergeProjectTeamIds(
        project,
        projectTeamsByProjectId.get(String(project._id)) || []
      ),
    ])
  );
  const attachedTeamIds = Array.from(
    new Set(Array.from(teamIdsByProjectId.values()).flat())
  );
  const projectMembers = await ProjectMember.find({
    projectId: {
      $in: projectIds,
    },
  })
    .populate("userId", "name email role avatarUrl workspaceId")
    .sort({ createdAt: 1 })
    .lean();
  const directMembersByProjectId = new Map(
    projectIds.map((projectId) => [String(projectId), []])
  );

  projectMembers.forEach((member) => {
    directMembersByProjectId.get(String(member.projectId))?.push(member);
  });

  if (!attachedTeamIds.length) {
    return normalizedProjects.map((project) => ({
      ...project,
      teams: [],
      projectMembers: directMembersByProjectId.get(String(project._id)) || [],
    }));
  }

  const teams = await Team.find({
    _id: {
      $in: attachedTeamIds,
    },
    workspaceId: {
      $in: workspaceIds,
    },
  }).lean();
  const serializedTeams = await attachMembersToTeams(teams);
  const teamsById = new Map(
    serializedTeams.map((team) => [String(team._id), team])
  );
  const missingTeamIds = attachedTeamIds.filter((teamId) => !teamsById.has(teamId));

  if (missingTeamIds.length) {
    logProjectTeamsWarning("Attached team references were not returned for projects", {
      projectIds: projectIds.map(String),
      workspaceIds,
      linkedTeamCount: attachedTeamIds.length,
      returnedTeamCount: serializedTeams.length,
      missingTeamIds,
    });
  }

  logProjectTeamsDebug("Projects API team summary", {
    projectCount: normalizedProjects.length,
    workspaceIds,
    linkedTeamCount: projectTeams.length,
    returnedUniqueTeamCount: serializedTeams.length,
    teams: summarizeTeams(serializedTeams),
  });

  const teamsByProjectId = new Map(
    projectIds.map((projectId) => [String(projectId), []])
  );

  teamIdsByProjectId.forEach((projectTeamIds, projectId) => {
    projectTeamIds.forEach((teamId) => {
      const team = teamsById.get(String(teamId));

      if (!team) {
        return;
      }

      teamsByProjectId.get(String(projectId))?.push(team);
    });
  });

  return normalizedProjects.map((project) => ({
    ...project,
    teams: teamsByProjectId.get(String(project._id)) || [],
    projectMembers: directMembersByProjectId.get(String(project._id)) || [],
  }));
};

const serializeProjectsWithRelations = async (projects = []) => {
  const projectsWithTeams = await attachTeamsToProjects(projects);

  return projectsWithTeams.map((project) => {
    const { members: _legacyMembers, ...projectWithoutLegacyMembers } = project;
    const rawGit = project.git || {};
    const serializedGit = {
      ...rawGit,
      encryptedToken: undefined,
      tokenConfigured: Boolean(rawGit.tokenConfigured),
      repositoryOwner: rawGit.repositoryOwner || project.repository?.owner || "",
      repositoryName: rawGit.repositoryName || project.repository?.name || "",
      repositoryUrl: rawGit.repositoryUrl || project.repository?.url || "",
      defaultBranch: rawGit.defaultBranch || project.repository?.defaultBranch || "main",
      provider: rawGit.provider || project.repository?.provider || "GitHub",
      webhookEndpoint: rawGit.webhookEndpoint || project.repository?.webhookEndpoint || "/api/webhooks/github",
      webhookEvents: Array.isArray(rawGit.webhookEvents) ? rawGit.webhookEvents : [],
      automationRules: rawGit.automationRules || {},
      moduleMappings: Array.isArray(rawGit.moduleMappings) ? rawGit.moduleMappings : [],
      status: rawGit.status || {},
      auditLog: Array.isArray(rawGit.auditLog) ? rawGit.auditLog.slice(-10) : [],
    };
    const directProjectMembers = (project.projectMembers || []).map((member) => ({
      ...member,
      user: member.userId,
    }));
    const effectiveMembers = buildEffectiveProjectMembers(
      project.teams || [],
      directProjectMembers
    );
    const serializedTeams = (project.teams || []).map((team) => ({
      ...team,
      workspaceId: normalizeWorkspaceId(team.workspaceId),
    }));

    return {
      ...projectWithoutLegacyMembers,
      workspaceId: normalizeWorkspaceId(project.workspaceId),
      tenantId: normalizeTenantId(project.tenantId),
      createdBy: sanitizeUser(project.createdBy),
      manager: sanitizeProjectUser(project.manager),
      projectManager: sanitizeProjectUser(project.projectManager || project.manager),
      teamLead: sanitizeProjectUser(project.teamLead),
      qaLead: sanitizeProjectUser(project.qaLead),
      status: project.status || (project.isCompleted ? "Completed" : "Active"),
      priority: project.priority || "Medium",
      themeColor: project.themeColor || "#2563EB",
      git: serializedGit,
      epics: Array.isArray(project.epics)
        ? project.epics
            .map((epic) => (typeof epic === "string" ? epic.trim() : ""))
            .filter(Boolean)
        : [],
      teams: serializedTeams,
      attachedTeams: serializedTeams,
      teamIds: serializedTeams.map((team) => team._id).filter(Boolean),
      teamCount: project.teams?.length || 0,
      projectMembers: directProjectMembers.map((member) => ({
        _id: member._id,
        role: member.role,
        user: sanitizeUser(member.user),
        userId: sanitizeUser(member.user),
      })),
      members: effectiveMembers,
      memberCount: effectiveMembers.length,
    };
  });
};

const getWorkspaceTeamIdsForUser = async (userId, workspaceId) => {
  const memberTeamIds = await TeamMember.find({
    userId,
  }).distinct("teamId");

  if (!memberTeamIds.length) {
    return [];
  }

  return Team.find({
    _id: {
      $in: memberTeamIds,
    },
    workspaceId: normalizeWorkspaceId(workspaceId),
  }).distinct("_id");
};

const getProjectIdsForTeamIds = async (teamIds = [], workspaceId = "", reqOrUser = {}) => {
  if (!teamIds.length) {
    return [];
  }

  const [projectTeamIds, inlineProjectIds] = await Promise.all([
    ProjectTeam.find({
      teamId: {
        $in: teamIds,
      },
    }).distinct("projectId"),
    Project.find(withTenantFilter({
      ...(workspaceId ? { workspaceId: normalizeWorkspaceId(workspaceId) } : {}),
      $or: [
        {
          attachedTeams: {
            $in: teamIds,
          },
        },
        {
          teamIds: {
            $in: teamIds,
          },
        },
      ],
    }, reqOrUser)).distinct("_id"),
  ]);
  const uniqueProjectIds = new Map();

  [...projectTeamIds, ...inlineProjectIds].forEach((projectId) => {
    if (projectId) {
      uniqueProjectIds.set(String(projectId), projectId);
    }
  });

  const candidateProjectIds = Array.from(uniqueProjectIds.values());

  if (!candidateProjectIds.length) {
    return [];
  }

  return Project.find(withTenantFilter({
    _id: {
      $in: candidateProjectIds,
    },
    ...(workspaceId ? { workspaceId: normalizeWorkspaceId(workspaceId) } : {}),
  }, reqOrUser)).distinct("_id");
};

const getProjectIdsForUserThroughTeams = async (userId, workspaceId) =>
  getProjectIdsForTeamIds(
    await getWorkspaceTeamIdsForUser(userId, workspaceId),
    workspaceId,
    { workspaceId }
  );

const getProjectIdsForUserThroughTenantTeams = async (user) =>
  getProjectIdsForTeamIds(
    await getWorkspaceTeamIdsForUser(user.id || user._id, user.workspaceId),
    user.workspaceId,
    user
  );

const buildProjectAccessQuery = async (user) => {
  const workspaceId = normalizeWorkspaceId(user.workspaceId);
  const tenantScopedWorkspace = withTenantFilter({ workspaceId }, user);

  if (user.role === ROLE_ADMIN) {
    return tenantScopedWorkspace;
  }

  const userId = user.id || user._id;
  const [teamProjectIds, directProjectIds] = await Promise.all([
    getProjectIdsForUserThroughTenantTeams(user),
    ProjectMember.find({ userId }).distinct("projectId"),
  ]);
  const accessConditions = [
    { createdBy: userId },
    { manager: userId },
    { projectManager: userId },
    { teamLead: userId },
    { qaLead: userId },
  ];

  if (teamProjectIds.length) {
    accessConditions.push({
      _id: {
        $in: teamProjectIds,
      },
    });
  }

  if (directProjectIds.length) {
    accessConditions.push({
      _id: {
        $in: directProjectIds,
      },
    });
  }

  return {
    ...tenantScopedWorkspace,
    $or: accessConditions,
  };
};

const loadSerializedProjectById = async (ProjectModel, target, populateProject) => {
  const project =
    typeof target === "string" || target?._bsontype === "ObjectId"
      ? await populateProject(ProjectModel.findById(target)).lean()
      : target;

  if (!project) {
    return null;
  }

  const [serializedProject] = await serializeProjectsWithRelations([project]);
  return serializedProject || null;
};

module.exports = {
  serializeProjectsWithRelations,
  buildProjectAccessQuery,
  getProjectIdsForUserThroughTenantTeams,
  getProjectIdsForUserThroughTeams,
  loadSerializedProjectById,
  mergeProjectTeamIds,
};
