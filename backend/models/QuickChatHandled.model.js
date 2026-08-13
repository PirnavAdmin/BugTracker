const mongoose = require("mongoose");
const { normalizeWorkspaceId } = require("../utils/workspace");

const { Schema, model, models } = mongoose;

const quickChatHandledSchema = new Schema(
  {
    workspaceId: {
      type: String,
      required: true,
      trim: true,
      index: true,
      default: normalizeWorkspaceId(),
    },
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true,
    },
    messageId: {
      type: Schema.Types.ObjectId,
      ref: "Message",
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    repliedWithMessageId: {
      type: Schema.Types.ObjectId,
      ref: "Message",
      default: null,
    },
    handledAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

quickChatHandledSchema.index(
  { workspaceId: 1, messageId: 1, userId: 1 },
  { unique: true }
);
quickChatHandledSchema.index({ workspaceId: 1, userId: 1, conversationId: 1 });

module.exports =
  models.QuickChatHandled || model("QuickChatHandled", quickChatHandledSchema);
