import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  formatPaymentStatus,
  formatProviderName,
  getBillingCycleLabel,
  getPlanName,
  getSubscriptionDateRows,
  getSubscriptionMessage,
  getSubscriptionPaymentStatus,
} from "../src/services/billingPresentation.js";

test("pending Cashfree presentation keeps plan, cycle, authorization state, and provider dates", () => {
  const subscription = {
    provider: "cashfree",
    planId: "starter",
    billingCycle: "monthly",
    amount: 799,
    status: "PENDING",
    createdAt: "2026-08-26T00:00:00.000Z",
    startDate: "2026-08-26T01:00:00.000Z",
    currentPeriodEnd: "2026-09-26T01:00:00.000Z",
  };

  assert.equal(getPlanName(subscription.planId), "Starter");
  assert.equal(subscription.amount, 799);
  assert.equal(getBillingCycleLabel(subscription.billingCycle), "Monthly");
  assert.equal(getSubscriptionPaymentStatus(subscription.status), "Pending authorization");
  assert.equal(
    getSubscriptionMessage(subscription.status),
    "Initial authorization/payment is still being processed."
  );
  assert.deepEqual(getSubscriptionDateRows(subscription), [
    { label: "Created On", value: subscription.createdAt },
    { label: "Subscription Started", value: subscription.startDate },
    { label: "Next Billing Date", value: subscription.currentPeriodEnd },
  ]);
  assert.doesNotMatch(getSubscriptionMessage(subscription.status), /failed/i);
});

test("active subscription presents its plan, activation date, and next billing date", () => {
  const subscription = {
    planId: "professional",
    status: "ACTIVE",
    startDate: "2026-08-26T01:00:00.000Z",
    currentPeriodEnd: "2026-09-26T01:00:00.000Z",
    expiryDate: "2050-12-31T00:00:00.000Z",
  };
  assert.equal(getPlanName(subscription.planId), "Professional");
  assert.equal(getSubscriptionPaymentStatus(subscription.status), "Authorized");
  assert.deepEqual(getSubscriptionDateRows(subscription), [
    { label: "Activated On", value: subscription.startDate },
    { label: "Next Billing Date", value: subscription.currentPeriodEnd },
    { label: "Expiry Date", value: subscription.expiryDate },
  ]);
});

test("failed and cancelled subscriptions preserve safe historical details", () => {
  assert.equal(getPlanName("business"), "Business");
  assert.equal(getSubscriptionMessage("FAILED"), "Authorization/payment was not completed.");
  assert.deepEqual(
    getSubscriptionDateRows({
      status: "CANCELLED",
      createdAt: "2026-07-01T00:00:00.000Z",
      cancelledAt: "2026-08-01T00:00:00.000Z",
      endedAt: "2026-08-01T00:00:00.000Z",
    }),
    [
      { label: "Created On", value: "2026-07-01T00:00:00.000Z" },
      { label: "Cancelled On", value: "2026-08-01T00:00:00.000Z" },
      { label: "Ended On", value: "2026-08-01T00:00:00.000Z" },
    ]
  );
});

test("null provider dates are hidden and never converted into invented dates", () => {
  assert.deepEqual(
    getSubscriptionDateRows({
      status: "PENDING",
      createdAt: null,
      startDate: null,
      currentPeriodEnd: null,
      endedAt: null,
    }),
    []
  );
});

test("payment history presentation identifies Cashfree and preserves Razorpay defaults", () => {
  assert.equal(formatPaymentStatus("pending"), "Pending");
  assert.equal(formatPaymentStatus("captured"), "Captured");
  assert.equal(formatProviderName("cashfree"), "Cashfree");
  assert.equal(formatProviderName("razorpay"), "Razorpay");
  assert.equal(formatProviderName(undefined), "Razorpay");
});

test("Billing UI uses server dates, shared formatting, both checkout choices, and no credentials", async () => {
  const source = await readFile(new URL("../src/pages/BillingPage.jsx", import.meta.url), "utf8");
  assert.match(source, /formatDate\(record\.currentPeriodEnd/);
  assert.match(source, /getSubscriptionDateRows\(subscription\)/);
  assert.match(source, /\["Amount", money\(subscription\.amount, subscription\.currency\)\]/);
  assert.match(source, /\["Billing Cycle", getBillingCycleLabel\(subscription\.billingCycle\)\]/);
  assert.doesNotMatch(source, /setMonth|setDate|Date\.UTC|86400000/);
  assert.match(source, /Choose Plan with Razorpay/);
  assert.match(source, /CashfreeCheckoutButton/);
  assert.match(source, /formatProviderName\(payment\.provider\)/);
  assert.doesNotMatch(source, /CASHFREE_SECRET_KEY|VITE_CASHFREE/);
  assert.doesNotMatch(source, /SubsFetchSubscription|SubsCreateSubscription/);
});

test("Platform Company uses authoritative Cashfree state and hides manual controls for provider-managed records", async () => {
  const [pageSource, apiSource] = await Promise.all([
    readFile(new URL("../src/pages/PlatformCompanyDetailsPage.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/lib/api.js", import.meta.url), "utf8"),
  ]);
  assert.match(apiSource, /\/platform\/billing\/companies\/\$\{companyId\}\/status/);
  assert.match(pageSource, /ProviderManagedSubscription/);
  assert.match(pageSource, /Provider-managed subscription · Read only/);
  assert.match(pageSource, /providerManaged \? \(/);
  assert.match(pageSource, /getSubscriptionDateRows\(subscription\)/);
  assert.match(pageSource, /getSubscriptionPaymentStatus\(subscription\)/);
  assert.match(pageSource, /subscription\.providerSubscriptionId/);
  assert.match(pageSource, /status === "PENDING" \? 5000 : false/);
  assert.doesNotMatch(`${pageSource}${apiSource}`, /CASHFREE_SECRET_KEY|VITE_CASHFREE/);
  assert.doesNotMatch(pageSource, /SubsFetchSubscription|SubsCreateSubscription/);
});
