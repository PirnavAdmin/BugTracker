const crypto = require("crypto");
const asyncHandler = require("../utils/asyncHandler");
const { buildAppUrl } = require("../config/env");
const { PLATFORM_COMPANY_STATUSES } = require("../constants/platformSubscriptions");
const PlatformCompany = require("../models/PlatformCompany");
const Subscription = require("../models/Subscription");
const Payment = require("../models/Payment");
const { getPlan } = require("../services/planService");
const cashfreeService = require("../services/payment/cashfreeService");
const { requireTenant } = require("../utils/tenant");

const ALLOWED_REQUEST_FIELDS = new Set(["planId", "billingCycle"]);
const CURRENT_SUBSCRIPTION_STATUSES = ["TRIAL", "PENDING", "ACTIVE", "PAST_DUE", "PAUSED"];
const SUPPORTED_BILLING_CYCLES = new Set(["monthly", "annual"]);

const apiError = (code, message, status = 400) =>
  Object.assign(new Error(message), { code, status });

const rejectUnexpectedFields = (body = {}) => {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw apiError("CASHFREE_REQUEST_INVALID", "A JSON request body is required");
  }
  const unexpectedFields = Object.keys(body).filter((field) => !ALLOWED_REQUEST_FIELDS.has(field));
  if (unexpectedFields.length > 0) {
    throw apiError(
      "CASHFREE_REQUEST_FIELDS_INVALID",
      "Only planId and billingCycle may be supplied"
    );
  }
};

const resolveRequestedPlan = (body = {}) => {
  const planId = String(body.planId || "").trim().toLowerCase();
  const billingCycle = String(body.billingCycle || "").trim().toLowerCase();
  const plan = getPlan(planId);

  if (!plan || plan.active === false || ["free", "enterprise"].includes(planId)) {
    throw apiError("CASHFREE_PLAN_NOT_SUPPORTED", "This CureCode plan is not supported");
  }

  if (!SUPPORTED_BILLING_CYCLES.has(billingCycle)) {
    throw apiError(
      "CASHFREE_BILLING_CYCLE_NOT_SUPPORTED",
      "Billing cycle must be monthly or annual"
    );
  }

  const amount = billingCycle === "annual" ? plan.priceAnnual : plan.priceMonthly;
  if (!Number.isFinite(amount) || amount <= 0) {
    throw apiError("CASHFREE_PLAN_NOT_SUPPORTED", "This CureCode plan is not billable");
  }

  return { plan, planId, billingCycle, amount, currency: plan.currency };
};

const safeResult = ({ subscriptionId, subscriptionSessionId, status, reused = false }) => ({
  success: true,
  subscriptionId,
  subscriptionSessionId,
  status,
  ...(reused ? { reused: true } : {}),
});

const reusablePendingResult = (subscription) => {
  const subscriptionSessionId = subscription?.metadata?.subscriptionSessionId;
  if (
    subscription?.provider === "cashfree" &&
    subscription.status === "PENDING" &&
    subscriptionSessionId &&
    subscription.providerSubscriptionId
  ) {
    return safeResult({
      subscriptionId: subscription.providerSubscriptionId,
      subscriptionSessionId,
      status: subscription.providerStatus || subscription.status,
      reused: true,
    });
  }
  return null;
};

const buildReference = () => `cc_${crypto.randomUUID()}`;

