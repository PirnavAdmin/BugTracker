const mongoose = require("mongoose");

const { Schema, model, models } = mongoose;

const storageUsageSchema = new Schema(
  {
    tenantId: { type: String, required: true, unique: true, index: true, uppercase: true, trim: true },
    issueAttachmentBytes: { type: Number, default: 0, min: 0 },
    chatAttachmentBytes: { type: Number, default: 0, min: 0 },
    avatarBytes: { type: Number, default: 0, min: 0 },
    totalBytes: { type: Number, default: 0, min: 0 },
    reservedBytes: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true, versionKey: false }
);

module.exports = models.StorageUsage || model("StorageUsage", storageUsageSchema);
