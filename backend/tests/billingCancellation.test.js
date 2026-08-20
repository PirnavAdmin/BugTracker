const test = require("node:test");
const assert = require("node:assert/strict");
const { getCancelAtCycleEnd } = require("../controllers/billingController");

test("pending Razorpay subscriptions cancel immediately before a billing cycle exists", () => {
  assert.equal(getCancelAtCycleEnd({ status: "PENDING", providerStatus: "created" }), false);
  assert.equal(getCancelAtCycleEnd({ status: "PENDING", providerStatus: "authenticated" }), false);
});

test("active subscriptions cancel at period end only with a known billing period", () => {
  assert.equal(getCancelAtCycleEnd({ status: "ACTIVE", currentPeriodEnd: new Date() }), true);
  assert.equal(getCancelAtCycleEnd({ status: "ACTIVE", currentPeriodEnd: null }), false);
  assert.equal(getCancelAtCycleEnd({ status: "CANCELLED", currentPeriodEnd: new Date() }), false);
});
