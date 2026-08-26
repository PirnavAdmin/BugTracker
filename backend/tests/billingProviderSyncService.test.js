const test = require("node:test");
const assert = require("node:assert/strict");
require("../config/env");

const Payment = require("../models/Payment");
const cashfreeService = require("../services/payment/cashfreeService");
const razorpayService = require("../services/razorpayService");
const billingLifecycle = require("../services/billingLifecycleService");
const providerSync = require("../services/billingProviderSyncService");

const originals = {
  paymentFindOne: Payment.findOne,
  cashfreeFetch: cashfreeService.fetchSubscription,
  razorpayFetch: razorpayService.fetchSubscription,
  applyProviderSubscription: billingLifecycle.applyProviderSubscription,
};

let cashfreeFetchCount;
let razorpayFetchCount;
let paymentQuery;
let paymentDocument;

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
    _id: "local-subscription-001",
    tenantId: "TENANT_001",
    provider: "cashfree",
    providerSubscriptionId: "cc_test_subscription",
    status: "PENDING",
    providerStatus: "INITIALIZED",
    metadata: {},
    ...overrides,
  });

test.beforeEach(() => {
  cashfreeFetchCount = 0;
  razorpayFetchCount = 0;
  paymentQuery = undefined;
  paymentDocument = createDocument({
    _id: "payment-001",
    status: "pending",
    metadata: {},
  });
  Payment.findOne = (filter) => {
    paymentQuery = filter;
    return { sort: async () => paymentDocument };
  };
  cashfreeService.fetchSubscription = async () => {
    cashfreeFetchCount += 1;
    return {
      status: "ACTIVE",
      authorizationStatus: "ACTIVE",
      paymentId: "cashfree-payment-001",
      paymentMethod: "upi",
    };
  };
  razorpayService.fetchSubscription = async (providerSubscriptionId) => {
    razorpayFetchCount += 1;
    return { id: providerSubscriptionId, status: "active" };
  };
  billingLifecycle.applyProviderSubscription = async (providerSubscription) =>
    createSubscription({
      _id: "local-razorpay-subscription",
      provider: "razorpay",
      providerSubscriptionId: providerSubscription.id,
      status: "ACTIVE",
    });
});

test.after(() => {
  Payment.findOne = originals.paymentFindOne;
  cashfreeService.fetchSubscription = originals.cashfreeFetch;
  razorpayService.fetchSubscription = originals.razorpayFetch;
  billingLifecycle.applyProviderSubscription = originals.applyProviderSubscription;
});

test("explicit Razorpay subscription uses only Razorpay status synchronization", async () => {
  const subscription = createSubscription({
    provider: "razorpay",
    providerSubscriptionId: "sub_razorpay_001",
  });
  const originalInfo = console.info;
  console.info = () => {};
  try {
    const result = await providerSync.syncPendingSubscription(subscription);
    assert.equal(result.status, "ACTIVE");
  } finally {
    console.info = originalInfo;
  }
  assert.equal(razorpayFetchCount, 1);
  assert.equal(cashfreeFetchCount, 0);
  assert.equal(paymentQuery, undefined);
});

test("Cashfree cc_ subscription uses SubsFetchSubscription and never calls Razorpay", async () => {
  const subscription = createSubscription();
  const originalInfo = console.info;
  console.info = () => {};
  try {
    const result = await providerSync.syncPendingSubscription(subscription);
    assert.equal(result.status, "ACTIVE");
  } finally {
    console.info = originalInfo;
  }
  assert.equal(cashfreeFetchCount, 1);
  assert.equal(razorpayFetchCount, 0);
  assert.equal(subscription.status, "ACTIVE");
  assert.equal(paymentDocument.status, "authorized");
});

