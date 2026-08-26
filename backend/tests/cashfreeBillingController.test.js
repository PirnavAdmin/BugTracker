const test = require("node:test");
const assert = require("node:assert/strict");
require("../config/env");
const PlatformCompany = require("../models/PlatformCompany");
const Subscription = require("../models/Subscription");
const Payment = require("../models/Payment");
const cashfreeService = require("../services/payment/cashfreeService");
const {
  buildReference,
  createSubscription,
  getSubscriptionStatus,
  mapVerifiedStatus,
} = require("../controllers/cashfreeBillingController");

const originalCompanyFindOne = PlatformCompany.findOne;
const originalSubscriptionFindOne = Subscription.findOne;
const originalSubscriptionCreate = Subscription.create;
const originalPaymentCreate = Payment.create;
const originalPaymentFindOne = Payment.findOne;
const originalCashfreeCreate = cashfreeService.createSubscription;
const originalCashfreeFetch = cashfreeService.fetchSubscription;

let companyQuery;
let subscriptionQuery;
let subscriptionPayload;
let paymentPayload;
let servicePayload;
let existingSubscription;
let localSubscriptionDocument;
let paymentDocument;

const createDocument = (payload) => ({
  _id: payload._id || "local-subscription-1",
  ...payload,
  saveCount: 0,
  async save() {
    this.saveCount += 1;
    return this;
  },
});

const createResponse = () => ({
  statusCode: 200,
  body: undefined,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(payload) {
    this.body = payload;
    return this;
  },
});

const callController = async (body = {}, userOverrides = {}) => {
  const req = {
    body,
    user: {
      _id: "user-001",
      id: "user-001",
      name: "CureCode Admin",
      email: "admin@example.com",
      tenantId: "TENANT_001",
      ...userOverrides,
    },
  };
  const res = createResponse();
  let nextError;
  await createSubscription(req, res, (error) => {
    nextError = error;
  });
  return { req, res, nextError };
};

const callStatusController = async (userOverrides = {}) => {
  const req = { user: { _id: "user-001", tenantId: "TENANT_001", ...userOverrides } };
  const res = createResponse();
  let nextError;
  await getSubscriptionStatus(req, res, (error) => {
    nextError = error;
  });
  return { res, nextError };
};

test.beforeEach(() => {
  companyQuery = undefined;
  subscriptionQuery = undefined;
  subscriptionPayload = undefined;
  paymentPayload = undefined;
  servicePayload = undefined;
  existingSubscription = null;
  localSubscriptionDocument = undefined;
  paymentDocument = undefined;

  PlatformCompany.findOne = async (filter) => {
    companyQuery = filter;
    return {
      _id: "company-001",
      tenantId: "TENANT_001",
      name: "CureCode Company",
      email: "company@example.com",
      contactPerson: "Billing Contact",
      contactEmail: "billing@example.com",
      contactPhone: "9999999999",
      status: "Active",
    };
  };
  Subscription.findOne = (filter) => {
    subscriptionQuery = filter;
    return { sort: async () => existingSubscription };
  };
  Subscription.create = async (payload) => {
    subscriptionPayload = payload;
    localSubscriptionDocument = createDocument(payload);
    return localSubscriptionDocument;
  };
  Payment.create = async (payload) => {
    paymentPayload = payload;
    paymentDocument = createDocument({ _id: "payment-attempt-1", ...payload });
    return paymentDocument;
  };
  Payment.findOne = () => ({ sort: async () => paymentDocument });
  cashfreeService.createSubscription = async (payload) => {
    servicePayload = payload;
    return {
      subscriptionId: payload.reference,
      subscriptionSessionId: "cashfree-session-001",
      status: "INITIALIZED",
    };
  };
  cashfreeService.fetchSubscription = async (subscriptionId) => ({
    subscriptionId,
    status: "ACTIVE",
    authorizationStatus: "ACTIVE",
    paymentId: "cashfree-payment-001",
    paymentMethod: "upi",
  });
});

test.after(() => {
  PlatformCompany.findOne = originalCompanyFindOne;
  Subscription.findOne = originalSubscriptionFindOne;
  Subscription.create = originalSubscriptionCreate;
  Payment.create = originalPaymentCreate;
  Payment.findOne = originalPaymentFindOne;
  cashfreeService.createSubscription = originalCashfreeCreate;
  cashfreeService.fetchSubscription = originalCashfreeFetch;
});

test("authenticated tenant user creates a pending Cashfree subscription", async () => {
  const { res, nextError } = await callController({ planId: "starter", billingCycle: "monthly" });

  assert.ifError(nextError);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.success, true);
  assert.equal(res.body.subscriptionSessionId, "cashfree-session-001");
  assert.equal(subscriptionPayload.tenantId, "TENANT_001");
  assert.equal(subscriptionPayload.provider, "cashfree");
  assert.equal(subscriptionPayload.status, "PENDING");
  assert.equal(paymentPayload.status, "pending");
});

