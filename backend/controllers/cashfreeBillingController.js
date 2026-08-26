const crypto = require("crypto");
const asyncHandler = require("../utils/asyncHandler");
const { buildAppUrl } = require("../config/env");
const cashfreeConfig = require("../config/cashfree");
const { PLATFORM_COMPANY_STATUSES } = require("../constants/platformSubscriptions");
const PlatformCompany = require("../models/PlatformCompany");
const Subscription = require("../models/Subscription");
const Payment = require("../models/Payment");
const BillingWebhookEvent = require("../models/BillingWebhookEvent");
const { getPlan } = require("../services/planService");
const cashfreeService = require("../services/payment/cashfreeService");
const providerSync = require("../services/billingProviderSyncService");
const { serializeBillingSubscription } = require("../services/billingSubscriptionPresentationService");
const cashfreeWebhookService = require("../services/cashfreeWebhookService");
const { recordPlatformAudit } = require("../services/platformAuditService");
const { requireTenant } = require("../utils/tenant");

const ALLOWED_REQUEST_FIELDS = new Set(["planId", "billingCycle"]);
const CURRENT_SUBSCRIPTION_STATUSES = ["TRIAL", "PENDING", "ACTIVE", "PAST_DUE", "PAUSED", "FAILED"];
const SUPPORTED_BILLING_CYCLES = new Set(["monthly", "annual"]);
const LOCAL_CASHFREE_ERROR_CODES = new Set([
  "CASHFREE_INVALID_SUBSCRIPTION_DATA",
  "CASHFREE_INVALID_PLAN",
  "CASHFREE_AMOUNT_MISMATCH",
  "CASHFREE_CURRENCY_MISMATCH",
  "CASHFREE_SANDBOX_REQUIRED",
]);

const apiError = (code, message, status = 400) =>
  Object.assign(new Error(message), { code, status });

const normalizeCustomerPhone = (value) => {
  if (value === undefined || value === null) return "";
  const text = String(value).trim();
  if (!text || ["null", "undefined"].includes(text.toLowerCase())) return "";
  const normalized = text.replace(/[\s()-]/g, "");
  return /^\+?\d{8,15}$/.test(normalized) ? normalized : "";
};

const resolveCustomerPhone = ({ user, company }) => {
  const candidates = [user?.phone, user?.mobile, company?.contactPhone];
  for (const candidate of candidates) {
    const normalized = normalizeCustomerPhone(candidate);
    if (normalized) return normalized;
  }
  return "";
};

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

