process.env.NODE_ENV = "test";
process.env.SUBSCRIPTION_LIMITS_BYPASS_FOR_TESTS = "true";

const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const Project = require("../models/Project");
const ProjectMember = require("../models/ProjectMember");
const ProjectTeam = require("../models/ProjectTeam");
const Team = require("../models/Team");
const TeamMember = require("../models/TeamMember");
const Issue = require("../models/Issue");
const Epic = require("../models/Epic");
const Sprint = require("../models/Sprint");
const User = require("../models/User");
const {
  deleteIssue,
  pickIssue,
  updateIssue,
} = require("../controllers/issueController");
const { updateTaskStatus } = require("../controllers/taskController");
const {
  downloadIssueAttachment,
  getIssueAttachments,
  getIssueHistory,
  getIssueWorklogs,
} = require("../controllers/issuePlanningController");
const { getComments } = require("../controllers/commentController");
const { deleteEpic } = require("../controllers/epicController");
const { updateSprint } = require("../controllers/sprintController");
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
const { loadTenantSafeIssue } = require("../utils/issueAccess");
const { buildUsageMatch } = require("../services/aiPolicyService");

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

test("AI usage match keeps tenant one data unavailable to tenant two", () => {
  const tenantOneMatch = buildUsageMatch({
    tenantId: "TENANT_001",
    workspaceId: "workspace-1",
  });
  const tenantTwoMatch = buildUsageMatch({
    tenantId: "TENANT_002",
    workspaceId: "workspace-2",
  });

  assert.strictEqual(tenantOneMatch.tenantId, "TENANT_001");
  assert.strictEqual(tenantTwoMatch.tenantId, "TENANT_002");
  assert.notDeepStrictEqual(tenantOneMatch, tenantTwoMatch);
});

const invokeController = async (controller, req, res = createResponse()) => {
  await controller(req, res, (error) => {
    if (error) {
      throw error;
    }
  });

  return res;
};

const createQuery = (result) => ({
  select() {
    return this;
  },
  populate() {
    return this;
  },
  sort() {
    return this;
  },
  lean() {
    return this;
  },
  then(resolve, reject) {
    return Promise.resolve(result).then(resolve, reject);
  },
  catch(reject) {
    return Promise.resolve(result).catch(reject);
  },
});

const createProjectingQuery = (result) => {
  let selectedFields = null;

  const pickPath = (source, target, path) => {
    const parts = path.split(".");
    let sourceCursor = source;
    let targetCursor = target;

    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index];

      if (!sourceCursor || typeof sourceCursor !== "object" || !(part in sourceCursor)) {
        return;
      }

      if (index === parts.length - 1) {
        targetCursor[part] = sourceCursor[part];
        return;
      }

      targetCursor[part] = targetCursor[part] || {};
      sourceCursor = sourceCursor[part];
      targetCursor = targetCursor[part];
    }
  };

  const applyProjection = () => {
    if (!result || !selectedFields) {
      return result;
    }

    const projected = {};

    selectedFields
      .split(/\s+/)
      .filter(Boolean)
      .forEach((field) => pickPath(result, projected, field));

    return projected;
  };

  return {
    select(fields) {
      selectedFields = fields;
      return this;
    },
    populate() {
      return this;
    },
    sort() {
      return this;
    },
    lean() {
      return this;
    },
    then(resolve, reject) {
      return Promise.resolve(applyProjection()).then(resolve, reject);
    },
  };
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

