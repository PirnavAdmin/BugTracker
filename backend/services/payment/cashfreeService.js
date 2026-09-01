const crypto = require("crypto");
const { Cashfree, CFEnvironment } = require("cashfree-pg");
const cashfreeConfig = require("../../config/cashfree");
const { PLANS } = require("../../config/plans");
const { normalizeCashfreeCustomerPhone } = require("../../utils/customerPhone");

const BILLING_CYCLES = Object.freeze({
  MONTHLY: "monthly",
  ANNUAL: "annual",
});

// Cashfree's published Subscription API currently supports this version.  The
// installed SDK defaults to a newer generated version, so set it explicitly.
const CASHFREE_API_VERSION = "2025-01-01";
const CASHFREE_SANDBOX_ENDPOINT = "https://sandbox.cashfree.com/pg/subscriptions";

const serviceError = (code, message, status = 400) =>
  Object.assign(new Error(message), { code, status });

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_PATTERN = /(?:\+?\d[\d\s()-]{7,}\d)/g;

const sanitizeProviderText = (value) => {
  if (typeof value !== "string") return undefined;
  let sanitized = value;
  for (const secret of [cashfreeConfig.appId, cashfreeConfig.secretKey]) {
    if (secret) sanitized = sanitized.split(secret).join("[redacted]");
  }
  return sanitized
    .replace(EMAIL_PATTERN, "[redacted-email]")
    .replace(PHONE_PATTERN, "[redacted-phone]")
    .slice(0, 500);
};

const requireText = (value, field) => {
  const normalized = String(value || "").trim();
  if (!normalized) {
    throw serviceError("CASHFREE_INVALID_SUBSCRIPTION_DATA", `${field} is required`);
  }
  return normalized;
};

const requireUrl = (value, field) => {
  const normalized = requireText(value, field);
  try {
    const url = new URL(normalized);
    if (!new Set(["http:", "https:"]).has(url.protocol)) {
      throw new Error("Unsupported URL protocol");
    }
    if (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname)) {
      throw new Error("Public return URLs must use HTTPS");
    }
  } catch {
    throw serviceError("CASHFREE_INVALID_SUBSCRIPTION_DATA", `${field} must be a valid HTTP URL`);
  }
  return normalized;
};

const requireEmail = (value, field) => {
  const normalized = requireText(value, field).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw serviceError("CASHFREE_INVALID_SUBSCRIPTION_DATA", `${field} must be a valid email`);
  }
  return normalized;
};

const requirePhone = (value, field) => {
  const normalized = normalizeCashfreeCustomerPhone(value);
  if (!normalized) {
    throw serviceError(
      "CASHFREE_CUSTOMER_PHONE_INVALID",
      `${field} must be a valid phone number`
    );
  }
  return normalized;
};

const resolvePlanBilling = ({ planId, billingCycle, amount, currency }) => {
  const normalizedPlanId = requireText(planId, "planId").toLowerCase();
  const normalizedCycle = requireText(billingCycle, "billingCycle").toLowerCase();
  const plan = PLANS[normalizedPlanId];

  if (!plan || ![BILLING_CYCLES.MONTHLY, BILLING_CYCLES.ANNUAL].includes(normalizedCycle)) {
    throw serviceError(
      "CASHFREE_INVALID_PLAN",
      "A paid CureCode plan with a monthly or annual billing cycle is required"
    );
  }

  const serverAmount =
    normalizedCycle === BILLING_CYCLES.MONTHLY ? plan.priceMonthly : plan.priceAnnual;
  if (!Number.isFinite(serverAmount) || serverAmount <= 0) {
    throw serviceError("CASHFREE_INVALID_PLAN", "The CureCode plan is not billable");
  }

  if (amount !== undefined && Number(amount) !== serverAmount) {
    throw serviceError(
      "CASHFREE_AMOUNT_MISMATCH",
      "The subscription amount does not match the CureCode plan"
    );
  }

  const planCurrency = requireText(plan.currency, "plan currency").toUpperCase();
  if (currency !== undefined && requireText(currency, "currency").toUpperCase() !== planCurrency) {
    throw serviceError(
      "CASHFREE_CURRENCY_MISMATCH",
      "The subscription currency does not match the CureCode plan"
    );
  }

  return {
    plan,
    planId: normalizedPlanId,
    billingCycle: normalizedCycle,
    amount: serverAmount,
    currency: planCurrency,
    intervalType: normalizedCycle === BILLING_CYCLES.MONTHLY ? "MONTH" : "YEAR",
  };
};

