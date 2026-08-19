const mongoose = require("mongoose");

const { Schema, model, models } = mongoose;

const attachmentSchema = new Schema(
  {
    tenantId: { type: String, trim: true, uppercase: true, default: "", index: true },
    name: {
      type: String,
      trim: true,
      default: "",
    },
    fileName: {
      type: String,
      trim: true,
      default: "",
    },
    url: {
      type: String,
      trim: true,
      default: "",
    },
    fileUrl: {
      type: String,
      trim: true,
      default: "",
    },
    type: {
      type: String,
      trim: true,
      default: "",
    },
    fileType: {
      type: String,
      trim: true,
      default: "",
    },
    size: {
      type: Number,
      default: 0,
      min: 0,
    },
    fileSizeBytes: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    _id: false,
  }
);

const seenBySchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    seenAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    _id: false,
  }
);

const messageSchema = new Schema(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true,
    },
    senderId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    message: {
      type: String,
      trim: true,
      default: "",
      maxlength: [4000, "Message cannot exceed 4000 characters"],
    },
    attachments: {
      type: [attachmentSchema],
      default: [],
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: null,
    },
    seenBy: {
      type: [seenBySchema],
      default: [],
    },
    edited: {
      type: Boolean,
      default: false,
    },
    deleted: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

messageSchema.index({ conversationId: 1, createdAt: -1 });
messageSchema.index({ conversationId: 1, "seenBy.userId": 1 });

module.exports = models.Message || model("Message", messageSchema);
