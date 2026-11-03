import test from "node:test";
import assert from "node:assert/strict";

import {
  matchesProjectName,
  normalizeProjectSearch,
} from "../src/lib/project-search.js";

test("project name search is a case-insensitive substring match", () => {
  const search = normalizeProjectSearch("B");

  assert.equal(matchesProjectName({ name: "Bug Tracking" }, search), true);
  assert.equal(matchesProjectName({ name: "backend" }, search), true);
  assert.equal(
    matchesProjectName({
      name: "Automation Testing",
      description: "B service",
      shortCode: "B",
      members: [{ name: "B User" }],
    }, search),
    false
  );
});

test("project name search handles C and trims surrounding whitespace", () => {
  const search = normalizeProjectSearch("  C  ");

  assert.equal(matchesProjectName({ name: "Clinical Management" }, search), true);
  assert.equal(matchesProjectName({ name: "curecode" }, search), true);
  assert.equal(matchesProjectName({ name: "Automation Testing" }, search), false);
});

test("empty project search matches every project name", () => {
  assert.equal(
    matchesProjectName({ name: "Automation Testing" }, normalizeProjectSearch("")),
    true
  );
  assert.equal(
    matchesProjectName({ name: "Bug Tracking" }, normalizeProjectSearch("   ")),
    true
  );
});