const environment = String(cashfreeConfig.environment || "").trim().toLowerCase();
if (environment !== "sandbox") {
  throw serviceError(
    "CASHFREE_SANDBOX_REQUIRED",
    "Cashfree subscriptions are currently available only in Sandbox mode",
    503
  );
}

const cashfreeClient = new Cashfree(
  CFEnvironment.SANDBOX,
  cashfreeConfig.appId,
  cashfreeConfig.secretKey
);
// Pin the documented Subscription API version instead of relying on an SDK default.
cashfreeClient.XApiVersion = CASHFREE_API_VERSION;

const classifyProviderFailure = (error) => {
  if (error?.response?.status) return "CASHFREE_PROVIDER_RESPONSE";
  if (
    ["ECONNABORTED", "ETIMEDOUT", "ECONNRESET", "ERR_NETWORK", "ENOTFOUND", "EAI_AGAIN"].includes(
      String(error?.code || "").toUpperCase()
    )
  ) {
    return "NETWORK_TIMEOUT_OR_TRANSPORT";
  }
  return "LOCAL_REQUEST_FAILURE";
};

const diagnosticValue = (error, field) => {
  const response = error?.response;
  const responseData = response?.data;
  const value = responseData?.[field] ?? error?.[field];
  return typeof value === "string" || typeof value === "number" ? value : undefined;
};

const isSubscriptionNotFound = (error) => {
  const status = Number(error?.response?.status);
  const providerCode = String(diagnosticValue(error, "code") || "").trim().toLowerCase();
  return status === 404 || (status === 400 && providerCode === "subscription_not_found");
};

const isSubscriptionAlreadyCancelled = (error) => {
  const status = Number(error?.response?.status);
  const providerCode = String(diagnosticValue(error, "code") || "").toLowerCase();
  const providerMessage = String(diagnosticValue(error, "message") || "").toLowerCase();
  return (
    ["subscription_cancelled", "already_cancelled", "subscription_already_cancelled"].includes(
      providerCode
    ) ||
    (status === 409 && /cancel/.test(`${providerCode} ${providerMessage}`))
  );
};

const providerErrorDiagnostic = (error, context = {}) => {
  const diagnostic = {
    environment,
    operation: context.operation,
    endpoint: context.endpoint,
    apiVersion: context.apiVersion,
    failureOrigin: classifyProviderFailure(error),
    httpStatus: error?.response?.status ?? diagnosticValue(error, "statusCode"),
    providerErrorCode: diagnosticValue(error, "code"),
    providerErrorMessage: sanitizeProviderText(diagnosticValue(error, "message")),
    type: diagnosticValue(error, "type"),
    requestId: error?.response?.headers?.["x-request-id"] || context.requestId,
    providerSubscriptionId: context.providerSubscriptionId,
    planType: context.planType,
    billingCycle: context.billingCycle,
    amount: context.amount,
    currency: context.currency,
    requestIdPresent: Boolean(context.requestId),
    idempotencyKeyPresent: Boolean(context.idempotencyKeyPresent),
    timeoutConfigured: false,
    durationMs: context.startedAt ? Date.now() - context.startedAt : undefined,
  };
  Object.keys(diagnostic).forEach(
    (key) => diagnostic[key] === undefined && delete diagnostic[key]
  );
  return diagnostic;
};

const logProviderError = (error, context) => {
  const diagnostic = providerErrorDiagnostic(error, context);
  console.error("[billing] Cashfree provider error", diagnostic);
  return diagnostic;
};

