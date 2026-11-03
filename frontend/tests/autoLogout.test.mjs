import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_INACTIVITY_TIMEOUT_MS,
  LAST_ACTIVITY_STORAGE_KEY,
  clearLastActivity,
  getInactivityTimeoutMs,
  getLastActivity,
  isSessionInactive,
  recordLastActivity,
} from "../src/lib/session.js";

const mockStorage = new Map();
globalThis.window = {
  localStorage: {
    getItem: (key) => mockStorage.get(key) || null,
    setItem: (key, val) => mockStorage.set(key, String(val)),
    removeItem: (key) => mockStorage.delete(key),
    clear: () => mockStorage.clear(),
  },
  sessionStorage: {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  },
};

test("default inactivity timeout is 30 minutes", () => {
  assert.equal(DEFAULT_INACTIVITY_TIMEOUT_MS, 30 * 60 * 1000);
  assert.equal(getInactivityTimeoutMs(), 30 * 60 * 1000);
});

test("records and reads last activity timestamp correctly", () => {
  mockStorage.clear();
  const testTime = 1700000000000;
  recordLastActivity(testTime);

  assert.equal(getLastActivity(), testTime);
  assert.equal(mockStorage.get(LAST_ACTIVITY_STORAGE_KEY), String(testTime));
});

test("isSessionInactive detects inactive vs active state", () => {
  mockStorage.clear();
  const now = Date.now();
  const timeoutMs = 30 * 60 * 1000;

  // Active (activity 5 minutes ago)
  recordLastActivity(now - 5 * 60 * 1000);
  assert.equal(isSessionInactive(timeoutMs), false);

  // Inactive (activity 31 minutes ago)
  recordLastActivity(now - 31 * 60 * 1000);
  assert.equal(isSessionInactive(timeoutMs), true);

  // Exactly at threshold (30 minutes ago)
  recordLastActivity(now - 30 * 60 * 1000);
  assert.equal(isSessionInactive(timeoutMs), true);
});

test("clearLastActivity removes timestamp from storage", () => {
  mockStorage.clear();
  recordLastActivity(Date.now());
  assert.ok(mockStorage.has(LAST_ACTIVITY_STORAGE_KEY));

  clearLastActivity();
  assert.equal(mockStorage.has(LAST_ACTIVITY_STORAGE_KEY), false);
});
