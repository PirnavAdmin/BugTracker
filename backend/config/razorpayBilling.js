const { PLAN_IDS } = require("./plans");

const BILLING_CYCLES = Object.freeze({ MONTHLY: "monthly", ANNUAL: "annual" });
const RAZORPAY_BILLING_PLANS = Object.freeze({
  [PLAN_IDS.STARTER]: Object.freeze({ monthly: process.env.RAZORPAY_STARTER_MONTHLY_PLAN_ID || "plan_TRtZqcqv7Uf9N", annual: process.env.RAZORPAY_STARTER_ANNUAL_PLAN_ID || "plan_TRtdeOC4C4QH3U9" }),
  [PLAN_IDS.PROFESSIONAL]: Object.freeze({ monthly: process.env.RAZORPAY_PROFESSIONAL_MONTHLY_PLAN_ID || "plan_TRtenEQnTyn1WK", annual: process.env.RAZORPAY_PROFESSIONAL_ANNUAL_PLAN_ID || "plan_TRtfKRbPF9Oiqj" }),
  [PLAN_IDS.BUSINESS]: Object.freeze({ monthly: process.env.RAZORPAY_BUSINESS_MONTHLY_PLAN_ID || "plan_TRtfkF2UcXeeBO", annual: process.env.RAZORPAY_BUSINESS_ANNUAL_PLAN_ID || "plan_TRciCUREMWBLo7" }),
});
const getBillingPlan = (planId, billingCycle) => RAZORPAY_BILLING_PLANS[String(planId || "").toLowerCase()]?.[String(billingCycle || "").toLowerCase()] || null;
// Razorpay total_count is the total number of charges, not an interval. One annual
// charge therefore creates a deliberately non-renewing one-year subscription.
const getSubscriptionTotalCount = (billingCycle) => String(billingCycle).toLowerCase() === BILLING_CYCLES.ANNUAL ? 1 : 120;
module.exports = { BILLING_CYCLES, RAZORPAY_BILLING_PLANS, getBillingPlan, getSubscriptionTotalCount };
