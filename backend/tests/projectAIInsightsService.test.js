const { test } = require("node:test");
const assert = require("node:assert");
const Epic = require("../models/Epic");
const Issue = require("../models/Issue");
const Sprint = require("../models/Sprint");
const Team = require("../models/Team");
const TeamMember = require("../models/TeamMember");
const ProjectMember = require("../models/ProjectMember");
const ProjectTeam = require("../models/ProjectTeam");
const User = require("../models/User");
const { buildProjectAIData } = require("../services/projectAIInsightsService");

const models = [Epic, Issue, Sprint, Team, TeamMember, ProjectMember, ProjectTeam, User];
const originalFind = new Map(models.map((model) => [model, model.find]));
const query = (rows) => ({ select: () => ({ lean: async () => rows }) });

test.afterEach(() => {
  models.forEach((model) => { model.find = originalFind.get(model); });
});

test("project AI aggregation remains tenant and project scoped and sends a minimal payload", async () => {
  const filters = {};
  Epic.find = (filter) => { filters.epics = filter; return query([]); };
  Issue.find = (filter) => {
    filters.issues = filter;
    return query([
      { _id: "secret-work-item-id", type: "Story", status: "DONE", storyPoints: 5 },
      { _id: "bug-id", title: "sensitive raw title", type: "Bug", status: "OPEN", priority: "Critical" },
    ]);
  };
  Sprint.find = (filter) => { filters.sprints = filter; return query([]); };
  ProjectMember.find = (filter) => { filters.members = filter; return query([]); };
  ProjectTeam.find = (filter) => { filters.projectTeams = filter; return query([]); };
  Team.find = (filter) => { filters.teams = filter; return query([{ _id: "team-a" }]); };
  TeamMember.find = (filter) => { filters.teamMembers = filter; return query([]); };
  User.find = (filter) => { filters.users = filter; return query([]); };

  const result = await buildProjectAIData({
    project: {
      _id: "project-a",
      name: "Shared project name",
      status: "Active",
      attachedTeams: ["team-a"],
      gitActivityHistory: [],
    },
    tenantId: "TENANT_A",
    now: new Date("2026-08-24T00:00:00.000Z"),
  });

  assert.deepStrictEqual(filters.epics, {
    tenantId: "TENANT_A",
    projectId: "project-a",
  });
  assert.deepStrictEqual(filters.issues, {
    tenantId: "TENANT_A",
    projectId: "project-a",
    isDeleted: { $ne: true },
  });
  assert.deepStrictEqual(filters.sprints, {
    tenantId: "TENANT_A",
    projectId: "project-a",
  });
  assert.strictEqual(filters.teams.tenantId, "TENANT_A");
  assert.strictEqual(filters.teamMembers.tenantId, "TENANT_A");
  assert.strictEqual(filters.users, undefined, "no unbounded user query should run");
  assert.deepStrictEqual(filters.members, { projectId: "project-a" });
  assert.deepStrictEqual(filters.projectTeams, { projectId: "project-a" });
  assert.strictEqual(result.metrics.projectHealth.completionRate, 50);
  assert.strictEqual(result.metrics.projectHealth.bugs.criticalOpen, 1);
  const serializedPayload = JSON.stringify(result.payload);
  assert.ok(!serializedPayload.includes("TENANT_A"), "tenant identifiers must not be sent to Bedrock");
  assert.ok(!serializedPayload.includes("secret-work-item-id"), "raw work-item ids must not be sent to Bedrock");
  assert.ok(!serializedPayload.includes("sensitive raw title"), "raw work-item content must not be sent to Bedrock");
});
