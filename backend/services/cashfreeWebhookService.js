const Payment = require("../models/Payment");
const Subscription = require("../models/Subscription");
const providerSync = require("./billingProviderSyncService");
const { recordPlatformAudit } = require("./platformAuditService");

const SUPPORTED_EVENTS = new Set([
  "SUBSCRIPTION_STATUS_CHANGED",
  "SUBSCRIPTION_AUTH_STATUS",
  "SUBSCRIPTION_PAYMENT_NOTIFICATION_INITIATED",
  "SUBSCRIPTION_PAYMENT_SUCCESS",
  "SUBSCRIPTION_PAYMENT_FAILED",
  "SUBSCRIPTION_PAYMENT_CANCELLED",
  "SUBSCRIPTION_REFUND_STATUS",
  "SUBSCRIPTION_CARD_EXPIRY_REMINDER",
]);

const PAYMENT_EVENTS = new Set([
  "SUBSCRIPTION_AUTH_STATUS",
  "SUBSCRIPTION_PAYMENT_NOTIFICATION_INITIATED",
  "SUBSCRIPTION_PAYMENT_SUCCESS",
  "SUBSCRIPTION_PAYMENT_FAILED",
  "SUBSCRIPTION_PAYMENT_CANCELLED",
]);

const webhookError = (code, message, status = 400) =>
  Object.assign(new Error(message), { code, status });

const parseDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
};

const extractWebhookData = (payload = {}) => {
  const data = payload?.data || {};
  const wrappedStatus = data.subscription_status_webhook || {};
  const subscriptionDetails = data.subscription_details || wrappedStatus.subscription_details || {};
  const authorizationDetails = data.authorization_details || wrappedStatus.authorization_details || {};
  return {
    data,
    subscriptionDetails,
    authorizationDetails,
    providerSubscriptionId: String(
      subscriptionDetails.subscription_id || data.subscription_id || ""
    ).trim(),
  };
};

const safePaymentMethod = (authorization = {}) => {
  if (authorization.payment_group) return String(authorization.payment_group).toLowerCase();
  if (typeof authorization.payment_method === "string") {
    return authorization.payment_method.toLowerCase();
  }
  if (authorization.payment_method && typeof authorization.payment_method === "object") {
    return String(Object.keys(authorization.payment_method)[0] || "").toLowerCase() || undefined;
  }
  return undefined;
};

const providerStateFromWebhook = ({
  type,
  subscriptionDetails,
  authorizationDetails,
  currentStatus,
}) => ({
  status:
    type === "SUBSCRIPTION_PAYMENT_FAILED"
      ? "FAILED"
      : type === "SUBSCRIPTION_PAYMENT_SUCCESS"
        ? subscriptionDetails.subscription_status || "ACTIVE"
        : type === "SUBSCRIPTION_PAYMENT_CANCELLED"
          ? subscriptionDetails.subscription_status || currentStatus
      : type === "SUBSCRIPTION_AUTH_STATUS"
        ? ["ACTIVE", "SUCCESS", "AUTHORIZED", "AUTHORISED"].includes(
            String(authorizationDetails.authorization_status || "").toUpperCase()
          )
          ? subscriptionDetails.subscription_status || "ACTIVE"
          : ["FAILED", "FAILURE"].includes(
                String(authorizationDetails.authorization_status || "").toUpperCase()
              )
            ? "FAILED"
            : subscriptionDetails.subscription_status
        : subscriptionDetails.subscription_status,
  authorizationStatus: authorizationDetails.authorization_status,
  authorizationTime: authorizationDetails.authorization_time,
  paymentId: authorizationDetails.payment_id,
  paymentMethod: safePaymentMethod(authorizationDetails),
  firstChargeTime: subscriptionDetails.subscription_first_charge_time,
  nextScheduleDate: subscriptionDetails.next_schedule_date,
  expiryDate: subscriptionDetails.subscription_expiry_time,
});

const paymentStatusForEvent = (type, data) => {
  if (type === "SUBSCRIPTION_PAYMENT_SUCCESS") return "captured";
  if (type === "SUBSCRIPTION_PAYMENT_FAILED") return "failed";
  if (type === "SUBSCRIPTION_PAYMENT_CANCELLED") return "cancelled";
  if (type === "SUBSCRIPTION_PAYMENT_NOTIFICATION_INITIATED") return "pending";
  const authorizationStatus = String(data.authorization_details?.authorization_status || "").toUpperCase();
  return ["ACTIVE", "SUCCESS", "AUTHORIZED", "AUTHORISED"].includes(authorizationStatus)
    ? "authorized"
    : ["FAILED", "FAILURE"].includes(authorizationStatus)
      ? "failed"
      : "pending";
};

