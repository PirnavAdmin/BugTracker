const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert");
const PlatformCompany = require("../models/PlatformCompany");
const PlatformSubscription = require("../models/PlatformSubscription");
const {
  createCompany,
  getCompanyById,
  listPlans,
  updateSubscription,
} = require("../services/platformCompanyService");

const originalCompanyCreate = PlatformCompany.create;
const originalCompanyFindById = PlatformCompany.findById;
const originalCompanyFindByIdAndUpdate = PlatformCompany.findByIdAndUpdate;
const originalSubscriptionCreate = PlatformSubscription.create;
const originalSubscriptionFindByIdAndUpdate = PlatformSubscription.findByIdAndUpdate;

const createResponse = () => ({
  statusCode: 200,
  status(code) {
    this.statusCode = code;
    return this;
  },
});

beforeEach(() => {
  PlatformCompany.create = async (payload) => ({
    _id: "507f1f77bcf86cd799439011",
    ...payload,
    createdAt: new Date("2026-08-18T00:00:00.000Z"),
    updatedAt: new Date("2026-08-18T00:00:00.000Z"),
    toObject() {
      return { ...this };
    },
  });
  PlatformSubscription.create = async (payload) => ({
    _id: "507f1f77bcf86cd799439022",
    ...payload,
    createdAt: new Date("2026-08-18T00:00:00.000Z"),
    updatedAt: new Date("2026-08-18T00:00:00.000Z"),
    toObject() {
      return { ...this };
    },
  });
  PlatformCompany.findByIdAndUpdate = async () => ({});
});

afterEach(() => {
  PlatformCompany.create = originalCompanyCreate;
  PlatformCompany.findById = originalCompanyFindById;
  PlatformCompany.findByIdAndUpdate = originalCompanyFindByIdAndUpdate;
  PlatformSubscription.create = originalSubscriptionCreate;
  PlatformSubscription.findByIdAndUpdate = originalSubscriptionFindByIdAndUpdate;
});

test("platform plans are centralized and include Professional limits", async () => {
  const result = await listPlans();
  const professional = result.plans.find((plan) => plan.id === "professional");

  assert.ok(professional);
  assert.strictEqual(professional.limits.users, 50);
  assert.strictEqual(professional.limits.projects, 20);
  assert.strictEqual(professional.limits.storageGb, 25);
  assert.strictEqual(professional.limits.aiRequestsPerMonth, 1000);
});

test("createCompany stores a platform company and initial subscription", async () => {
  const res = createResponse();
  const company = await createCompany(
    {
      name: "ABC Technologies",
      email: "hello@abc.test",
      contactPerson: "Anika",
      contactEmail: "anika@abc.test",
      contactPhone: "9999999999",
      planId: "professional",
      status: "Active",
    },
    res
  );

  assert.strictEqual(company.name, "ABC Technologies");
  assert.strictEqual(company.planId, "professional");
  assert.strictEqual(company.subscription.planId, "professional");
  assert.strictEqual(company.subscription.status, "Trial");
});

test("invalid company ids return a 404 instead of crashing", async () => {
  const res = createResponse();

  await assert.rejects(() => getCompanyById("not-a-real-id", res), /not found/);
  assert.strictEqual(res.statusCode, 404);
});

test("updateSubscription can change plan and suspend company status", async () => {
  PlatformSubscription.findByIdAndUpdate = async () => ({
    _id: "507f1f77bcf86cd799439022",
    companyId: "507f1f77bcf86cd799439011",
    planId: "business",
    status: "Suspended",
    billingCycle: "Monthly",
    amount: null,
    toObject() {
      return { ...this };
    },
  });

  const res = createResponse();
  const subscription = await updateSubscription(
    "507f1f77bcf86cd799439022",
    {
      planId: "business",
      status: "Suspended",
    },
    res
  );

  assert.strictEqual(subscription.planId, "business");
  assert.strictEqual(subscription.status, "Suspended");
});
