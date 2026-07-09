import test from "node:test";
import assert from "node:assert/strict";

import {
  getProjectTeamMembers,
  getProjectTeams,
} from "../src/lib/project-teams.js";

test("getProjectTeams falls back to attachedTeams when teams are not present", () => {
  const teams = getProjectTeams({
    attachedTeams: [
      { _id: "team-qa", name: "Q/A team" },
      { _id: "team-dev", name: "dev-1" },
    ],
  });

  assert.deepEqual(
    teams.map((team) => team.name),
    ["dev-1", "Q/A team"]
  );
});

test("getProjectTeamMembers includes direct project members for task assignment", () => {
  const members = getProjectTeamMembers(
    {
      teams: [
        {
          _id: "team-dev",
          name: "Developers",
          members: [{ _id: "user-team", name: "Team Member", role: "Developer" }],
        },
      ],
      projectMembers: [
        {
          _id: "membership-1",
          role: "Developer",
          user: {
            _id: "user-project",
            name: "Project Member",
            role: "Developer",
          },
        },
      ],
    },
    "team-dev"
  );

  assert.deepEqual(
    members.map((member) => member.name),
    ["Project Member", "Team Member"]
  );
});
