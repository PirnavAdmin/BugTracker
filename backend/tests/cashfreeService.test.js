const test = require("node:test");
const assert = require("node:assert/strict");

const configPath = require.resolve("../config/cashfree");
const sdkPath = require.resolve("cashfree-pg");
const servicePath = require.resolve("../services/payment/cashfreeService");
const originalConfigCache = require.cache[configPath];
const originalSdkCache = require.cache[sdkPath];
const originalEnvironment = process.env.CASHFREE_ENV;
const originalAppId = process.env.CASHFREE_APP_ID;
const originalSecretKey = process.env.CASHFREE_SECRET_KEY;

process.env.CASHFREE_ENV = "sandbox";
process.env.CASHFREE_APP_ID = "cashfree_test_app_id";
process.env.CASHFREE_SECRET_KEY = "cashfree_secret_must_not_appear";

const startupLogs = [];
const originalLog = console.log;
console.log = (...args) => startupLogs.push(args);
delete require.cache[configPath];
const cashfreeConfig = require("../config/cashfree");
console.log = originalLog;

let createSubscriptionImpl;
let fetchSubscriptionImpl;
let clientInitialization;
let lastCreateCall;
let lastFetchCall;

class FakeCashfree {
  constructor(environment, appId, secretKey) {
    clientInitialization = { environment, appId, secretKey };
  }

  async SubsCreateSubscription(...args) {
    lastCreateCall = args;
    return createSubscriptionImpl(...args);
  }

  async SubsFetchSubscription(...args) {
    lastFetchCall = args;
    return fetchSubscriptionImpl(...args);
  }
}

const fakeEnvironment = { SANDBOX: 1, PRODUCTION: 2 };
require.cache[sdkPath] = {
  id: sdkPath,
  filename: sdkPath,
  loaded: true,
  exports: { Cashfree: FakeCashfree, CFEnvironment: fakeEnvironment },
};
delete require.cache[servicePath];
const cashfreeService = require("../services/payment/cashfreeService");

const baseInput = (overrides = {}) => ({
  tenantId: "TENANT_001",
  userId: "user_001",
  customer: {
    name: "CureCode Customer",
    email: "customer@example.com",
    phone: "9999999999",
  },
  planId: "starter",
  billingCycle: "monthly",
  amount: 799,
  currency: "INR",
  returnUrl: "https://example.com/billing/return",
  reference: "curecode_sub_001",
  ...overrides,
});

test.after(() => {
  delete require.cache[servicePath];
  if (originalConfigCache) require.cache[configPath] = originalConfigCache;
  else delete require.cache[configPath];
  if (originalSdkCache) require.cache[sdkPath] = originalSdkCache;
  else delete require.cache[sdkPath];

  if (originalEnvironment === undefined) delete process.env.CASHFREE_ENV;
  else process.env.CASHFREE_ENV = originalEnvironment;
  if (originalAppId === undefined) delete process.env.CASHFREE_APP_ID;
  else process.env.CASHFREE_APP_ID = originalAppId;
  if (originalSecretKey === undefined) delete process.env.CASHFREE_SECRET_KEY;
  else process.env.CASHFREE_SECRET_KEY = originalSecretKey;
});

test.beforeEach(() => {
  lastCreateCall = undefined;
  lastFetchCall = undefined;
  createSubscriptionImpl = async (request) => ({
    data: {
      subscription_id: request.subscription_id,
      subscription_session_id: "session_001",
      subscription_status: "INITIALIZED",
      customer_details: request.customer_details,
    },
  });
  fetchSubscriptionImpl = async (subscriptionId) => ({
    status: 200,
    data: {
      subscription_id: subscriptionId,
      subscription_status: "ACTIVE",
      authorization_details: {
        authorization_status: "ACTIVE",
        payment_id: "payment_001",
        payment_method: "upi",
      },
    },
  });
});

test("Cashfree configuration is loaded without logging credentials", () => {
  assert.equal(cashfreeConfig.environment, "sandbox");
  assert.equal(cashfreeConfig.appId, process.env.CASHFREE_APP_ID);
  assert.equal(cashfreeConfig.secretKey, process.env.CASHFREE_SECRET_KEY);
  const serializedLogs = JSON.stringify(startupLogs);
  assert.equal(serializedLogs.includes(process.env.CASHFREE_APP_ID), false);
  assert.equal(serializedLogs.includes(process.env.CASHFREE_SECRET_KEY), false);
});

test("Cashfree client initializes in Sandbox mode", () => {
  assert.deepEqual(clientInitialization, {
    environment: fakeEnvironment.SANDBOX,
    appId: process.env.CASHFREE_APP_ID,
    secretKey: process.env.CASHFREE_SECRET_KEY,
  });
});

test("subscription creation uses the current Cashfree Subscription API and returns safe data", async () => {
  const result = await cashfreeService.createSubscription(baseInput());

  assert.equal(lastCreateCall.length, 3);
  assert.equal(lastCreateCall[0].subscription_id, "curecode_sub_001");
  assert.equal(lastCreateCall[1], "curecode_sub_001");
  assert.equal(lastCreateCall[2], "curecode_sub_001");
  assert.equal(lastCreateCall[0].subscription_meta.return_url, baseInput().returnUrl);
  assert.deepEqual(lastCreateCall[0].subscription_meta.notification_channel, ["EMAIL"]);
  assert.equal(Object.hasOwn(lastCreateCall[0].subscription_meta, "notify_url"), false);
  assert.deepEqual(result, {
    subscriptionId: "curecode_sub_001",
    subscriptionSessionId: "session_001",
    status: "INITIALIZED",
  });
  assert.equal(Object.hasOwn(result, "customer_details"), false);
});

