import { load } from "@cashfreepayments/cashfree-js";

export const CASHFREE_CHECKOUT_MODE = "sandbox";
export const CASHFREE_PROCESSING_MESSAGE =
  "Payment processing... We're confirming your subscription. Please wait.";

const checkoutError = (stage, backendCode) =>
  Object.assign(new Error("Cashfree checkout could not be started"), {
    stage,
    backendCode,
  });

export const createSingleFlight = () => {
  let pending;

  return (operation) => {
    if (!pending) {
      pending = Promise.resolve()
        .then(operation)
        .finally(() => {
          pending = undefined;
        });
    }

    return pending;
  };
};

export const openCashfreeSubscriptionCheckout = async ({
  subscriptionSessionId,
  redirectTarget = "_self",
  loadCashfree = load,
}) => {
  if (!subscriptionSessionId) {
    throw checkoutError("checkout");
  }

  const cashfree = await loadCashfree({ mode: CASHFREE_CHECKOUT_MODE });
  if (typeof cashfree?.subscriptionsCheckout !== "function") {
    throw checkoutError("checkout");
  }

  const result = await cashfree.subscriptionsCheckout({
    subsSessionId: subscriptionSessionId,
    redirectTarget,
  });

  if (result?.error) {
    throw checkoutError("checkout");
  }

  return result;
};

export const startCashfreeSubscriptionCheckout = async ({
  planId,
  billingCycle,
  createSubscription,
  openCheckout = openCashfreeSubscriptionCheckout,
}) => {
  if (typeof createSubscription !== "function") {
    throw checkoutError("backend");
  }

  let subscription;
  try {
    subscription = await createSubscription({ planId, billingCycle });
  } catch (error) {
    throw checkoutError("backend", error?.response?.data?.code);
  }

  if (!subscription?.subscriptionSessionId) {
    throw checkoutError("checkout");
  }

  try {
    await openCheckout({ subscriptionSessionId: subscription.subscriptionSessionId });
  } catch {
    throw checkoutError("checkout");
  }

  return subscription;
};

export const getCashfreeCheckoutErrorMessage = (error) => {
  if (error?.backendCode === "CASHFREE_ALREADY_SUBSCRIBED") {
    return "A current billing subscription already exists.";
  }

  if (
    ["CASHFREE_PLAN_NOT_SUPPORTED", "CASHFREE_BILLING_CYCLE_NOT_SUPPORTED"].includes(
      error?.backendCode
    )
  ) {
    return "The selected plan or billing cycle is unavailable.";
  }

  return error?.stage === "checkout"
    ? "Unable to open Cashfree checkout. Please try again."
    : "Unable to start Cashfree payment. Please try again.";
};

export const isCashfreeReturn = (search) => {
  const query =
    search === undefined && typeof window !== "undefined" ? window.location.search : search || "";
  return new URLSearchParams(query).get("cashfree") === "return";
};

export const isCashfreeSubscriptionRecord = (subscription) =>
  subscription?.provider === "cashfree" ||
  String(subscription?.providerSubscriptionId || "").startsWith("cc_");

export const getCashfreeInitialNotice = (search) => {
  return isCashfreeReturn(search) ? CASHFREE_PROCESSING_MESSAGE : "";
};
