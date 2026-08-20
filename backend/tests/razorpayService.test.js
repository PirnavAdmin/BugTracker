const test = require("node:test");
const assert = require("node:assert/strict");

const servicePath = require.resolve("../services/razorpayService");
const razorpayPath = require.resolve("razorpay");
const originalRazorpay = require("razorpay");
const originalMode = process.env.RAZORPAY_MODE;
const originalKeyId = process.env.RAZORPAY_KEY_ID;
const originalKeySecret = process.env.RAZORPAY_KEY_SECRET;

const loadServiceWithProviderError = (providerError, method) => {
  class FakeRazorpay {
    constructor() {
      this.subscriptions = {
        create: async () => { throw providerError; },
        fetch: async () => { throw providerError; },
        cancel: async () => { throw providerError; },
      };
    }
  }
  require.cache[razorpayPath].exports = FakeRazorpay;
  delete require.cache[servicePath];
  return require("../services/razorpayService")[method];
};

test("Razorpay provider failures are safely diagnosed and normalized", async () => {
  process.env.RAZORPAY_MODE = "test";
  process.env.RAZORPAY_KEY_ID = "rzp_test_public";
  process.env.RAZORPAY_KEY_SECRET = "rzp_secret_must_not_be_logged";
  const providerError = {
    statusCode: 400,
    error: { code: "BAD_REQUEST_ERROR", description: "Invalid plan", source: "business", reason: "input_validation_error", field: "plan_id" },
    config: { headers: { Authorization: "Basic should-never-appear" }, key_secret: process.env.RAZORPAY_KEY_SECRET },
  };
  const originalError = console.error;
  const logs = [];
  console.error = (...args) => logs.push(args);
  try {
    for (const [method, args] of [["createSubscription", [{ plan_id: "plan_test" }]], ["fetchSubscription", ["sub_test"]], ["cancelSubscription", ["sub_test", true]]]) {
      const call = loadServiceWithProviderError(providerError, method);
      await assert.rejects(() => call(...args), (error) => {
        assert.equal(error.code, "BILLING_PROVIDER_ERROR");
        assert.equal(error.message, "The billing provider could not complete this request.");
        assert.equal(error.status, 400);
        return true;
      });
    }
    const serializedLogs = JSON.stringify(logs);
    assert.equal(serializedLogs.includes(process.env.RAZORPAY_KEY_SECRET), false);
    assert.equal(serializedLogs.includes("Authorization"), false);
    assert.deepEqual(logs[0][1], { operation: "createSubscription", statusCode: 400, errorCode: "BAD_REQUEST_ERROR", description: "Invalid plan", source: "business", reason: "input_validation_error", field: "plan_id" });
  } finally {
    console.error = originalError;
    require.cache[razorpayPath].exports = originalRazorpay;
    delete require.cache[servicePath];
    if (originalMode === undefined) delete process.env.RAZORPAY_MODE; else process.env.RAZORPAY_MODE = originalMode;
    if (originalKeyId === undefined) delete process.env.RAZORPAY_KEY_ID; else process.env.RAZORPAY_KEY_ID = originalKeyId;
    if (originalKeySecret === undefined) delete process.env.RAZORPAY_KEY_SECRET; else process.env.RAZORPAY_KEY_SECRET = originalKeySecret;
  }
});
