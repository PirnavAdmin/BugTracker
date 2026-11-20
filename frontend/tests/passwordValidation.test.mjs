import test from "node:test";
import assert from "node:assert/strict";

import {
  getPasswordStrength,
  getPasswordValidationError,
} from "../src/lib/passwordValidation.js";

test("password validation requires all strong-password criteria", () => {
  assert.match(getPasswordValidationError(""), /at least 8 characters/);
  assert.match(getPasswordValidationError("lowercase1!"), /uppercase letter/);
  assert.match(getPasswordValidationError("UPPERCASE1!"), /lowercase letter/);
  assert.match(getPasswordValidationError("StrongPass!"), /a number/);
  assert.match(getPasswordValidationError("StrongPass1"), /special character/);
  assert.match(getPasswordValidationError("StrongPass1 "), /special character/);
  assert.equal(getPasswordValidationError("StrongPass1!"), "");
});

test("password strength reflects requirements as the password changes", () => {
  assert.equal(getPasswordStrength("abc").label, "Weak");
  assert.equal(getPasswordStrength("Strongpass").label, "Medium");
  assert.equal(getPasswordStrength("StrongPass1!").label, "Strong");
});
