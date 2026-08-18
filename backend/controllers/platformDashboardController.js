const asyncHandler = require("../utils/asyncHandler");
const dashboardService = require("../services/platformDashboardService");

const sendPlatformDashboardSection = (loader) =>
  asyncHandler(async (req, res) => {
    const payload = await loader(req.query || {});
    res.status(200).json(payload);
  });

const getDashboard = sendPlatformDashboardSection(dashboardService.getDashboard);
const getSummary = sendPlatformDashboardSection(dashboardService.getSummary);
const getRevenueOverview = sendPlatformDashboardSection(dashboardService.getRevenueOverview);
const getSubscriptionOverview = sendPlatformDashboardSection(
  dashboardService.getSubscriptionOverview
);
const getAIUsage = sendPlatformDashboardSection(dashboardService.getAIUsage);
const getAICostByCompany = sendPlatformDashboardSection(dashboardService.getAICostByCompany);
const getPayments = sendPlatformDashboardSection(dashboardService.getPayments);
const getCompanyGrowth = sendPlatformDashboardSection(dashboardService.getCompanyGrowth);
const getActivity = sendPlatformDashboardSection(dashboardService.getActivity);
const getAlerts = sendPlatformDashboardSection(dashboardService.getAlerts);

module.exports = {
  getAICostByCompany,
  getAIUsage,
  getActivity,
  getAlerts,
  getCompanyGrowth,
  getDashboard,
  getPayments,
  getRevenueOverview,
  getSubscriptionOverview,
  getSummary,
};
