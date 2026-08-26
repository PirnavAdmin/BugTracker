const test = require("node:test");
const assert = require("node:assert/strict");
require("../config/env");

const Subscription = require("../models/Subscription");
const Payment = require("../models/Payment");
const providerSync = require("../services/billingProviderSyncService");
const { getSubscription } = require("../controllers/billingController");

const originalFindOne = Subscription.findOne;
const originalPaymentFindOne = Payment.findOne;
const originalSyncPending = providerSync.syncPendingSubscription;

let subscription;
let subscriptionQuery;
let syncCalls;

const createResponse = () => ({
  body: undefined,
  json(payload) {
    this.body = payload;
    return this;
  },
});

const callGetSubscription = async () => {
  const req = { user: { tenantId: "TENANT_001" } };
  const res = createResponse();
  let nextError;
  await getSubscription(req, res, (error) => {
    nextError = error;
  });
  return { res, nextError };
};

test.beforeEach(() => {
  syncCalls = [];
  subscription = {
    _id: "local-cashfree-subscription",
    tenantId: "TENANT_001",
    provider: "cashfree",
    providerSubscriptionId: "cc_test_subscription",
    planId: "starter",
    billingCycle: "monthly",
    status: "PENDING",
    providerStatus: "INITIALIZED",
    currency: "INR",
    amount: 799,
    createdAt: new Date("2026-08-26T00:00:00.000Z"),
    startDate: new Date("2026-08-26T01:00:00.000Z"),
    currentPeriodStart: new Date("2026-08-26T01:00:00.000Z"),
    currentPeriodEnd: new Date("2026-09-26T01:00:00.000Z"),
    cancelledAt: undefined,
    endedAt: undefined,
  };
  Subscription.findOne = (filter) => {
    subscriptionQuery = filter;
    return { sort: async () => subscription };
  };
  Payment.findOne = () => ({ sort: () => ({ lean: async () => null }) });
  providerSync.syncPendingSubscription = async (record) => {
    syncCalls.push(record);
    return { ...record, status: "ACTIVE", providerStatus: "ACTIVE" };
  };
});

test.after(() => {
  Subscription.findOne = originalFindOne;
  Payment.findOne = originalPaymentFindOne;
  providerSync.syncPendingSubscription = originalSyncPending;
});

test("generic billing read delegates the tenant Cashfree pending record to provider sync", async () => {
  const { res, nextError } = await callGetSubscription();
  assert.ifError(nextError);
  assert.deepEqual(subscriptionQuery, { tenantId: "TENANT_001" });
  assert.equal(syncCalls.length, 1);
  assert.equal(syncCalls[0], subscription);
  assert.equal(res.body.subscription.provider, "cashfree");
  assert.equal(res.body.subscription.status, "ACTIVE");
  assert.equal(res.body.subscription.providerSubscriptionId, "cc_test_subscription");
  assert.equal(res.body.subscription.createdAt, subscription.createdAt);
  assert.equal(res.body.subscription.startDate, subscription.startDate);
  assert.equal(res.body.subscription.currentPeriodStart, subscription.currentPeriodStart);
  assert.equal(res.body.subscription.currentPeriodEnd, subscription.currentPeriodEnd);
  assert.equal(res.body.subscription.cancelledAt, undefined);
  assert.equal(res.body.subscription.endedAt, undefined);
});

test("pending provider errors are logged without raw provider details", async () => {
  providerSync.syncPendingSubscription = async () => {
    throw Object.assign(new Error("raw credentials and provider response"), {
      code: "BILLING_PROVIDER_ERROR",
    });
  };
  const logs = [];
  const originalWarn = console.warn;
  console.warn = (...args) => logs.push(args);
  try {
    const { res, nextError } = await callGetSubscription();
    assert.ifError(nextError);
    assert.equal(res.body.subscription.status, "PENDING");
  } finally {
    console.warn = originalWarn;
  }
  assert.deepEqual(Object.keys(logs[0][1]).sort(), [
    "code",
    "localSubscriptionId",
    "provider",
    "providerSubscriptionId",
  ]);
  assert.equal(JSON.stringify(logs).includes("raw credentials"), false);
  assert.equal(JSON.stringify(logs).includes(process.env.CASHFREE_SECRET_KEY || "never-match"), false);
});

test("unsupported provider is returned as a safe controller error", async () => {
  subscription.provider = "unknown-gateway";
  providerSync.syncPendingSubscription = async () => {
    throw Object.assign(new Error("The stored billing provider is not supported."), {
      code: "BILLING_PROVIDER_UNSUPPORTED",
      status: 500,
    });
  };
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    const { nextError } = await callGetSubscription();
    assert.equal(nextError.code, "BILLING_PROVIDER_UNSUPPORTED");
    assert.equal(nextError.message, "The stored billing provider is not supported.");
    assert.equal(nextError.status, 500);
  } finally {
    console.warn = originalWarn;
  }
});