const rejectCancellationFields = (body = {}) => {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw apiError("CASHFREE_REQUEST_INVALID", "A JSON request body is required");
  }
  if (Object.keys(body).length > 0) {
    throw apiError(
      "CASHFREE_REQUEST_FIELDS_INVALID",
      "Cashfree cancellation does not accept subscription or customer identifiers"
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

const safeSubscription = serializeBillingSubscription;

const reusablePendingResult = (subscription) => {
  const subscriptionSessionId = subscription?.metadata?.subscriptionSessionId;
  if (
    subscription?.provider === "cashfree" &&
    subscription.status === "PENDING" &&
    subscription.providerStatus !== "CREATION_FAILED" &&
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
    ["FAILED", "PENDING"].includes(currentSubscription.status) &&
    ["CREATION_FAILED", "VALIDATION_FAILED"].includes(currentSubscription.providerStatus) &&
    currentSubscription.planId === billing.planId &&
    currentSubscription.billingCycle === billing.billingCycle;

  if (currentSubscription && !retryFailedAttempt) {
    throw apiError(
      "CASHFREE_ALREADY_SUBSCRIBED",
      "A current billing subscription already exists",
      409
    );
  }

  if (retryFailedAttempt) {
    const providerExisting = await cashfreeService.fetchSubscription(
      currentSubscription.providerSubscriptionId,
      { allowNotFound: true }
    );
    if (providerExisting) {
      console.info("[billing] Cashfree subscription reconciliation", {
        operation: "fetchSubscription",
        provider: "cashfree",
        providerSubscriptionId: currentSubscription.providerSubscriptionId,
        apiVersion: cashfreeService.CASHFREE_API_VERSION,
        reconciliationResult: "EXISTING",
      });
      if (!providerExisting.subscriptionSessionId) {
        throw apiError(
          "CASHFREE_SUBSCRIPTION_RETRY_UNSAFE",
          "The previous Cashfree subscription exists but cannot be safely resumed",
          409
        );
      }
      currentSubscription.status = "PENDING";
      currentSubscription.providerStatus = providerExisting.status || "INITIALIZED";
      currentSubscription.metadata = {
        ...currentSubscription.metadata,
        subscriptionSessionId: providerExisting.subscriptionSessionId,
        providerReferenceId: providerExisting.providerReferenceId,
        reconciledBeforeRetryAt: new Date(),
      };
      await currentSubscription.save();
      const existingPayment = await Payment.findOne({
        tenantId,
        subscriptionId: currentSubscription._id,
        provider: "cashfree",
        providerSubscriptionId: currentSubscription.providerSubscriptionId,
      }).sort({ createdAt: -1 });
      if (existingPayment) {
        existingPayment.status = "pending";
        existingPayment.failureReason = undefined;
        existingPayment.metadata = {
          ...existingPayment.metadata,
          subscriptionSessionId: providerExisting.subscriptionSessionId,
          reconciledBeforeRetry: true,
        };
        await existingPayment.save();
      }
      return res.status(200).json(
        safeResult({
          subscriptionId: currentSubscription.providerSubscriptionId,
          subscriptionSessionId: providerExisting.subscriptionSessionId,
          status: currentSubscription.providerStatus,
          reused: true,
        })
      );
    }

    currentSubscription.status = "FAILED";
    currentSubscription.providerStatus = "STALE_PROVIDER_REFERENCE";
    currentSubscription.metadata = {
      ...currentSubscription.metadata,
      staleProviderReference: currentSubscription.providerSubscriptionId,
      staleProviderReferenceDetectedAt: new Date(),
    };
    await currentSubscription.save();
  }

  const customerPhone = resolveCustomerPhone({ user: req.user, company });
  if (!customerPhone) {
    console.warn("[billing] Cashfree billing phone missing", {
      tenantId,
      userId,
      planId: billing.planId,
      billingCycle: billing.billingCycle,
    });
    throw apiError(
      "CASHFREE_BILLING_PHONE_REQUIRED",
      "Please add a billing contact phone number before starting the subscription.",
      400
    );
  }

  const reference = buildReference();
  const providerPlanId = `cashfree-inline:${billing.planId}:${billing.billingCycle}`;
  let localSubscription;
  let paymentAttempt;
  const createLocalAttempt = async () => {
    localSubscription = await Subscription.create({
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
          ...(retryFailedAttempt
            ? { retryOfSubscriptionId: String(currentSubscription._id), retriedByUserId: userId }
            : {}),
        },
      });

    paymentAttempt = await Payment.create({
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
  };

  // A stale provider reference must be retained for audit purposes, but a
  // replacement local attempt is not created unless Cashfree creates it first.
  if (!retryFailedAttempt) await createLocalAttempt();

  let providerResult;
  try {
    providerResult = await cashfreeService.createSubscription({
      tenantId,
      userId,
      customer: {
        name: req.user?.name || company.contactPerson || company.name,
        email: req.user?.email || company.contactEmail || company.email,
        phone: customerPhone,
      },
      planId: billing.planId,
      billingCycle: billing.billingCycle,
      amount: billing.amount,
      currency: billing.currency,
      returnUrl: buildAppUrl("/api/billing/cashfree/return"),
      reference,
      notificationChannels: ["EMAIL"],
    });
  } catch (error) {
    const isProviderFailure = Boolean(error?.providerDiagnostic);
    const isLocalValidationFailure = LOCAL_CASHFREE_ERROR_CODES.has(error?.code);
    const diagnostic = isProviderFailure ? error.providerDiagnostic : {};

    if (isLocalValidationFailure) {
      console.warn("[billing] Cashfree request validation error", {
        code: error.code,
        message: error.message,
        planId: billing.planId,
        billingCycle: billing.billingCycle,
      });
    }

    if (localSubscription && paymentAttempt) {
      localSubscription.status = "FAILED";
      localSubscription.providerStatus = isProviderFailure
        ? "CREATION_FAILED"
        : isLocalValidationFailure
          ? "VALIDATION_FAILED"
          : "INTERNAL_FAILED";
      localSubscription.metadata = {
        ...localSubscription.metadata,
        ...(isProviderFailure
          ? {
              creationErrorCode: "CASHFREE_SUBSCRIPTION_CREATION_FAILED",
              providerHttpStatus: diagnostic.httpStatus,
              providerErrorCode: diagnostic.providerErrorCode,
              providerErrorType: diagnostic.type,
              providerRequestId: diagnostic.requestId,
            }
          : {
              validationErrorCode: isLocalValidationFailure
                ? error.code
                : "CASHFREE_REQUEST_PREPARATION_FAILED",
            }),
      };
      paymentAttempt.status = "failed";
      paymentAttempt.failureReason = isLocalValidationFailure
        ? error.message
        : isProviderFailure
          ? "Cashfree subscription creation failed"
          : "Cashfree subscription request could not be prepared";
      await Promise.allSettled([localSubscription.save(), paymentAttempt.save()]);
    }

    if (isLocalValidationFailure) {
      throw apiError(error.code, error.message, error.status || 400);
    }

    if (!isProviderFailure) {
      throw apiError(
        "CASHFREE_REQUEST_PREPARATION_FAILED",
        "Cashfree subscription request could not be prepared",
        500
      );
    }

    throw apiError(
      "CASHFREE_SUBSCRIPTION_CREATION_FAILED",
      "Cashfree subscription creation failed",
      502
    );
  }

  if (!localSubscription) await createLocalAttempt();

  localSubscription.providerSubscriptionId = providerResult.subscriptionId || reference;
  localSubscription.providerStatus = providerResult.status || "INITIALIZED";
  localSubscription.status = "PENDING";
  localSubscription.metadata = {
    ...localSubscription.metadata,
    subscriptionSessionId: providerResult.subscriptionSessionId,
    providerReferenceId: providerResult.providerReferenceId,
  };
  await localSubscription.save();

  paymentAttempt.providerSubscriptionId = localSubscription.providerSubscriptionId;
  paymentAttempt.metadata = {
    ...paymentAttempt.metadata,
    subscriptionSessionId: providerResult.subscriptionSessionId,
  };
  await paymentAttempt.save();

  const auditMetadata = {
    companyId: String(company._id),
    tenantId,
    subscriptionId: String(localSubscription._id),
    providerSubscriptionId: localSubscription.providerSubscriptionId,
    planId: localSubscription.planId,
    billingCycle: localSubscription.billingCycle,
  };
  await recordPlatformAudit({
    action: "CASHFREE_SUBSCRIPTION_CREATED",
    metadata: auditMetadata,
  });
  await recordPlatformAudit({
    action: "CASHFREE_AUTHORIZATION_PENDING",
    metadata: auditMetadata,
  });

  return res.status(201).json(
    safeResult({
      subscriptionId: localSubscription.providerSubscriptionId,
      subscriptionSessionId: providerResult.subscriptionSessionId,
      status: localSubscription.providerStatus,
    })
  );
});

const mapVerifiedStatus = providerSync.mapCashfreeVerifiedStatus;
const applyVerifiedSubscriptionStatus = providerSync.syncCashfreeSubscription;

const redirectCashfreeReturn = (res, status) =>
  res.redirect(
    303,
    buildAppUrl(`/settings/billing?cashfree=return&status=${encodeURIComponent(status)}`)
  );

const returnSubscription = asyncHandler(async (req, res) => {
  const providerSubscriptionId = String(req.body?.cf_subscriptionId || "").trim();
  const hasValidProviderSubscriptionId =
    providerSubscriptionId.length > 0 &&
    providerSubscriptionId.length <= 250 &&
    /^[A-Za-z0-9_. -]+$/.test(providerSubscriptionId);
  console.info("[billing] Cashfree return received", {
    ...(hasValidProviderSubscriptionId ? { providerSubscriptionId } : {}),
    method: req.method,
    environment: cashfreeConfig.environment,
  });

  if (!hasValidProviderSubscriptionId) {
    return redirectCashfreeReturn(res, "failed");
  }

  const subscription = await Subscription.findOne({
    provider: "cashfree",
    providerSubscriptionId,
  }).sort({ createdAt: -1 });
  if (!subscription?.tenantId) {
    return redirectCashfreeReturn(res, "failed");
  }

  try {
    const { nextStatus } = await applyVerifiedSubscriptionStatus(subscription);
    const returnStatus = nextStatus === "ACTIVE" ? "success" : nextStatus.toLowerCase();
    console.info("[billing] Cashfree return status verified", {
      providerSubscriptionId,
      verifiedStatus: nextStatus,
      localSubscriptionId: String(subscription._id),
    });
    return redirectCashfreeReturn(res, returnStatus);
  } catch (error) {
    const diagnostic = error?.providerDiagnostic || {};
    console.error("[billing] Cashfree return verification failed", {
      httpStatus: diagnostic.httpStatus,
      providerErrorCode: diagnostic.providerErrorCode,
      sanitizedMessage: diagnostic.providerErrorMessage,
      requestId: diagnostic.requestId,
    });
    return redirectCashfreeReturn(res, "pending");
  }
});

const getSubscriptionStatus = asyncHandler(async (req, res) => {
  const tenantId = requireTenant(req, res);
  const subscription = await Subscription.findOne({
    tenantId,
    provider: "cashfree",
  }).sort({ createdAt: -1 });

  if (!subscription) {
    throw apiError("CASHFREE_SUBSCRIPTION_NOT_FOUND", "No Cashfree subscription was found", 404);
  }

  if (subscription.status !== "PENDING") {
    return res.json({ subscription: safeSubscription(subscription), verified: false });
  }

  await applyVerifiedSubscriptionStatus(subscription);

  return res.json({ subscription: safeSubscription(subscription), verified: true });
});

const cancelSubscription = asyncHandler(async (req, res) => {
  rejectCancellationFields(req.body || {});
  const tenantId = requireTenant(req, res);
  const subscription = await Subscription.findOne({
    tenantId,
    provider: "cashfree",
    status: { $in: ["ACTIVE", "CANCELLED"] },
  }).sort({ createdAt: -1 });
  if (!subscription) {
    throw apiError("CASHFREE_SUBSCRIPTION_NOT_FOUND", "No cancellable Cashfree subscription was found", 404);
  }
  if (subscription.status === "CANCELLED") {
    const payment = await Payment.findOne({
      tenantId,
      subscriptionId: subscription._id,
      provider: "cashfree",
      providerSubscriptionId: subscription.providerSubscriptionId,
    }).sort({ createdAt: -1 });
    return res.status(200).json({ success: true, subscription: safeSubscription(subscription, payment), reused: true });
  }

  let providerStatus;
  try {
    providerStatus = await cashfreeService.cancelSubscription(subscription.providerSubscriptionId);
  } catch (error) {
    console.error("[billing] Cashfree subscription cancellation failed", {
      provider: "cashfree",
      providerSubscriptionId: subscription.providerSubscriptionId,
      httpStatus: error?.providerDiagnostic?.httpStatus,
      providerErrorCode: error?.providerDiagnostic?.providerErrorCode,
      failureOrigin: error?.providerDiagnostic?.failureOrigin,
    });
    throw apiError(
      "CASHFREE_SUBSCRIPTION_CANCELLATION_FAILED",
      "Cashfree subscription cancellation failed",
      error?.status || 502
    );
  }

  const result = await providerSync.applyCashfreeVerifiedStatus(subscription, providerStatus);
  if (result.subscription.status !== "CANCELLED") {
    throw apiError(
      "CASHFREE_SUBSCRIPTION_CANCELLATION_UNCONFIRMED",
      "Cashfree has not confirmed subscription cancellation",
      502
    );
  }
  return res.status(200).json({
    success: true,
    subscription: safeSubscription(result.subscription, result.payment),
  });
});

const webhook = asyncHandler(async (req, res) => {
  const rawBody = req.body;
  const signature = req.get("x-webhook-signature");
  const timestamp = req.get("x-webhook-timestamp");
  if (!Buffer.isBuffer(rawBody) || !signature || !timestamp) {
    return res.status(400).json({
      code: "CASHFREE_WEBHOOK_INVALID_SIGNATURE",
      message: "Invalid Cashfree webhook signature",
    });
  }

  let payload;
  try {
    payload = cashfreeService.verifyWebhookSignature({ rawBody, signature, timestamp });
  } catch (error) {
    console.warn("[billing] Cashfree webhook signature rejected", {
      code: error?.code || "CASHFREE_WEBHOOK_INVALID_SIGNATURE",
      webhookVersion: req.get("x-webhook-version") || undefined,
    });
    return res.status(400).json({
      code: "CASHFREE_WEBHOOK_INVALID_SIGNATURE",
      message: "Invalid Cashfree webhook signature",
    });
  }

  const payloadHash = crypto.createHash("sha256").update(rawBody).digest("hex");
  const eventId = String(req.get("x-idempotency-key") || payloadHash).trim();
  let event;
  try {
    event = await BillingWebhookEvent.create({
      provider: "cashfree",
      eventId,
      eventType: String(payload?.type || "").toUpperCase(),
      payloadHash,
      status: "received",
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(200).json({ received: true, duplicate: true });
    }
    throw error;
  }

  try {
    const result = await cashfreeWebhookService.processCashfreeWebhook(payload);
    event.status = result.ignored ? "ignored" : "processed";
    event.tenantId = result.subscription?.tenantId;
    event.providerResourceId = result.subscription?.providerSubscriptionId;
    event.metadata = {
      eventType: result.type,
      localSubscriptionId: result.subscription?._id
        ? String(result.subscription._id)
        : undefined,
      localPaymentId: result.payment?._id ? String(result.payment._id) : undefined,
    };
    event.processedAt = new Date();
    await event.save();
    return res.status(200).json({ received: true, ...(result.ignored ? { ignored: true } : {}) });
  } catch (error) {
    event.status = error?.status === 404 ? "ignored" : "failed";
    event.processingError = error?.code || "CASHFREE_WEBHOOK_PROCESSING_FAILED";
    event.processedAt = new Date();
    await event.save();
    console.warn("[billing] Cashfree webhook processing rejected", {
      eventType: event.eventType,
      code: event.processingError,
    });
    if (error?.status === 404) {
      return res.status(404).json({ code: error.code, message: error.message });
    }
    throw error;
  }
});

module.exports = {
  LOCAL_CASHFREE_ERROR_CODES,
  applyVerifiedSubscriptionStatus,
  buildReference,
  createSubscription,
  cancelSubscription,
  getSubscriptionStatus,
  mapVerifiedStatus,
  normalizeCustomerPhone,
  rejectUnexpectedFields,
  rejectCancellationFields,
  resolveCustomerPhone,
  resolveRequestedPlan,
  returnSubscription,
  webhook,
};
