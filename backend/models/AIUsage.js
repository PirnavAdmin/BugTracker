const mongoose = require("mongoose");

const { Schema, model, models } = mongoose;

const aiUsageSchema = new Schema(
  {
    workspaceId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    tenantId: {
      type: String,
      trim: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    projectId: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      default: null,
      index: true,
    },
    feature: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    modelId: {
      type: String,
      trim: true,
      default: "",
    },
    requestId: {
      type: String,
      trim: true,
      default: "",
      index: true,
    },
    inputTokens: {
      type: Number,
      default: null,
    },
    outputTokens: {
      type: Number,
      default: null,
    },
    totalTokens: {
      type: Number,
      default: null,
    },
    estimatedCost: {
      type: Number,
      default: 0,
      min: 0,
    },
    status: {
      type: String,
      enum: ["SUCCESS", "FAILED", "BLOCKED"],
      default: "SUCCESS",
      index: true,
    },
    durationMs: {
      type: Number,
      default: null,
    },
    role: {
      type: String,
      trim: true,
      default: "",
      index: true,
    },
    repository: {
      type: String,
      trim: true,
      default: "",
    },
    commitSha: {
      type: String,
      trim: true,
      default: "",
      index: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
  }
);

aiUsageSchema.index({ workspaceId: 1, createdAt: -1 });
aiUsageSchema.index({ tenantId: 1, createdAt: -1 });
aiUsageSchema.index({ workspaceId: 1, feature: 1, createdAt: -1 });
aiUsageSchema.index({ workspaceId: 1, userId: 1, createdAt: -1 });
aiUsageSchema.index({ workspaceId: 1, projectId: 1, createdAt: -1 });

module.exports = models.AIUsage || model("AIUsage", aiUsageSchema);
