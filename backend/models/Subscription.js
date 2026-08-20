const mongoose = require("mongoose");
const { Schema, model, models } = mongoose;
const schema = new Schema({
  tenantId: { type: String, required: true, uppercase: true, index: true }, companyId: { type: Schema.Types.ObjectId, ref: "PlatformCompany", required: true, index: true }, planId: { type: String, required: true, lowercase: true }, billingCycle: { type: String, enum: ["monthly", "annual"], required: true }, provider: { type: String, required: true, default: "razorpay" }, providerSubscriptionId: { type: String, required: true, unique: true, sparse: true }, providerPlanId: { type: String, required: true }, status: { type: String, enum: ["TRIAL", "PENDING", "ACTIVE", "PAST_DUE", "PAUSED", "CANCELLED", "EXPIRED", "SUSPENDED"], default: "PENDING", index: true }, providerStatus: String, currency: { type: String, required: true, default: "INR" }, amount: { type: Number, required: true, min: 0 }, startDate: Date, currentPeriodStart: Date, currentPeriodEnd: Date, trialStart: Date, trialEnd: Date, cancelledAt: Date, cancelAtPeriodEnd: { type: Boolean, default: false }, endedAt: Date, metadata: { type: Schema.Types.Mixed, default: {} },
}, { timestamps: true, versionKey: false });
schema.index({ tenantId: 1, status: 1 }); schema.index({ companyId: 1, createdAt: -1 });
module.exports = models.Subscription || model("Subscription", schema);
