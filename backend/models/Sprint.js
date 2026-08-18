const mongoose = require("mongoose");
const { normalizeWorkspaceId } = require("../utils/workspace");

const { Schema, model, models } = mongoose;

const sprintSnapshotSchema = new Schema(
  {
    committedIssueIds: [
      {
        type: Schema.Types.ObjectId,
        ref: "Issue",
      },
    ],
    committedPoints: {
      type: Number,
      default: 0,
    },
    completedIssueIds: [
      {
        type: Schema.Types.ObjectId,
        ref: "Issue",
      },
    ],
    completedPoints: {
      type: Number,
      default: 0,
    },
    carriedOverIssueIds: [
      {
        type: Schema.Types.ObjectId,
        ref: "Issue",
      },
    ],
    carryOverMode: {
      type: String,
      enum: {
        values: ["BACKLOG", "SPRINT", ""],
        message: "Carry-over mode must be BACKLOG or SPRINT",
      },
      default: "",
    },
  },
  {
    _id: false,
    versionKey: false,
  }
);

const sprintSchema = new Schema(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: [true, "Project is required"],
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
    tenantId: {
      type: String,
      index: true,
      trim: true,
    },
    name: {
      type: String,
      required: [true, "Sprint name is required"],
      trim: true,
      minlength: [2, "Sprint name must be at least 2 characters long"],
    },
    goal: {
      type: String,
      trim: true,
      default: "",
    },
    state: {
      type: String,
      enum: {
        values: ["PLANNED", "ACTIVE", "COMPLETED"],
        message: "Sprint state must be PLANNED, ACTIVE, or COMPLETED",
      },
      default: "PLANNED",
      index: true,
    },
    startDate: {
      type: Date,
      default: null,
    },
    endDate: {
      type: Date,
      default: null,
    },
    startedAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    expiredAt: {
      type: Date,
      default: null,
    },
    lockOverride: {
      enabled: {
        type: Boolean,
        default: false,
      },
      reopenedAt: {
        type: Date,
        default: null,
      },
      reopenedBy: {
        type: Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Created by user is required"],
      index: true,
    },
    completedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    notificationSettings: {
      sprintNotificationsEnabled: {
        type: Boolean,
        default: undefined,
      },
      stakeholderUserIds: [
        {
          type: Schema.Types.ObjectId,
          ref: "User",
        },
      ],
      stakeholderEmails: [
        {
          type: String,
          trim: true,
          lowercase: true,
        },
      ],
      ccEmails: [
        {
          type: String,
          trim: true,
          lowercase: true,
        },
      ],
    },
    snapshot: {
      type: sprintSnapshotSchema,
      default: () => ({
        committedIssueIds: [],
        committedPoints: 0,
        completedIssueIds: [],
        completedPoints: 0,
        carriedOverIssueIds: [],
        carryOverMode: "",
      }),
    },
    createdAt: {
      type: Date,
      default: Date.now,
      immutable: true,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    versionKey: false,
  }
);

sprintSchema.pre("save", function updateSprintTimestamp(next) {
  this.updatedAt = new Date();
  next();
});

sprintSchema.index({ workspaceId: 1, projectId: 1, state: 1, teamId: 1 });
sprintSchema.index({ projectId: 1, createdAt: -1 });

module.exports = models.Sprint || model("Sprint", sprintSchema);
