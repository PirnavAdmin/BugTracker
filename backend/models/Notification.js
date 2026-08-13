const mongoose = require("mongoose");

const { Schema, model, models } = mongoose;

const notificationSchema = new Schema(
  {
    recipientId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    text: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ["assignment", "status_change", "team_queue", "sprint", "meeting", "git_push", "other"],
      default: "other",
    },
    relatedId: {
      type: Schema.Types.ObjectId,
      refPath: "onModel",
      default: null,
    },
    onModel: {
      type: String,
      enum: ["Issue", "Sprint", "Project", "ChatMeeting"],
      default: "Issue",
    },
    link: {
      type: String,
      default: "",
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    versionKey: false,
  }
);

notificationSchema.index({ recipientId: 1, isRead: 1, createdAt: -1 });

module.exports = models.Notification || model("Notification", notificationSchema);
