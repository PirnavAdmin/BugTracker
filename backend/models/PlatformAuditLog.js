const mongoose = require("mongoose");

const { Schema, model, models } = mongoose;

const platformAuditLogSchema = new Schema(
  {
    actorId: {
      type: Schema.Types.ObjectId,
      ref: "PlatformAdmin",
      default: null,
      index: true,
    },
    actorEmail: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
      index: true,
    },
    action: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["SUCCESS", "FAILED"],
      default: "SUCCESS",
      index: true,
    },
    ipAddress: {
      type: String,
      trim: true,
      default: "",
    },
    userAgent: {
      type: String,
      trim: true,
      default: "",
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
  }
);

platformAuditLogSchema.index({ createdAt: -1 });

module.exports =
  models.PlatformAuditLog || model("PlatformAuditLog", platformAuditLogSchema);