test("monthly billing resolves its amount from CureCode plan configuration", async () => {
  await cashfreeService.createSubscription(baseInput());

  assert.deepEqual(lastCreateCall[0].plan_details, {
    plan_name: "CureCode Starter monthly",
    plan_type: "PERIODIC",
    plan_currency: "INR",
    plan_amount: 799,
    plan_max_amount: 799,
    plan_intervals: 1,
    plan_interval_type: "MONTH",
    plan_note: "Starter monthly subscription",
  });
});

test("annual billing resolves its amount from CureCode plan configuration", async () => {
  await cashfreeService.createSubscription(
    baseInput({ billingCycle: "annual", amount: 7990, reference: "curecode_sub_annual" })
  );

  assert.equal(lastCreateCall[0].plan_details.plan_amount, 7990);
  assert.equal(lastCreateCall[0].plan_details.plan_interval_type, "YEAR");
  assert.equal(lastCreateCall[0].subscription_tags.curecode_billing_cycle, "annual");
});

test("Professional and Business prices come from CureCode plan configuration", async () => {
  await cashfreeService.createSubscription(
    baseInput({ planId: "professional", amount: 1999, reference: "professional_monthly" })
  );
  assert.equal(lastCreateCall[0].plan_details.plan_amount, 1999);

  await cashfreeService.createSubscription(
    baseInput({ planId: "business", amount: 3999, reference: "business_monthly" })
  );
  assert.equal(lastCreateCall[0].plan_details.plan_amount, 3999);
});

test("missing or invalid customer information is rejected before the provider call", async () => {
  for (const customer of [
    { name: "Customer", email: "customer@example.com", phone: "" },
    { name: "Customer", email: "invalid-email", phone: "9999999999" },
    { name: "Customer", email: "customer@example.com", phone: "not-a-phone" },
  ]) {
    await assert.rejects(
      () => cashfreeService.createSubscription(baseInput({ customer })),
      (error) => error.code === "CASHFREE_INVALID_SUBSCRIPTION_DATA"
    );
  }
  assert.equal(lastCreateCall, undefined);
});

test("provider and session identifiers are extracted only from a complete response", async () => {
  createSubscriptionImpl = async (request) => ({
    status: 200,
    data: {
      subscription_id: request.subscription_id,
      cf_subscription_id: "cf_subscription_001",
      subscription_session_id: "session_001",
      subscription_status: "INITIALIZED",
    },
  });
  const result = await cashfreeService.createSubscription(baseInput());
  assert.equal(result.subscriptionId, "curecode_sub_001");
  assert.equal(result.providerReferenceId, "cf_subscription_001");
  assert.equal(result.subscriptionSessionId, "session_001");

  createSubscriptionImpl = async (request) => ({ data: { subscription_id: request.subscription_id } });
  await assert.rejects(
    () => cashfreeService.createSubscription(baseInput()),
    (error) => error.code === "CASHFREE_SUBSCRIPTION_CREATION_FAILED"
  );
});

test("subscription status is fetched server-side and reduced to safe authorization data", async () => {
  const result = await cashfreeService.fetchSubscription("curecode_sub_001");
  assert.deepEqual(lastFetchCall, ["curecode_sub_001"]);
  assert.deepEqual(result, {
    subscriptionId: "curecode_sub_001",
    status: "ACTIVE",
    authorizationStatus: "ACTIVE",
    paymentId: "payment_001",
    paymentMethod: "upi",
  });
});

test("caller-supplied amount cannot override the configured CureCode plan price", async () => {
  await assert.rejects(
    () => cashfreeService.createSubscription(baseInput({ amount: 1 })),
    (error) => {
      assert.equal(error.code, "CASHFREE_AMOUNT_MISMATCH");
      assert.equal(error.status, 400);
      return true;
    }
  );
  assert.equal(lastCreateCall, undefined);
});

test("Cashfree API failures are normalized and credentials never reach logs or callers", async () => {
  const providerError = {
    response: {
      status: 401,
      data: {
        code: "authentication_error",
        type: "authentication_error",
        message: `Invalid secret ${process.env.CASHFREE_SECRET_KEY}`,
      },
      headers: { "x-request-id": "request_001" },
      config: {
        headers: {
          "x-client-id": process.env.CASHFREE_APP_ID,
          "x-client-secret": process.env.CASHFREE_SECRET_KEY,
        },
      },
    },
  };
  createSubscriptionImpl = async () => {
    throw providerError;
  };

  const logs = [];
  const originalError = console.error;
  console.error = (...args) => logs.push(args);
  try {
    await assert.rejects(() => cashfreeService.createSubscription(baseInput()), (error) => {
      assert.equal(error.code, "CASHFREE_SUBSCRIPTION_CREATION_FAILED");
      assert.equal(error.message, "Cashfree subscription creation failed");
      assert.equal(error.status, 502);
      assert.equal(JSON.stringify(error).includes(process.env.CASHFREE_SECRET_KEY), false);
      return true;
    });
  } finally {
    console.error = originalError;
  }

  const serializedLogs = JSON.stringify(logs);
  assert.equal(serializedLogs.includes(process.env.CASHFREE_APP_ID), false);
  assert.equal(serializedLogs.includes(process.env.CASHFREE_SECRET_KEY), false);
  assert.deepEqual(logs[0][1], {
    operation: "createSubscription",
    statusCode: 401,
    errorCode: "authentication_error",
    type: "authentication_error",
    message: "Invalid secret [redacted]",
    requestId: "request_001",
  });
});