const providerFailure = (error, context, code, message) => {
  const diagnostic = logProviderError(error, context);
  const httpStatus = Number(diagnostic.httpStatus);
  const providerCode = String(diagnostic.providerErrorCode || "").toLowerCase();
  const providerType = String(diagnostic.type || "").toLowerCase();
  const authenticationFailure =
    [401, 403].includes(httpStatus) || providerType === "authentication_error";
  const phoneValidationFailure =
    httpStatus === 400 && providerCode === "customer_details.customer_phone_invalid";
  const requestValidationFailure =
    httpStatus === 400 || providerType.includes("validation") || providerType.includes("invalid_request");
  const missingReference = httpStatus === 404;
  const connectivityFailure = diagnostic.failureOrigin === "NETWORK_TIMEOUT_OR_TRANSPORT";

  let classified = { code, message, status: 502 };
  if (authenticationFailure) {
    classified = {
      code: "CASHFREE_PROVIDER_AUTHENTICATION_FAILED",
      message: "Cashfree provider authentication failed",
      status: 503,
    };
  } else if (phoneValidationFailure) {
    classified = {
      code: "CASHFREE_CUSTOMER_PHONE_INVALID",
      message: "Cashfree rejected the customer phone number",
      status: 400,
    };
  } else if (requestValidationFailure) {
    classified = {
      code: "CASHFREE_PROVIDER_REQUEST_VALIDATION_FAILED",
      message: "Cashfree rejected the subscription request",
      status: 400,
    };
  } else if (missingReference) {
    classified = {
      code: "CASHFREE_PROVIDER_REFERENCE_NOT_FOUND",
      message: "Cashfree subscription reference was not found",
      status: 404,
    };
  } else if (connectivityFailure) {
    classified = {
      code: "CASHFREE_PROVIDER_CONNECTIVITY_FAILED",
      message: "Cashfree could not be reached",
      status: 503,
    };
  }

  return Object.assign(
    serviceError(classified.code, classified.message, classified.status),
    { providerDiagnostic: diagnostic }
  );
};

const normalizeNotificationChannels = (channels = ["EMAIL"]) => {
  if (!Array.isArray(channels) || channels.length === 0) {
    return [];
  }

  const normalized = [...new Set(channels.map((channel) => String(channel).trim().toUpperCase()))];
  if (normalized.some((channel) => !["EMAIL", "SMS"].includes(channel))) {
    throw serviceError(
      "CASHFREE_INVALID_SUBSCRIPTION_DATA",
      "notificationChannels may contain only EMAIL or SMS"
    );
  }
  return normalized;
};

const isAmbiguousCreateFailure = (error) => {
  const status = Number(error?.response?.status);
  return (
    [502, 503, 504].includes(status) ||
    classifyProviderFailure(error) === "NETWORK_TIMEOUT_OR_TRANSPORT"
  );
};

const requireCompleteSubscriptionResponse = (response) => {
  const data = response?.data || {};
  if (!data.subscription_id || !data.subscription_session_id) {
    throw Object.assign(new Error("Cashfree returned an incomplete subscription response"), {
      response: {
        status: response?.status,
        data: { code: "incomplete_provider_response" },
        headers: response?.headers,
      },
    });
  }
  return data;
};

