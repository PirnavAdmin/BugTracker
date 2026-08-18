const mongoose = require("mongoose");
const { PLATFORM_PLAN_IDS } = require("../constants/platformPlans");
const {
  PLATFORM_COMPANY_STATUS_OPTIONS,
  PLATFORM_COMPANY_STATUSES,
} = require("../constants/platformSubscriptions");

const { Schema, model, models } = mongoose;

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const platformCompanySchema = new Schema(
  {
    name: {
      type: String,
      required: [true, "Company name is required"],
      trim: true,
      minlength: [2, "Company name must be at least 2 characters long"],
      index: true,
    },
    email: {
      type: String,
      required: [true, "Company email is required"],
      trim: true,
      lowercase: true,
      match: [emailRegex, "Please provide a valid company email address"],
      index: true,
    },
    contactPerson: {
      type: String,
      trim: true,
      default: "",
    },
    contactEmail: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
      validate: {
        validator: (value) => !value || emailRegex.test(value),
        message: "Please provide a valid contact email address",
      },
    },
    contactPhone: {
      type: String,
      trim: true,
      default: "",
    },
    planId: {
      type: String,
      trim: true,
      lowercase: true,
      enum: Object.values(PLATFORM_PLAN_IDS),
      default: PLATFORM_PLAN_IDS.STARTER,
      index: true,
    },
    status: {
      type: String,
      enum: PLATFORM_COMPANY_STATUS_OPTIONS,
      default: PLATFORM_COMPANY_STATUSES.ACTIVE,
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

platformCompanySchema.index({ name: "text", email: "text", contactPerson: "text", contactEmail: "text" });
platformCompanySchema.index({ createdAt: -1 });

module.exports = models.PlatformCompany || model("PlatformCompany", platformCompanySchema);
