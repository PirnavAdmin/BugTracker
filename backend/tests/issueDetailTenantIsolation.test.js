process.env.NODE_ENV = "test";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const Issue = require("../models/Issue");
const Project = require("../models/Project");
const { getIssueById } = require("../controllers/issueController");

const createResponse = () => ({
  statusCode: 200,
  payload: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(payload) {
    this.payload = payload;
    return this;
  },
});

const invoke = async (controller, req, res) => {
  await controller(req, res, (error) => {
    if (error) throw error;
  });
};

test("issue detail remains protected by authenticated tenant project access", async () => {
  const originalIssueFindOne = Issue.findOne;
  const originalProjectFindOne = Project.findOne;
  const issueId = new mongoose.Types.ObjectId();
  const projectId = new mongoose.Types.ObjectId();
  const issue = {
    _id: issueId,
    projectId,
    type: "Task",
    title: "Tenant one task",
    status: "TODO",
    priority: "Medium",
    reporter: "tenant-one-user",
    isDeleted: false,
    async populate() {
      return this;
    },
  };

  Issue.findOne = () => ({
    then(resolve, reject) {
      return Promise.resolve(issue).then(resolve, reject);
    },
  });
  Project.findOne = (filter) =>
    Promise.resolve(
      filter.tenantId === "TENANT_001" && String(filter._id) === String(projectId)
        ? { _id: projectId, tenantId: "TENANT_001", workspaceId: "workspace-1" }
        : null
    );

  try {
    const allowedResponse = createResponse();
    await invoke(
      getIssueById,
      {
        user: {
          _id: "tenant-one-user",
          role: "Admin",
          tenantId: "TENANT_001",
          workspaceId: "workspace-1",
        },
        params: { id: String(issueId) },
      },
      allowedResponse
    );
    assert.equal(allowedResponse.statusCode, 200);
    assert.equal(allowedResponse.payload.title, "Tenant one task");

    const deniedResponse = createResponse();
    await assert.rejects(
      () =>
        invoke(
          getIssueById,
          {
            user: {
              _id: "tenant-two-user",
              role: "Admin",
              tenantId: "TENANT_002",
              workspaceId: "workspace-2",
            },
            params: { id: String(issueId) },
          },
          deniedResponse
        ),
      /Issue not found/
    );
    assert.equal(deniedResponse.statusCode, 404);
  } finally {
    Issue.findOne = originalIssueFindOne;
    Project.findOne = originalProjectFindOne;
  }
});