test("Cashfree subscription references are unique valid merchant subscription IDs", () => {
  const first = buildReference();
  const second = buildReference();
  assert.match(first, /^cc_[0-9a-f-]{36}$/i);
  assert.match(second, /^cc_[0-9a-f-]{36}$/i);
  assert.notEqual(first, second);
});

test("invalid and non-billable plans are rejected", async () => {
  for (const planId of ["unknown", "free", "enterprise"]) {
    const { nextError } = await callController({ planId, billingCycle: "monthly" });
    assert.equal(nextError?.code, "CASHFREE_PLAN_NOT_SUPPORTED");
    assert.equal(nextError?.status, 400);
  }
  assert.equal(servicePayload, undefined);
});

test("invalid billing cycles are rejected", async () => {
  const { nextError } = await callController({ planId: "starter", billingCycle: "weekly" });

  assert.equal(nextError?.code, "CASHFREE_BILLING_CYCLE_NOT_SUPPORTED");
  assert.equal(nextError?.status, 400);
  assert.equal(servicePayload, undefined);
});

test("client-supplied amount and tenant identity fields are rejected", async () => {
  for (const body of [
    { planId: "starter", billingCycle: "monthly", amount: 1 },
    { planId: "starter", billingCycle: "monthly", tenantId: "TENANT_999" },
    { planId: "starter", billingCycle: "monthly", userId: "other-user" },
  ]) {
    const { nextError } = await callController(body);
    assert.equal(nextError?.code, "CASHFREE_REQUEST_FIELDS_INVALID");
  }
  assert.equal(servicePayload, undefined);
});

test("monthly price and authenticated tenant data are passed to Cashfree", async () => {
  await callController({ planId: "professional", billingCycle: "monthly" });

  assert.equal(servicePayload.tenantId, "TENANT_001");
  assert.equal(servicePayload.userId, "user-001");
  assert.equal(servicePayload.planId, "professional");
  assert.equal(servicePayload.billingCycle, "monthly");
  assert.equal(servicePayload.amount, 1999);
  assert.equal(servicePayload.currency, "INR");
  assert.equal(servicePayload.customer.phone, "9999999999");
});

test("authenticated user customer data takes precedence over company contact data", async () => {
  await callController(
    { planId: "starter", billingCycle: "monthly" },
    { name: "Authenticated Customer", email: "customer@example.com", phone: "9888888888" }
  );
  assert.deepEqual(servicePayload.customer, {
    name: "Authenticated Customer",
    email: "customer@example.com",
    phone: "9888888888",
  });
});

test("annual price is resolved from CureCode plan configuration", async () => {
  await callController({ planId: "business", billingCycle: "annual" });

  assert.equal(servicePayload.billingCycle, "annual");
  assert.equal(servicePayload.amount, 39990);
  assert.equal(subscriptionPayload.amount, 39990);
  assert.equal(subscriptionPayload.billingCycle, "annual");
});

test("existing active subscription prevents a second provider subscription", async () => {
  existingSubscription = createDocument({
    provider: "razorpay",
    providerSubscriptionId: "sub_existing",
    status: "ACTIVE",
  });

  const { nextError } = await callController({ planId: "starter", billingCycle: "monthly" });

  assert.equal(nextError?.code, "CASHFREE_ALREADY_SUBSCRIBED");
  assert.equal(nextError?.status, 409);
  assert.equal(servicePayload, undefined);
});

test("usable pending Cashfree subscription is reused without creating another", async () => {
  existingSubscription = createDocument({
    provider: "cashfree",
    providerSubscriptionId: "cashfree-existing",
    providerStatus: "INITIALIZED",
    status: "PENDING",
    metadata: { subscriptionSessionId: "existing-session" },
  });

  const { res, nextError } = await callController({ planId: "starter", billingCycle: "monthly" });

  assert.ifError(nextError);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    success: true,
    subscriptionId: "cashfree-existing",
    subscriptionSessionId: "existing-session",
    status: "INITIALIZED",
    reused: true,
  });
  assert.equal(servicePayload, undefined);
  assert.equal(subscriptionPayload, undefined);
});

