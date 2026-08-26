const test = require("node:test");
const assert = require("node:assert/strict");
const PlatformCompany = require("../models/PlatformCompany");
const Subscription = require("../models/Subscription");
const Payment = require("../models/Payment");
const { platformCompanyStatus } = require("../controllers/billingController");

const originals = {
  companyFindById: PlatformCompany.findById,
  paymentFindOne: Payment.findOne,
  subscriptionFindOne: Subscription.findOne,
};

test.after(() => {
  PlatformCompany.findById = originals.companyFindById;
  Payment.findOne = originals.paymentFindOne;
  Subscription.findOne = originals.subscriptionFindOne;
});

test("Platform company billing status returns the authoritative tenant-owned provider subscription", async () => {
  const company = {
    _id: "507f1f77bcf86cd799439201",
    name: "Tenant One",
    tenantId: "TENANT_001",
  };
  const subscription = {
    _id: "507f1f77bcf86cd799439202",
    companyId: company._id,
    tenantId: company.tenantId,
    provider: "cashfree",
    providerSubscriptionId: "cc_platform_subscription",
    planId: "starter",
    billingCycle: "monthly",
    status: "ACTIVE",
    amount: 799,
    currency: "INR",
    startDate: new Date("2026-08-26T00:00:00.000Z"),
    currentPeriodEnd: new Date("2026-09-26T00:00:00.000Z"),
    expiryDate: new Date("2050-12-31T00:00:00.000Z"),
  };
  const payment = {
    _id: "507f1f77bcf86cd799439203",
    tenantId: company.tenantId,
    subscriptionId: subscription._id,
    status: "authorized",
    metadata: { providerInternal: "must-not-be-returned" },
  };
  let subscriptionFilter;
  let paymentFilter;
  PlatformCompany.findById = () => ({ lean: async () => company });
  Subscription.findOne = (filter) => {
    subscriptionFilter = filter;
    return { sort: () => ({ lean: async () => subscription }) };
  };
  Payment.findOne = (filter) => {
    paymentFilter = filter;
    return { sort: () => ({ lean: async () => payment }) };
  };
  const res = {
    body: undefined,
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  let nextError;
  await platformCompanyStatus({ params: { id: String(company._id) } }, res, (error) => {
    nextError = error;
  });
  assert.ifError(nextError);
  assert.deepEqual(subscriptionFilter, { companyId: company._id, tenantId: "TENANT_001" });
  assert.deepEqual(paymentFilter, {
    tenantId: "TENANT_001",
    subscriptionId: subscription._id,
  });
  assert.equal(res.body.subscription.provider, "cashfree");
  assert.equal(res.body.subscription.planName, "Starter");
  assert.equal(res.body.subscription.paymentStatus, "authorized");
  assert.equal(res.body.subscription.currentPeriodEnd, subscription.currentPeriodEnd);
  assert.equal(res.body.subscription.expiryDate, subscription.expiryDate);
  assert.equal(Object.hasOwn(res.body, "lastPayment"), false);
  assert.equal(JSON.stringify(res.body).includes("providerInternal"), false);
});