test("tenant-safe issue loader blocks TENANT_002 and preserves TENANT_001 access", async () => {
  const originalIssueFindOne = Issue.findOne;
  const originalProjectFind = Project.find;
  const originalProjectFindOne = Project.findOne;
  const originalTeamMemberFind = TeamMember.find;
  const originalProjectMemberFind = ProjectMember.find;
  const issueId = new mongoose.Types.ObjectId();
  const projectId = new mongoose.Types.ObjectId();
  const tenantOneIssue = {
    _id: issueId,
    projectId,
    isDeleted: false,
  };

  Issue.findOne = () => createQuery(tenantOneIssue);
  Project.findOne = (filter) =>
    Promise.resolve(
      filter.tenantId === "TENANT_001" && String(filter._id) === String(projectId)
        ? {
            _id: projectId,
            workspaceId: "legacy-workspace",
            tenantId: "TENANT_001",
          }
        : null
    );

  try {
    const tenantOneIssueResult = await loadTenantSafeIssue(
      {
        _id: "admin-1",
        role: "Admin",
        workspaceId: "legacy-workspace",
        tenantId: "TENANT_001",
      },
      issueId
    );
    const tenantTwoIssueResult = await loadTenantSafeIssue(
      {
        _id: "admin-2",
        role: "Admin",
        workspaceId: "legacy-workspace",
        tenantId: "TENANT_002",
      },
      issueId
    );

    assert.equal(tenantOneIssueResult, tenantOneIssue);
    assert.equal(tenantTwoIssueResult, null);
  } finally {
    Issue.findOne = originalIssueFindOne;
    Project.findOne = originalProjectFindOne;
  }
});

test("task status preflight keeps fields required by tenant-safe issue access", async () => {
  const originalIssueFindOne = Issue.findOne;
  const originalProjectFindOne = Project.findOne;
  const originalTeamMemberFind = TeamMember.find;
  const originalProjectMemberFind = ProjectMember.find;
  const issueId = new mongoose.Types.ObjectId();
  const projectId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();
  const issue = {
    _id: issueId,
    type: "Story",
    projectId,
    assignee: userId,
    assignees: [userId],
    reporter: userId,
    bugDetails: {
      testerOwner: null,
      developerLead: null,
    },
    isDeleted: false,
  };

  Issue.findOne = () => createProjectingQuery(issue);
  Project.findOne = (filter) =>
    Promise.resolve(
      filter.tenantId === "TENANT_001" && String(filter._id) === String(projectId)
        ? {
            _id: projectId,
            workspaceId: "legacy-workspace",
            tenantId: "TENANT_001",
            teamLead: userId,
          }
        : null
    );
  TeamMember.find = () => ({
    distinct: async () => [],
  });
  ProjectMember.find = () => ({
    distinct: async () => [],
  });

  try {
    const allowedRes = createResponse();

    await assert.rejects(
      () =>
        invokeController(
          updateTaskStatus,
          {
            user: {
              _id: userId,
              id: userId,
              role: "Team Lead",
              workspaceId: "legacy-workspace",
              tenantId: "TENANT_001",
            },
            params: {
              id: String(issueId),
            },
            body: {
              status: "IN_PROGRESS",
            },
          },
          allowedRes
        ),
      /Only Task work items can be updated from the task board/
    );
    assert.equal(allowedRes.statusCode, 400);

    const deniedRes = createResponse();

    await assert.rejects(
      () =>
        invokeController(
          updateTaskStatus,
          {
            user: {
              _id: new mongoose.Types.ObjectId(),
              id: new mongoose.Types.ObjectId(),
              role: "Team Lead",
              workspaceId: "legacy-workspace",
              tenantId: "TENANT_002",
            },
            params: {
              id: String(issueId),
            },
            body: {
              status: "IN_PROGRESS",
            },
          },
          deniedRes
        ),
      /Task not found/
    );
    assert.equal(deniedRes.statusCode, 404);
  } finally {
    Issue.findOne = originalIssueFindOne;
    Project.findOne = originalProjectFindOne;
    TeamMember.find = originalTeamMemberFind;
    ProjectMember.find = originalProjectMemberFind;
  }
});