test("failed Cashfree creation retries with a new provider attempt and preserves history", async () => {
  existingSubscription = createDocument({
    _id: "failed-subscription",
    tenantId: "TENANT_001",
    companyId: "company-001",
    provider: "cashfree",
    providerSubscriptionId: "cashfree-failed-reference",
    providerStatus: "CREATION_FAILED",
    providerPlanId: "cashfree-inline:starter:monthly",
    planId: "starter",
    billingCycle: "monthly",
    amount: 799,
    currency: "INR",
    status: "FAILED",
    metadata: {},
  });

  const { res, nextError } = await callController({ planId: "starter", billingCycle: "monthly" });

  assert.ifError(nextError);
  assert.equal(res.statusCode, 201);
  assert.notEqual(servicePayload.reference, "cashfree-failed-reference");
  assert.equal(paymentPayload.providerOrderId, servicePayload.reference);
  assert.equal(subscriptionPayload.metadata.retryOfSubscriptionId, "failed-subscription");
  assert.equal(existingSubscription.status, "FAILED");
});

test("Cashfree failures are returned safely while the local attempt stays non-active", async () => {
  cashfreeService.createSubscription = async () => {
    throw Object.assign(new Error("provider internals and credentials"), {
      providerDiagnostic: {
        httpStatus: 400,
        providerErrorCode: "invalid_request",
        type: "invalid_request_error",
        requestId: "request-safe-001",
      },
    });
  };

  const { nextError } = await callController({ planId: "starter", billingCycle: "monthly" });

  assert.equal(nextError?.code, "CASHFREE_SUBSCRIPTION_CREATION_FAILED");
  assert.equal(nextError?.message, "Cashfree subscription creation failed");
  assert.equal(nextError?.status, 502);
  assert.equal(String(nextError).includes("provider internals"), false);
  assert.equal(localSubscriptionDocument.status, "FAILED");
  assert.equal(localSubscriptionDocument.providerStatus, "CREATION_FAILED");
  assert.equal(paymentDocument.status, "failed");
});