test("missing provider preserves legacy Razorpay behavior", async () => {
  const subscription = createSubscription({
    provider: undefined,
    providerSubscriptionId: "legacy_subscription_without_provider",
  });
  const originalInfo = console.info;
  console.info = () => {};
  try {
    await providerSync.syncPendingSubscription(subscription);
  } finally {
    console.info = originalInfo;
  }
  assert.equal(providerSync.resolveSubscriptionProvider(subscription), "razorpay");
  assert.equal(razorpayFetchCount, 1);
  assert.equal(cashfreeFetchCount, 0);
});

test("unknown stored provider returns a safe unsupported-provider error", async () => {
  const subscription = createSubscription({ provider: "unknown-gateway" });
  const originalInfo = console.info;
  console.info = () => {};
  try {
    await assert.rejects(
      () => providerSync.syncPendingSubscription(subscription),
      (error) => {
        assert.equal(error.code, "BILLING_PROVIDER_UNSUPPORTED");
        assert.equal(error.message, "The stored billing provider is not supported.");
        assert.equal(error.status, 500);
        return true;
      }
    );
  } finally {
    console.info = originalInfo;
  }
  assert.equal(razorpayFetchCount, 0);
  assert.equal(cashfreeFetchCount, 0);
});

test("Cashfree verified ACTIVE, PENDING, and FAILED states use the existing lifecycle records", async () => {
  const cases = [
    ["ACTIVE", "ACTIVE", "ACTIVE", "authorized"],
    ["ACTIVE", "PENDING", "PENDING", "pending"],
    ["ACTIVE", "FAILED", "FAILED", "failed"],
  ];
  const originalInfo = console.info;
  console.info = () => {};
  try {
    for (const [status, authorizationStatus, expectedSubscription, expectedPayment] of cases) {
      const subscription = createSubscription();
      paymentDocument = createDocument({ status: "pending", metadata: {} });
      cashfreeService.fetchSubscription = async () => {
        cashfreeFetchCount += 1;
        return { status, authorizationStatus };
      };
      await providerSync.syncPendingSubscription(subscription);
      assert.equal(subscription.status, expectedSubscription);
      assert.equal(paymentDocument.status, expectedPayment);
      assert.equal(paymentDocument.saveCount, 1);
    }
  } finally {
    console.info = originalInfo;
  }
  assert.equal(razorpayFetchCount, 0);
});

test("repeated Cashfree synchronization is idempotent and reuses the tenant-owned payment", async () => {
  const subscription = createSubscription();
  const originalInfo = console.info;
  console.info = () => {};
  try {
    await providerSync.syncPendingSubscription(subscription);
    await providerSync.syncPendingSubscription(subscription);
  } finally {
    console.info = originalInfo;
  }
  assert.equal(subscription.status, "ACTIVE");
  assert.equal(paymentDocument.status, "authorized");
  assert.equal(cashfreeFetchCount, 2);
  assert.equal(razorpayFetchCount, 0);
  assert.deepEqual(paymentQuery, {
    tenantId: "TENANT_001",
    subscriptionId: "local-subscription-001",
    provider: "cashfree",
    providerSubscriptionId: "cc_test_subscription",
  });
});

test("provider sync logs contain only allow-listed identifiers and statuses", async () => {
  const subscription = createSubscription();
  const logs = [];
  const originalInfo = console.info;
  console.info = (...args) => logs.push(args);
  try {
    await providerSync.syncPendingSubscription(subscription);
  } finally {
    console.info = originalInfo;
  }
  assert.equal(logs[0][0], "[billing] Pending subscription status sync");
  assert.equal(logs[1][0], "[billing] Cashfree subscription status verified");
  assert.deepEqual(Object.keys(logs[0][1]).sort(), [
    "localSubscriptionId",
    "provider",
    "providerSubscriptionId",
  ]);
  const serializedLogs = JSON.stringify(logs);
  assert.equal(serializedLogs.includes("customer@example.com"), false);
  assert.equal(serializedLogs.includes("9999999999"), false);
  assert.equal(serializedLogs.includes(process.env.CASHFREE_SECRET_KEY || "never-match"), false);
});
