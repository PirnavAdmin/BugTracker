const MODEL_PRICING = Object.freeze({
  "global.amazon.nova-2-lite-v1:0": {
    inputPricePerMillionTokens: 0.06,
    outputPricePerMillionTokens: 0.24,
  },
});

const normalizeTokenCount = (value) => {
  const numeric = Number(value);

  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
};

const getModelPricing = (modelId = "") =>
  MODEL_PRICING[modelId] || {
    inputPricePerMillionTokens: 0,
    outputPricePerMillionTokens: 0,
  };

const calculateAICost = ({
  inputTokens,
  modelId = "",
  outputTokens,
} = {}) => {
  const normalizedInputTokens = normalizeTokenCount(inputTokens);
  const normalizedOutputTokens = normalizeTokenCount(outputTokens);
  const pricing = getModelPricing(modelId);
  const inputCost =
    normalizedInputTokens === null
      ? 0
      : (normalizedInputTokens / 1_000_000) * pricing.inputPricePerMillionTokens;
  const outputCost =
    normalizedOutputTokens === null
      ? 0
      : (normalizedOutputTokens / 1_000_000) * pricing.outputPricePerMillionTokens;

  return {
    inputCost,
    outputCost,
    totalEstimatedCost: inputCost + outputCost,
  };
};

module.exports = {
  MODEL_PRICING,
  calculateAICost,
  getModelPricing,
  normalizeTokenCount,
};
