import test from "node:test";
import assert from "node:assert/strict";

import { getEmailValidationError } from "../src/lib/emailValidation.js";

test("email validation requires an address with a valid format", () => {
  assert.equal(getEmailValidationError(""), "Email is required");
  assert.equal(getEmailValidationError("person@example.com"), "");
  assert.equal(getEmailValidationError("person+tag@example.co.uk"), "");
  assert.equal(getEmailValidationError("invalid-address"), "Please enter a valid email address");
});

test("email validation rejects spaces and multiple at symbols", () => {
  assert.equal(
    getEmailValidationError("person name@example.com"),
    "Email cannot contain spaces"
  );
  assert.equal(getEmailValidationError(" person@example.com"), "Email cannot contain spaces");
  assert.equal(getEmailValidationError("person@example.com "), "Email cannot contain spaces");
  assert.equal(
    getEmailValidationError("person@@example.com"),
    "Email must contain only one @ symbol"
  );
});
