const Issue = require("../models/Issue");
const Project = require("../models/Project");
const { buildProjectAccessQuery } = require("./projectRelations");
const { withTenantFilter } = require("./tenant");
const { normalizeWorkspaceId } = require("./workspace");

const getUserId = (user = {}) => user.id || user._id;

const buildDirectIssueAccess = (user = {}) => {
  const userId = getUserId(user);

  return userId
    ? {
        $or: [
          { assignee: userId },
          { assignees: userId },
          { reporter: userId },
          { "bugDetails.testerOwner": userId },
          { "bugDetails.developerLead": userId },
        ],
      }
    : null;
};

const hasDirectIssueAccess = (issue, user = {}) => {
  const userId = String(getUserId(user) || "");

  if (!issue || !userId) {
    return false;
  }

  return [
    issue.assignee,
    ...(Array.isArray(issue.assignees) ? issue.assignees : []),
    issue.reporter,
    issue.bugDetails?.testerOwner,
    issue.bugDetails?.developerLead,
  ].some((value) => String(value || "") === userId);
};

const loadTenantSafeIssueWithProject = async (user, issueId, options = {}) => {
  const issueFilter = {
    _id: issueId,
  };

  if (!options.includeDeleted) {
    issueFilter.isDeleted = { $ne: true };
  }

  const issueQuery = Issue.findOne(issueFilter);

  if (options.select) {
    issueQuery.select(options.select);
  }

  if (options.lean) {
    issueQuery.lean();
  }

  const issue = await issueQuery;

  if (!issue) {
    return {
      issue: null,
      project: null,
    };
  }

  const directProject = await Project.findOne({
    _id: issue.projectId,
    ...(await buildProjectAccessQuery(user)),
  });

  if (directProject) {
    return {
      issue,
      project: directProject,
    };
  }

  if (!hasDirectIssueAccess(issue, user)) {
    return {
      issue: null,
      project: null,
    };
  }

  const tenantProject = await Project.findOne(
    withTenantFilter(
      {
        _id: issue.projectId,
        workspaceId: normalizeWorkspaceId(user.workspaceId),
      },
      user
    )
  );

  return tenantProject
    ? {
        issue,
        project: tenantProject,
      }
    : {
        issue: null,
        project: null,
      };
};

const loadTenantSafeIssue = async (user, issueId, options = {}) => {
  const { issue } = await loadTenantSafeIssueWithProject(user, issueId, options);
  return issue;
};

module.exports = {
  buildDirectIssueAccess,
  loadTenantSafeIssue,
  loadTenantSafeIssueWithProject,
};
