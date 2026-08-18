const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const Project = require("../models/Project");
const ProjectMember = require("../models/ProjectMember");
const ProjectTeam = require("../models/ProjectTeam");
const Team = require("../models/Team");
const TeamMember = require("../models/TeamMember");
const Issue = require("../models/Issue");
const User = require("../models/User");
const { createProject } = require("../controllers/projectController");
const { getManagedUsers } = require("../controllers/userController");
const {
  buildProjectAccessQuery,
  getProjectIdsForUserThroughTenantTeams,
} = require("../utils/projectRelations");

test("admin project access query is scoped by workspace and tenant", async () => {
  const query = await buildProjectAccessQuery({
    _id: "admin-1",
    role: "Admin",
    workspaceId: "legacy-workspace",
    tenantId: "TENANT_001",
  });

  assert.deepEqual(query, {
    workspaceId: "legacy-workspace",
    tenantId: "TENANT_001",
  });
});

test("non-admin project access query keeps tenantId on assignment scopes", async () => {
  const originalTeamMemberFind = TeamMember.find;
  const originalProjectMemberFind = ProjectMember.find;

  TeamMember.find = () => ({
    distinct: async () => [],
  });
  ProjectMember.find = () => ({
    distinct: async () => ["project-direct"],
  });

  try {
    const query = await buildProjectAccessQuery({
      _id: "user-1",
      role: "Developer",
      workspaceId: "legacy-workspace",
      tenantId: "TENANT_001",
    });

    assert.equal(query.workspaceId, "legacy-workspace");
    assert.equal(query.tenantId, "TENANT_001");
    assert.ok(query.$or.some((condition) => condition._id?.$in?.includes("project-direct")));
  } finally {
    TeamMember.find = originalTeamMemberFind;
    ProjectMember.find = originalProjectMemberFind;
  }
});

test("team-linked project ids are resolved through tenant-filtered projects", async () => {
  const originalTeamMemberFind = TeamMember.find;
  const originalTeamFind = Team.find;
  const originalProjectTeamFind = ProjectTeam.find;
  const originalProjectFind = Project.find;
  const seenProjectQueries = [];

  TeamMember.find = () => ({
    distinct: async () => ["team-1"],
  });
  Team.find = () => ({
    distinct: async () => ["team-1"],
  });
  ProjectTeam.find = () => ({
    distinct: async () => ["project-from-link"],
  });
  Project.find = (query) => {
    seenProjectQueries.push(query);
    return {
      distinct: async () => ["project-from-inline"],
    };
  };

  try {
    await getProjectIdsForUserThroughTenantTeams({
      _id: "user-1",
      workspaceId: "legacy-workspace",
      tenantId: "TENANT_001",
    });

    assert.ok(seenProjectQueries.length >= 2);
    assert.ok(seenProjectQueries.every((query) => query.tenantId === "TENANT_001"));
    assert.ok(seenProjectQueries.every((query) => query.workspaceId === "legacy-workspace"));
  } finally {
    TeamMember.find = originalTeamMemberFind;
    Team.find = originalTeamFind;
    ProjectTeam.find = originalProjectTeamFind;
    Project.find = originalProjectFind;
  }
});

test("managed users endpoint lists only users from the authenticated tenant", async () => {
  const originalUserFind = User.find;
  let seenFilter = null;

  User.find = (filter) => {
    seenFilter = filter;
    return {
      select: () => ({
        sort: () => ({
          lean: async () => [],
        }),
      }),
    };
  };

  const req = {
    user: {
      _id: "admin-1",
      role: "Admin",
      workspaceId: "legacy-workspace",
      tenantId: "TENANT_001",
    },
  };
  const res = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };

  try {
    await getManagedUsers(req, res, (error) => {
      if (error) {
        throw error;
      }
    });

    assert.equal(res.statusCode, 200);
    assert.deepEqual(seenFilter, {
      workspaceId: "legacy-workspace",
      tenantId: "TENANT_001",
    });
  } finally {
    User.find = originalUserFind;
  }
});

test("project creation persists tenantId from the authenticated user", async () => {
  const originalProjectExists = Project.exists;
  const originalProjectFindOne = Project.findOne;
  const originalProjectCreate = Project.create;
  const originalProjectFindById = Project.findById;
  const originalProjectTeamFind = ProjectTeam.find;
  const originalProjectMemberFind = ProjectMember.find;
  const originalIssueCountDocuments = Issue.countDocuments;
  const projectId = new mongoose.Types.ObjectId();
  let createdPayload = null;

  Project.exists = async () => null;
  Project.findOne = () => ({
    select: () => ({
      lean: async () => null,
    }),
  });
  Project.create = async (payload) => {
    createdPayload = payload;
    return {
      _id: projectId,
      ...payload,
    };
  };
  Project.findById = () => ({
    populate() {
      return this;
    },
    lean: async () => ({
      _id: projectId,
      name: createdPayload.name,
      workspaceId: createdPayload.workspaceId,
      tenantId: createdPayload.tenantId,
      createdBy: createdPayload.createdBy,
      manager: createdPayload.manager,
      projectManager: createdPayload.projectManager,
      teamLead: createdPayload.teamLead,
      qaLead: createdPayload.qaLead,
      attachedTeams: [],
      teamIds: [],
      teams: [],
    }),
  });
  ProjectTeam.find = () => ({
    sort: () => ({
      lean: async () => [],
    }),
  });
  ProjectMember.find = () => ({
    populate: () => ({
      sort: () => ({
        lean: async () => [],
      }),
    }),
  });
  Issue.countDocuments = async () => 0;

  const req = {
    user: {
      _id: "admin-1",
      role: "Admin",
      workspaceId: "legacy-workspace",
      tenantId: "TENANT_001",
    },
    body: {
      name: "Tenant Project",
      tenantId: "TENANT_999",
      deliveryModules: [{ name: "Core" }],
    },
  };
  const res = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };

  try {
    await createProject(req, res, (error) => {
      if (error) {
        throw error;
      }
    });

    assert.equal(res.statusCode, 201);
    assert.equal(createdPayload.tenantId, "TENANT_001");
    assert.equal(createdPayload.workspaceId, "legacy-workspace");
  } finally {
    Project.exists = originalProjectExists;
    Project.findOne = originalProjectFindOne;
    Project.create = originalProjectCreate;
    Project.findById = originalProjectFindById;
    ProjectTeam.find = originalProjectTeamFind;
    ProjectMember.find = originalProjectMemberFind;
    Issue.countDocuments = originalIssueCountDocuments;
  }
});