test("local Cashfree validation errors preserve their safe code and are not provider failures", async () => {
  const cases = [
    ["CASHFREE_INVALID_SUBSCRIPTION_DATA", "customer.phone is required", 400],
    ["CASHFREE_INVALID_PLAN", "A paid CureCode plan is required", 400],
    ["CASHFREE_AMOUNT_MISMATCH", "The subscription amount does not match", 400],
    ["CASHFREE_CURRENCY_MISMATCH", "The subscription currency does not match", 400],
    ["CASHFREE_SANDBOX_REQUIRED", "Cashfree Sandbox is required", 503],
  ];
  const logs = [];
  const originalWarn = console.warn;
  console.warn = (...args) => logs.push(args);
  try {
    for (const [code, message, status] of cases) {
      cashfreeService.createSubscription = async () => {
        throw Object.assign(new Error(message), { code, status });
      };
      const { nextError } = await callController({ planId: "starter", billingCycle: "monthly" });
      assert.equal(nextError.code, code);
      assert.equal(nextError.message, message);
      assert.equal(nextError.status, status);
      assert.equal(localSubscriptionDocument.status, "FAILED");
      assert.equal(localSubscriptionDocument.providerStatus, "VALIDATION_FAILED");
      assert.equal(localSubscriptionDocument.metadata.validationErrorCode, code);
      assert.equal(localSubscriptionDocument.metadata.creationErrorCode, undefined);
      assert.equal(paymentDocument.status, "failed");
    }
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(logs.length, cases.length);
  for (const [label, diagnostic] of logs) {
    assert.equal(label, "[billing] Cashfree request validation error");
    assert.deepEqual(Object.keys(diagnostic).sort(), ["billingCycle", "code", "message", "planId"]);
  }
  const serializedLogs = JSON.stringify(logs);
  assert.equal(serializedLogs.includes("admin@example.com"), false);
  assert.equal(serializedLogs.includes("9999999999"), false);
  assert.equal(serializedLogs.includes(process.env.CASHFREE_SECRET_KEY || "never-match"), false);
});

test("unknown preparation errors are not mislabeled as Cashfree provider failures", async () => {
  cashfreeService.createSubscription = async () => {
    throw new Error("unexpected internal detail");
  };
  const { nextError } = await callController({ planId: "starter", billingCycle: "monthly" });
  assert.equal(nextError.code, "CASHFREE_REQUEST_PREPARATION_FAILED");
  assert.equal(nextError.message, "Cashfree subscription request could not be prepared");
  assert.equal(nextError.status, 500);
  assert.equal(localSubscriptionDocument.providerStatus, "INTERNAL_FAILED");
  assert.equal(JSON.stringify(nextError).includes("unexpected internal detail"), false);
});

test("legacy PENDING creation failures are not reused as checkout sessions", async () => {
  existingSubscription = createDocument({
    _id: "legacy-failed-subscription",
    provider: "cashfree",
    providerSubscriptionId: "legacy-failed-reference",
    providerStatus: "CREATION_FAILED",
    planId: "starter",
    billingCycle: "monthly",
    status: "PENDING",
    metadata: { subscriptionSessionId: "known-failed-session" },
  });

  const { res, nextError } = await callController({ planId: "starter", billingCycle: "monthly" });
  assert.ifError(nextError);
  assert.equal(res.body.reused, undefined);
  assert.notEqual(servicePayload.reference, "legacy-failed-reference");
  assert.notEqual(res.body.subscriptionSessionId, "known-failed-session");
});

test("provider creation diagnostics are persisted without exposing provider internals", async () => {
  cashfreeService.createSubscription = async () => {
    throw Object.assign(new Error("sensitive provider response"), {
      providerDiagnostic: {
        httpStatus: 400,
        providerErrorCode: "invalid_request",
        type: "validation_error",
        requestId: "request-safe-001",
      },
    });
  };
  const { nextError } = await callController({ planId: "starter", billingCycle: "monthly" });
  assert.equal(nextError.code, "CASHFREE_SUBSCRIPTION_CREATION_FAILED");
  assert.equal(Object.hasOwn(nextError, "providerDiagnostic"), false);
  assert.equal(localSubscriptionDocument.metadata.providerHttpStatus, 400);
  assert.equal(localSubscriptionDocument.metadata.providerErrorCode, "invalid_request");
  assert.equal(localSubscriptionDocument.metadata.providerRequestId, "request-safe-001");
  assert.equal(JSON.stringify(localSubscriptionDocument.metadata).includes("sensitive"), false);
});

test("verified Cashfree authorization activates only after a server-side status fetch", async () => {
  existingSubscription = createDocument({
    _id: "pending-cashfree-subscription",
    tenantId: "TENANT_001",
    provider: "cashfree",
    providerSubscriptionId: "cashfree-subscription-001",
    planId: "starter",
    billingCycle: "monthly",
    amount: 799,
    currency: "INR",
    status: "PENDING",
    metadata: {},
  });
  paymentDocument = createDocument({ status: "pending", metadata: {} });
  const { res, nextError } = await callStatusController();
  assert.ifError(nextError);
  assert.equal(res.body.verified, true);
  assert.equal(existingSubscription.status, "ACTIVE");
  assert.equal(paymentDocument.status, "authorized");
  assert.equal(paymentDocument.metadata.authorizationVerified, true);
  assert.equal(subscriptionQuery.tenantId, "TENANT_001");
  assert.equal(subscriptionQuery.provider, "cashfree");
});

test("pending or failed provider authorization maps without premature activation", () => {
  assert.equal(mapVerifiedStatus({ status: "INITIALIZED", authorizationStatus: "PENDING" }), "PENDING");
  assert.equal(mapVerifiedStatus({ status: "ACTIVE", authorizationStatus: "PENDING" }), "PENDING");
  assert.equal(mapVerifiedStatus({ status: "ACTIVE", authorizationStatus: "FAILED" }), "FAILED");
  assert.equal(mapVerifiedStatus({ status: "ACTIVE", authorizationStatus: "ACTIVE" }), "ACTIVE");
});

test("provider and session identifiers are persisted while subscription remains pending", async () => {
  const { res } = await callController({ planId: "starter", billingCycle: "monthly" });

  assert.equal(res.body.subscriptionId, localSubscriptionDocument.providerSubscriptionId);
  assert.equal(res.body.subscriptionSessionId, "cashfree-session-001");
  assert.equal(localSubscriptionDocument.provider, "cashfree");
  assert.equal(paymentDocument.provider, "cashfree");
  assert.equal(
    paymentDocument.providerSubscriptionId,
    localSubscriptionDocument.providerSubscriptionId
  );
  assert.equal(localSubscriptionDocument.metadata.subscriptionSessionId, "cashfree-session-001");
  assert.equal(paymentDocument.metadata.subscriptionSessionId, "cashfree-session-001");
  assert.equal(localSubscriptionDocument.status, "PENDING");
});

test("all company and subscription lookups remain scoped to authenticated tenant", async () => {
  await callController({ planId: "starter", billingCycle: "monthly" });

  assert.deepEqual(companyQuery, { tenantId: "TENANT_001" });
  assert.equal(subscriptionQuery.tenantId, "TENANT_001");
  assert.equal(JSON.stringify(companyQuery).includes("TENANT_999"), false);
  assert.equal(JSON.stringify(subscriptionQuery).includes("TENANT_999"), false);
});

test("missing tenant context is rejected before any billing lookup", async () => {
  const { nextError } = await callController(
    { planId: "starter", billingCycle: "monthly" },
    { tenantId: "" }
  );

  assert.match(nextError?.message || "", /Tenant context is required/);
  assert.equal(companyQuery, undefined);
  assert.equal(servicePayload, undefined);
});
