const asyncHandler = require("../utils/asyncHandler");
const platformCompanyService = require("../services/platformCompanyService");

const listPlans = asyncHandler(async (req, res) => {
  res.status(200).json(await platformCompanyService.listPlans());
});

const listCompanies = asyncHandler(async (req, res) => {
  res.status(200).json(await platformCompanyService.listCompanies(req.query || {}));
});

const createCompany = asyncHandler(async (req, res) => {
  res.status(201).json({
    company: await platformCompanyService.createCompany(req.body || {}, res),
  });
});

const createCompanyAdminUser = asyncHandler(async (req, res) => {
  res.status(201).json(
    await platformCompanyService.createCompanyAdminUser(req.params.id, req.body || {}, res)
  );
});

const getCompany = asyncHandler(async (req, res) => {
  res.status(200).json({
    company: await platformCompanyService.getCompanyById(req.params.id, res),
  });
});

const updateCompany = asyncHandler(async (req, res) => {
  res.status(200).json({
    company: await platformCompanyService.updateCompany(req.params.id, req.body || {}, res),
  });
});

const listSubscriptions = asyncHandler(async (req, res) => {
  res.status(200).json(await platformCompanyService.listSubscriptions(req.query || {}));
});

const createSubscription = asyncHandler(async (req, res) => {
  res.status(201).json({
    subscription: await platformCompanyService.createSubscription(req.body || {}, res),
  });
});

const updateSubscription = asyncHandler(async (req, res) => {
  res.status(200).json({
    subscription: await platformCompanyService.updateSubscription(
      req.params.id,
      req.body || {},
      res
    ),
  });
});

module.exports = {
  createCompany,
  createCompanyAdminUser,
  createSubscription,
  getCompany,
  listCompanies,
  listPlans,
  listSubscriptions,
  updateCompany,
  updateSubscription,
};
