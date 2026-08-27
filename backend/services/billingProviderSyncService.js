const Payment = require("../models/Payment");
const PlatformCompany = require("../models/PlatformCompany");
const { recordPlatformAudit } = require("./platformAuditService");

const getCashfreeService = () => require("./payment/cashfreeService");

const BILLING_PROVIDERS = Object.freeze({
  CASHFREE: "cashfree",
});

const billingError = (code, message, status = 400) =>
  Object.assign(new Error(message), { code, status });

const resolveSubscriptionProvider = (subscription) => {
  const provider = String(subscription?.provider || "").trim().toLowerCase();
  return provider || BILLING_PROVIDERS.CASHFREE;
};

const mapCashfreeVerifiedStatus = ({ status, authorizationStatus }) => {
  const providerStatus = String(status || "").trim().toUpperCase();
  const authStatus = String(authorizationStatus || "").trim().toUpperCase();
  if (["CANCELLED", "CUSTOMER_CANCELLED"].includes(providerStatus)) return "CANCELLED";
  if (["EXPIRED", "COMPLETED", "LINK_EXPIRED", "CARD_EXPIRED"].includes(providerStatus)) {
    return "EXPIRED";
  }
  if (
    ["FAILED", "FAILURE", "CANCELLED", "EXPIRED"].includes(authStatus) ||
    ["FAILED", "FAILURE"].includes(providerStatus)
  ) {
    return "FAILED";
  }
  if (
    ["ACTIVE", "SUCCESS"].includes(providerStatus) &&
    (!authStatus || ["ACTIVE", "SUCCESS", "AUTHORIZED", "AUTHORISED"].includes(authStatus))
  ) {
    return "ACTIVE";
  }
  return "PENDING";
};

const parseProviderDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
};

const auditActionForStatus = (status) =>
  ({
    ACTIVE: "CASHFREE_SUBSCRIPTION_ACTIVATED",
    PENDING: "CASHFREE_AUTHORIZATION_PENDING",
    FAILED: "CASHFREE_SUBSCRIPTION_FAILED",
    CANCELLED: "CASHFREE_SUBSCRIPTION_CANCELLED",
    EXPIRED: "CASHFREE_SUBSCRIPTION_EXPIRED",
  })[status] || "CASHFREE_SUBSCRIPTION_UPDATED";

const syncCashfreePlatformState = async (subscription, previousStatus) => {
  if (subscription?.provider !== BILLING_PROVIDERS.CASHFREE || !subscription.companyId) return;
  if (subscription.status === "ACTIVE") {
    await PlatformCompany.findOneAndUpdate(
      { _id: subscription.companyId, tenantId: subscription.tenantId },
      { $set: { planId: subscription.planId } }
    );
  }
  if (previousStatus !== subscription.status) {
    await recordPlatformAudit({
      action: auditActionForStatus(subscription.status),
      metadata: {
        companyId: String(subscription.companyId),
        tenantId: subscription.tenantId,
        subscriptionId: String(subscription._id),
        providerSubscriptionId: subscription.providerSubscriptionId,
        planId: subscription.planId,
        previousStatus,
        status: subscription.status,
      },
    });
  }
};

const applyCashfreeVerifiedStatus = async (
  subscription,
  providerStatus,
  { updateAuthorizationPayment = true } = {}
) => {
  const previousStatus = subscription.status;
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
  const authorizationTime = parseProviderDate(providerStatus.authorizationTime);
  const nextScheduleDate = parseProviderDate(providerStatus.nextScheduleDate);
  const expiryDate = parseProviderDate(providerStatus.expiryDate);
  if (nextStatus === "ACTIVE" && !subscription.startDate) {
    subscription.startDate = authorizationTime || new Date();
  }
  if (nextScheduleDate) subscription.currentPeriodEnd = nextScheduleDate;
  if (expiryDate) subscription.expiryDate = expiryDate;
  if (nextStatus === "CANCELLED" && !subscription.cancelledAt) subscription.cancelledAt = new Date();
  if (["CANCELLED", "EXPIRED"].includes(nextStatus) && !subscription.endedAt) {
    subscription.endedAt = nextStatus === "EXPIRED" ? expiryDate || new Date() : new Date();
  }
  if (nextStatus === "FAILED" && !subscription.endedAt) subscription.endedAt = new Date();
  await subscription.save();

  const payment = updateAuthorizationPayment
    ? await Payment.findOne({
        tenantId: subscription.tenantId,
        subscriptionId: subscription._id,
        provider: BILLING_PROVIDERS.CASHFREE,
        providerSubscriptionId: subscription.providerSubscriptionId,
      }).sort({ createdAt: -1 })
    : null;
  if (payment) {
    payment.status = nextStatus === "ACTIVE"
      ? "authorized"
      : nextStatus === "FAILED"
        ? "failed"
        : nextStatus === "CANCELLED"
          ? "cancelled"
          : nextStatus === "EXPIRED"
            ? "expired"
            : "pending";
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

  await syncCashfreePlatformState(subscription, previousStatus);

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
  syncCashfreePlatformState,
  syncCashfreeSubscription,
  syncPendingSubscription,
};
