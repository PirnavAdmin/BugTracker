process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const Issue = require("../models/Issue");
const IssueHistory = require("../models/IssueHistory");
const Project = require("../models/Project");
const ProjectMember = require("../models/ProjectMember");
const ProjectTeam = require("../models/ProjectTeam");
const TeamMember = require("../models/TeamMember");
const { deleteIssue } = require("../controllers/issueController");
const {
  ROLE_ADMIN,
  ROLE_MANAGER,
  ROLE_TEAM_LEAD,
  ROLE_QA_LEAD,
  ROLE_DEVELOPER,
} = require("../utils/roles");

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

const createQuery = (result) => ({
  select() {
    return this;
  },
  populate() {
    return this;
  },
  lean() {
    return this;
  },
  distinct() {
    return Promise.resolve([]);
  },
  then(resolve, reject) {
    return Promise.resolve(result).then(resolve, reject);
  },
  catch(reject) {
    return Promise.resolve(result).catch(reject);
  },
});

let originalFindOne;
let originalProjectFindOne;
let originalTeamMemberFind;
let originalProjectMemberFind;
let originalProjectTeamFind;

test.beforeEach(() => {
  IssueHistory.create = async () => [{}];
  originalFindOne = Issue.findOne;
  originalProjectFindOne = Project.findOne;
  originalTeamMemberFind = TeamMember.find;
  originalProjectMemberFind = ProjectMember.find;
  originalProjectTeamFind = ProjectTeam.find;

  TeamMember.find = () => createQuery([]);
  ProjectMember.find = () => createQuery([]);
  ProjectTeam.find = () => createQuery([]);
});

test.afterEach(() => {
  Issue.findOne = originalFindOne;
  Project.findOne = originalProjectFindOne;
  TeamMember.find = originalTeamMemberFind;
  ProjectMember.find = originalProjectMemberFind;
  ProjectTeam.find = originalProjectTeamFind;
});

