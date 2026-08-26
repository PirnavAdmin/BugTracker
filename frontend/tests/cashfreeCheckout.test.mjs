import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  CASHFREE_CHECKOUT_MODE,
  CASHFREE_PROCESSING_MESSAGE,
  createSingleFlight,
  getCashfreeCheckoutErrorMessage,
  getCashfreeInitialNotice,
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
      assert.equal(getCashfreeCheckoutErrorMessage(error), "Unable to start payment. Please try again.");
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

test("Cashfree return state remains processing until backend confirmation", () => {
  assert.equal(getCashfreeInitialNotice("?cashfree=return"), CASHFREE_PROCESSING_MESSAGE);
  assert.match(CASHFREE_PROCESSING_MESSAGE, /confirming your subscription/i);
  assert.doesNotMatch(CASHFREE_PROCESSING_MESSAGE, /payment successful/i);
  assert.equal(getCashfreeInitialNotice(""), "");
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
  assert.match(buttonSource, /Creating subscription\.\.\." : "Choose Plan"/);
  assert.match(billingSource, /CashfreeCheckoutButton/);
  assert.doesNotMatch(`${buttonSource}${apiSource}${billingSource}${checkoutSource}`, /CASHFREE_SECRET_KEY/);
  assert.doesNotMatch(`${buttonSource}${apiSource}${billingSource}${checkoutSource}`, /VITE_CASHFREE/);
  assert.doesNotMatch(`${buttonSource}${apiSource}${billingSource}${checkoutSource}`, /status\s*=\s*["']ACTIVE/);
});
