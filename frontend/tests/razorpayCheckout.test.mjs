import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("subscription checkout options include the required recurring Razorpay fields", async () => {
  const source = await readFile(new URL("../src/lib/razorpayCheckout.js", import.meta.url), "utf8");
  assert.match(source, /subscription_id:\s*subscriptionId/);
  assert.match(source, /recurring:\s*true/);
  assert.match(source, /key,\s*subscription_id/);
  assert.match(source, /name,\s*description,\s*handler/);
  assert.match(source, /modal:\s*\{\s*ondismiss:\s*onDismiss\s*\}/);
  assert.doesNotMatch(source, /order_id\s*:/);
  assert.doesNotMatch(source, /amount\s*:/);
  assert.doesNotMatch(source, /currency\s*:/);
  assert.doesNotMatch(source, /short_url\s*:/);
});