const createSubscription = asyncHandler(async (req, res) => {
  rejectUnexpectedFields(req.body);

  const tenantId = requireTenant(req, res);
  const userId = String(req.user?._id || req.user?.id || "").trim();
  if (!userId) {
    throw apiError("CASHFREE_USER_CONTEXT_REQUIRED", "Authenticated user context is required", 403);
  }

  const billing = resolveRequestedPlan(req.body);
  const company = await PlatformCompany.findOne({ tenantId });
  if (!company || company.status !== PLATFORM_COMPANY_STATUSES.ACTIVE) {
    throw apiError(
      "CASHFREE_COMPANY_NOT_ACTIVE",
      "Billing is unavailable for this company",
      403
    );
  }

  const currentSubscription = await Subscription.findOne({
    tenantId,
    status: { $in: CURRENT_SUBSCRIPTION_STATUSES },
  }).sort({ createdAt: -1 });

  const reusable = reusablePendingResult(currentSubscription);
  if (reusable) {
    return res.status(200).json(reusable);
  }

  const retryFailedAttempt =
    currentSubscription?.provider === "cashfree" &&
    currentSubscription.status === "PENDING" &&
    currentSubscription.providerStatus === "CREATION_FAILED" &&
    currentSubscription.planId === billing.planId &&
    currentSubscription.billingCycle === billing.billingCycle &&
    currentSubscription.providerSubscriptionId;

  if (currentSubscription && !retryFailedAttempt) {
    throw apiError(
      "CASHFREE_ALREADY_SUBSCRIBED",
      "A current billing subscription already exists",
      409
    );
  }

  const reference = retryFailedAttempt
    ? currentSubscription.providerSubscriptionId
    : buildReference();
  const providerPlanId = `cashfree-inline:${billing.planId}:${billing.billingCycle}`;
  const localSubscription = retryFailedAttempt
    ? currentSubscription
    : await Subscription.create({
        tenantId,
        companyId: company._id,
        planId: billing.planId,
        billingCycle: billing.billingCycle,
        provider: "cashfree",
        providerSubscriptionId: reference,
        providerPlanId,
        status: "PENDING",
        providerStatus: "CREATING",
        currency: billing.currency,
        amount: billing.amount,
        metadata: {
          createdByUserId: userId,
          providerPlanType: "inline",
        },
      });

  if (retryFailedAttempt) {
    localSubscription.providerStatus = "CREATING";
    localSubscription.metadata = {
      ...localSubscription.metadata,
      retriedByUserId: userId,
    };
    await localSubscription.save();
  }

  const paymentAttempt = await Payment.create({
    tenantId,
    subscriptionId: localSubscription._id,
    provider: "cashfree",
    providerOrderId: reference,
    providerSubscriptionId: reference,
    amount: billing.amount,
    currency: billing.currency,
    status: "pending",
    metadata: {
      planId: billing.planId,
      billingCycle: billing.billingCycle,
      attemptType: "subscription_authorization",
      createdByUserId: userId,
    },
  });

  let providerResult;
  try {
    providerResult = await cashfreeService.createSubscription({
      tenantId,
      userId,
      customer: {
        name: req.user?.name || company.contactPerson || company.name,
        email: req.user?.email || company.contactEmail || company.email,
        phone: company.contactPhone,
      },
      planId: billing.planId,
      billingCycle: billing.billingCycle,
      amount: billing.amount,
      currency: billing.currency,
      returnUrl: buildAppUrl("/settings/billing?cashfree=return"),
      reference,
      notificationChannels: ["EMAIL"],
    });
  } catch {
    localSubscription.providerStatus = "CREATION_FAILED";
    localSubscription.metadata = {
      ...localSubscription.metadata,
      creationErrorCode: "CASHFREE_SUBSCRIPTION_CREATION_FAILED",
    };
    paymentAttempt.status = "failed";
    paymentAttempt.failureReason = "Cashfree subscription creation failed";
    await Promise.allSettled([localSubscription.save(), paymentAttempt.save()]);
    throw apiError(
      "CASHFREE_SUBSCRIPTION_CREATION_FAILED",
      "Cashfree subscription creation failed",
      502
    );
  }

  localSubscription.providerSubscriptionId = providerResult.subscriptionId || reference;
  localSubscription.providerStatus = providerResult.status || "INITIALIZED";
  localSubscription.status = "PENDING";
  localSubscription.metadata = {
    ...localSubscription.metadata,
    subscriptionSessionId: providerResult.subscriptionSessionId,
  };
  await localSubscription.save();

  paymentAttempt.providerSubscriptionId = localSubscription.providerSubscriptionId;
  paymentAttempt.metadata = {
    ...paymentAttempt.metadata,
    subscriptionSessionId: providerResult.subscriptionSessionId,
  };
  await paymentAttempt.save();

  return res.status(201).json(
    safeResult({
      subscriptionId: localSubscription.providerSubscriptionId,
      subscriptionSessionId: providerResult.subscriptionSessionId,
      status: localSubscription.providerStatus,
    })
  );
});

module.exports = {
  createSubscription,
  rejectUnexpectedFields,
  resolveRequestedPlan,
};
