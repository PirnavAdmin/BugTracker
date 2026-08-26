import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  CASHFREE_BILLING_PHONE_REQUIRED_MESSAGE,
  CASHFREE_CHECKOUT_MODE,
  CASHFREE_RETURN_MESSAGES,
  CASHFREE_PROCESSING_MESSAGE,
  createSingleFlight,
  getCashfreeCheckoutErrorMessage,
  getCashfreeInitialNotice,
  getCashfreeReturnStatus,
  getCashfreeVerifiedNotice,
  isCashfreeReturn,
  isCashfreeSubscriptionRecord,
  openCashfreeSubscriptionCheckout,
  startCashfreeSubscriptionCheckout,
} from "../src/services/cashfreeCheckoutService.js";

test("Cashfree subscription checkout initializes Sandbox mode with the returned session", async () => {
  let loadOptions;
  let checkoutOptions;
  const result = await openCashfreeSubscriptionCheckout({
    subscriptionSessionId: "sub_session_test",
    loadCashfree: async (options) => {
      loadOptions = options;
      return {
        subscriptionsCheckout: async (checkout) => {
          checkoutOptions = checkout;
          return {};
        },
      };
    },
  });

  assert.deepEqual(loadOptions, { mode: "sandbox" });
  assert.equal(CASHFREE_CHECKOUT_MODE, "sandbox");
  assert.deepEqual(checkoutOptions, {
    subsSessionId: "sub_session_test",
    redirectTarget: "_self",
  });
  assert.deepEqual(result, {});
});

test("Choose Plan sends only planId and billingCycle to the Cashfree backend flow", async () => {
  let backendPayload;
  let checkoutPayload;
  await startCashfreeSubscriptionCheckout({
    planId: "starter",
    billingCycle: "annual",
    createSubscription: async (payload) => {
      backendPayload = payload;
      return { subscriptionSessionId: "sub_session_annual" };
    },
    openCheckout: async (payload) => {
      checkoutPayload = payload;
    },
  });

  assert.deepEqual(backendPayload, { planId: "starter", billingCycle: "annual" });
  assert.equal(Object.hasOwn(backendPayload, "amount"), false);
  assert.equal(Object.hasOwn(backendPayload, "currency"), false);
  assert.equal(Object.hasOwn(backendPayload, "tenantId"), false);
  assert.equal(Object.hasOwn(backendPayload, "userId"), false);
  assert.equal(Object.hasOwn(backendPayload, "customerId"), false);
  assert.equal(Object.hasOwn(backendPayload, "CASHFREE_SECRET_KEY"), false);
  assert.deepEqual(checkoutPayload, { subscriptionSessionId: "sub_session_annual" });
});

test("duplicate checkout attempts share one in-flight operation", async () => {
  let operationCount = 0;
  let release;
  const operation = () => {
    operationCount += 1;
    return new Promise((resolve) => {
      release = resolve;
    });
  };
  const runOnce = createSingleFlight();

  const first = runOnce(operation);
  const second = runOnce(operation);
  assert.equal(first, second);
  assert.equal(operationCount, 0);

  await Promise.resolve();
  assert.equal(operationCount, 1);
  release("complete");
  assert.equal(await first, "complete");

  const third = runOnce(async () => {
    operationCount += 1;
    return "next";
  });
  assert.equal(await third, "next");
  assert.equal(operationCount, 2);
});

test("backend and checkout failures produce only safe messages", async () => {
  await assert.rejects(
    () =>
      startCashfreeSubscriptionCheckout({
        planId: "starter",
        billingCycle: "monthly",
        createSubscription: async () => {
          throw new Error("provider secret and internal response");
        },
      }),
    (error) => {
      assert.equal(getCashfreeCheckoutErrorMessage(error), "Unable to start Cashfree payment. Please try again.");
      assert.equal(error.message.includes("provider secret"), false);
      return true;
    }
  );

  await assert.rejects(
    () =>
      startCashfreeSubscriptionCheckout({
        planId: "starter",
        billingCycle: "monthly",
        createSubscription: async () => ({ subscriptionSessionId: "sub_session_test" }),
        openCheckout: async () => {
          throw new Error("Cashfree internal checkout error");
        },
      }),
    (error) => {
      assert.equal(
        getCashfreeCheckoutErrorMessage(error),
        "Unable to open Cashfree checkout. Please try again."
      );
      assert.equal(error.message.includes("internal checkout"), false);
      return true;
    }
  );
});

test("missing Cashfree billing phone displays clear company-contact guidance", async () => {
  await assert.rejects(
    () =>
      startCashfreeSubscriptionCheckout({
        planId: "starter",
        billingCycle: "monthly",
        createSubscription: async () => {
          throw { response: { data: { code: "CASHFREE_BILLING_PHONE_REQUIRED" } } };
        },
      }),
    (error) => {
      assert.equal(error.backendCode, "CASHFREE_BILLING_PHONE_REQUIRED");
      assert.equal(getCashfreeCheckoutErrorMessage(error), CASHFREE_BILLING_PHONE_REQUIRED_MESSAGE);
      assert.match(getCashfreeCheckoutErrorMessage(error), /billing contact phone number/i);
      assert.match(getCashfreeCheckoutErrorMessage(error), /platform administrator/i);
      return true;
    }
  );
});

