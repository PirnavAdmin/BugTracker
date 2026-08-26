const test = require("node:test");
const assert = require("node:assert/strict");
const cashfreeBillingRoutes = require("../routes/cashfreeBillingRoutes");

const route = cashfreeBillingRoutes.stack.find(
  (layer) => layer.route?.path === "/create-subscription" && layer.route?.methods?.post
)?.route;

test("Cashfree create-subscription endpoint exists and requires authentication", async () => {
  assert.ok(route, "expected POST /create-subscription route");
  assert.equal(route.stack.length, 2);

  const res = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
  };
  let nextError;
  await route.stack[0].handle({ headers: {} }, res, (error) => {
    nextError = error;
  });

  assert.equal(res.statusCode, 401);
  assert.match(nextError?.message || "", /No token provided/);
});
