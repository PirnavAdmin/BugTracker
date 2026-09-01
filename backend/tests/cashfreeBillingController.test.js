const test = require("node:test");
const assert = require("node:assert/strict");
require("../config/env");
const PlatformCompany = require("../models/PlatformCompany");
const Subscription = require("../models/Subscription");
const Payment = require("../models/Payment");
const PlatformAuditLog = require("../models/PlatformAuditLog");
const cashfreeService = require("../services/payment/cashfreeService");
const {
  buildReference,
  cancelSubscription,
  createSubscription,
  getSubscriptionStatus,
  mapVerifiedStatus,
  normalizeCustomerPhone,
  resolveCustomerPhone,
  returnSubscription,
} = require("../controllers/cashfreeBillingController");

const originalCompanyFindOne = PlatformCompany.findOne;
const originalSubscriptionFindOne = Subscription.findOne;
const originalSubscriptionCreate = Subscription.create;
const originalPaymentCreate = Payment.create;
const originalPaymentFindOne = Payment.findOne;
const originalPlatformAuditCreate = PlatformAuditLog.create;
const originalCashfreeCreate = cashfreeService.createSubscription;
const originalCashfreeFetch = cashfreeService.fetchSubscription;
const originalCashfreeCancel = cashfreeService.cancelSubscription;

