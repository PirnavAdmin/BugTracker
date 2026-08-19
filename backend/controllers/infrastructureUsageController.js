const asyncHandler = require("../utils/asyncHandler");
const { getInfrastructureUsage } = require("../services/infrastructureUsageService");

const getInfrastructureUsageController = asyncHandler(async (_req, res) => {
  res.status(200).json(await getInfrastructureUsage());
});

module.exports = { getInfrastructureUsageController };
