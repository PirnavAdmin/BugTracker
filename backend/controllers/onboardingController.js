const asyncHandler = require("../utils/asyncHandler");
const PlatformCompany = require("../models/PlatformCompany");
const PlatformSubscription = require("../models/PlatformSubscription");
const User = require("../models/User");
const platformCompanyService = require("../services/platformCompanyService");
const generateToken = require("../utils/generateToken");
const { normalizeTenantId } = require("../utils/tenant");
const { normalizeWorkspaceId } = require("../utils/workspace");

const PAID_PLAN_IDS = new Set(["starter", "professional", "business"]);
const BILLING_CYCLES = new Set(["monthly", "annual"]);
const passwordHasLetter = /[A-Za-z]/;
const passwordHasNumber = /\d/;
const onboardingError = (message, status = 400) =>
  Object.assign(new Error(message), { status });
const normalizeText = (value) => String(value || "").trim();
const normalizeEmail = (value) => normalizeText(value).toLowerCase();

const createCompanyAccount = asyncHandler(async (req, res) => {
  const companyName = normalizeText(req.body?.companyName);
  const companyEmail = normalizeEmail(req.body?.companyEmail);
  const adminName = normalizeText(req.body?.adminName);
  const adminEmail = normalizeEmail(req.body?.adminEmail);
  const contactPhone = normalizeText(req.body?.contactPhone);
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  const planId = normalizeText(req.body?.planId).toLowerCase();
  const billingCycle = normalizeText(req.body?.billingCycle).toLowerCase();

  if (!companyName || !companyEmail || !adminName || !adminEmail || !contactPhone) {
    throw onboardingError("Company and administrator details are required");
  }
  if (!PAID_PLAN_IDS.has(planId)) throw onboardingError("Please select a valid paid plan");
  if (!BILLING_CYCLES.has(billingCycle)) {
    throw onboardingError("Please select a valid billing cycle");
  }
  if (password.length < 8 || !passwordHasLetter.test(password) || !passwordHasNumber.test(password)) {
    throw onboardingError("Password must be at least 8 characters and include a letter and number");
  }

  const [existingUser, existingCompany] = await Promise.all([
    User.findOne({ email: adminEmail }).lean(),
    PlatformCompany.findOne({ email: companyEmail }).lean(),
  ]);
  if (existingUser) throw onboardingError("An account with that administrator email already exists", 409);
  if (existingCompany) throw onboardingError("A company with that email already exists", 409);

  let company;
  try {
    company = await platformCompanyService.createCompany({
      name: companyName,
      email: companyEmail,
      contactPerson: adminName,
      contactEmail: adminEmail,
      contactPhone,
      planId,
      status: "Active",
    }, res);
    await PlatformSubscription.findOneAndUpdate(
      { companyId: company._id },
      { $set: { billingCycle } }
    );
    const result = await platformCompanyService.createCompanyAdminUser(company._id, {
      name: adminName,
      email: adminEmail,
      password,
    }, res);
    const user = await User.findById(result.adminUser._id);
    const tenantId = normalizeTenantId(user.tenantId);
    const workspaceId = normalizeWorkspaceId(user.workspaceId);
    const maxAgeSeconds = generateToken.getTokenMaxAgeSeconds();

    res.status(201).json({
      token: generateToken(user._id, workspaceId, { tenantId }),
      expiresAt: new Date(Date.now() + maxAgeSeconds * 1000).toISOString(),
      rememberMe: false,
      selectedPlan: { planId, billingCycle },
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatarUrl: user.avatarUrl || "",
        workspaceId,
        tenantId,
        teams: [],
        teamCount: 0,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    if (company?._id) {
      await Promise.allSettled([
        User.deleteMany({ tenantId: normalizeTenantId(company.tenantId) }),
        PlatformSubscription.deleteMany({ companyId: company._id }),
        PlatformCompany.deleteOne({ _id: company._id }),
      ]);
    }
    throw error;
  }
});

module.exports = { createCompanyAccount };
