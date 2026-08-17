const { test } = require("node:test");
const assert = require("node:assert");
const {
  calculateAICost,
  getModelPricing,
  normalizeTokenCount,
} = require("../services/aiCostService");

test("normalizes usable token counts", () => {
  assert.strictEqual(normalizeTokenCount(12.8), 12.8);
  assert.strictEqual(normalizeTokenCount("42"), 42);
  assert.strictEqual(normalizeTokenCount(-1), null);
  assert.strictEqual(normalizeTokenCount("nope"), null);
});

test("calculates Nova Lite estimated AI cost", () => {
  const cost = calculateAICost({
    modelId: "global.amazon.nova-2-lite-v1:0",
    inputTokens: 1_000_000,
    outputTokens: 1_000_000,
  });

  assert.strictEqual(cost.inputCost, 0.06);
  assert.strictEqual(cost.outputCost, 0.24);
  assert.strictEqual(cost.totalEstimatedCost, 0.3);
});

test("unknown models are tracked with zero estimated cost", () => {
  assert.deepStrictEqual(getModelPricing("unknown-model"), {
    inputPricePerMillionTokens: 0,
    outputPricePerMillionTokens: 0,
  });
  assert.strictEqual(
    calculateAICost({
      modelId: "unknown-model",
      inputTokens: 500,
      outputTokens: 500,
    }).totalEstimatedCost,
    0
  );
});
