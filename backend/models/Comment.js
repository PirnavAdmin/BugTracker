const mongoose = require("mongoose");

const { Schema, model, models } = mongoose;

const commentSchema = new Schema(
  {
    issueId: {
      type: Schema.Types.ObjectId,
      ref: "Issue",
      required: [true, "Issue is required"],
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User is required"],
      index: true,
    },
    comment: {
      type: String,
      trim: true,
      default: "",
    },
    attachments: {
      type: [Schema.Types.ObjectId],
      ref: "IssueAttachment",
      default: [],
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

commentSchema.index({ issueId: 1, createdAt: 1 });

module.exports = models.Comment || model("Comment", commentSchema);
