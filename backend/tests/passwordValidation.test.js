const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getStrongPasswordValidationMessage,
} = require("../utils/passwordValidation");

test("strong password validation requires every password criterion", () => {
  assert.match(getStrongPasswordValidationMessage(""), /at least 8 characters/);
  assert.match(getStrongPasswordValidationMessage("lowercase1!"), /uppercase letter/);
  assert.match(getStrongPasswordValidationMessage("UPPERCASE1!"), /lowercase letter/);
  assert.match(getStrongPasswordValidationMessage("StrongPass!"), /a number/);
  assert.match(getStrongPasswordValidationMessage("StrongPass1"), /special character/);
  assert.match(getStrongPasswordValidationMessage("StrongPass1 "), /special character/);
  assert.equal(getStrongPasswordValidationMessage("StrongPass1!"), "");
});