const createSubscription = async ({
  tenantId,
  userId,
  customer,
  planId,
  billingCycle,
  amount,
  currency,
  returnUrl,
  reference,
  notificationChannels,
}) => {
  const merchantReference = requireText(reference, "reference");
  if (merchantReference.length > 250 || !/^[A-Za-z0-9_. -]+$/.test(merchantReference)) {
    throw serviceError(
      "CASHFREE_INVALID_SUBSCRIPTION_DATA",
      "reference contains unsupported characters or is too long"
    );
  }

  const tenantReference = requireText(tenantId, "tenantId");
  const userReference = requireText(userId, "userId");
  const billing = resolvePlanBilling({ planId, billingCycle, amount, currency });
  const subscriptionReturnUrl = requireUrl(returnUrl, "returnUrl");

  const request = {
    subscription_id: merchantReference,
    customer_details: {
      customer_name: requireText(customer?.name, "customer.name"),
      customer_email: requireEmail(customer?.email, "customer.email"),
      customer_phone: requirePhone(customer?.phone, "customer.phone"),
    },
    plan_details: {
      plan_name: `CureCode ${billing.plan.name} ${billing.billingCycle}`,
      plan_type: "PERIODIC",
      plan_currency: billing.currency,
      plan_amount: billing.amount,
      plan_max_amount: billing.amount,
      plan_intervals: 1,
      plan_interval_type: billing.intervalType,
      plan_note: `${billing.plan.name} ${billing.billingCycle} subscription`,
    },
    subscription_meta: {
      return_url: subscriptionReturnUrl,
      notification_channel: normalizeNotificationChannels(notificationChannels),
    },
    subscription_tags: {
      curecode_tenant_id: tenantReference,
      curecode_user_id: userReference,
      curecode_plan_id: billing.planId,
      curecode_billing_cycle: billing.billingCycle,
    },
  };
  const requestId = crypto.randomUUID();
  const idempotencyKey = crypto.randomUUID();
  const diagnosticContext = {
    operation: "createSubscription",
    endpoint: CASHFREE_SANDBOX_ENDPOINT,
    apiVersion: CASHFREE_API_VERSION,
    requestId,
    idempotencyKeyPresent: true,
    startedAt: Date.now(),
    providerSubscriptionId: merchantReference,
    planType: request.plan_details.plan_type,
    billingCycle: billing.billingCycle,
    amount: request.plan_details.plan_amount,
    currency: request.plan_details.plan_currency,
  };

  try {
    console.info("[billing] Cashfree create subscription request", {
      environment,
      operation: diagnosticContext.operation,
      endpoint: diagnosticContext.endpoint,
      apiVersion: diagnosticContext.apiVersion,
      providerSubscriptionId: merchantReference,
      planType: diagnosticContext.planType,
      billingCycle: diagnosticContext.billingCycle,
      amount: diagnosticContext.amount,
      currency: diagnosticContext.currency,
      requestIdPresent: true,
      idempotencyKeyPresent: true,
      timeoutConfigured: false,
    });
    let response;
    try {
      response = await cashfreeClient.SubsCreateSubscription(request, requestId, idempotencyKey);
    } catch (initialError) {
      if (!isAmbiguousCreateFailure(initialError)) throw initialError;

      const initialDiagnostic = providerErrorDiagnostic(initialError, diagnosticContext);
      console.warn("[billing] Cashfree create subscription response was ambiguous", {
        ...initialDiagnostic,
        recovery: "fetch_same_subscription_before_retry",
      });

      const lookupRequestId = crypto.randomUUID();
      let existingResponse;
      try {
        existingResponse = await cashfreeClient.SubsFetchSubscription(
          merchantReference,
          lookupRequestId
        );
      } catch (lookupError) {
        if (!isSubscriptionNotFound(lookupError)) {
          console.warn("[billing] Cashfree ambiguous create reconciliation was inconclusive", {
            environment,
            operation: "fetchSubscriptionAfterAmbiguousCreate",
            endpoint: CASHFREE_SANDBOX_ENDPOINT,
            apiVersion: CASHFREE_API_VERSION,
            providerSubscriptionId: merchantReference,
            failureOrigin: classifyProviderFailure(lookupError),
            httpStatus: lookupError?.response?.status,
            requestIdPresent: true,
          });
          throw initialError;
        }
      }

      if (existingResponse) {
        response = existingResponse;
        console.info("[billing] Cashfree ambiguous create reconciled to existing subscription", {
          environment,
          providerSubscriptionId: merchantReference,
          apiVersion: CASHFREE_API_VERSION,
          sessionIdConfigured: Boolean(existingResponse?.data?.subscription_session_id),
        });
      } else {
        const retryRequestId = crypto.randomUUID();
        console.info("[billing] Cashfree create subscription retrying once after confirmed absence", {
          environment,
          endpoint: CASHFREE_SANDBOX_ENDPOINT,
          apiVersion: CASHFREE_API_VERSION,
          providerSubscriptionId: merchantReference,
          requestIdPresent: true,
          idempotencyKeyReused: true,
        });
        response = await cashfreeClient.SubsCreateSubscription(
          request,
          retryRequestId,
          idempotencyKey
        );
      }
    }
    const data = requireCompleteSubscriptionResponse(response);

    console.info("[billing] Cashfree subscription created", {
      environment,
      statusCode: response?.status,
      apiVersion: CASHFREE_API_VERSION,
      providerSubscriptionId: data.subscription_id,
      subscriptionStatus: data.subscription_status,
      sessionIdConfigured: true,
    });

    return {
      subscriptionId: data.subscription_id,
      subscriptionSessionId: data.subscription_session_id,
      status: data.subscription_status,
      ...(data.cf_subscription_id ? { providerReferenceId: data.cf_subscription_id } : {}),
    };
  } catch (error) {
    throw providerFailure(
      error,
      diagnosticContext,
      "CASHFREE_SUBSCRIPTION_CREATION_FAILED",
      "Cashfree subscription creation failed"
    );
  }
};

