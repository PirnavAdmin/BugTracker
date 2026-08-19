const mongoose = require("mongoose");

const { Schema, model, models } = mongoose;

const issueAttachmentSchema = new Schema(
  {
    tenantId: {
      type: String,
      trim: true,
      uppercase: true,
      default: "",
      index: true,
    },
    issueId: {
      type: Schema.Types.ObjectId,
      ref: "Issue",
      required: [true, "Issue is required"],
      index: true,
    },
    uploadedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Uploader is required"],
      index: true,
    },
    fileName: {
      type: String,
      required: [true, "File name is required"],
      trim: true,
    },
    mimeType: {
      type: String,
      trim: true,
      default: "application/octet-stream",
    },
    sizeBytes: {
      type: Number,
      default: 0,
    },
    storagePath: {
      type: String,
      required: [true, "Storage path is required"],
      trim: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      immutable: true,
    },
  },
  {
    versionKey: false,
  }
);

issueAttachmentSchema.index({ issueId: 1, createdAt: -1 });

module.exports =
  models.IssueAttachment || model("IssueAttachment", issueAttachmentSchema);
