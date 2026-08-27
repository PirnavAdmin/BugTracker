const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
require("../config/env");

const BillingWebhookEvent = require("../models/BillingWebhookEvent");
const Payment = require("../models/Payment");
const PlatformAuditLog = require("../models/PlatformAuditLog");
const PlatformCompany = require("../models/PlatformCompany");
const Subscription = require("../models/Subscription");
const cashfreeWebhookService = require("../services/cashfreeWebhookService");
const { webhook } = require("../controllers/cashfreeBillingController");

const originals = {
  billingEventCreate: BillingWebhookEvent.create,
  paymentFindOne: Payment.findOne,
  paymentSave: Payment.prototype.save,
  platformAuditCreate: PlatformAuditLog.create,
  platformCompanyFindOneAndUpdate: PlatformCompany.findOneAndUpdate,
  processWebhook: cashfreeWebhookService.processCashfreeWebhook,
  subscriptionFindOne: Subscription.findOne,
};

const createDocument = (payload) => ({
  ...payload,
  saveCount: 0,
  async save() {
    this.saveCount += 1;
    return this;
  },
});

const createSubscription = (overrides = {}) =>
  createDocument({
    _id: "507f1f77bcf86cd799439101",
    companyId: "507f1f77bcf86cd799439102",
    tenantId: "TENANT_001",
    provider: "cashfree",
    providerSubscriptionId: "cc_webhook_subscription",
    planId: "starter",
    billingCycle: "monthly",
    status: "PENDING",
    providerStatus: "INITIALIZED",
    currency: "INR",
    amount: 799,
    metadata: {},
    ...overrides,
  });

const subscriptionDetails = (status, overrides = {}) => ({
  subscription_id: "cc_webhook_subscription",
  cf_subscription_id: "23639858",
  subscription_status: status,
  subscription_expiry_time: "2050-12-31T00:00:00+05:30",
  next_schedule_date: "2026-09-26T00:00:00+05:30",
  ...overrides,
});

const webhookPayload = ({ type = "SUBSCRIPTION_STATUS_CHANGED", status = "ACTIVE", ...data } = {}) => ({
  type,
  event_time: "2026-08-26T12:00:00+05:30",
  data: {
    subscription_id: "cc_webhook_subscription",
    subscription_details: subscriptionDetails(status),
    authorization_details: {
      authorization_status: status === "ACTIVE" ? "ACTIVE" : "PENDING",
      authorization_time: "2026-08-26T10:00:00+05:30",
      payment_group: "upi",
    },
    ...data,
  },
});