const cancelSubscription = async (subscriptionId) => {
  const normalizedSubscriptionId = requireText(subscriptionId, "subscriptionId");
  const requestId = crypto.randomUUID();
  const idempotencyKey = crypto.randomUUID();
  const context = {
    operation: "cancelSubscription",
    endpoint: `${CASHFREE_SANDBOX_ENDPOINT}/{subscription_id}/manage`,
    apiVersion: CASHFREE_API_VERSION,
    requestId,
    idempotencyKeyPresent: true,
    startedAt: Date.now(),
    providerSubscriptionId: normalizedSubscriptionId,
  };
  try {
    console.info("[billing] Cashfree subscription cancellation requested", {
      environment,
      operation: context.operation,
      provider: "cashfree",
      providerSubscriptionId: normalizedSubscriptionId,
      apiVersion: CASHFREE_API_VERSION,
      requestIdPresent: true,
      idempotencyKeyPresent: true,
    });
    try {
      await cashfreeClient.SubsManageSubscription(
        normalizedSubscriptionId,
        { subscription_id: normalizedSubscriptionId, action: "CANCEL" },
        requestId,
        idempotencyKey
      );
    } catch (error) {
      // A duplicate request may reach Cashfree after the first cancellation
      // completed. Reconcile that provider response instead of changing local
      // state based on an unverified error alone.
      if (!isSubscriptionAlreadyCancelled(error)) throw error;
      console.info("[billing] Cashfree cancellation already reported; reconciling", {
        environment,
        provider: "cashfree",
        providerSubscriptionId: normalizedSubscriptionId,
        apiVersion: CASHFREE_API_VERSION,
      });
    }
    const verified = await fetchSubscription(normalizedSubscriptionId);
    console.info("[billing] Cashfree subscription cancellation confirmed", {
      environment,
      provider: "cashfree",
      providerSubscriptionId: normalizedSubscriptionId,
      apiVersion: CASHFREE_API_VERSION,
      subscriptionStatus: verified.status,
    });
    return verified;
  } catch (error) {
    if (error?.providerDiagnostic) {
      throw Object.assign(
        serviceError(
          "CASHFREE_SUBSCRIPTION_CANCELLATION_FAILED",
          "Cashfree subscription cancellation could not be verified",
          502
        ),
        { providerDiagnostic: error.providerDiagnostic }
      );
    }
    throw providerFailure(
      error,
      context,
      "CASHFREE_SUBSCRIPTION_CANCELLATION_FAILED",
      "Cashfree subscription cancellation failed"
    );
  }
};

