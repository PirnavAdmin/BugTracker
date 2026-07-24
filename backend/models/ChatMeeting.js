const mongoose = require("mongoose");
const { normalizeWorkspaceId } = require("../utils/workspace");

const { Schema, model, models } = mongoose;

const chatMeetingParticipantSchema = new Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    role: {
      type: String,
      trim: true,
      default: "",
    },
  },
  {
    _id: false,
    versionKey: false,
  }
);

const chatMeetingSchema = new Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      required: [true, "Conversation id is required"],
      index: true,
    },
    workspaceId: {
      type: String,
      required: true,
      trim: true,
      index: true,
      default: normalizeWorkspaceId(),
    },
    scheduledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    provider: {
      type: String,
      default: "microsoft_teams",
      trim: true,
    },
    subject: {
      type: String,
      required: [true, "Meeting title is required"],
      trim: true,
      minlength: [2, "Meeting title must be at least 2 characters long"],
    },
    meetingId: {
      type: String,
      required: [true, "Meeting id is required"],
      trim: true,
      index: true,
    },
    joinUrl: {
      type: String,
      required: [true, "Meeting join URL is required"],
      trim: true,
    },
    startDateTime: {
      type: Date,
      required: [true, "Meeting start time is required"],
      index: true,
    },
    endDateTime: {
      type: Date,
      required: [true, "Meeting end time is required"],
      index: true,
    },
    durationMinutes: {
      type: Number,
      required: [true, "Meeting duration is required"],
      min: [5, "Meeting duration must be at least 5 minutes"],
    },
    participants: {
      type: [chatMeetingParticipantSchema],
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
    collection: "chat_meetings",
  }
);

chatMeetingSchema.index({ workspaceId: 1, conversationId: 1, startDateTime: 1 });
chatMeetingSchema.index({ conversationId: 1, createdAt: -1 });

module.exports = models.ChatMeeting || model("ChatMeeting", chatMeetingSchema);