test("Cashfree return state remains processing until backend confirmation", () => {
  assert.equal(getCashfreeInitialNotice("?cashfree=return"), CASHFREE_PROCESSING_MESSAGE);
  assert.equal(
    getCashfreeInitialNotice("?cashfree=return&status=success"),
    CASHFREE_PROCESSING_MESSAGE
  );
  assert.match(CASHFREE_PROCESSING_MESSAGE, /confirming your subscription/i);
  assert.doesNotMatch(CASHFREE_PROCESSING_MESSAGE, /payment successful/i);
  assert.equal(getCashfreeInitialNotice(""), "");
  assert.equal(isCashfreeReturn("?cashfree=return"), true);
  assert.equal(isCashfreeReturn(""), false);
});

test("Cashfree return status is allow-listed but never treated as verification", () => {
  assert.equal(getCashfreeReturnStatus("?cashfree=return&status=success"), "success");
  assert.equal(getCashfreeReturnStatus("?cashfree=return&status=pending"), "pending");
  assert.equal(getCashfreeReturnStatus("?cashfree=return&status=failed"), "failed");
  assert.equal(getCashfreeReturnStatus("?cashfree=return&status=ACTIVE"), "");
  assert.equal(getCashfreeReturnStatus("?cashfree=return&status=payment_success"), "");
  assert.equal(
    getCashfreeInitialNotice("?cashfree=return&status=success"),
    CASHFREE_PROCESSING_MESSAGE
  );
});

test("server-verified Cashfree states map to exact authorization notices", () => {
  assert.equal(getCashfreeVerifiedNotice("ACTIVE"), CASHFREE_RETURN_MESSAGES.ACTIVE);
  assert.equal(getCashfreeVerifiedNotice("PENDING"), CASHFREE_RETURN_MESSAGES.PENDING);
  assert.equal(getCashfreeVerifiedNotice("FAILED"), CASHFREE_RETURN_MESSAGES.FAILED);
  assert.equal(CASHFREE_RETURN_MESSAGES.ACTIVE, "Cashfree subscription authorization completed.");
  assert.equal(
    CASHFREE_RETURN_MESSAGES.PENDING,
    "Cashfree subscription authorization is still being processed."
  );
  assert.equal(
    CASHFREE_RETURN_MESSAGES.FAILED,
    "Cashfree subscription authorization was not completed."
  );
  assert.doesNotMatch(Object.values(CASHFREE_RETURN_MESSAGES).join(" "), /payment successful/i);
});

test("Cashfree records are identified for provider-specific retry without changing Razorpay retry", () => {
  assert.equal(isCashfreeSubscriptionRecord({ provider: "cashfree" }), true);
  assert.equal(isCashfreeSubscriptionRecord({ providerSubscriptionId: "cc_attempt_001" }), true);
  assert.equal(isCashfreeSubscriptionRecord({ provider: "razorpay", providerSubscriptionId: "sub_001" }), false);
});

test("Cashfree UI has duplicate-click loading protection and no frontend secret", async () => {
  const [buttonSource, apiSource, billingSource, checkoutSource] = await Promise.all([
    readFile(new URL("../src/components/billing/CashfreeCheckoutButton.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/lib/api.js", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/BillingPage.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/services/cashfreeCheckoutService.js", import.meta.url), "utf8"),
  ]);

  assert.match(buttonSource, /disabled=\{create\.isPending\}/);
  assert.match(buttonSource, /Creating subscription\.\.\./);
  assert.match(apiSource, /\/billing\/cashfree\/create-subscription/);
  assert.match(apiSource, /\{ planId, billingCycle \}/);
  assert.match(billingSource, /Starting checkout\.\.\." : "Choose Plan with Razorpay"/);
  assert.match(buttonSource, /label = "Choose Plan with Cashfree"/);
  assert.match(buttonSource, /Creating subscription\.\.\." : label/);
  assert.match(apiSource, /\/billing\/cashfree\/subscription\/status/);
  assert.match(billingSource, /fetchCashfreeBillingSubscriptionStatus/);
  assert.match(billingSource, /getCashfreeVerifiedNotice\(data\?\.subscription\?\.status\)/);
  assert.match(billingSource, /\["billing-subscription"\], \["billing-payments"\], \["billing-invoices"\]/);
  assert.match(billingSource, /Retry Cashfree Payment/);
  assert.match(billingSource, /CashfreeCheckoutButton/);
  assert.doesNotMatch(`${buttonSource}${apiSource}${billingSource}${checkoutSource}`, /CASHFREE_SECRET_KEY/);
  assert.doesNotMatch(`${buttonSource}${apiSource}${billingSource}${checkoutSource}`, /VITE_CASHFREE/);
  assert.doesNotMatch(`${buttonSource}${apiSource}${billingSource}${checkoutSource}`, /status\s*=\s*["']ACTIVE/);
});
