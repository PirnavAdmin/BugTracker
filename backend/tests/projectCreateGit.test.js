process.env.NODE_ENV = "test";
process.env.SUBSCRIPTION_LIMITS_BYPASS_FOR_TESTS = "true";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret";

const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const Project = require("../models/Project");
const ProjectMember = require("../models/ProjectMember");
const ProjectTeam = require("../models/ProjectTeam");
const Issue = require("../models/Issue");
const { createProject } = require("../controllers/projectController");

const originalProjectExists = Project.exists;
const originalProjectFindOne = Project.findOne;
const originalProjectCreate = Project.create;
const originalProjectFindById = Project.findById;
const originalProjectTeamFind = ProjectTeam.find;
const originalProjectMemberFind = ProjectMember.find;
const originalIssueCountDocuments = Issue.countDocuments;
const originalFetch = global.fetch;

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

const invokeCreateProject = async (body) => {
  const req = {
    user: {
      _id: "admin-1",
      role: "Admin",
      workspaceId: "workspace-1",
      tenantId: "TENANT_001",
    },
    body,
  };
  const res = createResponse();

  await createProject(req, res, (error) => {
    if (error) {
      throw error;
    }
  });

  return res;
};

test.afterEach(() => {
  Project.exists = originalProjectExists;
  Project.findOne = originalProjectFindOne;
  Project.create = originalProjectCreate;
  Project.findById = originalProjectFindById;
  ProjectTeam.find = originalProjectTeamFind;
  ProjectMember.find = originalProjectMemberFind;
  Issue.countDocuments = originalIssueCountDocuments;
  global.fetch = originalFetch;
});

test("createProject reads repositoryOwner from git when both git and repository payloads are sent", async () => {
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
      git: createdPayload.git,
      repository: createdPayload.repository,
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

  global.fetch = async (url) => {
    const target = String(url);

    if (target.endsWith("/repos/PirnavAdmin/ARPPB")) {
      return new Response(
        JSON.stringify({
          permissions: { admin: true },
          pushed_at: "2026-11-11T05:00:00Z",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    if (target.endsWith("/repos/PirnavAdmin/ARPPB/branches/main")) {
      return new Response(
        JSON.stringify({
          commit: { sha: "abc1234", commit: { message: "Initial commit" } },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    if (target.includes("/repos/PirnavAdmin/ARPPB/commits/abc1234")) {
      return new Response(
        JSON.stringify({
          sha: "abc1234",
          commit: { message: "Initial commit", author: { name: "PirnavAdmin" } },
          files: [],
          stats: { additions: 1, deletions: 0 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    if (target.includes("/repos/PirnavAdmin/ARPPB/commits?")) {
      return new Response(
        JSON.stringify([
          {
            sha: "abc1234",
            commit: { message: "Initial commit", author: { name: "PirnavAdmin" } },
          },
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    if (target.endsWith("/repos/PirnavAdmin/ARPPB/hooks")) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    throw new Error(`Unexpected fetch URL: ${target}`);
  };

  const res = await invokeCreateProject({
    name: "ARPPB Project",
    description: "Project created with Git config",
    deliveryModules: [{ name: "Login" }],
    git: {
      enabled: true,
      provider: "GitHub",
      repositoryOwner: "PirnavAdmin",
      repositoryName: "ARPPB",
      repositoryUrl: "https://github.com/PirnavAdmin/ARPPB.git",
      defaultBranch: "main",
      token: "ghp_test_token",
      webhookEndpoint: "https://www.curecode.site/api/webhooks/github",
      webhookSecret: "cc_p9l1a30w",
      webhookEvents: ["push", "pull_request"],
    },
    repository: {
      enabled: true,
      provider: "GitHub",
      name: "ARPPB",
      url: "https://github.com/PirnavAdmin/ARPPB.git",
      defaultBranch: "main",
      webhookEnabled: true,
      webhookEndpoint: "https://www.curecode.site/api/webhooks/github",
      webhookSecret: "cc_p9l1a30w",
      repositoryIdentifier: "PirnavAdmin/ARPPB",
    },
  });

  assert.equal(res.statusCode, 201);
  assert.equal(createdPayload.git.repositoryOwner, "PirnavAdmin");
  assert.equal(createdPayload.git.repositoryName, "ARPPB");
  assert.equal(createdPayload.git.tokenConfigured, true);
  assert.equal(createdPayload.repository.repositoryIdentifier, "PirnavAdmin/ARPPB");
});

test("createProject rejects missing git.repositoryOwner even when repository is also present", async () => {
  Project.exists = async () => null;

  await assert.rejects(
    () =>
      invokeCreateProject({
        name: "Invalid Git Project",
        deliveryModules: [{ name: "Login" }],
        git: {
          provider: "GitHub",
          repositoryOwner: "",
          repositoryName: "ARPPB",
          repositoryUrl: "https://github.com/PirnavAdmin/ARPPB.git",
          defaultBranch: "main",
          token: "ghp_test_token",
        },
        repository: {
          provider: "GitHub",
          name: "ARPPB",
          url: "https://github.com/PirnavAdmin/ARPPB.git",
          defaultBranch: "main",
        },
      }),
    /Repository owner is required/
  );
});

test("createProject allows optional repository payload when git is omitted", async () => {
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
      git: createdPayload.git,
      repository: createdPayload.repository,
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

  const res = await invokeCreateProject({
    name: "No Git Project",
    deliveryModules: [{ name: "Login" }],
    repository: {
      enabled: true,
      provider: "GitHub",
      name: "",
      url: "",
      defaultBranch: "main",
      webhookEnabled: true,
      webhookEndpoint: "https://www.curecode.site/api/webhooks/github",
      webhookSecret: "cc_p9l1a30w",
      repositoryIdentifier: "",
    },
  });

  assert.equal(res.statusCode, 201);
  assert.equal(createdPayload.repository.name, "");
  assert.equal(createdPayload.git.enabled, false);
});

const stubProjectCreateWithoutGitHubCalls = () => {
  const projectId = new mongoose.Types.ObjectId();
  let createdPayload = null;
  let fetchCalled = false;

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
      git: createdPayload.git,
      repository: createdPayload.repository,
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
  global.fetch = async () => {
    fetchCalled = true;
    throw new Error("GitHub API should not be called when Git configuration is skipped");
  };

  return {
    getCreatedPayload: () => createdPayload,
    wasFetchCalled: () => fetchCalled,
  };
};

for (const testCase of [
  {
    name: "createProject succeeds with git.enabled=false and omits repository verification",
    git: { enabled: false },
  },
  {
    name: "createProject ignores autofilled token when git.enabled=false",
    git: { enabled: false, token: "autofilled-password" },
  },
  {
    name: "createProject succeeds with an empty git object and persists git.enabled=false",
    git: {},
  },
  {
    name: "createProject skips validation when git.enabled=true but all git inputs are empty",
    git: {
      enabled: true,
      repositoryOwner: "",
      repositoryName: "",
      repositoryUrl: "",
      token: "",
    },
  },
]) {
  test(testCase.name, async () => {
    const tracker = stubProjectCreateWithoutGitHubCalls();

    const res = await invokeCreateProject({
      name: `Optional Git Project - ${testCase.name}`,
      deliveryModules: [{ name: "Login" }],
      git: testCase.git,
    });

    const createdPayload = tracker.getCreatedPayload();
    assert.equal(res.statusCode, 201);
    assert.equal(tracker.wasFetchCalled(), false);
    assert.equal(createdPayload.git.enabled, false);
    assert.equal(createdPayload.repository.enabled, false);
    assert.equal(createdPayload.repository.webhookEnabled, false);
  });
}
