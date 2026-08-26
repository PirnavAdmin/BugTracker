const { Cashfree, CFEnvironment } = require("cashfree-pg");
const cashfreeConfig = require("../../config/cashfree");
const { PLANS } = require("../../config/plans");

const BILLING_CYCLES = Object.freeze({
  MONTHLY: "monthly",
  ANNUAL: "annual",
});

const serviceError = (code, message, status = 400) =>
  Object.assign(new Error(message), { code, status });

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
  } catch {
    throw serviceError("CASHFREE_INVALID_SUBSCRIPTION_DATA", `${field} must be a valid HTTP URL`);
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

const diagnosticValue = (error, field) => {
  const response = error?.response;
  const responseData = response?.data;
  const value = responseData?.[field] ?? error?.[field];
  return typeof value === "string" || typeof value === "number" ? value : undefined;
};

const logProviderError = (error) => {
  const diagnostic = {
    operation: "createSubscription",
    statusCode: error?.response?.status ?? diagnosticValue(error, "statusCode"),
    errorCode: diagnosticValue(error, "code"),
    type: diagnosticValue(error, "type"),
    requestId: error?.response?.headers?.["x-request-id"],
  };
  Object.keys(diagnostic).forEach(
    (key) => diagnostic[key] === undefined && delete diagnostic[key]
  );
  console.error("[billing] Cashfree provider error", diagnostic);
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
      customer_email: requireText(customer?.email, "customer.email"),
      customer_phone: requireText(customer?.phone, "customer.phone"),
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

  try {
    const response = await cashfreeClient.SubsCreateSubscription(
      request,
      merchantReference,
      merchantReference
    );
    const data = response?.data || {};

    return {
      subscriptionId: data.subscription_id || merchantReference,
      subscriptionSessionId: data.subscription_session_id,
      status: data.subscription_status,
    };
  } catch (error) {
    logProviderError(error);
    throw serviceError(
      "CASHFREE_SUBSCRIPTION_CREATION_FAILED",
      "Cashfree subscription creation failed",
      502
    );
  }
};

module.exports = {
  BILLING_CYCLES,
  createSubscription,
  resolvePlanBilling,
};