test("Team Lead can delete an unassigned task they created", async () => {
  const leadId = new mongoose.Types.ObjectId();
  const projectId = new mongoose.Types.ObjectId();
  const issueId = new mongoose.Types.ObjectId();

  const mockIssue = {
    _id: issueId,
    type: "Task",
    reporter: leadId,
    assignee: null,
    assignees: [],
    assignedDeveloperId: null,
    isDeleted: false,
    projectId,
    tenantId: "TENANT_001",
    save: async function () {
      return this;
    },
  };

  Issue.findOne = () => createQuery(mockIssue);
  Project.findOne = () => createQuery({ _id: projectId, tenantId: "TENANT_001" });

  const req = {
    params: { id: String(issueId) },
    user: {
      _id: leadId,
      role: ROLE_TEAM_LEAD,
      tenantId: "TENANT_001",
      name: "Team Lead",
    },
  };

  const res = createResponse();
  await invokeController(deleteIssue, req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(mockIssue.isDeleted, true);
});

test("Team Lead cannot delete an unassigned task created by another user", async () => {
  const leadId = new mongoose.Types.ObjectId();
  const otherUserId = new mongoose.Types.ObjectId();
  const projectId = new mongoose.Types.ObjectId();
  const issueId = new mongoose.Types.ObjectId();

  const mockIssue = {
    _id: issueId,
    type: "Task",
    reporter: otherUserId,
    assignee: null,
    assignees: [],
    assignedDeveloperId: null,
    isDeleted: false,
    projectId,
    tenantId: "TENANT_001",
  };

  Issue.findOne = () => createQuery(mockIssue);
  Project.findOne = () => createQuery({ _id: projectId, tenantId: "TENANT_001" });

  const req = {
    params: { id: String(issueId) },
    user: {
      _id: leadId,
      role: ROLE_TEAM_LEAD,
      tenantId: "TENANT_001",
      name: "Team Lead",
    },
  };

  const res = createResponse();
  await assert.rejects(
    () => invokeController(deleteIssue, req, res),
    /not authorized to delete this work item/
  );
  assert.equal(res.statusCode, 403);
});

test("Team Lead can delete a task they created even if someone is assigned to it", async () => {
  const leadId = new mongoose.Types.ObjectId();
  const devId = new mongoose.Types.ObjectId();
  const projectId = new mongoose.Types.ObjectId();
  const issueId = new mongoose.Types.ObjectId();

  const mockIssue = {
    _id: issueId,
    type: "Task",
    reporter: leadId,
    assignee: devId,
    assignees: [devId],
    assignedDeveloperId: devId,
    isDeleted: false,
    projectId,
    tenantId: "TENANT_001",
    save: async function () {
      return this;
    },
  };

  Issue.findOne = () => createQuery(mockIssue);
  Project.findOne = () => createQuery({ _id: projectId, tenantId: "TENANT_001" });

  const req = {
    params: { id: String(issueId) },
    user: {
      _id: leadId,
      role: ROLE_TEAM_LEAD,
      tenantId: "TENANT_001",
      name: "Team Lead",
    },
  };

  const res = createResponse();
  await invokeController(deleteIssue, req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(mockIssue.isDeleted, true);
});

test("QA Lead can delete an unassigned task they created", async () => {
  const qaId = new mongoose.Types.ObjectId();
  const projectId = new mongoose.Types.ObjectId();
  const issueId = new mongoose.Types.ObjectId();

  const mockIssue = {
    _id: issueId,
    type: "Task",
    reporter: qaId,
    assignee: null,
    assignees: [],
    assignedDeveloperId: null,
    isDeleted: false,
    projectId,
    tenantId: "TENANT_001",
    save: async function () {
      return this;
    },
  };

  Issue.findOne = () => createQuery(mockIssue);
  Project.findOne = () => createQuery({ _id: projectId, tenantId: "TENANT_001" });

  const req = {
    params: { id: String(issueId) },
    user: {
      _id: qaId,
      role: ROLE_QA_LEAD,
      tenantId: "TENANT_001",
      name: "QA Lead",
    },
  };

  const res = createResponse();
  await invokeController(deleteIssue, req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(mockIssue.isDeleted, true);
});

test("QA Lead can delete a task they created even if someone is assigned to it", async () => {
  const qaId = new mongoose.Types.ObjectId();
  const devId = new mongoose.Types.ObjectId();
  const projectId = new mongoose.Types.ObjectId();
  const issueId = new mongoose.Types.ObjectId();

  const mockIssue = {
    _id: issueId,
    type: "Task",
    reporter: qaId,
    assignee: devId,
    assignees: [devId],
    assignedDeveloperId: devId,
    isDeleted: false,
    projectId,
    tenantId: "TENANT_001",
    save: async function () {
      return this;
    },
  };

  Issue.findOne = () => createQuery(mockIssue);
  Project.findOne = () => createQuery({ _id: projectId, tenantId: "TENANT_001" });

  const req = {
    params: { id: String(issueId) },
    user: {
      _id: qaId,
      role: ROLE_QA_LEAD,
      tenantId: "TENANT_001",
      name: "QA Lead",
    },
  };

  const res = createResponse();
  await invokeController(deleteIssue, req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(mockIssue.isDeleted, true);
});

test("Tester can delete a bug they reported even after picked/assigned", async () => {
  const testerId = new mongoose.Types.ObjectId();
  const devId = new mongoose.Types.ObjectId();
  const projectId = new mongoose.Types.ObjectId();
  const issueId = new mongoose.Types.ObjectId();

  const mockIssue = {
    _id: issueId,
    type: "Bug",
    status: "IN_PROGRESS",
    reporter: testerId,
    assignee: devId,
    bugDetails: {
      testerOwner: testerId,
      developerLead: devId,
    },
    isDeleted: false,
    projectId,
    tenantId: "TENANT_001",
    save: async function () {
      return this;
    },
  };

  Issue.findOne = () => createQuery(mockIssue);
  Project.findOne = () => createQuery({ _id: projectId, tenantId: "TENANT_001" });

  const req = {
    params: { id: String(issueId) },
    user: {
      _id: testerId,
      role: "Tester",
      tenantId: "TENANT_001",
      name: "Tester",
    },
  };

  const res = createResponse();
  await invokeController(deleteIssue, req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(mockIssue.isDeleted, true);
});

test("QA Lead can delete a bug they reported even after picked/assigned", async () => {
  const qaId = new mongoose.Types.ObjectId();
  const devId = new mongoose.Types.ObjectId();
  const projectId = new mongoose.Types.ObjectId();
  const issueId = new mongoose.Types.ObjectId();

  const mockIssue = {
    _id: issueId,
    type: "Bug",
    status: "ASSIGNED",
    reporter: qaId,
    assignee: devId,
    bugDetails: {
      testerOwner: qaId,
      developerLead: devId,
    },
    isDeleted: false,
    projectId,
    tenantId: "TENANT_001",
    save: async function () {
      return this;
    },
  };

  Issue.findOne = () => createQuery(mockIssue);
  Project.findOne = () => createQuery({ _id: projectId, tenantId: "TENANT_001" });

  const req = {
    params: { id: String(issueId) },
    user: {
      _id: qaId,
      role: ROLE_QA_LEAD,
      tenantId: "TENANT_001",
      name: "QA Lead",
    },
  };

  const res = createResponse();
  await invokeController(deleteIssue, req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(mockIssue.isDeleted, true);
});

test("Developer cannot delete an unassigned task even if they created it", async () => {
  const devId = new mongoose.Types.ObjectId();
  const projectId = new mongoose.Types.ObjectId();
  const issueId = new mongoose.Types.ObjectId();

  const mockIssue = {
    _id: issueId,
    type: "Task",
    reporter: devId,
    assignee: null,
    assignees: [],
    assignedDeveloperId: null,
    isDeleted: false,
    projectId,
    tenantId: "TENANT_001",
  };

  Issue.findOne = () => createQuery(mockIssue);
  Project.findOne = () => createQuery({ _id: projectId, tenantId: "TENANT_001" });

  const req = {
    params: { id: String(issueId) },
    user: {
      _id: devId,
      role: ROLE_DEVELOPER,
      tenantId: "TENANT_001",
      name: "Dev",
    },
  };

  const res = createResponse();
  await assert.rejects(
    () => invokeController(deleteIssue, req, res),
    /not authorized to delete this work item/
  );
  assert.equal(res.statusCode, 403);
});
