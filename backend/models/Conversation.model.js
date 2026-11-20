const mongoose = require("mongoose");
const { normalizeWorkspaceId } = require("../utils/workspace");

const { Schema, model, models } = mongoose;

const conversationSchema = new Schema(
  {
    type: {
      type: String,
      enum: ["direct", "group"],
      required: true,
      index: true,
    },
    channelType: {
      type: String,
      enum: ["direct", "team", "project", "custom"],
      default: "custom",
      index: true,
    },
    name: {
      type: String,
      trim: true,
      default: "",
    },
    participants: {
      type: [
        {
          type: Schema.Types.ObjectId,
          ref: "User",
        },
      ],
      required: true,
      validate: {
        validator: (value) => Array.isArray(value) && value.length > 0,
        message: "A conversation needs at least one participant",
      },
      index: true,
    },
    projectId: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      default: null,
      index: true,
    },
    teamId: {
      type: Schema.Types.ObjectId,
      ref: "Team",
      default: null,
      index: true,
    },
    workspaceId: {
      type: String,
      required: true,
      trim: true,
      index: true,
      default: normalizeWorkspaceId(),
    },
    // Per-user visibility boundary; shared messages and membership stay intact.
    historyClearedAt: { type: Map, of: Date, default: {} },
    lastMessage: {
      type: String,
      trim: true,
      default: "",
    },
    lastMessageAt: {
      type: Date,
      default: null,
      index: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

conversationSchema.index({ workspaceId: 1, participants: 1, lastMessageAt: -1 });
conversationSchema.index(
  { workspaceId: 1, type: 1, "participants.0": 1, "participants.1": 1 },
  {
    unique: true,
    partialFilterExpression: {
      type: "direct",
    },
  }
);
conversationSchema.index(
  { workspaceId: 1, channelType: 1, projectId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      channelType: "project",
      projectId: {
        $type: "objectId",
      },
    },
  }
);
conversationSchema.index(
  { workspaceId: 1, channelType: 1, teamId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      channelType: "team",
      teamId: {
        $type: "objectId",
      },
    },
  }
);

module.exports =
  models.Conversation || model("Conversation", conversationSchema);