let companyQuery;
let subscriptionQuery;
let subscriptionQueries;
let subscriptionPayload;
let paymentPayload;
let servicePayload;
let existingSubscription;
let localSubscriptionDocument;
let paymentDocument;
let companyDocument;
let paymentQuery;
let cancelledProviderSubscriptionId;

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
  redirect(code, location) {
    this.statusCode = code;
    this.redirectLocation = location;
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

const callCancelController = async (body = {}, userOverrides = {}) => {
  const req = { body, user: { _id: "user-001", tenantId: "TENANT_001", ...userOverrides } };
  const res = createResponse();
  let nextError;
  await cancelSubscription(req, res, (error) => { nextError = error; });
  return { res, nextError };
};

const callReturnController = async (body = {}) => {
  const req = { body, method: "POST" };
  const res = createResponse();
  let nextError;
  await returnSubscription(req, res, (error) => {
    nextError = error;
  });
  return { req, res, nextError };
};

test.beforeEach(() => {
  companyQuery = undefined;
  subscriptionQuery = undefined;
  subscriptionQueries = [];
  subscriptionPayload = undefined;
  paymentPayload = undefined;
  servicePayload = undefined;
  existingSubscription = null;
  localSubscriptionDocument = undefined;
  paymentDocument = undefined;
  paymentQuery = undefined;
  cancelledProviderSubscriptionId = undefined;
  companyDocument = {
    _id: "company-001",
    tenantId: "TENANT_001",
    name: "CureCode Company",
    email: "company@example.com",
    contactPerson: "Billing Contact",
    contactEmail: "billing@example.com",
    contactPhone: "9999999999",
    status: "Active",
  };

  PlatformCompany.findOne = async (filter) => {
    companyQuery = filter;
    return companyDocument;
  };
  Subscription.findOne = (filter) => {
    subscriptionQuery = filter;
    subscriptionQueries.push(filter);
    return {
      sort: async () =>
        existingSubscription?.tenantId &&
        filter.tenantId &&
        existingSubscription.tenantId !== filter.tenantId
          ? null
          : existingSubscription,
    };
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
  Payment.findOne = (filter) => {
    paymentQuery = filter;
    return { sort: async () => paymentDocument };
  };
  PlatformAuditLog.create = async () => ({});
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
  cashfreeService.cancelSubscription = async (subscriptionId) => {
    cancelledProviderSubscriptionId = subscriptionId;
    return { subscriptionId, status: "CANCELLED" };
  };
});

test.after(() => {
  PlatformCompany.findOne = originalCompanyFindOne;
  Subscription.findOne = originalSubscriptionFindOne;
  Subscription.create = originalSubscriptionCreate;
  Payment.create = originalPaymentCreate;
  Payment.findOne = originalPaymentFindOne;
  PlatformAuditLog.create = originalPlatformAuditCreate;
  cashfreeService.createSubscription = originalCashfreeCreate;
  cashfreeService.fetchSubscription = originalCashfreeFetch;
  cashfreeService.cancelSubscription = originalCashfreeCancel;
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

test("tenant-owned active Cashfree subscription is cancelled with its stored provider ID", async () => {
  existingSubscription = createDocument({
    _id: "cashfree-active-local", tenantId: "TENANT_001", provider: "cashfree",
    providerSubscriptionId: "cc_stored_only", status: "ACTIVE", providerStatus: "ACTIVE",
    planId: "starter", billingCycle: "monthly", amount: 799, currency: "INR", metadata: {},
  });
  const { res, nextError } = await callCancelController({ providerSubscriptionId: "cc_browser_override" });
  assert.equal(nextError?.code, "CASHFREE_REQUEST_FIELDS_INVALID");
  assert.equal(cancelledProviderSubscriptionId, undefined);

  const result = await callCancelController();
  assert.ifError(result.nextError);
  assert.equal(cancelledProviderSubscriptionId, "cc_stored_only");
  assert.equal(existingSubscription.status, "CANCELLED");
  assert.equal(result.res.body.subscription.providerSubscriptionId, "cc_stored_only");
});

test("Cashfree cancellation is idempotent for an already-cancelled tenant record", async () => {
  existingSubscription = createDocument({
    tenantId: "TENANT_001", provider: "cashfree", providerSubscriptionId: "cc_cancelled",
    status: "CANCELLED", planId: "starter", billingCycle: "monthly", amount: 799, currency: "INR", metadata: {},
  });
  const { res, nextError } = await callCancelController();
  assert.ifError(nextError);
  assert.equal(res.body.reused, true);
  assert.equal(cancelledProviderSubscriptionId, undefined);
});

test("Cashfree cancellation provider failures preserve the active local subscription", async () => {
  existingSubscription = createDocument({
    tenantId: "TENANT_001", provider: "cashfree", providerSubscriptionId: "cc_active_error",
    status: "ACTIVE", planId: "starter", billingCycle: "monthly", amount: 799, currency: "INR", metadata: {},
  });
  cashfreeService.cancelSubscription = async () => {
    throw Object.assign(new Error("provider failed"), { status: 502, providerDiagnostic: { httpStatus: 500, providerErrorCode: "internal_error" } });
  };
  const originalError = console.error;
  console.error = () => {};
  try {
    const { nextError } = await callCancelController();
    assert.equal(nextError?.code, "CASHFREE_SUBSCRIPTION_CANCELLATION_FAILED");
  } finally { console.error = originalError; }
  assert.equal(existingSubscription.status, "ACTIVE");
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
  assert.match(servicePayload.returnUrl, /\/api\/billing\/cashfree\/return$/);
  assert.equal(servicePayload.returnUrl.includes("/settings/billing"), false);
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

test("authenticated user mobile is used when phone is absent", async () => {
  await callController(
    { planId: "starter", billingCycle: "monthly" },
    { phone: undefined, mobile: "+91 98888-88888" }
  );

  assert.equal(servicePayload.customer.phone, "9888888888");
});

test("company contact phone is used when the authenticated user phone is missing", async () => {
  companyDocument.contactPhone = "(99999) 99999";
  await callController(
    { planId: "starter", billingCycle: "monthly" },
    { phone: undefined, mobile: undefined }
  );

  assert.equal(servicePayload.customer.phone, "9999999999");
});

test("invalid user phone falls back to a valid tenant company contact phone", async () => {
  companyDocument.contactPhone = "+91 99999-99999";
  await callController(
    { planId: "starter", billingCycle: "monthly" },
    { phone: "not-a-phone", mobile: "undefined" }
  );

  assert.equal(servicePayload.customer.phone, "9999999999");
});

test("missing billing phone returns a safe error before creating records or calling Cashfree", async () => {
  companyDocument.contactPhone = "";
  const logs = [];
  const originalWarn = console.warn;
  console.warn = (...args) => logs.push(args);
  try {
    const { nextError } = await callController(
      { planId: "starter", billingCycle: "monthly" },
      { phone: null, mobile: "null" }
    );

    assert.equal(nextError.code, "CASHFREE_BILLING_PHONE_REQUIRED");
    assert.equal(
      nextError.message,
      "Please add a billing contact phone number before starting the subscription."
    );
    assert.equal(nextError.status, 400);
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(servicePayload, undefined);
  assert.equal(subscriptionPayload, undefined);
  assert.equal(paymentPayload, undefined);
  assert.deepEqual(logs, [
    [
      "[billing] Cashfree billing phone missing",
      {
        tenantId: "TENANT_001",
        userId: "user-001",
        planId: "starter",
        billingCycle: "monthly",
      },
    ],
  ]);
  assert.equal(JSON.stringify(logs).includes("admin@example.com"), false);
  assert.equal(JSON.stringify(logs).includes(process.env.CASHFREE_SECRET_KEY || "never-match"), false);
});

test("invalid billing phone is rejected before retry reconciliation or record creation", async () => {
  companyDocument.contactPhone = "91-91-9876543210";
  existingSubscription = createDocument({
    _id: "failed-subscription",
    tenantId: "TENANT_001",
    companyId: companyDocument._id,
    provider: "cashfree",
    providerSubscriptionId: "failed-provider-reference",
    providerStatus: "CREATION_FAILED",
    planId: "starter",
    billingCycle: "monthly",
    status: "FAILED",
    metadata: {},
  });
  let fetchCalls = 0;
  cashfreeService.fetchSubscription = async () => {
    fetchCalls += 1;
    return null;
  };
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    const { nextError } = await callController(
      { planId: "starter", billingCycle: "monthly" },
      { phone: undefined, mobile: undefined }
    );
    assert.equal(nextError?.code, "CASHFREE_CUSTOMER_PHONE_INVALID");
    assert.equal(nextError?.status, 400);
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(fetchCalls, 0);
  assert.equal(servicePayload, undefined);
  assert.equal(subscriptionPayload, undefined);
  assert.equal(paymentPayload, undefined);
});

test("phone resolution uses only the authenticated tenant company", async () => {
  await callController(
    { planId: "starter", billingCycle: "monthly" },
    { tenantId: "TENANT_001", phone: undefined, mobile: undefined }
  );

  assert.deepEqual(companyQuery, { tenantId: "TENANT_001" });
  assert.equal(servicePayload.customer.phone, "9999999999");
});

test("customer phone normalization rejects placeholders and normalizes supported formatting", () => {
  assert.equal(normalizeCustomerPhone(" undefined "), "");
  assert.equal(normalizeCustomerPhone("null"), "");
  assert.equal(normalizeCustomerPhone("+91 (98888) 88888"), "9888888888");
  assert.equal(
    resolveCustomerPhone({
      user: { phone: "invalid", mobile: "98888 88888" },
      company: { contactPhone: "9999999999" },
    }),
    "9888888888"
  );
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
    provider: "legacy-provider",
    providerSubscriptionId: "sub_existing",
    status: "ACTIVE",
  });

  const { nextError } = await callController({ planId: "starter", billingCycle: "monthly" });

  assert.equal(nextError?.code, "CASHFREE_ALREADY_SUBSCRIBED");
  assert.equal(nextError?.status, 409);
  assert.equal(servicePayload, undefined);
});

test("pending Cashfree subscription remains current and is reused instead of creating another", async () => {
  existingSubscription = createDocument({
    tenantId: "TENANT_001",
    provider: "cashfree",
    providerSubscriptionId: "cc_pending_current",
    providerStatus: "INITIALIZED",
    status: "PENDING",
    planId: "starter",
    billingCycle: "monthly",
    metadata: { subscriptionSessionId: "pending-session" },
  });

  const { res, nextError } = await callController({ planId: "starter", billingCycle: "monthly" });

  assert.ifError(nextError);
  assert.equal(res.body.reused, true);
  assert.equal(servicePayload, undefined);
});

test("terminal Cashfree history permits a new subscription without altering the old record", async () => {
  for (const [status, providerStatus] of [
    ["CANCELLED", "CANCELLED"],
    ["FAILED", "AUTHORIZATION_FAILED"],
    ["EXPIRED", "EXPIRED"],
    ["FAILED", "STALE_PROVIDER_REFERENCE"],
  ]) {
    existingSubscription = createDocument({
      _id: `old-${status}-${providerStatus}`,
      tenantId: "TENANT_001",
      provider: "cashfree",
      providerSubscriptionId: `cc_old_${status}_${providerStatus}`,
      providerStatus,
      status,
      planId: "starter",
      billingCycle: "monthly",
      amount: 799,
      currency: "INR",
      metadata: { historical: true },
    });
    const historicalSnapshot = JSON.stringify(existingSubscription);

    const { res, nextError } = await callController({ planId: "starter", billingCycle: "monthly" });

    assert.ifError(nextError);
    assert.equal(res.statusCode, 201);
    assert.notEqual(servicePayload.reference, existingSubscription.providerSubscriptionId);
    assert.equal(subscriptionPayload.providerSubscriptionId, servicePayload.reference);
    assert.equal(existingSubscription.saveCount, 0);
    assert.equal(JSON.stringify(existingSubscription), historicalSnapshot);
  }
});

test("an active subscription belonging to another tenant does not block a new Cashfree subscription", async () => {
  existingSubscription = createDocument({
    tenantId: "TENANT_999",
    provider: "cashfree",
    providerSubscriptionId: "cc_other_tenant_active",
    status: "ACTIVE",
    metadata: {},
  });

  const { res, nextError } = await callController({ planId: "starter", billingCycle: "monthly" });

  assert.ifError(nextError);
  assert.equal(res.statusCode, 201);
  assert.equal(servicePayload.tenantId, "TENANT_001");
  assert.ok(subscriptionQueries.every((query) => query.tenantId === "TENANT_001"));
});

test("repeated Subscribe Again requests reuse the new pending Cashfree subscription", async () => {
  existingSubscription = createDocument({
    tenantId: "TENANT_001",
    provider: "cashfree",
    providerSubscriptionId: "cc_cancelled_history",
    providerStatus: "CANCELLED",
    status: "CANCELLED",
    planId: "starter",
    billingCycle: "monthly",
    metadata: {},
  });
  const first = await callController({ planId: "starter", billingCycle: "monthly" });
  assert.ifError(first.nextError);
  const firstProviderSubscriptionId = subscriptionPayload.providerSubscriptionId;

  existingSubscription = createDocument({
    ...subscriptionPayload,
    metadata: { subscriptionSessionId: first.res.body.subscriptionSessionId },
    providerStatus: "INITIALIZED",
    status: "PENDING",
  });
  servicePayload = undefined;
  subscriptionPayload = undefined;
  const second = await callController({ planId: "starter", billingCycle: "monthly" });

  assert.ifError(second.nextError);
  assert.equal(second.res.body.reused, true);
  assert.equal(second.res.body.subscriptionId, firstProviderSubscriptionId);
  assert.equal(servicePayload, undefined);
  assert.equal(subscriptionPayload, undefined);
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

test("failed Cashfree creation retries with the existing company and one replacement attempt", async () => {
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
  // A failed attempt can create a fresh merchant reference only after Cashfree
  // confirms the original reference was not created.
  cashfreeService.fetchSubscription = async () => null;

  const { res, nextError } = await callController({ planId: "starter", billingCycle: "monthly" });

  assert.ifError(nextError);
  assert.equal(res.statusCode, 201);
  assert.notEqual(servicePayload.reference, "cashfree-failed-reference");
  assert.equal(subscriptionPayload.companyId, companyDocument._id);
  assert.equal(paymentPayload.providerOrderId, servicePayload.reference);
  assert.equal(subscriptionPayload.metadata.retryOfSubscriptionId, "failed-subscription");
  assert.equal(existingSubscription.status, "FAILED");
  assert.equal(existingSubscription.providerStatus, "STALE_PROVIDER_REFERENCE");
  assert.equal(existingSubscription.metadata.staleProviderReference, "cashfree-failed-reference");
});

test("Cashfree failures are returned safely while the local attempt stays non-active", async () => {
  cashfreeService.createSubscription = async () => {
    throw Object.assign(new Error("provider internals and credentials"), {
      code: "CASHFREE_PROVIDER_REQUEST_VALIDATION_FAILED",
      status: 400,
      providerDiagnostic: {
        httpStatus: 400,
        providerErrorCode: "invalid_request",
        type: "invalid_request_error",
        requestId: "request-safe-001",
      },
    });
  };

  const { nextError } = await callController({ planId: "starter", billingCycle: "monthly" });

  assert.equal(nextError?.code, "CASHFREE_PROVIDER_REQUEST_VALIDATION_FAILED");
  assert.equal(nextError?.message, "Payment could not be started because the request was rejected.");
  assert.equal(nextError?.status, 400);
  assert.equal(String(nextError).includes("provider internals"), false);
  assert.equal(localSubscriptionDocument.status, "FAILED");
  assert.equal(localSubscriptionDocument.providerStatus, "CREATION_FAILED");
  assert.equal(paymentDocument.status, "failed");
});

test("Cashfree phone validation failure remains an actionable HTTP 400", async () => {
  cashfreeService.createSubscription = async () => {
    throw Object.assign(new Error("provider rejected phone"), {
      code: "CASHFREE_CUSTOMER_PHONE_INVALID",
      status: 400,
      providerDiagnostic: {
        httpStatus: 400,
        providerErrorCode: "customer_details.customer_phone_invalid",
        type: "validation_error",
      },
    });
  };

  const { nextError } = await callController({ planId: "starter", billingCycle: "monthly" });

  assert.equal(nextError?.code, "CASHFREE_CUSTOMER_PHONE_INVALID");
  assert.equal(nextError?.status, 400);
  assert.match(nextError?.message || "", /valid customer phone number/i);
  assert.equal(localSubscriptionDocument.metadata.providerHttpStatus, 400);
  assert.equal(localSubscriptionDocument.status, "FAILED");
});

test("Cashfree credential rejection is reported as payment-service unavailability", async () => {
  cashfreeService.createSubscription = async () => {
    throw Object.assign(new Error("provider credentials rejected"), {
      code: "CASHFREE_PROVIDER_AUTHENTICATION_FAILED",
      status: 503,
      providerDiagnostic: {
        httpStatus: 401,
        providerErrorCode: "request_failed",
        type: "authentication_error",
      },
    });
  };

  const { nextError } = await callController({ planId: "starter", billingCycle: "monthly" });

  assert.equal(nextError?.code, "CASHFREE_PROVIDER_AUTHENTICATION_FAILED");
  assert.equal(nextError?.message, "Payment service authentication is unavailable");
  assert.equal(nextError?.status, 503);
  assert.equal(localSubscriptionDocument.metadata.creationErrorCode, "CASHFREE_PROVIDER_AUTHENTICATION_FAILED");
  assert.equal(localSubscriptionDocument.status, "FAILED");
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
  cashfreeService.fetchSubscription = async () => null;

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
  assert.equal(mapVerifiedStatus({ status: "SUCCESS", authorizationStatus: "AUTHORIZED" }), "ACTIVE");
});

test("Cashfree return requires the documented cf_subscriptionId field", async () => {
  const originalInfo = console.info;
  console.info = () => {};
  try {
    const { res, nextError } = await callReturnController({
      subscription_id: "cashfree-subscription-001",
      cf_status: "ACTIVE",
    });
    assert.ifError(nextError);
    assert.equal(res.statusCode, 303);
    assert.match(res.redirectLocation, /cashfree=return&status=failed$/);
  } finally {
    console.info = originalInfo;
  }
  assert.equal(subscriptionQuery, undefined);
  assert.equal(servicePayload, undefined);
});

test("unknown Cashfree return subscription is rejected without creating local records", async () => {
  const originalInfo = console.info;
  console.info = () => {};
  try {
    const { res, nextError } = await callReturnController({
      cf_subscriptionId: "cashfree-unknown",
    });
    assert.ifError(nextError);
    assert.equal(res.statusCode, 303);
    assert.match(res.redirectLocation, /cashfree=return&status=failed$/);
  } finally {
    console.info = originalInfo;
  }
  assert.deepEqual(subscriptionQuery, {
    provider: "cashfree",
    providerSubscriptionId: "cashfree-unknown",
  });
  assert.equal(subscriptionPayload, undefined);
  assert.equal(paymentPayload, undefined);
});

test("Cashfree return verifies ACTIVE server-side and updates the tenant-scoped existing payment", async () => {
  existingSubscription = createDocument({
    _id: "pending-cashfree-subscription",
    tenantId: "TENANT_001",
    provider: "cashfree",
    providerSubscriptionId: "cashfree-subscription-001",
    status: "PENDING",
    metadata: {},
  });
  paymentDocument = createDocument({ status: "pending", metadata: {} });
  const originalInfo = console.info;
  console.info = () => {};
  try {
    const { res, nextError } = await callReturnController({
      cf_subscriptionId: "cashfree-subscription-001",
      cf_status: "FAILED",
    });
    assert.ifError(nextError);
    assert.equal(res.statusCode, 303);
    assert.match(res.redirectLocation, /cashfree=return&status=success$/);
  } finally {
    console.info = originalInfo;
  }
  assert.equal(existingSubscription.status, "ACTIVE");
  assert.equal(paymentDocument.status, "authorized");
  assert.deepEqual(paymentQuery, {
    tenantId: "TENANT_001",
    subscriptionId: "pending-cashfree-subscription",
    provider: "cashfree",
    providerSubscriptionId: "cashfree-subscription-001",
  });
});

test("browser return status cannot force success when Cashfree verification is pending", async () => {
  existingSubscription = createDocument({
    _id: "pending-cashfree-subscription",
    tenantId: "TENANT_001",
    provider: "cashfree",
    providerSubscriptionId: "cashfree-subscription-001",
    status: "PENDING",
    metadata: {},
  });
  paymentDocument = createDocument({ status: "pending", metadata: {} });
  cashfreeService.fetchSubscription = async () => ({
    status: "ACTIVE",
    authorizationStatus: "PENDING",
  });
  const originalInfo = console.info;
  console.info = () => {};
  try {
    const { res } = await callReturnController({
      cf_subscriptionId: "cashfree-subscription-001",
      cf_status: "ACTIVE",
      cf_checkoutStatus: "SUCCESS",
    });
    assert.match(res.redirectLocation, /cashfree=return&status=pending$/);
  } finally {
    console.info = originalInfo;
  }
  assert.equal(existingSubscription.status, "PENDING");
  assert.equal(paymentDocument.status, "pending");
});

test("Cashfree return maps verified failure and remains idempotent on duplicate POSTs", async () => {
  existingSubscription = createDocument({
    _id: "pending-cashfree-subscription",
    tenantId: "TENANT_001",
    provider: "cashfree",
    providerSubscriptionId: "cashfree-subscription-001",
    status: "PENDING",
    metadata: {},
  });
  paymentDocument = createDocument({ status: "pending", metadata: {} });
  cashfreeService.fetchSubscription = async () => ({
    status: "ACTIVE",
    authorizationStatus: "FAILED",
  });
  const originalInfo = console.info;
  console.info = () => {};
  try {
    const first = await callReturnController({ cf_subscriptionId: "cashfree-subscription-001" });
    const second = await callReturnController({ cf_subscriptionId: "cashfree-subscription-001" });
    assert.match(first.res.redirectLocation, /cashfree=return&status=failed$/);
    assert.match(second.res.redirectLocation, /cashfree=return&status=failed$/);
  } finally {
    console.info = originalInfo;
  }
  assert.equal(existingSubscription.status, "FAILED");
  assert.equal(paymentDocument.status, "failed");
  assert.equal(subscriptionPayload, undefined);
  assert.equal(paymentPayload, undefined);
  assert.equal(existingSubscription.startDate, undefined);
});

test("Cashfree return verification failures are sanitized and leave local state pending", async () => {
  existingSubscription = createDocument({
    _id: "pending-cashfree-subscription",
    tenantId: "TENANT_001",
    provider: "cashfree",
    providerSubscriptionId: "cashfree-subscription-001",
    status: "PENDING",
    metadata: {},
  });
  cashfreeService.fetchSubscription = async () => {
    throw Object.assign(new Error("raw secret provider failure"), {
      providerDiagnostic: {
        httpStatus: 502,
        providerErrorCode: "provider_unavailable",
        providerErrorMessage: "sanitized provider unavailable",
        requestId: "request-safe-002",
      },
    });
  };
  const logs = [];
  const originalInfo = console.info;
  const originalError = console.error;
  console.info = () => {};
  console.error = (...args) => logs.push(args);
  try {
    const { res } = await callReturnController({
      cf_subscriptionId: "cashfree-subscription-001",
      cf_message: "customer@example.com 9999999999",
    });
    assert.match(res.redirectLocation, /cashfree=return&status=pending$/);
  } finally {
    console.info = originalInfo;
    console.error = originalError;
  }
  assert.equal(existingSubscription.status, "PENDING");
  assert.deepEqual(logs, [
    [
      "[billing] Cashfree return verification failed",
      {
        httpStatus: 502,
        providerErrorCode: "provider_unavailable",
        sanitizedMessage: "sanitized provider unavailable",
        requestId: "request-safe-002",
      },
    ],
  ]);
  const serializedLogs = JSON.stringify(logs);
  assert.equal(serializedLogs.includes("customer@example.com"), false);
  assert.equal(serializedLogs.includes("9999999999"), false);
  assert.equal(serializedLogs.includes(process.env.CASHFREE_SECRET_KEY || "never-match"), false);
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
