const test = require("node:test");
const assert = require("node:assert/strict");
const Subscription = require("../models/Subscription");
const Payment = require("../models/Payment");
const lifecycle = require("../services/billingLifecycleService");
const { getBillingPlan, getSubscriptionTotalCount } = require("../config/razorpayBilling");

test("payment ownership is resolved from the local subscription tenant", async () => {
  const originalFindOne = Subscription.findOne;
  const originalUpsert = Payment.findOneAndUpdate;
  let update;
  Subscription.findOne = async () => ({ _id: "subscription-1", tenantId: "TENANT_001" });
  Payment.findOneAndUpdate = async (_filter, payload) => { update = payload; return payload.$set; };
  try {
    const payment = await lifecycle.upsertPayment({ id: "pay_1", subscription_id: "sub_1", amount: 79900, currency: "INR" }, "captured");
    assert.equal(payment.tenantId, "TENANT_001");
    assert.notEqual(payment.tenantId, "UNKNOWN");
    assert.equal(update.$set.providerSubscriptionId, "sub_1");
  } finally { Subscription.findOne = originalFindOne; Payment.findOneAndUpdate = originalUpsert; }
});

test("payment without a local subscription is rejected and never persisted", async () => {
  const originalFindOne = Subscription.findOne;
  const originalUpsert = Payment.findOneAndUpdate;
  let persisted = false;
  Subscription.findOne = async () => null;
  Payment.findOneAndUpdate = async () => { persisted = true; };
  try {
    await assert.rejects(() => lifecycle.upsertPayment({ id: "pay_unknown", subscription_id: "sub_unknown" }), { code: "BILLING_SUBSCRIPTION_NOT_FOUND" });
    assert.equal(persisted, false);
  } finally { Subscription.findOne = originalFindOne; Payment.findOneAndUpdate = originalUpsert; }
});

test("invalid terminal subscription transition is rejected", async () => {
  const subscription = { status: "CANCELLED", providerStatus: "cancelled", save: async () => {} };
  await assert.rejects(() => lifecycle.transitionSubscription(subscription, "ACTIVE", "active"), { code: "BILLING_INVALID_STATE_TRANSITION" });
});

test("Razorpay plan mapping and charge counts use the approved test plans", () => {
  assert.equal(getBillingPlan("starter", "monthly"), "plan_TRtZqcqv7UTF9N");
  assert.equal(getBillingPlan("starter", "annual"), "plan_TRtdeOC4CQH3U9");
  assert.equal(getBillingPlan("professional", "monthly"), "plan_TRtenEQnTyn1WK");
  assert.equal(getBillingPlan("professional", "annual"), "plan_TRtfKRbPF9Oiqj");
  assert.equal(getBillingPlan("business", "monthly"), "plan_TRtfkF2UcXeeBO");
  assert.equal(getBillingPlan("business", "annual"), "plan_TRtiCUREMVBLo7");
  assert.equal(getSubscriptionTotalCount("monthly"), 120);
  assert.equal(getSubscriptionTotalCount("annual"), 1);
});

test("payment without subscription_id resolves only through an exact trusted payment association", async () => {
  const originalPaymentFindOne = Payment.findOne;
  const originalSubscriptionFindOne = Subscription.findOne;
  Payment.findOne = () => ({ lean: async () => ({ providerPaymentId: "pay_exact", providerSubscriptionId: "sub_exact", subscriptionId: "local_exact", tenantId: "TENANT_001" }) });
  Subscription.findOne = async (query) => query.providerSubscriptionId === "sub_exact" ? { _id: "local_exact", tenantId: "TENANT_001" } : null;
  try {
    assert.deepEqual(await lifecycle.resolvePaymentAssociation({ id: "pay_exact" }), { providerSubscriptionId: "sub_exact" });
    Payment.findOne = () => ({ lean: async () => null });
    assert.equal(await lifecycle.resolvePaymentAssociation({ id: "pay_other" }), null);
  } finally { Payment.findOne = originalPaymentFindOne; Subscription.findOne = originalSubscriptionFindOne; }
});