const response = () => ({
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

const signedRequest = (payload, { valid = true } = {}) => {
  const rawBody = Buffer.from(JSON.stringify(payload));
  const timestamp = String(Date.now());
  const signature = crypto
    .createHmac("sha256", process.env.CASHFREE_SECRET_KEY || "")
    .update(timestamp + rawBody.toString("utf8"))
    .digest("base64");
  const headers = {
    "x-webhook-signature": valid ? signature : "invalid-signature",
    "x-webhook-timestamp": timestamp,
    "x-webhook-version": "2025-01-01",
  };
  return { body: rawBody, get: (name) => headers[String(name).toLowerCase()] };
};

let subscription;
let authorizationPayment;
let createdPayments;
let subscriptionQuery;
let companyUpdates;

test.beforeEach(() => {
  cashfreeWebhookService.processCashfreeWebhook = originals.processWebhook;
  subscription = createSubscription();
  authorizationPayment = createDocument({
    _id: "507f1f77bcf86cd799439103",
    tenantId: "TENANT_001",
    subscriptionId: subscription._id,
    provider: "cashfree",
    providerSubscriptionId: subscription.providerSubscriptionId,
    amount: 799,
    currency: "INR",
    status: "pending",
    metadata: { attemptType: "subscription_authorization" },
  });
  createdPayments = [];
  companyUpdates = [];
  Subscription.findOne = async (filter) => {
    subscriptionQuery = filter;
    return subscription;
  };
  Payment.findOne = (filter) => ({
    sort: async () => {
      if (filter.providerPaymentId) {
        return createdPayments.find((item) => item.providerPaymentId === filter.providerPaymentId) || null;
      }
      return authorizationPayment;
    },
  });
  Payment.prototype.save = async function save() {
    if (!createdPayments.includes(this)) createdPayments.push(this);
    return this;
  };
  PlatformCompany.findOneAndUpdate = async (...args) => {
    companyUpdates.push(args);
    return {};
  };
  PlatformAuditLog.create = async () => ({});
});

test.after(() => {
  BillingWebhookEvent.create = originals.billingEventCreate;
  Payment.findOne = originals.paymentFindOne;
  Payment.prototype.save = originals.paymentSave;
  PlatformAuditLog.create = originals.platformAuditCreate;
  PlatformCompany.findOneAndUpdate = originals.platformCompanyFindOneAndUpdate;
  Subscription.findOne = originals.subscriptionFindOne;
  cashfreeWebhookService.processCashfreeWebhook = originals.processWebhook;
});

test("valid Cashfree webhook signature is accepted and duplicate delivery is idempotent", async () => {
  let createCalls = 0;
  let processCalls = 0;
  BillingWebhookEvent.create = async () => {
    createCalls += 1;
    if (createCalls === 2) throw Object.assign(new Error("duplicate"), { code: 11000 });
    return createDocument({ _id: "event-001", metadata: {} });
  };
  cashfreeWebhookService.processCashfreeWebhook = async () => {
    processCalls += 1;
    return { type: "SUBSCRIPTION_STATUS_CHANGED", subscription };
  };
  const req = signedRequest(webhookPayload());
  const first = response();
  const second = response();
  let nextError;
  await webhook(req, first, (error) => { nextError = error; });
  await webhook(req, second, (error) => { nextError = error; });
  assert.ifError(nextError);
  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  assert.equal(second.body.duplicate, true);
  assert.equal(processCalls, 1);
});

test("invalid Cashfree webhook signature is rejected before processing and never logged", async () => {
  let processCalls = 0;
  cashfreeWebhookService.processCashfreeWebhook = async () => { processCalls += 1; };
  const logs = [];
  const originalWarn = console.warn;
  console.warn = (...args) => logs.push(args);
  try {
    const res = response();
    await webhook(signedRequest(webhookPayload(), { valid: false }), res, () => {});
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.code, "CASHFREE_WEBHOOK_INVALID_SIGNATURE");
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(processCalls, 0);
  assert.equal(JSON.stringify(logs).includes(process.env.CASHFREE_SECRET_KEY || "never-match"), false);
  assert.equal(JSON.stringify(logs).includes("invalid-signature"), false);
});

test("Cashfree status webhooks use stored ownership and map ACTIVE, PENDING, FAILED, CANCELLED, and EXPIRED", async () => {
  const cases = [
    ["ACTIVE", "ACTIVE"],
    ["BANK_APPROVAL_PENDING", "PENDING"],
    ["FAILED", "FAILED"],
    ["CANCELLED", "CANCELLED"],
    ["EXPIRED", "EXPIRED"],
  ];
  for (const [providerStatus, expected] of cases) {
    subscription = createSubscription();
    authorizationPayment = createDocument({ status: "pending", metadata: {} });
    const payload = webhookPayload({ status: providerStatus });
    if (providerStatus === "FAILED") {
      payload.data.authorization_details.authorization_status = "FAILED";
    }
    await cashfreeWebhookService.processCashfreeWebhook(payload);
    assert.equal(subscription.status, expected);
    assert.deepEqual(subscriptionQuery, {
      provider: "cashfree",
      providerSubscriptionId: "cc_webhook_subscription",
    });
    assert.equal(subscription.tenantId, "TENANT_001");
  }
});

test("ACTIVE lifecycle stores verified provider dates and synchronizes existing plan entitlements", async () => {
  await cashfreeWebhookService.processCashfreeWebhook(webhookPayload());
  assert.equal(subscription.status, "ACTIVE");
  assert.equal(subscription.startDate.toISOString(), "2026-08-26T04:30:00.000Z");
  assert.equal(subscription.currentPeriodEnd.toISOString(), "2026-09-25T18:30:00.000Z");
  assert.equal(subscription.expiryDate.toISOString(), "2050-12-30T18:30:00.000Z");
  assert.deepEqual(companyUpdates[0], [
    { _id: subscription.companyId, tenantId: "TENANT_001" },
    { $set: { planId: "starter" } },
  ]);
});

test("unknown and cross-tenant payload ownership cannot select another subscription", async () => {
  const otherProvider = createSubscription({ provider: "legacy-provider", tenantId: "TENANT_002" });
  Subscription.findOne = async (filter) => {
    subscriptionQuery = filter;
    return filter.provider === "cashfree" ? null : otherProvider;
  };
  const payload = webhookPayload();
  payload.data.subscription_details.subscription_tags = { tenantId: "TENANT_002" };
  await assert.rejects(
    () => cashfreeWebhookService.processCashfreeWebhook(payload),
    (error) => error.code === "CASHFREE_WEBHOOK_SUBSCRIPTION_NOT_FOUND" && error.status === 404
  );
  assert.deepEqual(subscriptionQuery, {
    provider: "cashfree",
    providerSubscriptionId: "cc_webhook_subscription",
  });
  assert.equal(otherProvider.saveCount, 0);
});

test("recurring success creates one Cashfree Payment and updates the existing Subscription", async () => {
  authorizationPayment = null;
  const payload = webhookPayload({
    type: "SUBSCRIPTION_PAYMENT_SUCCESS",
    status: "ACTIVE",
    payment_id: "recurring-payment-001",
    cf_payment_id: "49914526",
    payment_type: "CHARGE",
    payment_amount: 799,
    payment_currency: "INR",
    payment_status: "SUCCESS",
    payment_schedule_date: "2026-08-26T12:00:00+05:30",
  });
  await cashfreeWebhookService.processCashfreeWebhook(payload);
  assert.equal(subscription.status, "ACTIVE");
  assert.equal(createdPayments.length, 1);
  assert.equal(createdPayments[0].tenantId, "TENANT_001");
  assert.equal(String(createdPayments[0].subscriptionId), subscription._id);
  assert.equal(createdPayments[0].providerPaymentId, "recurring-payment-001");
  assert.equal(createdPayments[0].status, "captured");
  assert.equal(createdPayments[0].metadata.attemptType, "recurring_charge");
  assert.equal(
    subscription.currentPeriodStart.toISOString(),
    "2026-08-26T06:30:00.000Z"
  );
});

test("current 2025 payment payload resolves its top-level subscription ID without downgrading ACTIVE", async () => {
  authorizationPayment = null;
  subscription.status = "ACTIVE";
  const payload = {
    type: "SUBSCRIPTION_PAYMENT_SUCCESS",
    event_time: "2026-09-26T12:01:00+05:30",
    data: {
      subscription_id: subscription.providerSubscriptionId,
      payment_id: "current-contract-payment",
      cf_payment_id: "49914527",
      payment_type: "CHARGE",
      payment_amount: 799,
      payment_currency: "INR",
      payment_schedule_date: "2026-09-26T12:00:00+05:30",
      payment_status: "SUCCESS",
      authorization_details: { authorization_status: "ACTIVE", payment_group: "upi" },
    },
  };
  await cashfreeWebhookService.processCashfreeWebhook(payload);
  assert.equal(subscription.status, "ACTIVE");
  assert.equal(createdPayments.length, 1);
  assert.equal(createdPayments[0].status, "captured");
});

test("recurring failed and cancelled events update the payment safely without raw failure details", async () => {
  authorizationPayment = null;
  for (const [type, expectedPayment, expectedSubscription] of [
    ["SUBSCRIPTION_PAYMENT_FAILED", "failed", "FAILED"],
    ["SUBSCRIPTION_PAYMENT_CANCELLED", "cancelled", "ACTIVE"],
  ]) {
    createdPayments = [];
    subscription = createSubscription();
    const payload = webhookPayload({
      type,
      status: "ACTIVE",
      payment_id: `payment-${expectedPayment}`,
      payment_type: "CHARGE",
      payment_amount: 799,
      payment_status: expectedPayment.toUpperCase(),
      failure_details: { failure_reason: "sensitive raw provider decline" },
    });
    await cashfreeWebhookService.processCashfreeWebhook(payload);
    assert.equal(subscription.status, expectedSubscription);
    assert.equal(createdPayments[0].status, expectedPayment);
    assert.equal(JSON.stringify(createdPayments[0]).includes("sensitive raw provider decline"), false);
  }
});

test("webhook implementation never creates a Subscription and the raw route precedes JSON parsing", async () => {
  const serverSource = require("node:fs").readFileSync(require.resolve("../server"), "utf8");
  const webhookIndex = serverSource.indexOf('app.post("/api/billing/cashfree/webhook"');
  const jsonIndex = serverSource.indexOf("app.use(express.json");
  assert.ok(webhookIndex > 0 && webhookIndex < jsonIndex);
  assert.doesNotMatch(
    require("node:fs").readFileSync(require.resolve("../services/cashfreeWebhookService"), "utf8"),
    /Subscription\.create/
  );
});
