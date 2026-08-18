const mongoose = require("mongoose");
const crypto = require("crypto");
const { PLATFORM_PLANS, getPlatformPlan } = require("../constants/platformPlans");
const {
  PLATFORM_BILLING_CYCLES,
  PLATFORM_BILLING_CYCLE_OPTIONS,
  PLATFORM_COMPANY_STATUSES,
  PLATFORM_COMPANY_STATUS_OPTIONS,
  PLATFORM_SUBSCRIPTION_STATUSES,
  PLATFORM_SUBSCRIPTION_STATUS_OPTIONS,
} = require("../constants/platformSubscriptions");
const PlatformCompany = require("../models/PlatformCompany");
const PlatformSubscription = require("../models/PlatformSubscription");
const User = require("../models/User");
const { ROLE_ADMIN } = require("../utils/roles");
const {
  createTenantIdFromNumber,
  normalizeTenantId,
  parseTenantSequence,
} = require("../utils/tenant");
const { normalizeWorkspaceId } = require("../utils/workspace");

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normalizeString = (value = "") => String(value || "").trim();
const normalizeEmail = (value = "") => normalizeString(value).toLowerCase();
const normalizePlanId = (value = "") => normalizeString(value).toLowerCase();
const generateTemporaryPassword = () => `${crypto.randomBytes(4).toString("hex")}A9!`;

const ensureObjectId = (id, res) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(404);
    throw new Error("Platform company not found");
  }
};

const requireValidPlan = (planId, res) => {
  const plan = getPlatformPlan(planId);

  if (!plan) {
    res.status(400);
    throw new Error("A valid subscription plan is required");
  }

  return plan;
};

const validateEmail = (email, fieldName, res, { required = true } = {}) => {
  if (!email && !required) {
    return;
  }

  if (!email || !emailRegex.test(email)) {
    res.status(400);
    throw new Error(`${fieldName} must be a valid email address`);
  }
};

const serializePlan = (planId) => getPlatformPlan(planId) || null;

const serializeSubscription = (subscription) => {
  if (!subscription) {
    return null;
  }

  return {
    _id: subscription._id,
    companyId: subscription.companyId,
    planId: subscription.planId,
    plan: serializePlan(subscription.planId),
    status: subscription.status,
    startDate: subscription.startDate,
    endDate: subscription.endDate,
    billingCycle: subscription.billingCycle,
    amount: subscription.amount,
    createdAt: subscription.createdAt,
    updatedAt: subscription.updatedAt,
  };
};

const serializeCompany = (company, subscription = null) => ({
  _id: company._id,
  name: company.name,
  email: company.email,
  tenantId: normalizeTenantId(company.tenantId),
  contactPerson: company.contactPerson,
  contactEmail: company.contactEmail,
  contactPhone: company.contactPhone,
  planId: company.planId,
  plan: serializePlan(company.planId),
  status: company.status,
  adminUserId: company.adminUserId?._id || company.adminUserId || null,
  adminUser: company.adminUserId?._id
    ? {
        _id: company.adminUserId._id,
        name: company.adminUserId.name,
        email: company.adminUserId.email,
        role: company.adminUserId.role,
        tenantId: normalizeTenantId(company.adminUserId.tenantId),
      }
    : null,
  subscription: serializeSubscription(subscription),
  createdAt: company.createdAt,
  updatedAt: company.updatedAt,
});

const generateNextTenantId = async () => {
  const companies = await PlatformCompany.find({})
    .select("tenantId")
    .lean();
  const highestSequence = companies.reduce(
    (max, company) => Math.max(max, parseTenantSequence(company.tenantId)),
    0
  );

  return createTenantIdFromNumber(highestSequence + 1);
};

