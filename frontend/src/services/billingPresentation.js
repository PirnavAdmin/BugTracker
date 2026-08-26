const PLAN_NAMES = Object.freeze({
  starter: "Starter",
  professional: "Professional",
  business: "Business",
});

const STATUS_MESSAGES = Object.freeze({
  PENDING: "Initial authorization/payment is still being processed.",
  FAILED: "Authorization/payment was not completed.",
  CANCELLED: "This subscription has been cancelled.",
  EXPIRED: "This subscription has expired.",
});

export const getPlanName = (planId) => {
  const normalized = String(planId || "").trim().toLowerCase();
  if (PLAN_NAMES[normalized]) return PLAN_NAMES[normalized];
  return normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : "Plan";
};

export const getBillingCycleLabel = (billingCycle) =>
  String(billingCycle || "").toLowerCase() === "annual" ? "Annual" : "Monthly";

export const getBillingIntervalLabel = (billingCycle) =>
  String(billingCycle || "").toLowerCase() === "annual" ? "year" : "month";

export const getSubscriptionMessage = (status) => STATUS_MESSAGES[String(status || "").toUpperCase()] || "";

export const getSubscriptionPaymentStatus = (status) => {
  const normalized = String(status || "").toUpperCase();
  if (normalized === "ACTIVE") return "Authorized";
  if (normalized === "PENDING") return "Pending authorization";
  if (normalized === "FAILED") return "Failed";
  if (normalized === "CANCELLED") return "Cancelled";
  return normalized ? normalized.charAt(0) + normalized.slice(1).toLowerCase() : "Unknown";
};

export const getSubscriptionDateRows = (subscription = {}) => {
  const status = String(subscription.status || "").toUpperCase();
  return [
    subscription.createdAt && { label: "Created On", value: subscription.createdAt },
    subscription.startDate && {
      label: status === "ACTIVE" ? "Activated On" : "Subscription Started",
      value: subscription.startDate,
    },
    subscription.currentPeriodEnd && {
      label: "Next Billing Date",
      value: subscription.currentPeriodEnd,
    },
    subscription.cancelledAt && { label: "Cancelled On", value: subscription.cancelledAt },
    subscription.endedAt && {
      label: status === "EXPIRED" ? "Expiry Date" : "Ended On",
      value: subscription.endedAt,
    },
  ].filter(Boolean);
};

export const formatPaymentStatus = (status) => {
  const normalized = String(status || "").trim().toLowerCase();
  return normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : "Unknown";
};

export const formatProviderName = (provider) => {
  const normalized = String(provider || "razorpay").trim().toLowerCase();
  if (normalized === "cashfree") return "Cashfree";
  if (normalized === "razorpay") return "Razorpay";
  return normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : "Razorpay";
};
