const mongoose = require("mongoose");

const { Schema, model, models } = mongoose;

const projectAIInsightSchema = new Schema(
  {
    tenantId: { type: String, required: true, trim: true, index: true },
    workspaceId: { type: String, required: true, trim: true, index: true },
    projectId: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    analysisVersion: { type: String, required: true, trim: true, default: "v1" },
    generatedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    generatedAt: { type: Date, required: true, default: Date.now },
    report: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true, versionKey: false }
);

projectAIInsightSchema.index(
  { tenantId: 1, projectId: 1, analysisVersion: 1 },
  { unique: true }
);

module.exports = models.ProjectAIInsight || model("ProjectAIInsight", projectAIInsightSchema);
