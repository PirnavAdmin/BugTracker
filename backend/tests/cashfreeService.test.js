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
let clientInstance;
let lastCreateCall;
let lastFetchCall;
let createCalls;
let fetchCalls;
let lastManageCall;
let manageSubscriptionImpl;

class FakeCashfree {
  constructor(environment, appId, secretKey) {
    clientInitialization = { environment, appId, secretKey };
    clientInstance = this;
  }

  async SubsCreateSubscription(...args) {
    lastCreateCall = args;
    createCalls.push(args);
    return createSubscriptionImpl(...args);
  }

  async SubsFetchSubscription(...args) {
    lastFetchCall = args;
    fetchCalls.push(args);
    return fetchSubscriptionImpl(...args);
  }

  async SubsManageSubscription(...args) {
    lastManageCall = args;
    return manageSubscriptionImpl(...args);
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

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  createCalls = [];
  fetchCalls = [];
  lastManageCall = undefined;
  manageSubscriptionImpl = async () => ({ data: { subscription_status: "CANCELLED" } });
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
      cf_subscription_id: "23639858",
      subscription_status: "ACTIVE",
      subscription_first_charge_time: "2026-08-26T10:00:00+05:30",
      next_schedule_date: "2026-09-26T10:00:00+05:30",
      subscription_expiry_time: "2050-12-31T00:00:00+05:30",
      authorization_details: {
        authorization_status: "ACTIVE",
        authorization_time: "2026-08-26T09:55:00+05:30",
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
  assert.equal(clientInstance.XApiVersion, cashfreeService.CASHFREE_API_VERSION);
});

test("Cashfree Subscription API endpoint and explicit supported version override the SDK default", () => {
  assert.equal(cashfreeService.CASHFREE_API_VERSION, "2025-01-01");
  assert.equal(
    cashfreeService.CASHFREE_SANDBOX_ENDPOINT,
    "https://sandbox.cashfree.com/pg/subscriptions"
  );
  const sdkApiSource = require("node:fs").readFileSync(
    require("node:path").join(require("node:path").dirname(sdkPath), "api.js"),
    "utf8"
  );
  assert.match(sdkApiSource, /class Cashfree/);
  assert.match(sdkApiSource, /this\.XApiVersion = "2026-01-01"/);
  assert.match(sdkApiSource, /localVarPath = `\/subscriptions`/);
});

test("subscription creation uses the current Cashfree Subscription API and returns safe data", async () => {
  const result = await cashfreeService.createSubscription(baseInput());

  assert.equal(lastCreateCall.length, 3);
  assert.equal(lastCreateCall[0].subscription_id, "curecode_sub_001");
  assert.match(lastCreateCall[1], UUID_PATTERN);
  assert.match(lastCreateCall[2], UUID_PATTERN);
  assert.notEqual(lastCreateCall[1], lastCreateCall[2]);
  assert.notEqual(lastCreateCall[0].subscription_id, lastCreateCall[1]);
  assert.notEqual(lastCreateCall[0].subscription_id, lastCreateCall[2]);
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

test("installed SDK argument order is body, x-request-id, then x-idempotency-key", async () => {
  await cashfreeService.createSubscription(baseInput());
  const [requestBody, requestId, idempotencyKey] = lastCreateCall;
  assert.equal(requestBody.subscription_id, "curecode_sub_001");
  assert.match(requestId, UUID_PATTERN);
  assert.match(idempotencyKey, UUID_PATTERN);
  assert.equal(lastCreateCall.length, 3);
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

test("inline plan details do not depend on a dashboard plan", async () => {
  await cashfreeService.createSubscription(baseInput());
  assert.equal(Object.hasOwn(lastCreateCall[0].plan_details, "plan_id"), false);
  assert.equal(lastCreateCall[0].plan_details.plan_type, "PERIODIC");
  assert.equal(lastCreateCall[0].authorization_details, undefined);
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

test("invalid customer phone returns the local subscription-data error before the SDK call", async () => {
  await assert.rejects(
    () =>
      cashfreeService.createSubscription(
        baseInput({ customer: { name: "Customer", email: "customer@example.com", phone: "" } })
      ),
    (error) => error.code === "CASHFREE_CUSTOMER_PHONE_INVALID" && error.status === 400
  );
  assert.equal(lastCreateCall, undefined);
});

test("Cashfree request contains the normalized phone without changing other customer fields", async () => {
  await cashfreeService.createSubscription(
    baseInput({
      customer: {
        name: "CureCode Customer",
        email: "customer@example.com",
        phone: "+91 (99999) 99999",
      },
    })
  );

  assert.deepEqual(lastCreateCall[0].customer_details, {
    customer_name: "CureCode Customer",
    customer_email: "customer@example.com",
    customer_phone: "9999999999",
  });
});

test("invalid customer email returns the local subscription-data error before the SDK call", async () => {
  await assert.rejects(
    () =>
      cashfreeService.createSubscription(
        baseInput({ customer: { name: "Customer", email: "invalid-email", phone: "9999999999" } })
      ),
    (error) => error.code === "CASHFREE_INVALID_SUBSCRIPTION_DATA"
  );
  assert.equal(lastCreateCall, undefined);
});

test("invalid return URL returns the local subscription-data error before the SDK call", async () => {
  await assert.rejects(
    () => cashfreeService.createSubscription(baseInput({ returnUrl: "http://public.example.com" })),
    (error) => error.code === "CASHFREE_INVALID_SUBSCRIPTION_DATA"
  );
  assert.equal(lastCreateCall, undefined);
});

test("invalid plan returns CASHFREE_INVALID_PLAN before the SDK call", async () => {
  await assert.rejects(
    () => cashfreeService.createSubscription(baseInput({ planId: "not-a-plan" })),
    (error) => error.code === "CASHFREE_INVALID_PLAN"
  );
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
    providerReferenceId: "23639858",
    status: "ACTIVE",
    authorizationStatus: "ACTIVE",
    authorizationTime: "2026-08-26T09:55:00+05:30",
    paymentId: "payment_001",
    paymentMethod: "upi",
    firstChargeTime: "2026-08-26T10:00:00+05:30",
    nextScheduleDate: "2026-09-26T10:00:00+05:30",
    expiryDate: "2050-12-31T00:00:00+05:30",
  });
});

test("Cashfree subscription_not_found is a reconciliation miss when explicitly allowed", async () => {
  fetchSubscriptionImpl = async () => {
    throw Object.assign(new Error("not found"), {
      response: {
        status: 400,
        data: { code: "subscription_not_found", message: "Subscription does not exist" },
      },
    });
  };
  const logs = [];
  const originalInfo = console.info;
  console.info = (...args) => logs.push(args);
  try {
    assert.equal(await cashfreeService.fetchSubscription("cc_stale_reference", { allowNotFound: true }), null);
  } finally {
    console.info = originalInfo;
  }
  assert.deepEqual(logs, [["[billing] Cashfree subscription reconciliation", {
    operation: "fetchSubscription",
    provider: "cashfree",
    providerSubscriptionId: "cc_stale_reference",
    apiVersion: "2025-01-01",
    httpStatus: 400,
    providerErrorCode: "subscription_not_found",
    reconciliationResult: "NOT_FOUND_STALE_REFERENCE",
  }]]);
});

test("Cashfree cancellation uses the stored ID with CANCEL and independent idempotency headers", async () => {
  fetchSubscriptionImpl = async (subscriptionId) => ({
    data: { subscription_id: subscriptionId, subscription_status: "CANCELLED" },
  });
  const result = await cashfreeService.cancelSubscription("cc_active_subscription");
  assert.equal(lastManageCall[0], "cc_active_subscription");
  assert.deepEqual(lastManageCall[1], { subscription_id: "cc_active_subscription", action: "CANCEL" });
  assert.match(lastManageCall[2], UUID_PATTERN);
  assert.match(lastManageCall[3], UUID_PATTERN);
  assert.notEqual(lastManageCall[2], lastManageCall[3]);
  assert.equal(result.status, "CANCELLED");
});

test("Cashfree cancellation reconciles an already-cancelled provider response", async () => {
  manageSubscriptionImpl = async () => {
    throw Object.assign(new Error("already cancelled"), {
      response: { status: 409, data: { code: "subscription_already_cancelled" } },
    });
  };
  fetchSubscriptionImpl = async (subscriptionId) => ({
    data: { subscription_id: subscriptionId, subscription_status: "CANCELLED" },
  });
  const result = await cashfreeService.cancelSubscription("cc_cancelled_subscription");
  assert.equal(lastManageCall[0], "cc_cancelled_subscription");
  assert.equal(result.status, "CANCELLED");
});

test("Cashfree cancellation does not turn a provider-not-found response into a local success", async () => {
  manageSubscriptionImpl = async () => {
    throw Object.assign(new Error("not found"), {
      response: { status: 404, data: { code: "subscription_not_found" } },
    });
  };
  const originalError = console.error;
  console.error = () => {};
  try {
    await assert.rejects(
      () => cashfreeService.cancelSubscription("cc_missing_subscription"),
      (error) =>
        error.code === "CASHFREE_PROVIDER_REFERENCE_NOT_FOUND" &&
        error.status === 404
    );
  } finally {
    console.error = originalError;
  }
});

test("genuine Cashfree fetch errors remain provider failures during reconciliation", async () => {
  fetchSubscriptionImpl = async () => {
    throw Object.assign(new Error("upstream unavailable"), {
      response: { status: 500, data: { code: "internal_error" } },
    });
  };
  const originalError = console.error;
  console.error = () => {};
  try {
    await assert.rejects(
      () => cashfreeService.fetchSubscription("cc_provider_error", { allowNotFound: true }),
      (error) => error.code === "CASHFREE_SUBSCRIPTION_STATUS_FAILED"
    );
  } finally {
    console.error = originalError;
  }
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

test("caller-supplied currency mismatch is rejected before the SDK call", async () => {
  await assert.rejects(
    () => cashfreeService.createSubscription(baseInput({ currency: "USD" })),
    (error) => error.code === "CASHFREE_CURRENCY_MISMATCH"
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
      assert.equal(error.code, "CASHFREE_PROVIDER_AUTHENTICATION_FAILED");
      assert.equal(error.message, "Cashfree provider authentication failed");
      assert.equal(error.status, 503);
      assert.equal(JSON.stringify(error).includes(process.env.CASHFREE_SECRET_KEY), false);
      return true;
    });
  } finally {
    console.error = originalError;
  }

  const serializedLogs = JSON.stringify(logs);
  assert.equal(serializedLogs.includes(process.env.CASHFREE_APP_ID), false);
  assert.equal(serializedLogs.includes(process.env.CASHFREE_SECRET_KEY), false);
  assert.equal(logs[0][1].environment, "sandbox");
  assert.equal(logs[0][1].operation, "createSubscription");
  assert.equal(logs[0][1].endpoint, cashfreeService.CASHFREE_SANDBOX_ENDPOINT);
  assert.equal(logs[0][1].apiVersion, "2025-01-01");
  assert.equal(logs[0][1].failureOrigin, "CASHFREE_PROVIDER_RESPONSE");
  assert.equal(logs[0][1].httpStatus, 401);
  assert.equal(logs[0][1].providerErrorCode, "authentication_error");
  assert.equal(logs[0][1].providerErrorMessage, "Invalid secret [redacted]");
  assert.equal(logs[0][1].requestId, "request_001");
  assert.equal(logs[0][1].requestIdPresent, true);
  assert.equal(logs[0][1].idempotencyKeyPresent, true);
  assert.equal(logs[0][1].timeoutConfigured, false);
});

test("Cashfree 400 phone rejection is classified as customer validation, not 502", async () => {
  createSubscriptionImpl = async () => {
    throw {
      response: {
        status: 400,
        data: {
          code: "customer_details.customer_phone_invalid",
          type: "validation_error",
          message: "customer_details.customer_phone should be a valid phone number.",
        },
      },
    };
  };
  const originalError = console.error;
  console.error = () => {};
  try {
    await assert.rejects(
      () => cashfreeService.createSubscription(baseInput()),
      (error) =>
        error.code === "CASHFREE_CUSTOMER_PHONE_INVALID" && error.status === 400
    );
  } finally {
    console.error = originalError;
  }
});

test("HTTP 504 is classified as a provider response and retries once only after a 404 lookup", async () => {
  let attempt = 0;
  createSubscriptionImpl = async (request) => {
    attempt += 1;
    if (attempt === 1) {
      throw Object.assign(new Error("Request failed with status code 504"), {
        code: "ERR_BAD_RESPONSE",
        response: { status: 504, data: {}, headers: {} },
      });
    }
    return {
      status: 200,
      data: {
        subscription_id: request.subscription_id,
        subscription_session_id: "recovered_session",
        subscription_status: "INITIALIZED",
      },
    };
  };
  fetchSubscriptionImpl = async () => {
    throw Object.assign(new Error("not found"), { response: { status: 404 } });
  };
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args);
  let result;
  try {
    result = await cashfreeService.createSubscription(baseInput());
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(result.subscriptionSessionId, "recovered_session");
  assert.equal(createCalls.length, 2);
  assert.equal(fetchCalls.length, 1);
  assert.notEqual(createCalls[0][1], createCalls[1][1]);
  assert.equal(createCalls[0][2], createCalls[1][2]);
  assert.equal(warnings[0][1].failureOrigin, "CASHFREE_PROVIDER_RESPONSE");
  assert.equal(warnings[0][1].httpStatus, 504);
  assert.equal(JSON.stringify(warnings).includes(createCalls[0][2]), false);
});

test("ambiguous create reuses an existing provider subscription instead of retrying", async () => {
  createSubscriptionImpl = async () => {
    throw Object.assign(new Error("gateway unavailable"), {
      code: "ERR_BAD_RESPONSE",
      response: { status: 504, data: {}, headers: {} },
    });
  };
  fetchSubscriptionImpl = async (subscriptionId) => ({
    status: 200,
    data: {
      subscription_id: subscriptionId,
      subscription_session_id: "existing_session",
      subscription_status: "INITIALIZED",
    },
  });
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    const result = await cashfreeService.createSubscription(baseInput());
    assert.equal(result.subscriptionSessionId, "existing_session");
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(createCalls.length, 1);
  assert.equal(fetchCalls.length, 1);
});

test("provider failure classification distinguishes responses, transport, and local failures", () => {
  assert.equal(
    cashfreeService.classifyProviderFailure({ response: { status: 504 }, code: "ERR_BAD_RESPONSE" }),
    "CASHFREE_PROVIDER_RESPONSE"
  );
  assert.equal(
    cashfreeService.classifyProviderFailure({ code: "ETIMEDOUT" }),
    "NETWORK_TIMEOUT_OR_TRANSPORT"
  );
  assert.equal(cashfreeService.classifyProviderFailure(new Error("invalid local request")), "LOCAL_REQUEST_FAILURE");
});