test("TENANT_002 cannot update, delete, pick, or read child issue data for TENANT_001 issue", async () => {
  const originalIssueFindOne = Issue.findOne;
  const originalProjectFind = Project.find;
  const originalProjectFindOne = Project.findOne;
  const originalTeamMemberFind = TeamMember.find;
  const originalProjectMemberFind = ProjectMember.find;
  const issueId = new mongoose.Types.ObjectId();
  const projectId = new mongoose.Types.ObjectId();

  Issue.findOne = () =>
    createQuery({
      _id: issueId,
      projectId,
      type: "Bug",
      isDeleted: false,
      status: "AVAILABLE_QUEUE",
    });
  Project.findOne = () => Promise.resolve(null);
  Project.find = () => ({
    distinct: async () => [],
  });
  TeamMember.find = () => ({
    distinct: async () => [],
  });
  ProjectMember.find = () => ({
    distinct: async () => [],
  });

  const req = {
    user: {
      _id: new mongoose.Types.ObjectId(),
      id: new mongoose.Types.ObjectId(),
      role: "Developer",
      workspaceId: "legacy-workspace",
      tenantId: "TENANT_002",
    },
    params: {
      id: String(issueId),
      issueId: String(issueId),
      attachmentId: String(new mongoose.Types.ObjectId()),
    },
    body: {
      status: "DONE",
    },
  };

  try {
    for (const controller of [
      updateIssue,
      deleteIssue,
      pickIssue,
      getComments,
      getIssueAttachments,
      getIssueWorklogs,
      getIssueHistory,
      downloadIssueAttachment,
    ]) {
      const res = createResponse();

      await assert.rejects(
        () => invokeController(controller, req, res),
        /Issue not found|inaccessible/
      );
      assert.equal(res.statusCode, 404);
    }
  } finally {
    Issue.findOne = originalIssueFindOne;
    Project.find = originalProjectFind;
    Project.findOne = originalProjectFindOne;
    TeamMember.find = originalTeamMemberFind;
    ProjectMember.find = originalProjectMemberFind;
  }
});

test("TENANT_002 cannot delete TENANT_001 epic", async () => {
  const originalEpicFindById = Epic.findById;
  const originalProjectFindOne = Project.findOne;
  const originalIssueExists = Issue.exists;
  const epicId = new mongoose.Types.ObjectId();
  const projectId = new mongoose.Types.ObjectId();

  Epic.findById = () =>
    createQuery({
      _id: epicId,
      projectId,
      name: "Tenant One Epic",
    });
  Project.findOne = () => Promise.resolve(null);
  Issue.exists = async () => null;

  const res = createResponse();

  try {
    await assert.rejects(
      () =>
        invokeController(
          deleteEpic,
          {
            user: {
              _id: new mongoose.Types.ObjectId(),
              role: "Admin",
              workspaceId: "legacy-workspace",
              tenantId: "TENANT_002",
            },
            params: {
              id: String(epicId),
            },
            body: {},
          },
          res
        ),
      /Project not found or inaccessible/
    );
    assert.equal(res.statusCode, 404);
  } finally {
    Epic.findById = originalEpicFindById;
    Project.findOne = originalProjectFindOne;
    Issue.exists = originalIssueExists;
  }
});

test("TENANT_002 cannot modify TENANT_001 sprint by id", async () => {
  const originalSprintFindById = Sprint.findById;
  const originalProjectFindOne = Project.findOne;
  const originalIssueExists = Issue.exists;
  const sprintId = new mongoose.Types.ObjectId();
  const projectId = new mongoose.Types.ObjectId();

  Sprint.findById = () =>
    createQuery({
      _id: sprintId,
      projectId,
      state: "PLANNED",
      workspaceId: "legacy-workspace",
    });
  Project.findOne = () => Promise.resolve(null);
  Issue.exists = async () => null;

  const res = createResponse();

  try {
    await assert.rejects(
      () =>
        invokeController(
          updateSprint,
          {
            user: {
              _id: "admin-2",
              role: "Admin",
              workspaceId: "legacy-workspace",
              tenantId: "TENANT_002",
            },
            params: {
              id: String(sprintId),
            },
            body: {
              name: "Cross Tenant Rename",
            },
          },
          res
        ),
      /Project not found or inaccessible/
    );
    assert.equal(res.statusCode, 404);
  } finally {
    Sprint.findById = originalSprintFindById;
    Project.findOne = originalProjectFindOne;
    Issue.exists = originalIssueExists;
  }
});