const getLatestSubscriptionsForCompanies = async (companyIds = []) => {
  if (!companyIds.length) {
    return new Map();
  }

  const subscriptions = await PlatformSubscription.find({
    companyId: { $in: companyIds },
  })
    .sort({ createdAt: -1 })
    .lean();
  const byCompanyId = new Map();

  subscriptions.forEach((subscription) => {
    const key = String(subscription.companyId);

    if (!byCompanyId.has(key)) {
      byCompanyId.set(key, subscription);
    }
  });

  return byCompanyId;
};

const listPlans = async () => ({
  plans: PLATFORM_PLANS,
});

const listCompanies = async (query = {}) => {
  const page = Math.max(Number.parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(Number.parseInt(query.limit, 10) || 10, 1), 50);
  const search = normalizeString(query.search);
  const status = normalizeString(query.status);
  const planId = normalizePlanId(query.planId);
  const filter = {};

  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
      { contactPerson: { $regex: search, $options: "i" } },
      { contactEmail: { $regex: search, $options: "i" } },
    ];
  }

  if (status && PLATFORM_COMPANY_STATUS_OPTIONS.includes(status)) {
    filter.status = status;
  }

  if (planId && getPlatformPlan(planId)) {
    filter.planId = planId;
  }

  const [total, companies] = await Promise.all([
    PlatformCompany.countDocuments(filter),
    PlatformCompany.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("adminUserId", "name email role tenantId")
      .lean(),
  ]);
  const subscriptionsByCompany = await getLatestSubscriptionsForCompanies(
    companies.map((company) => company._id)
  );

  return {
    companies: companies.map((company) =>
      serializeCompany(company, subscriptionsByCompany.get(String(company._id)))
    ),
    pagination: {
      page,
      limit,
      total,
      pages: Math.max(Math.ceil(total / limit), 1),
    },
    filters: {
      statuses: PLATFORM_COMPANY_STATUS_OPTIONS,
      plans: PLATFORM_PLANS,
    },
  };
};

const createCompany = async (payload = {}, res) => {
  const name = normalizeString(payload.name);
  const email = normalizeEmail(payload.email);
  const contactPerson = normalizeString(payload.contactPerson);
  const contactEmail = normalizeEmail(payload.contactEmail);
  const contactPhone = normalizeString(payload.contactPhone);
  const planId = normalizePlanId(payload.planId) || "starter";
  const status = normalizeString(payload.status) || PLATFORM_COMPANY_STATUSES.ACTIVE;

  if (!name) {
    res.status(400);
    throw new Error("Company name is required");
  }

  validateEmail(email, "Company email", res);
  validateEmail(contactEmail, "Contact email", res, { required: false });
  requireValidPlan(planId, res);

  if (!PLATFORM_COMPANY_STATUS_OPTIONS.includes(status)) {
    res.status(400);
    throw new Error("A valid company status is required");
  }

  const company = await PlatformCompany.create({
    name,
    email,
    tenantId: await generateNextTenantId(),
    contactPerson,
    contactEmail,
    contactPhone,
    planId,
    status,
  });
  const subscription = await PlatformSubscription.create({
    companyId: company._id,
    planId,
    status:
      status === PLATFORM_COMPANY_STATUSES.SUSPENDED
        ? PLATFORM_SUBSCRIPTION_STATUSES.SUSPENDED
        : PLATFORM_SUBSCRIPTION_STATUSES.TRIAL,
    billingCycle: PLATFORM_BILLING_CYCLES.MONTHLY,
  });

  return serializeCompany(company.toObject(), subscription.toObject());
};

const getCompanyById = async (id, res) => {
  ensureObjectId(id, res);

  const company = await PlatformCompany.findById(id)
    .populate("adminUserId", "name email role tenantId")
    .lean();

  if (!company) {
    res.status(404);
    throw new Error("Platform company not found");
  }

  const subscription = await PlatformSubscription.findOne({ companyId: company._id })
    .sort({ createdAt: -1 })
    .lean();

  return serializeCompany(company, subscription);
};

