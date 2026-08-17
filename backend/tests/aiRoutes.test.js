const { test } = require("node:test");
const assert = require("node:assert");
const aiRoutes = require("../routes/aiRoutes");

const getRoute = (path) =>
  aiRoutes.stack.find(
    (layer) => layer.route?.path === path && layer.route?.methods?.post
  )?.route;

const getMiddlewareNames = (route) =>
  (route?.stack || []).map((layer) => layer.handle?.name || "");

test("AI preferred endpoint is authenticated and rate limited", () => {
  const route = getRoute("/generate-description");
  const middlewareNames = getMiddlewareNames(route);

  assert.ok(route, "expected /generate-description route");
  assert.strictEqual(route.stack.length, 3);
  assert.strictEqual(typeof route.stack[0].handle, "function");
  assert.strictEqual(middlewareNames[1], "aiDescriptionRateLimit");
  assert.strictEqual(typeof route.stack[2].handle, "function");
});

test("AI legacy endpoint remains authenticated and rate limited", () => {
  const route = getRoute("/generate-work-item-description");
  const middlewareNames = getMiddlewareNames(route);

  assert.ok(route, "expected /generate-work-item-description route");
  assert.strictEqual(route.stack.length, 3);
  assert.strictEqual(typeof route.stack[0].handle, "function");
  assert.strictEqual(middlewareNames[1], "aiDescriptionRateLimit");
  assert.strictEqual(typeof route.stack[2].handle, "function");
});

test("AI code review endpoint is authenticated and rate limited", () => {
  const route = getRoute("/code-review");
  const middlewareNames = getMiddlewareNames(route);

  assert.ok(route, "expected /code-review route");
  assert.strictEqual(route.stack.length, 3);
  assert.strictEqual(typeof route.stack[0].handle, "function");
  assert.strictEqual(middlewareNames[1], "aiDescriptionRateLimit");
  assert.strictEqual(typeof route.stack[2].handle, "function");
});
