import test from "node:test";
import assert from "node:assert/strict";

import {
  canDeleteTaskForUser,
  canDeleteBugForUser,
  canDeleteIssueForUser,
  ROLE_ADMIN,
  ROLE_MANAGER,
  ROLE_TEAM_LEAD,
  ROLE_QA_LEAD,
  ROLE_DEVELOPER,
  ROLE_TESTER,
} from "../src/lib/roles.js";

const leadUser = {
  _id: "user-lead-1",
  name: "Team Lead",
  role: ROLE_TEAM_LEAD,
};

const qaLeadUser = {
  _id: "user-qa-1",
  name: "QA Lead",
  role: ROLE_QA_LEAD,
};

const testerUser = {
  _id: "user-tester-1",
  name: "Tester",
  role: ROLE_TESTER,
};

const devUser = {
  _id: "user-dev-1",
  name: "Developer",
  role: ROLE_DEVELOPER,
};

const adminUser = {
  _id: "user-admin-1",
  name: "Admin",
  role: ROLE_ADMIN,
};

test("Team Lead can delete an unassigned task they created", () => {
  const task = {
    _id: "task-1",
    type: "Task",
    reporter: "user-lead-1",
    assignee: null,
    assignees: [],
  };

  assert.equal(canDeleteTaskForUser(task, leadUser), true);
});

test("Team Lead cannot delete a task created by someone else", () => {
  const task = {
    _id: "task-2",
    type: "Task",
    reporter: "user-other",
    assignee: null,
    assignees: [],
  };

  assert.equal(canDeleteTaskForUser(task, leadUser), false);
});

test("Team Lead can delete a task they created even if someone is assigned", () => {
  const assignedTask = {
    _id: "task-3",
    type: "Task",
    reporter: "user-lead-1",
    assignee: "user-dev-1",
    assignees: ["user-dev-1"],
  };

  assert.equal(canDeleteTaskForUser(assignedTask, leadUser), true);
});

test("Q/A Lead can delete a task they created even if assigned to someone", () => {
  const task = {
    _id: "task-4",
    type: "Task",
    reporter: { _id: "user-qa-1", name: "QA Lead" },
    assignee: { _id: "user-dev-1", name: "Dev" },
    assignees: ["user-dev-1"],
  };

  assert.equal(canDeleteTaskForUser(task, qaLeadUser), true);
});

test("Q/A Lead cannot delete a task created by someone else", () => {
  const task = {
    _id: "task-5",
    type: "Task",
    reporter: { _id: "user-other", name: "Other" },
    assignee: null,
    assignees: [],
  };

  assert.equal(canDeleteTaskForUser(task, qaLeadUser), false);
});

test("Q/A Lead can delete a bug they reported even after assigned", () => {
  const bug = {
    _id: "bug-1",
    type: "Bug",
    reporter: "user-qa-1",
    assignee: { _id: "user-dev-1", name: "Dev" },
    bugDetails: {
      testerOwner: "user-qa-1",
      developerLead: "user-dev-1",
    },
  };

  assert.equal(canDeleteBugForUser(bug, qaLeadUser), true);
});

test("Tester can delete a bug they reported even after picked/assigned", () => {
  const bug = {
    _id: "bug-2",
    type: "Bug",
    reporter: "user-tester-1",
    assignee: "user-dev-1",
    bugDetails: {
      testerOwner: "user-tester-1",
      developerLead: "user-dev-1",
    },
  };

  assert.equal(canDeleteBugForUser(bug, testerUser), true);
});

test("Tester cannot delete a bug reported by someone else", () => {
  const bug = {
    _id: "bug-3",
    type: "Bug",
    reporter: "user-other",
    bugDetails: {
      testerOwner: "user-other",
    },
  };

  assert.equal(canDeleteBugForUser(bug, testerUser), false);
});

test("Developer cannot delete tasks even if created by them", () => {
  const task = {
    _id: "task-7",
    type: "Task",
    reporter: "user-dev-1",
    assignee: null,
    assignees: [],
  };

  assert.equal(canDeleteTaskForUser(task, devUser), false);
});

test("Admin can delete any task regardless of creator or assignment", () => {
  const assignedTask = {
    _id: "task-8",
    type: "Task",
    reporter: "someone-else",
    assignee: "user-dev-1",
  };

  assert.equal(canDeleteTaskForUser(assignedTask, adminUser), true);
  assert.equal(canDeleteIssueForUser(assignedTask, adminUser), true);
});
