process.env.NODE_ENV = "test";
process.env.SUBSCRIPTION_LIMITS_BYPASS_FOR_TESTS = "true";

const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert");
const PlatformCompany = require("../models/PlatformCompany");
const PlatformSubscription = require("../models/PlatformSubscription");
const User = require("../models/User");
const { PLANS } = require("../config/plans");
const {
  createCompany,
  createCompanyAdminUser,
  getCompanyById,
  listPlans,
  updateSubscription,
} = require("../services/platformCompanyService");

const originalCompanyCreate = PlatformCompany.create;
const originalCompanyFind = PlatformCompany.find;
const originalCompanyFindById = PlatformCompany.findById;
const originalCompanyFindByIdAndUpdate = PlatformCompany.findByIdAndUpdate;
const originalSubscriptionCreate = PlatformSubscription.create;
const originalSubscriptionFindOne = PlatformSubscription.findOne;
const originalSubscriptionFindByIdAndUpdate = PlatformSubscription.findByIdAndUpdate;
const originalUserCreate = User.create;
const originalUserFindOne = User.findOne;

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
  PlatformCompany.find = () => ({
    select: () => ({
      lean: async () => [],
    }),
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
  PlatformSubscription.findOne = () => ({
    sort: () => ({
      lean: async () => null,
    }),
  });
  PlatformCompany.findByIdAndUpdate = async () => ({});
  User.findOne = async () => null;
});

afterEach(() => {
  PlatformCompany.create = originalCompanyCreate;
  PlatformCompany.find = originalCompanyFind;
  PlatformCompany.findById = originalCompanyFindById;
  PlatformCompany.findByIdAndUpdate = originalCompanyFindByIdAndUpdate;
  PlatformSubscription.create = originalSubscriptionCreate;
  PlatformSubscription.findOne = originalSubscriptionFindOne;
  PlatformSubscription.findByIdAndUpdate = originalSubscriptionFindByIdAndUpdate;
  User.create = originalUserCreate;
  User.findOne = originalUserFindOne;
});

test("platform plans are centralized and include Professional limits", async () => {
  const result = await listPlans();
  const professional = result.plans.find((plan) => plan.id === "professional");

  assert.ok(professional);
  assert.strictEqual(professional.limits.users, 25);
  assert.strictEqual(professional.limits.projects, 25);
  assert.strictEqual(professional.limits.storageGb, 20);
  assert.strictEqual(professional.limits.aiRequestsPerMonth, 500);
});

test("platform plan aliases match canonical plan limits", async () => {
  const result = await listPlans();
  result.plans.forEach((plan) => {
    const canonical = PLANS[plan.id];
    assert.ok(canonical);
    assert.equal(plan.limits.users, canonical.limits.maxUsers);
    assert.equal(plan.limits.projects, canonical.limits.maxProjects);
    assert.equal(plan.limits.storageGb, canonical.limits.storageGB);
    assert.equal(plan.limits.aiRequestsPerMonth, canonical.limits.maxAIRequestsPerMonth);
  });
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
  assert.strictEqual(company.tenantId, "TENANT_001");
  assert.strictEqual(company.planId, "professional");
  assert.strictEqual(company.subscription.planId, "professional");
  assert.strictEqual(company.subscription.status, "Trial");
});

test("createCompany advances tenant ids from existing companies", async () => {
  PlatformCompany.find = () => ({
    select: () => ({
      lean: async () => [{ tenantId: "TENANT_001" }, { tenantId: "TENANT_004" }],
    }),
  });

  const res = createResponse();
  const company = await createCompany(
    {
      name: "Next Company",
      email: "next@example.test",
      planId: "starter",
    },
    res
  );

  assert.strictEqual(company.tenantId, "TENANT_005");
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

test("createCompanyAdminUser creates a normal admin user linked to the company tenant", async () => {
  const companyDocument = {
    _id: "507f1f77bcf86cd799439011",
    name: "ABC Technologies",
    email: "hello@abc.test",
    tenantId: "TENANT_002",
    contactPerson: "Anika",
    contactEmail: "anika@abc.test",
    planId: "professional",
    status: "Active",
    adminUserId: null,
    save: async function save() {
      return this;
    },
  };
  let createdUserPayload;

  User.create = async (payload) => {
    createdUserPayload = payload;
    return {
      _id: "507f1f77bcf86cd799439033",
      ...payload,
    };
  };
  let firstFindById = true;
  PlatformCompany.findById = () => {
    if (firstFindById) {
      firstFindById = false;
      return companyDocument;
    }

    return {
      populate: () => ({
        lean: async () => ({
          ...companyDocument,
          adminUserId: {
            _id: "507f1f77bcf86cd799439033",
            name: "Anika",
            email: "anika@abc.test",
            role: "Admin",
            tenantId: "TENANT_002",
          },
        }),
      }),
    };
  };

  const res = createResponse();
  const result = await createCompanyAdminUser(
    "507f1f77bcf86cd799439011",
    {
      name: "Anika",
      email: "anika@abc.test",
    },
    res
  );

  assert.strictEqual(createdUserPayload.role, "Admin");
  assert.strictEqual(createdUserPayload.tenantId, "TENANT_002");
  assert.strictEqual(result.adminUser.tenantId, "TENANT_002");
  assert.strictEqual(String(companyDocument.adminUserId), "507f1f77bcf86cd799439033");
  assert.ok(result.temporaryPassword);
});

test("createCompanyAdminUser rejects users linked to a different tenant", async () => {
  PlatformCompany.findById = () => ({
    _id: "507f1f77bcf86cd799439011",
    name: "ABC Technologies",
    email: "hello@abc.test",
    tenantId: "TENANT_002",
    save: async function save() {
      return this;
    },
  });
  User.findOne = async () => ({
    tenantId: "TENANT_099",
  });

  const res = createResponse();

  await assert.rejects(
    () =>
      createCompanyAdminUser(
        "507f1f77bcf86cd799439011",
        {
          email: "admin@abc.test",
        },
        res
      ),
    /different tenant/
  );
  assert.strictEqual(res.statusCode, 409);
});
