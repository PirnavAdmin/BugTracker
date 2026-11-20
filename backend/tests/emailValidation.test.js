const test = require("node:test");
const assert = require("node:assert/strict");
const { getEmailValidationError } = require("../utils/emailValidation");

test("registration email validation accepts well-formed email addresses", () => {
  assert.equal(getEmailValidationError("person@example.com"), "");
  assert.equal(getEmailValidationError("person+tag@example.co.uk"), "");
});

test("registration email validation rejects missing, spaced, and malformed addresses", () => {
  assert.equal(getEmailValidationError(""), "Email is required");
  assert.equal(getEmailValidationError("person name@example.com"), "Email cannot contain spaces");
  assert.equal(getEmailValidationError("person@@example.com"), "Email must contain only one @ symbol");
  assert.equal(getEmailValidationError("invalid-address"), "Please enter a valid email address");
});
