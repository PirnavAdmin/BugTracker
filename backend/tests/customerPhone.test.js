const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeCashfreeCustomerPhone,
} = require("../utils/customerPhone");

test("normalizes common Indian phone formats for Cashfree", () => {
  const cases = [
    ["9876543210", "9876543210"],
    ["+919876543210", "9876543210"],
    ["919876543210", "9876543210"],
    ["09876543210", "9876543210"],
    ["+91 (98765) 43210", "9876543210"],
    ["98765-43210", "9876543210"],
  ];

  for (const [input, expected] of cases) {
    assert.equal(normalizeCashfreeCustomerPhone(input), expected);
  }
});

test("preserves valid international phones in E.164-style form", () => {
  assert.equal(normalizeCashfreeCustomerPhone("+1 (415) 555-2671"), "+14155552671");
  assert.equal(normalizeCashfreeCustomerPhone("442071838750"), "+442071838750");
});

test("rejects missing, malformed, and duplicated-country-code phones", () => {
  for (const value of [
    "",
    null,
    undefined,
    "phone 9876543210",
    "12345",
    "+91919876543210",
    "+911234567890",
    "0911234567890",
    "+91+9876543210",
  ]) {
    assert.equal(normalizeCashfreeCustomerPhone(value), "");
  }
});
