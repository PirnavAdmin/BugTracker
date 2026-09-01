import test from "node:test";
import assert from "node:assert/strict";
import { getCashfreeCheckoutErrorMessage } from "../src/services/cashfreeCheckoutService.js";

test("Cashfree credential rejection shows a safe service-unavailable message", () => {
  assert.equal(
    getCashfreeCheckoutErrorMessage({
      backendCode: "CASHFREE_PROVIDER_AUTHENTICATION_FAILED",
    }),
    "Payment service is temporarily unavailable. Please contact CureCode support."
  );
});
