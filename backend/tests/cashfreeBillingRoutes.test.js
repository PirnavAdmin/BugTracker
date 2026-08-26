const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const Subscription = require("../models/Subscription");
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

test("Cashfree status endpoint exists and requires authentication", async () => {
  const statusRoute = cashfreeBillingRoutes.stack.find(
    (layer) => layer.route?.path === "/subscription/status" && layer.route?.methods?.get
  )?.route;
  assert.ok(statusRoute);
  assert.equal(statusRoute.stack.length, 2);
});

test("Cashfree return endpoint accepts URL-encoded POST data without authentication", async () => {
  const returnRoute = cashfreeBillingRoutes.stack.find(
    (layer) => layer.route?.path === "/return" && layer.route?.methods?.post
  )?.route;
  assert.ok(returnRoute);
  assert.equal(returnRoute.stack.length, 1);

  const originalFindOne = Subscription.findOne;
  const originalInfo = console.info;
  let subscriptionQuery;
  Subscription.findOne = (filter) => {
    subscriptionQuery = filter;
    return { sort: async () => null };
  };
  console.info = () => {};

  const app = express();
  app.use(express.urlencoded({ limit: "25mb", extended: true }));
  app.use("/api/billing/cashfree", cashfreeBillingRoutes);
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });

  try {
    const address = server.address();
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/billing/cashfree/return`,
      {
        method: "POST",
        body: new URLSearchParams({ cf_subscriptionId: "cashfree-form-subscription" }),
        redirect: "manual",
      }
    );
    assert.equal(response.status, 303);
    assert.match(response.headers.get("location") || "", /cashfree=return&status=failed$/);
    assert.deepEqual(subscriptionQuery, {
      provider: "cashfree",
      providerSubscriptionId: "cashfree-form-subscription",
    });
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
    Subscription.findOne = originalFindOne;
    console.info = originalInfo;
  }
});
