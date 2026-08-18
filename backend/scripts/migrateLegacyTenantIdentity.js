require("../config/env");
const mongoose = require("mongoose");

const connectDB = require("../config/db");
const PlatformCompany = require("../models/PlatformCompany");
const User = require("../models/User");
const { PLATFORM_PLAN_IDS } = require("../constants/platformPlans");
const { PLATFORM_COMPANY_STATUSES } = require("../constants/platformSubscriptions");
const { DEFAULT_USER } = require("../utils/defaultUser");
const {
  createTenantIdFromNumber,
  normalizeTenantId,
  parseTenantSequence,
} = require("../utils/tenant");
const { LEGACY_WORKSPACE_ID, normalizeWorkspaceId } = require("../utils/workspace");

const LEGACY_TENANT_ID = "TENANT_001";
const missingTenantFilter = {
  $or: [{ tenantId: { $exists: false } }, { tenantId: null }, { tenantId: "" }],
};

const getLegacyCompanyConfig = () => ({
  name: process.env.LEGACY_COMPANY_NAME || "CureCode Legacy Company",
  email: process.env.LEGACY_COMPANY_EMAIL || DEFAULT_USER.email,
  contactPerson: process.env.LEGACY_COMPANY_CONTACT_PERSON || DEFAULT_USER.name,
  contactEmail: process.env.LEGACY_COMPANY_CONTACT_EMAIL || DEFAULT_USER.email,
  contactPhone: process.env.LEGACY_COMPANY_CONTACT_PHONE || "",
  planId: process.env.LEGACY_COMPANY_PLAN_ID || PLATFORM_PLAN_IDS.PROFESSIONAL,
  status: PLATFORM_COMPANY_STATUSES.ACTIVE,
  tenantId: LEGACY_TENANT_ID,
});

const assignTenantId = async (companyId, tenantId) => {
  await PlatformCompany.collection.updateOne(
    {
      _id: companyId,
    },
    {
      $set: {
        tenantId,
      },
    }
  );
};

const getNextTenantId = (usedSequences) => {
  let nextSequence = 1;

  while (usedSequences.has(nextSequence)) {
    nextSequence += 1;
  }

  usedSequences.add(nextSequence);
  return createTenantIdFromNumber(nextSequence);
};

const getUsedTenantSequences = async () => {
  const companies = await PlatformCompany.find({
    tenantId: /^TENANT_\d{3,}$/i,
  })
    .select("tenantId")
    .lean();

  return new Set(companies.map((company) => parseTenantSequence(company.tenantId)).filter(Boolean));
};

const migrateLegacyTenantIdentity = async () => {
  const legacyWorkspaceId = normalizeWorkspaceId(process.env.LEGACY_WORKSPACE_ID || LEGACY_WORKSPACE_ID);
  const config = getLegacyCompanyConfig();
  const usedTenantSequences = await getUsedTenantSequences();

  let company = await PlatformCompany.findOne({
    tenantId: normalizeTenantId(config.tenantId),
  });

  if (!company) {
    company = await PlatformCompany.findOne(missingTenantFilter).sort({ createdAt: 1 });

    if (company) {
      await assignTenantId(company._id, LEGACY_TENANT_ID);
      company.tenantId = LEGACY_TENANT_ID;
      usedTenantSequences.add(1);
      console.log(`[tenant] Assigned legacy platform company ${company.name} to ${LEGACY_TENANT_ID}`);
    } else {
      company = await PlatformCompany.create(config);
      usedTenantSequences.add(1);
      console.log(`[tenant] Created legacy platform company ${company.name} (${company.tenantId})`);
    }
  } else {
    usedTenantSequences.add(1);
    console.log(`[tenant] Legacy platform company already exists (${company.tenantId})`);
  }

  const companiesWithoutTenant = await PlatformCompany.find(missingTenantFilter).sort({ createdAt: 1 });

  for (const companyWithoutTenant of companiesWithoutTenant) {
    const tenantId = getNextTenantId(usedTenantSequences);

    await assignTenantId(companyWithoutTenant._id, tenantId);
    console.log(`[tenant] Assigned platform company ${companyWithoutTenant.name} to ${tenantId}`);
  }

  const result = await User.updateMany(
    {
      workspaceId: legacyWorkspaceId,
      $or: [{ tenantId: { $exists: false } }, { tenantId: null }, { tenantId: "" }],
    },
    {
      $set: {
        tenantId: LEGACY_TENANT_ID,
      },
    }
  );

  console.log(
    `[tenant] Assigned ${result.modifiedCount || 0} users in workspace ${legacyWorkspaceId} to ${LEGACY_TENANT_ID}`
  );
  console.log("[tenant] Existing tenantId values were not overwritten.");
};

const run = async () => {
  try {
    await connectDB();
    await migrateLegacyTenantIdentity();
  } catch (error) {
    console.error(`[tenant] Migration failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
    }
  }
};

if (require.main === module) {
  run();
}

module.exports = {
  LEGACY_TENANT_ID,
  migrateLegacyTenantIdentity,
};
