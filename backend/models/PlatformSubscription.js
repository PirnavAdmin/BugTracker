const mongoose = require("mongoose");
const { PLATFORM_PLAN_IDS } = require("../constants/platformPlans");
const {
  PLATFORM_BILLING_CYCLE_OPTIONS,
  PLATFORM_BILLING_CYCLES,
  PLATFORM_SUBSCRIPTION_STATUS_OPTIONS,
  PLATFORM_SUBSCRIPTION_STATUSES,
} = require("../constants/platformSubscriptions");

const { Schema, model, models } = mongoose;

const platformSubscriptionSchema = new Schema(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: "PlatformCompany",
      required: true,
      index: true,
    },
    planId: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      enum: Object.values(PLATFORM_PLAN_IDS),
      index: true,
    },
    status: {
      type: String,
      enum: PLATFORM_SUBSCRIPTION_STATUS_OPTIONS,
      default: PLATFORM_SUBSCRIPTION_STATUSES.TRIAL,
      index: true,
    },
    startDate: {
      type: Date,
      default: Date.now,
    },
    endDate: {
      type: Date,
      default: null,
    },
    billingCycle: {
      type: String,
      enum: PLATFORM_BILLING_CYCLE_OPTIONS,
      default: PLATFORM_BILLING_CYCLES.MONTHLY,
    },
    amount: {
      type: Number,
      default: null,
      min: 0,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

platformSubscriptionSchema.index({ companyId: 1, createdAt: -1 });
platformSubscriptionSchema.index({ status: 1, planId: 1 });

module.exports =
  models.PlatformSubscription || model("PlatformSubscription", platformSubscriptionSchema);
