const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const PlatformCompany = require("../models/PlatformCompany");
const {
  getPlan,
  getCompanyPlan,
  getPlanLimits,
  getCompanyPlanByTenantId,
  getPlanMetadata,
} = require("../services/planService");

const originalFindOne = PlatformCompany.findOne;
const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  PlatformCompany.findOne = originalFindOne;
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
});

test("all CureCode plans resolve from the centralized configuration", () => {
  for (const id of ["free", "starter", "professional", "business", "enterprise"]) {
    assert.equal(getPlan(id).id, id);
  }
  assert.equal(getPlan("PROFESSIONAL").mostPopular, true);
  assert.equal(getPlan("professional").priceMonthly, 1999);
  assert.equal(getPlan("professional").priceAnnual, 19990);
});

test("canonical plan limits match Phase 5A", () => {
  assert.deepEqual(getPlanLimits("free"), {
    maxUsers: 5,
    maxProjects: 2,
    maxIssues: 200,
    storageGB: 1,
    maxAIRequestsPerMonth: 25,
  });
  assert.equal(getPlanLimits("starter").maxUsers, 10);
  assert.equal(getPlanLimits("professional").maxUsers, 25);
  assert.equal(getPlanLimits("professional").maxProjects, 25);
  assert.equal(getPlanLimits("professional").storageGB, 20);
  assert.equal(getPlanLimits("professional").maxAIRequestsPerMonth, 500);
  assert.equal(getPlanLimits("business").maxUsers, 50);
  assert.equal(getPlanLimits("business").maxProjects, null);
  assert.equal(getPlanLimits("business").storageGB, 100);
  assert.equal(getPlanLimits("business").maxAIRequestsPerMonth, 2000);
  assert.equal(getPlanLimits("enterprise").maxUsers, null);
});

test("invalid plans fail clearly outside production and use the safe Free plan in production", () => {
  process.env.NODE_ENV = "test";
  assert.throws(() => getPlanLimits("not-a-plan"), { code: "PLAN_CONFIGURATION_ERROR" });
  process.env.NODE_ENV = "production";
  assert.equal(getPlanLimits("not-a-plan").maxUsers, 5);
});

test("tenant resolves its plan through PlatformCompany.tenantId", async () => {
  let seenFilter;
  PlatformCompany.findOne = (filter) => {
    seenFilter = filter;
    return { lean: async () => ({ tenantId: "TENANT_007", planId: "professional" }) };
  };
  const result = await getCompanyPlanByTenantId("tenant_007");
  assert.deepEqual(seenFilter, { tenantId: "TENANT_007" });
  assert.equal(result.plan.id, "professional");
  assert.equal(getCompanyPlan({ planId: "enterprise" }).limits.maxProjects, null);
});

test("plan metadata contains no automation capability", () => {
  for (const id of ["free", "starter", "professional", "business", "enterprise"]) {
    assert.equal(Object.hasOwn(getPlanMetadata(getPlan(id)).capabilities, "automation"), false);
  }
});