const updateCompany = async (id, payload = {}, res) => {
  ensureObjectId(id, res);

  const updates = {};

  if (payload.name !== undefined) {
    updates.name = normalizeString(payload.name);
    if (!updates.name) {
      res.status(400);
      throw new Error("Company name is required");
    }
  }

  if (payload.email !== undefined) {
    updates.email = normalizeEmail(payload.email);
    validateEmail(updates.email, "Company email", res);
  }

  if (payload.contactPerson !== undefined) {
    updates.contactPerson = normalizeString(payload.contactPerson);
  }

  if (payload.contactEmail !== undefined) {
    updates.contactEmail = normalizeEmail(payload.contactEmail);
    validateEmail(updates.contactEmail, "Contact email", res, { required: false });
  }

  if (payload.contactPhone !== undefined) {
    updates.contactPhone = normalizeString(payload.contactPhone);
  }

  if (payload.planId !== undefined) {
    updates.planId = normalizePlanId(payload.planId);
    requireValidPlan(updates.planId, res);
  }

  if (payload.status !== undefined) {
    updates.status = normalizeString(payload.status);
    if (!PLATFORM_COMPANY_STATUS_OPTIONS.includes(updates.status)) {
      res.status(400);
      throw new Error("A valid company status is required");
    }
  }

  delete updates.tenantId;
  delete updates.adminUserId;

  const company = await PlatformCompany.findByIdAndUpdate(id, updates, {
    new: true,
    runValidators: true,
  })
    .populate("adminUserId", "name email role tenantId")
    .lean();

  if (!company) {
    res.status(404);
    throw new Error("Platform company not found");
  }

  const subscription = await PlatformSubscription.findOne({ companyId: company._id })
    .sort({ createdAt: -1 })
    .lean();

  return serializeCompany(company, subscription);
};

const listSubscriptions = async () => {
  const subscriptions = await PlatformSubscription.find({})
    .sort({ createdAt: -1 })
    .populate("companyId", "name email status")
    .lean();

  return {
    subscriptions: subscriptions.map((subscription) => ({
      ...serializeSubscription(subscription),
      company: subscription.companyId || null,
    })),
    filters: {
      statuses: PLATFORM_SUBSCRIPTION_STATUS_OPTIONS,
      billingCycles: PLATFORM_BILLING_CYCLE_OPTIONS,
      plans: PLATFORM_PLANS,
    },
  };
};

const createSubscription = async (payload = {}, res) => {
  const companyId = normalizeString(payload.companyId);
  ensureObjectId(companyId, res);

  const company = await PlatformCompany.findById(companyId);

  if (!company) {
    res.status(404);
    throw new Error("Platform company not found");
  }

  const planId = normalizePlanId(payload.planId || company.planId);
  requireValidPlan(planId, res);

  const status = normalizeString(payload.status) || PLATFORM_SUBSCRIPTION_STATUSES.TRIAL;
  const billingCycle = normalizeString(payload.billingCycle) || PLATFORM_BILLING_CYCLES.MONTHLY;

  if (!PLATFORM_SUBSCRIPTION_STATUS_OPTIONS.includes(status)) {
    res.status(400);
    throw new Error("A valid subscription status is required");
  }

  if (!PLATFORM_BILLING_CYCLE_OPTIONS.includes(billingCycle)) {
    res.status(400);
    throw new Error("A valid billing cycle is required");
  }

  company.planId = planId;
  await company.save();

  const subscription = await PlatformSubscription.create({
    companyId,
    planId,
    status,
    startDate: payload.startDate || new Date(),
    endDate: payload.endDate || null,
    billingCycle,
    amount:
      payload.amount === null || payload.amount === undefined || payload.amount === ""
        ? null
        : Number(payload.amount),
  });

  return serializeSubscription(subscription.toObject());
};

