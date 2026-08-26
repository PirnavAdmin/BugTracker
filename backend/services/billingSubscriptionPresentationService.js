const { getPlan } = require("./planService");

const derivePaymentStatus = (subscription, payment) => {
  if (payment?.status) return payment.status;
  const status = String(subscription?.status || "").toUpperCase();
  if (status === "ACTIVE") return "authorized";
  if (status === "PENDING") return "pending";
  if (status === "FAILED") return "failed";
  if (status === "CANCELLED") return "cancelled";
  return null;
};

const serializeBillingSubscription = (subscription, payment = null) => {
  if (!subscription) return null;
  const plan = getPlan(subscription.planId);
  return {
    id: subscription._id,
    provider: subscription.provider || "razorpay",
    planId: subscription.planId,
    planName: plan?.name || subscription.planId,
    billingCycle: subscription.billingCycle,
    status: subscription.status,
    providerStatus: subscription.providerStatus,
    paymentStatus: derivePaymentStatus(subscription, payment),
    currency: subscription.currency,
    amount: subscription.amount,
    createdAt: subscription.createdAt,
    startDate: subscription.startDate,
    currentPeriodStart: subscription.currentPeriodStart,
    currentPeriodEnd: subscription.currentPeriodEnd,
    expiryDate: subscription.expiryDate,
    cancelledAt: subscription.cancelledAt,
    endedAt: subscription.endedAt,
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    providerSubscriptionId: subscription.providerSubscriptionId,
  };
};

module.exports = {
  derivePaymentStatus,
  serializeBillingSubscription,
};
