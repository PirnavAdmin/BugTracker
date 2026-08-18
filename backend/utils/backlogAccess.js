const Issue = require("../models/Issue");
const Project = require("../models/Project");
const { buildProjectAccessQuery } = require("./projectRelations");
const { hasAdminAccess } = require("./roles");
const { withTenantFilter } = require("./tenant");
const { normalizeWorkspaceId } = require("./workspace");

const getUserId = (user) => String(user?.id || user?._id || "");

const isAdmin = (user) => hasAdminAccess(user?.role);

const canManageProjectPlanning = (user, project) => {
  if (!user || !project) {
    return false;
  }

  if (isAdmin(user)) {
    return true;
  }

  const userId = getUserId(user);

  if (!userId) {
    return false;
  }

  return [
    project.createdBy,
    project.manager,
    project.projectManager,
    project.teamLead,
    project.qaLead,
  ].some(
    (value) => String(value || "") === userId
  );
};

const getReadableProjectIds = async (user) => {
  const workspaceId = normalizeWorkspaceId(user.workspaceId);
  const accessQuery = await buildProjectAccessQuery(user);
  const [projectIds, directlyAssignedProjectIds] = await Promise.all([
    Project.find(accessQuery).distinct("_id"),
    Issue.find({
      $or: [
        { assignee: user._id },
        { reporter: user._id },
        { "bugDetails.testerOwner": user._id },
        { "bugDetails.developerLead": user._id },
      ],
    }).distinct("projectId"),
  ]);

  const additionalProjectIds = directlyAssignedProjectIds.length
    ? await Project.find(withTenantFilter({
        _id: {
          $in: directlyAssignedProjectIds,
        },
        workspaceId,
      }, user)).distinct("_id")
    : [];
  const uniqueProjectIds = new Map();

  [...projectIds, ...additionalProjectIds].forEach((projectId) => {
    if (projectId) {
      uniqueProjectIds.set(String(projectId), projectId);
    }
  });

  return Array.from(uniqueProjectIds.values());
};

const loadReadableProject = async (user, projectId) => {
  const workspaceId = normalizeWorkspaceId(user.workspaceId);
  const directProject = await Project.findOne({
    _id: projectId,
    ...(await buildProjectAccessQuery(user)),
  });

  if (directProject) {
    return directProject;
  }

  const hasAssignedIssue = await Issue.exists({
    projectId,
    $or: [
      { assignee: user._id },
      { reporter: user._id },
      { "bugDetails.testerOwner": user._id },
      { "bugDetails.developerLead": user._id },
    ],
  });

  if (!hasAssignedIssue) {
    return null;
  }

  return Project.findOne(withTenantFilter({
    _id: projectId,
    workspaceId,
  }, user));
};

const loadReadableIssue = async (user, issueId) => {
  const issue = await Issue.findById(issueId);

  if (!issue) {
    return null;
  }

  const project = await loadReadableProject(user, issue.projectId);

  if (!project) {
    return null;
  }

  return issue;
};

const getBacklogPermissions = (user, project) => {
  const canManagePlanning = canManageProjectPlanning(user, project);

  return {
    canManagePlanning,
    canManageSprints: canManagePlanning,
    canManageEpics: canManagePlanning,
    canAssignIssues: canManagePlanning,
    canReorderIssues: canManagePlanning,
    canSuggestPriority: true,
    canComment: true,
    canUploadAttachments: true,
    canLogWork: true,
  };
};

module.exports = {
  getUserId,
  isAdmin,
  canManageProjectPlanning,
  getReadableProjectIds,
  loadReadableProject,
  loadReadableIssue,
  getBacklogPermissions,
};