const updateSubscription = async (id, payload = {}, res) => {
  ensureObjectId(id, res);

  const updates = {};

  if (payload.planId !== undefined) {
    updates.planId = normalizePlanId(payload.planId);
    requireValidPlan(updates.planId, res);
  }

  if (payload.status !== undefined) {
    updates.status = normalizeString(payload.status);
    if (!PLATFORM_SUBSCRIPTION_STATUS_OPTIONS.includes(updates.status)) {
      res.status(400);
      throw new Error("A valid subscription status is required");
    }
  }

  if (payload.startDate !== undefined) {
    updates.startDate = payload.startDate || null;
  }

  if (payload.endDate !== undefined) {
    updates.endDate = payload.endDate || null;
  }

  if (payload.billingCycle !== undefined) {
    updates.billingCycle = normalizeString(payload.billingCycle);
    if (!PLATFORM_BILLING_CYCLE_OPTIONS.includes(updates.billingCycle)) {
      res.status(400);
      throw new Error("A valid billing cycle is required");
    }
  }

  if (payload.amount !== undefined) {
    updates.amount = payload.amount === null || payload.amount === "" ? null : Number(payload.amount);
  }

  const subscription = await PlatformSubscription.findByIdAndUpdate(id, updates, {
    new: true,
    runValidators: true,
  });

  if (!subscription) {
    res.status(404);
    throw new Error("Platform subscription not found");
  }

  if (updates.planId) {
    await PlatformCompany.findByIdAndUpdate(subscription.companyId, { planId: updates.planId });
  }

  if (updates.status === PLATFORM_SUBSCRIPTION_STATUSES.SUSPENDED) {
    await PlatformCompany.findByIdAndUpdate(subscription.companyId, {
      status: PLATFORM_COMPANY_STATUSES.SUSPENDED,
    });
  }

  if (updates.status === PLATFORM_SUBSCRIPTION_STATUSES.ACTIVE) {
    await PlatformCompany.findByIdAndUpdate(subscription.companyId, {
      status: PLATFORM_COMPANY_STATUSES.ACTIVE,
    });
  }

  return serializeSubscription(subscription.toObject());
};

const createCompanyAdminUser = async (companyId, payload = {}, res) => {
  ensureObjectId(companyId, res);

  const company = await PlatformCompany.findById(companyId);

  if (!company) {
    res.status(404);
    throw new Error("Platform company not found");
  }

  const name = normalizeString(payload.name) || company.contactPerson || `${company.name} Admin`;
  const email = normalizeEmail(payload.email || company.contactEmail || company.email);
  const password = normalizeString(payload.password) || generateTemporaryPassword();
  const workspaceId = normalizeWorkspaceId();
  const tenantId = normalizeTenantId(company.tenantId);

  validateEmail(email, "Company admin email", res);

  const existingUser = await User.findOne({ email });
  let user;

  if (existingUser) {
    const existingTenantId = normalizeTenantId(existingUser.tenantId);

    if (existingTenantId && existingTenantId !== tenantId) {
      res.status(409);
      throw new Error("User already belongs to a different tenant");
    }

    existingUser.tenantId = tenantId;
    existingUser.role = ROLE_ADMIN;
    existingUser.password = password;
    if (!existingUser.workspaceId) {
      existingUser.workspaceId = workspaceId;
    }
    user = await existingUser.save();
  } else {
    user = await User.create({
      name,
      email,
      password,
      role: ROLE_ADMIN,
      workspaceId,
      tenantId,
    });
  }

  company.adminUserId = user._id;
  await company.save();

  return {
    company: await getCompanyById(company._id, res),
    adminUser: {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      tenantId: normalizeTenantId(user.tenantId),
    },
    temporaryPassword: payload.password ? undefined : password,
  };
};

module.exports = {
  createCompany,
  createCompanyAdminUser,
  createSubscription,
  getCompanyById,
  listCompanies,
  listPlans,
  listSubscriptions,
  serializeCompany,
  serializeSubscription,
  updateCompany,
  updateSubscription,
};
