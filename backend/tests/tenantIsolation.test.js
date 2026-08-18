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
const { attachProjectTeam, createProject } = require("../controllers/projectController");
const {
  addTeamMember,
  createTeam,
  deleteTeam,
  getTeamById,
  getTeams,
} = require("../controllers/teamController");
const { getManagedUsers } = require("../controllers/userController");
const {
  buildProjectAccessQuery,
  getProjectIdsForUserThroughTenantTeams,
} = require("../utils/projectRelations");

const createResponse = () => ({
  statusCode: 200,
  payload: undefined,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(payload) {
    this.payload = payload;
    return this;
  },
});

const invokeController = async (controller, req, res = createResponse()) => {
  await controller(req, res, (error) => {
    if (error) {
      throw error;
    }
  });

  return res;
};

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

test("team list is scoped by workspace and authenticated tenant", async () => {
  const originalTeamFind = Team.find;
  const originalTeamMemberFind = TeamMember.find;
  const seenFilters = [];
  const tenantOneTeams = Array.from({ length: 12 }, (_, index) => ({
    _id: new mongoose.Types.ObjectId(),
    name: `Team ${index + 1}`,
    workspaceId: "legacy-workspace",
    tenantId: "TENANT_001",
  }));

  Team.find = (filter) => {
    seenFilters.push(filter);
    return {
      populate() {
        return this;
      },
      sort() {
        return {
          lean: async () => (filter.tenantId === "TENANT_001" ? tenantOneTeams : []),
        };
      },
    };
  };
  TeamMember.find = () => ({
    populate() {
      return this;
    },
    sort() {
      return {
        lean: async () => [],
      };
    },
  });

  try {
    const tenantOneResponse = await invokeController(getTeams, {
      user: {
        _id: "admin-1",
        role: "Admin",
        workspaceId: "legacy-workspace",
        tenantId: "TENANT_001",
      },
      query: {},
    });
    const tenantTwoResponse = await invokeController(getTeams, {
      user: {
        _id: "admin-2",
        role: "Admin",
        workspaceId: "legacy-workspace",
        tenantId: "TENANT_002",
      },
      query: {},
    });

    assert.equal(tenantOneResponse.payload.length, 12);
    assert.equal(tenantTwoResponse.payload.length, 0);
    assert.deepEqual(seenFilters, [
      { workspaceId: "legacy-workspace", tenantId: "TENANT_001" },
      { workspaceId: "legacy-workspace", tenantId: "TENANT_002" },
    ]);
  } finally {
    Team.find = originalTeamFind;
    TeamMember.find = originalTeamMemberFind;
  }
});

test("TENANT_002 cannot read or delete a TENANT_001 team", async () => {
  const originalTeamFindOne = Team.findOne;
  const originalTeamMemberCountDocuments = TeamMember.countDocuments;
  const teamId = new mongoose.Types.ObjectId();
  const seenFilters = [];

  Team.findOne = (filter) => {
    seenFilters.push(filter);
    return {
      populate() {
        return this;
      },
      select() {
        return this;
      },
      lean: async () => null,
    };
  };
  TeamMember.countDocuments = async () => 0;

  const req = {
    user: {
      _id: "admin-2",
      role: "Admin",
      workspaceId: "legacy-workspace",
      tenantId: "TENANT_002",
    },
    params: {
      id: String(teamId),
    },
  };

  try {
    const readResponse = createResponse();
    await assert.rejects(
      () => invokeController(getTeamById, req, readResponse),
      /Team not found/
    );
    assert.equal(readResponse.statusCode, 404);

    const deleteResponse = createResponse();
    await assert.rejects(
      () => invokeController(deleteTeam, req, deleteResponse),
      /Team not found/
    );
    assert.equal(deleteResponse.statusCode, 404);
    assert.deepEqual(seenFilters, [
      { _id: String(teamId), workspaceId: "legacy-workspace", tenantId: "TENANT_002" },
      { _id: String(teamId), workspaceId: "legacy-workspace", tenantId: "TENANT_002" },
    ]);
  } finally {
    Team.findOne = originalTeamFindOne;
    TeamMember.countDocuments = originalTeamMemberCountDocuments;
  }
});

