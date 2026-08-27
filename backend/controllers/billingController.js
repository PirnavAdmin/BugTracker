const asyncHandler = require("../utils/asyncHandler");
const PlatformCompany = require("../models/PlatformCompany");
const Subscription = require("../models/Subscription");
const Payment = require("../models/Payment");
const Invoice = require("../models/Invoice");
const providerSync = require("../services/billingProviderSyncService");
const { serializeBillingSubscription } = require("../services/billingSubscriptionPresentationService");

const fail = (res, code, message, status = 400) => res.status(status).json({ code, message });
const getSubscription = asyncHandler(async (req, res) => {
  let subscription = await Subscription.findOne({ tenantId: req.user.tenantId }).sort({ createdAt: -1 });
  if (subscription?.status === "PENDING" && subscription.providerSubscriptionId) {
    try { subscription = await providerSync.syncPendingSubscription(subscription); }
    catch (error) {
      console.warn("[BILLING] Pending subscription status sync failed", { provider: providerSync.resolveSubscriptionProvider(subscription).toUpperCase(), providerSubscriptionId: subscription.providerSubscriptionId, localSubscriptionId: String(subscription._id), code: error?.code });
      if (error?.code === "BILLING_PROVIDER_UNSUPPORTED") throw error;
    }
  }
  const payment = subscription ? await Payment.findOne({ tenantId: req.user.tenantId, subscriptionId: subscription._id }).sort({ createdAt: -1 }).lean() : null;
  res.json({ subscription: serializeBillingSubscription(subscription, payment) });
});
const getPayments = asyncHandler(async (req, res) => res.json({ payments: await Payment.find({ tenantId: req.user.tenantId }).sort({ createdAt: -1 }).lean() }));
const getInvoices = asyncHandler(async (req, res) => res.json({ invoices: await Invoice.find({ tenantId: req.user.tenantId }).sort({ createdAt: -1 }).lean() }));
const platformList = (Model, field) => asyncHandler(async (req, res) => { const query = req.query.status ? { status: req.query.status } : {}; let result = Model.find(query).sort({ createdAt: -1 }).limit(500); if (Model === Subscription) result = result.populate("companyId", "name tenantId"); res.json({ [field]: await result.lean() }); });
const platformCompanyStatus = asyncHandler(async (req, res) => { const company = await PlatformCompany.findById(req.params.id).lean(); if (!company) return fail(res, "BILLING_COMPANY_NOT_FOUND", "Company not found.", 404); const subscription = await Subscription.findOne({ companyId: company._id, tenantId: company.tenantId }).sort({ createdAt: -1 }).lean(); const payment = subscription ? await Payment.findOne({ tenantId: company.tenantId, subscriptionId: subscription._id }).sort({ createdAt: -1 }).lean() : null; res.json({ company: { id: company._id, name: company.name, tenantId: company.tenantId }, subscription: serializeBillingSubscription(subscription, payment) }); });
module.exports = { getSubscription, getStatus: getSubscription, getPayments, getInvoices, platformSubscriptions: platformList(Subscription, "subscriptions"), platformPayments: platformList(Payment, "payments"), platformInvoices: platformList(Invoice, "invoices"), platformCompanyStatus };
