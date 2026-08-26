const Payment = require("../models/Payment");
const razorpayService = require("./razorpayService");
const billingLifecycle = require("./billingLifecycleService");

const getCashfreeService = () => require("./payment/cashfreeService");

const BILLING_PROVIDERS = Object.freeze({
  RAZORPAY: "razorpay",
  CASHFREE: "cashfree",
});

const billingError = (code, message, status = 400) =>
  Object.assign(new Error(message), { code, status });

const resolveSubscriptionProvider = (subscription) => {
  const provider = String(subscription?.provider || "").trim().toLowerCase();
  return provider || BILLING_PROVIDERS.RAZORPAY;
};

const mapCashfreeVerifiedStatus = ({ status, authorizationStatus }) => {
  const providerStatus = String(status || "").trim().toUpperCase();
  const authStatus = String(authorizationStatus || "").trim().toUpperCase();
  if (
    ["FAILED", "FAILURE", "CANCELLED", "EXPIRED"].includes(authStatus) ||
    ["FAILED", "CANCELLED", "EXPIRED"].includes(providerStatus)
  ) {
    return "FAILED";
  }
  if (
    ["ACTIVE", "SUCCESS", "AUTHORIZED", "AUTHORISED"].includes(authStatus) &&
    ["ACTIVE", "SUCCESS"].includes(providerStatus)
  ) {
    return "ACTIVE";
  }
  return "PENDING";
};

const applyCashfreeVerifiedStatus = async (subscription, providerStatus) => {
  const nextStatus = mapCashfreeVerifiedStatus(providerStatus);
  subscription.status = nextStatus;
  subscription.providerStatus =
    providerStatus.authorizationStatus || providerStatus.status || subscription.providerStatus;
  subscription.metadata = {
    ...subscription.metadata,
    lastStatusVerifiedAt: new Date(),
    providerSubscriptionStatus: providerStatus.status,
    providerAuthorizationStatus: providerStatus.authorizationStatus,
  };
  if (nextStatus === "ACTIVE" && !subscription.startDate) subscription.startDate = new Date();
  if (nextStatus === "FAILED" && !subscription.endedAt) subscription.endedAt = new Date();
  await subscription.save();

  const payment = await Payment.findOne({
    tenantId: subscription.tenantId,
    subscriptionId: subscription._id,
    provider: BILLING_PROVIDERS.CASHFREE,
    providerSubscriptionId: subscription.providerSubscriptionId,
  }).sort({ createdAt: -1 });
  if (payment) {
    payment.status =
      nextStatus === "ACTIVE" ? "authorized" : nextStatus === "FAILED" ? "failed" : "pending";
    payment.providerPaymentId = providerStatus.paymentId || payment.providerPaymentId;
    payment.paymentMethod = providerStatus.paymentMethod || payment.paymentMethod;
    payment.failureReason = nextStatus === "FAILED" ? "Cashfree authorization failed" : undefined;
    payment.metadata = {
      ...payment.metadata,
      authorizationVerified: nextStatus === "ACTIVE",
      providerAuthorizationStatus: providerStatus.authorizationStatus,
    };
    await payment.save();
  }

  return { nextStatus, payment, provider: providerStatus, subscription };
};

const syncCashfreeSubscription = async (subscription) => {
  const providerStatus = await getCashfreeService().fetchSubscription(
    subscription.providerSubscriptionId
  );
  const result = await applyCashfreeVerifiedStatus(subscription, providerStatus);
  console.info("[billing] Cashfree subscription status verified", {
    provider: "CASHFREE",
    providerSubscriptionId: subscription.providerSubscriptionId,
    verifiedStatus: result.nextStatus,
    localSubscriptionId: String(subscription._id),
  });
  return result;
};

const syncPendingSubscription = async (subscription) => {
  const provider = resolveSubscriptionProvider(subscription);
  console.info("[billing] Pending subscription status sync", {
    provider: provider.toUpperCase(),
    providerSubscriptionId: subscription.providerSubscriptionId,
    localSubscriptionId: String(subscription._id),
  });

  if (provider === BILLING_PROVIDERS.RAZORPAY) {
    const providerSubscription = await razorpayService.fetchSubscription(
      subscription.providerSubscriptionId
    );
    const syncedSubscription = await billingLifecycle.applyProviderSubscription(
      providerSubscription
    );
    console.info("[billing] Razorpay subscription status verified", {
      provider: "RAZORPAY",
      providerSubscriptionId: subscription.providerSubscriptionId,
      verifiedStatus: syncedSubscription.status,
      localSubscriptionId: String(syncedSubscription._id),
    });
    return syncedSubscription;
  }

  if (provider === BILLING_PROVIDERS.CASHFREE) {
    const result = await syncCashfreeSubscription(subscription);
    return result.subscription;
  }

  throw billingError(
    "BILLING_PROVIDER_UNSUPPORTED",
    "The stored billing provider is not supported.",
    500
  );
};

module.exports = {
  BILLING_PROVIDERS,
  applyCashfreeVerifiedStatus,
  mapCashfreeVerifiedStatus,
  resolveSubscriptionProvider,
  syncCashfreeSubscription,
  syncPendingSubscription,
};