test("TENANT_002 cannot add a TENANT_001 user to a team", async () => {
  const originalTeamFindOne = Team.findOne;
  const originalUserFindOne = User.findOne;
  const originalTeamMemberFindOne = TeamMember.findOne;
  const teamId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();
  let seenUserFilter = null;

  Team.findOne = () => ({
    populate() {
      return this;
    },
    select() {
      return this;
    },
    lean: async () => ({
      _id: teamId,
      workspaceId: "legacy-workspace",
      tenantId: "TENANT_002",
    }),
  });
  User.findOne = (filter) => {
    seenUserFilter = filter;
    return {
      select() {
        return this;
      },
      lean: async () => null,
    };
  };
  TeamMember.findOne = () => ({
    select() {
      return this;
    },
    lean: async () => null,
  });

  const res = createResponse();

  try {
    await assert.rejects(
      () =>
        invokeController(
          addTeamMember,
          {
            user: {
              _id: "admin-2",
              role: "Admin",
              workspaceId: "legacy-workspace",
              tenantId: "TENANT_002",
            },
            params: {
              id: String(teamId),
            },
            body: {
              userId: String(userId),
            },
          },
          res
        ),
      /Selected user does not belong to this workspace/
    );

    assert.equal(res.statusCode, 400);
    assert.deepEqual(seenUserFilter, {
      _id: String(userId),
      workspaceId: "legacy-workspace",
      tenantId: "TENANT_002",
    });
  } finally {
    Team.findOne = originalTeamFindOne;
    User.findOne = originalUserFindOne;
    TeamMember.findOne = originalTeamMemberFindOne;
  }
});

test("TENANT_002 team creation stamps tenantId from the authenticated user", async () => {
  const originalTeamFindOne = Team.findOne;
  const originalTeamCreate = Team.create;
  const originalTeamMemberFind = TeamMember.find;
  let createdPayload = null;
  const teamId = new mongoose.Types.ObjectId();

  Team.findOne = () => ({
    populate() {
      return this;
    },
    select() {
      return this;
    },
    lean: async () => null,
  });
  Team.create = async (payload) => {
    createdPayload = payload;
    return {
      _id: teamId,
      ...payload,
    };
  };
  TeamMember.find = () => ({
    populate() {
      return this;
    },
    sort() {
      return {
        lean: async () => [],
      };
    },
  });

  try {
    const response = await invokeController(createTeam, {
      user: {
        _id: new mongoose.Types.ObjectId(),
        role: "Admin",
        workspaceId: "legacy-workspace",
        tenantId: "TENANT_002",
      },
      body: {
        name: "Tenant Two Team",
        tenantId: "TENANT_001",
      },
    });

    assert.equal(response.statusCode, 201);
    assert.equal(createdPayload.tenantId, "TENANT_002");
    assert.equal(createdPayload.workspaceId, "legacy-workspace");
  } finally {
    Team.findOne = originalTeamFindOne;
    Team.create = originalTeamCreate;
    TeamMember.find = originalTeamMemberFind;
  }
});

test("TENANT_002 cannot attach a TENANT_001 team to a TENANT_002 project", async () => {
  const originalProjectFindOne = Project.findOne;
  const originalTeamFindOne = Team.findOne;
  const originalProjectTeamFindOne = ProjectTeam.findOne;
  const projectId = new mongoose.Types.ObjectId();
  const teamId = new mongoose.Types.ObjectId();
  let seenTeamFilter = null;

  Project.findOne = () => ({
    select() {
      return this;
    },
    lean: async () => ({
      _id: projectId,
      workspaceId: "legacy-workspace",
      tenantId: "TENANT_002",
      attachedTeams: [],
      teamIds: [],
    }),
  });
  Team.findOne = (filter) => {
    seenTeamFilter = filter;
    return {
      select() {
        return this;
      },
      lean: async () => null,
    };
  };
  ProjectTeam.findOne = () => ({
    select() {
      return this;
    },
    lean: async () => null,
  });

  const res = createResponse();

  try {
    await assert.rejects(
      () =>
        invokeController(
          attachProjectTeam,
          {
            user: {
              _id: "admin-2",
              role: "Admin",
              workspaceId: "legacy-workspace",
              tenantId: "TENANT_002",
            },
            params: {
              id: String(projectId),
            },
            body: {
              teamId: String(teamId),
            },
          },
          res
        ),
      /Selected team could not be found in this workspace/
    );

    assert.equal(res.statusCode, 404);
    assert.deepEqual(seenTeamFilter, {
      _id: String(teamId),
      workspaceId: "legacy-workspace",
      tenantId: "TENANT_002",
    });
  } finally {
    Project.findOne = originalProjectFindOne;
    Team.findOne = originalTeamFindOne;
    ProjectTeam.findOne = originalProjectTeamFindOne;
  }
});