const fetchSubscription = async (subscriptionId, { allowNotFound = false } = {}) => {
  const normalizedSubscriptionId = requireText(subscriptionId, "subscriptionId");
  try {
    const response = await cashfreeClient.SubsFetchSubscription(normalizedSubscriptionId);
    const data = response?.data || {};
    const authorization = data.authorization_details || data.authorisation_details || {};

    console.info("[billing] Cashfree subscription status fetched", {
      statusCode: response?.status,
      subscriptionId: data.subscription_id || normalizedSubscriptionId,
      subscriptionStatus: data.subscription_status,
      authorizationStatus: authorization.authorization_status,
      paymentMethodConfigured: Boolean(authorization.payment_method),
    });

    return {
      subscriptionId: data.subscription_id || normalizedSubscriptionId,
      ...(data.cf_subscription_id ? { providerReferenceId: data.cf_subscription_id } : {}),
      ...(data.subscription_session_id
        ? { subscriptionSessionId: data.subscription_session_id }
        : {}),
      status: data.subscription_status,
      authorizationStatus: authorization.authorization_status,
      ...(authorization.authorization_time
        ? { authorizationTime: authorization.authorization_time }
        : {}),
      paymentId: authorization.payment_id,
      paymentMethod:
        authorization.payment_group ||
        (authorization.payment_method && typeof authorization.payment_method === "object"
          ? Object.keys(authorization.payment_method)[0]
          : authorization.payment_method),
      ...(data.subscription_first_charge_time
        ? { firstChargeTime: data.subscription_first_charge_time }
        : {}),
      ...(data.next_schedule_date ? { nextScheduleDate: data.next_schedule_date } : {}),
      ...(data.subscription_expiry_time
        ? { expiryDate: data.subscription_expiry_time }
        : {}),
    };
  } catch (error) {
    if (allowNotFound && isSubscriptionNotFound(error)) {
      console.info("[billing] Cashfree subscription reconciliation", {
        operation: "fetchSubscription",
        provider: "cashfree",
        providerSubscriptionId: normalizedSubscriptionId,
        apiVersion: CASHFREE_API_VERSION,
        httpStatus: error?.response?.status,
        providerErrorCode: diagnosticValue(error, "code"),
        reconciliationResult: "NOT_FOUND_STALE_REFERENCE",
      });
      return null;
    }
    throw providerFailure(
      error,
      {
        operation: "fetchSubscription",
        endpoint: `${CASHFREE_SANDBOX_ENDPOINT}/{subscription_id}`,
        apiVersion: CASHFREE_API_VERSION,
        providerSubscriptionId: normalizedSubscriptionId,
      },
      "CASHFREE_SUBSCRIPTION_STATUS_FAILED",
      "Cashfree subscription status could not be verified"
    );
  }
};

const verifyWebhookSignature = ({ rawBody, signature, timestamp }) => {
  const body = Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : String(rawBody || "");
  const normalizedSignature = requireText(signature, "x-webhook-signature");
  const normalizedTimestamp = requireText(timestamp, "x-webhook-timestamp");
  if (!body) {
    throw serviceError("CASHFREE_WEBHOOK_INVALID_PAYLOAD", "Cashfree webhook payload is required");
  }
  try {
    cashfreeClient.PGVerifyWebhookSignature(normalizedSignature, body, normalizedTimestamp);
    return JSON.parse(body);
  } catch {
    throw serviceError("CASHFREE_WEBHOOK_INVALID_SIGNATURE", "Invalid Cashfree webhook signature");
  }
};

module.exports = {
  BILLING_CYCLES,
  CASHFREE_API_VERSION,
  CASHFREE_SANDBOX_ENDPOINT,
  classifyProviderFailure,
  cancelSubscription,
  createSubscription,
  fetchSubscription,
  isSubscriptionNotFound,
  isSubscriptionAlreadyCancelled,
  resolvePlanBilling,
  sanitizeProviderText,
  verifyWebhookSignature,
};
