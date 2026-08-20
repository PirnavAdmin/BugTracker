const Subscription = require("../models/Subscription");
const Payment = require("../models/Payment");
const transitions = Object.freeze({ TRIAL: ["ACTIVE", "CANCELLED", "EXPIRED"], PENDING: ["ACTIVE", "PAST_DUE", "CANCELLED"], ACTIVE: ["PAST_DUE", "PAUSED", "CANCELLED", "EXPIRED"], PAST_DUE: ["ACTIVE", "SUSPENDED", "CANCELLED"], PAUSED: ["ACTIVE", "CANCELLED"], SUSPENDED: ["ACTIVE", "CANCELLED", "EXPIRED"], CANCELLED: [], EXPIRED: [] });
const mapProviderStatus = (status) => ({ created: "PENDING", authenticated: "PENDING", active: "ACTIVE", resumed: "ACTIVE", pending: "PENDING", halted: "PAST_DUE", cancelled: "CANCELLED", completed: "EXPIRED", paused: "PAUSED" })[String(status || "").toLowerCase()] || null;
const unixDate = (value) => value ? new Date(Number(value) * 1000) : undefined;
const transitionSubscription = async (subscription, nextStatus, providerStatus, fields = {}) => {
  if (!nextStatus) return subscription;
  if (subscription.status !== nextStatus && !(transitions[subscription.status] || []).includes(nextStatus)) throw Object.assign(new Error(`Invalid billing transition ${subscription.status} -> ${nextStatus}`), { code: "BILLING_INVALID_STATE_TRANSITION" });
  Object.assign(subscription, fields, { status: nextStatus, providerStatus: providerStatus || subscription.providerStatus }); await subscription.save(); return subscription;
};
const applyProviderSubscription = async (providerSubscription) => {
  if (!providerSubscription?.id) throw Object.assign(new Error("Billing subscription could not be resolved."), { code: "BILLING_SUBSCRIPTION_NOT_FOUND" });
  const subscription = await Subscription.findOne({ providerSubscriptionId: providerSubscription.id });
  if (!subscription) throw Object.assign(new Error("Billing subscription could not be resolved."), { code: "BILLING_SUBSCRIPTION_NOT_FOUND" });
  const next = mapProviderStatus(providerSubscription.status);
  return transitionSubscription(subscription, next, providerSubscription.status, { currentPeriodStart: unixDate(providerSubscription.current_start), currentPeriodEnd: unixDate(providerSubscription.current_end), startDate: unixDate(providerSubscription.start_at) || subscription.startDate, cancelledAt: providerSubscription.status === "cancelled" ? new Date() : subscription.cancelledAt, endedAt: providerSubscription.status === "completed" ? new Date() : subscription.endedAt });
};
const upsertPayment = async (payment, status) => {
  if (!payment?.id || !payment.subscription_id) throw Object.assign(new Error("Billing subscription could not be resolved."), { code: "BILLING_SUBSCRIPTION_NOT_FOUND" });
  const subscription = await Subscription.findOne({ providerSubscriptionId: payment.subscription_id });
  if (!subscription?.tenantId) throw Object.assign(new Error("Billing subscription could not be resolved."), { code: "BILLING_SUBSCRIPTION_NOT_FOUND" });
  return Payment.findOneAndUpdate({ providerPaymentId: payment.id }, { $set: { tenantId: subscription.tenantId, subscriptionId: subscription._id, provider: "razorpay", providerOrderId: payment.order_id, providerSubscriptionId: payment.subscription_id, amount: Number(payment.amount || 0) / 100, currency: payment.currency || "INR", status: status || payment.status || "created", paymentMethod: payment.method, capturedAt: payment.captured ? new Date() : undefined, failureReason: payment.error_description, metadata: { razorpayStatus: payment.status } } }, { upsert: true, new: true, setDefaultsOnInsert: true });
};
module.exports = { applyProviderSubscription, upsertPayment, transitionSubscription, mapProviderStatus };