const upsertWebhookPayment = async ({ subscription, type, data, eventTime }) => {
  const providerPaymentId = String(data.payment_id || data.cf_payment_id || "").trim();
  if (!providerPaymentId) return null;
  const paymentType = String(data.payment_type || "").toUpperCase();
  const isAuthorization = type === "SUBSCRIPTION_AUTH_STATUS" || paymentType === "AUTH";
  let payment = await Payment.findOne({
    tenantId: subscription.tenantId,
    provider: "cashfree",
    providerPaymentId,
  }).sort({ createdAt: -1 });
  if (!payment && isAuthorization) {
    payment = await Payment.findOne({
      tenantId: subscription.tenantId,
      subscriptionId: subscription._id,
      provider: "cashfree",
      providerSubscriptionId: subscription.providerSubscriptionId,
      "metadata.attemptType": "subscription_authorization",
    }).sort({ createdAt: -1 });
  }

  const status = paymentStatusForEvent(type, data);
  const paymentAmount = Number(data.payment_amount);
  const payload = {
    tenantId: subscription.tenantId,
    subscriptionId: subscription._id,
    provider: "cashfree",
    providerPaymentId,
    providerOrderId: data.cf_order_id ? String(data.cf_order_id) : undefined,
    providerSubscriptionId: subscription.providerSubscriptionId,
    amount:
      !isAuthorization && Number.isFinite(paymentAmount) && paymentAmount >= 0
        ? paymentAmount
        : subscription.amount,
    currency: String(data.payment_currency || subscription.currency || "INR").toUpperCase(),
    status,
    paymentMethod: safePaymentMethod(data.authorization_details || {}),
    capturedAt: status === "captured" ? parseDate(eventTime) || new Date() : undefined,
    failureReason:
      status === "failed" ? "Cashfree subscription payment failed" : undefined,
    metadata: {
      ...(payment?.metadata || {}),
      attemptType: isAuthorization ? "subscription_authorization" : "recurring_charge",
      cashfreePaymentType: paymentType || undefined,
      providerPaymentStatus: data.payment_status,
      paymentScheduleDate: data.payment_schedule_date,
    },
  };

  if (!payment) payment = new Payment(payload);
  else Object.assign(payment, payload);
  await payment.save();
  return payment;
};

const processCashfreeWebhook = async (payload) => {
  const type = String(payload?.type || "").trim().toUpperCase();
  if (!SUPPORTED_EVENTS.has(type)) return { ignored: true, type };
  if (["SUBSCRIPTION_REFUND_STATUS", "SUBSCRIPTION_CARD_EXPIRY_REMINDER"].includes(type)) {
    return { ignored: true, type };
  }

  const extracted = extractWebhookData(payload);
  if (!extracted.providerSubscriptionId) {
    throw webhookError(
      "CASHFREE_WEBHOOK_SUBSCRIPTION_ID_MISSING",
      "Cashfree webhook subscription ID is missing"
    );
  }
  const subscription = await Subscription.findOne({
    provider: "cashfree",
    providerSubscriptionId: extracted.providerSubscriptionId,
  });
  if (!subscription) {
    throw webhookError(
      "CASHFREE_WEBHOOK_SUBSCRIPTION_NOT_FOUND",
      "Cashfree webhook subscription was not found",
      404
    );
  }

  if (type === "SUBSCRIPTION_PAYMENT_NOTIFICATION_INITIATED") {
    const nextScheduleDate = parseDate(extracted.subscriptionDetails.next_schedule_date);
    if (nextScheduleDate) subscription.currentPeriodEnd = nextScheduleDate;
    await subscription.save();
  } else {
    const scheduledAt = parseDate(extracted.data.payment_schedule_date);
    if (
      type === "SUBSCRIPTION_PAYMENT_SUCCESS" &&
      String(extracted.data.payment_type || "").toUpperCase() !== "AUTH" &&
      scheduledAt
    ) {
      subscription.currentPeriodStart = scheduledAt;
    }
    await providerSync.applyCashfreeVerifiedStatus(
      subscription,
      providerStateFromWebhook({ type, currentStatus: subscription.status, ...extracted }),
      { updateAuthorizationPayment: !PAYMENT_EVENTS.has(type) }
    );
  }

  const payment = PAYMENT_EVENTS.has(type)
    ? await upsertWebhookPayment({
        subscription,
        type,
        data: extracted.data,
        eventTime: payload.event_time,
      })
    : null;

  if (["SUBSCRIPTION_PAYMENT_SUCCESS", "SUBSCRIPTION_PAYMENT_FAILED"].includes(type)) {
    await recordPlatformAudit({
      action:
        type === "SUBSCRIPTION_PAYMENT_SUCCESS"
          ? "CASHFREE_PAYMENT_SUCCEEDED"
          : "CASHFREE_PAYMENT_FAILED",
      metadata: {
        companyId: String(subscription.companyId),
        tenantId: subscription.tenantId,
        subscriptionId: String(subscription._id),
        providerSubscriptionId: subscription.providerSubscriptionId,
        providerPaymentId: payment?.providerPaymentId,
      },
    });
  }

  return { subscription, payment, type };
};

module.exports = {
  PAYMENT_EVENTS,
  SUPPORTED_EVENTS,
  extractWebhookData,
  paymentStatusForEvent,
  processCashfreeWebhook,
  providerStateFromWebhook,
  safePaymentMethod,
  upsertWebhookPayment,
};
