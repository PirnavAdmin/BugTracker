const test = require("node:test");
const assert = require("node:assert/strict");
const { buildTaskImportSampleRows } = require("../controllers/issueController");

test("task import samples repeat every team member for every active epic", () => {
  const rows = buildTaskImportSampleRows({
    projectNames: ["Demo project"],
    teamsByProjectName: new Map([["Demo project", ["Delivery"]]]),
    assigneesByTeamName: new Map([["Delivery", ["Alex", "Bina"]]]),
    epicsByProjectName: new Map([["Demo project", ["API", "Mobile"]]]),
    storiesByProjectName: new Map(),
  });

  assert.equal(rows.length, 4);
  assert.deepEqual(
    rows.filter((row) => row.epic === "API").map((row) => row.assignee).sort(),
    ["Alex", "Bina"]
  );
  assert.deepEqual(
    rows.filter((row) => row.epic === "Mobile").map((row) => row.assignee).sort(),
    ["Alex", "Bina"]
  );
});

test("task import samples keep a blank optional epic when no active epics exist", () => {
  const rows = buildTaskImportSampleRows({
    projectNames: ["Demo project"],
    teamsByProjectName: new Map([["Demo project", ["Delivery"]]]),
    assigneesByTeamName: new Map([["Delivery", ["Alex", "Bina"]]]),
    epicsByProjectName: new Map(),
    storiesByProjectName: new Map(),
  });

  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => row.epic), ["", ""]);
  assert.deepEqual(rows.map((row) => row.assignee).sort(), ["Alex", "Bina"]);
});
