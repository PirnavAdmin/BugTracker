import test from "node:test";
import assert from "node:assert/strict";

import { formatDate, formatDateTime } from "../src/lib/utils.js";

test("formatDate uses day short-month year", () => {
  assert.equal(
    formatDate("2026-05-20T12:00:00.000Z", { timeZone: "UTC" }),
    "20 May 2026"
  );
});

test("formatDateTime keeps the shared date format", () => {
  assert.equal(
    formatDateTime("2026-05-20T15:30:00.000Z", { timeZone: "UTC" }),
    "20 May 2026, 03:30 PM"
  );
});
