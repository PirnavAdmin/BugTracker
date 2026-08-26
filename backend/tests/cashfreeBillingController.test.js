const test = require("node:test");
const assert = require("node:assert/strict");
require("../config/env");
const PlatformCompany = require("../models/PlatformCompany");
const Subscription = require("../models/Subscription");
const Payment = require("../models/Payment");
const cashfreeService = require("../services/payment/cashfreeService");
const { createSubscription } = require("../controllers/cashfreeBillingController");

const originalCompanyFindOne = PlatformCompany.findOne;
const originalSubscriptionFindOne = Subscription.findOne;
const originalSubscriptionCreate = Subscription.create;
const originalPaymentCreate = Payment.create;
const originalCashfreeCreate = cashfreeService.createSubscription;

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
  cashfreeService.createSubscription = async (payload) => {
    servicePayload = payload;
    return {
      subscriptionId: payload.reference,
      subscriptionSessionId: "cashfree-session-001",
      status: "INITIALIZED",
    };
  };
});

test.after(() => {
  PlatformCompany.findOne = originalCompanyFindOne;
  Subscription.findOne = originalSubscriptionFindOne;
  Subscription.create = originalSubscriptionCreate;
  Payment.create = originalPaymentCreate;
  cashfreeService.createSubscription = originalCashfreeCreate;
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

test("failed Cashfree creation retries the same idempotent provider reference", async () => {
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
    status: "PENDING",
    metadata: {},
  });

  const { res, nextError } = await callController({ planId: "starter", billingCycle: "monthly" });

  assert.ifError(nextError);
  assert.equal(res.statusCode, 201);
  assert.equal(servicePayload.reference, "cashfree-failed-reference");
  assert.equal(paymentPayload.providerOrderId, "cashfree-failed-reference");
  assert.equal(subscriptionPayload, undefined);
  assert.equal(existingSubscription.status, "PENDING");
});

test("Cashfree failures are returned safely while the local attempt stays non-active", async () => {
  cashfreeService.createSubscription = async () => {
    throw new Error("provider internals and credentials");
  };

  const { nextError } = await callController({ planId: "starter", billingCycle: "monthly" });

  assert.equal(nextError?.code, "CASHFREE_SUBSCRIPTION_CREATION_FAILED");
  assert.equal(nextError?.message, "Cashfree subscription creation failed");
  assert.equal(nextError?.status, 502);
  assert.equal(String(nextError).includes("provider internals"), false);
  assert.equal(localSubscriptionDocument.status, "PENDING");
  assert.equal(localSubscriptionDocument.providerStatus, "CREATION_FAILED");
  assert.equal(paymentDocument.status, "failed");
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
