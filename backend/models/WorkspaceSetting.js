const mongoose = require("mongoose");

const { Schema, model, models } = mongoose;

const workspaceSettingSchema = new Schema(
  {
    workspaceId: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      index: true,
    },
    workspaceSender: {
      userId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
      enabled: {
        type: Boolean,
        default: false,
      },
      updatedBy: {
        type: Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
      updatedAt: {
        type: Date,
        default: null,
      },
    },
    sprintNotifications: {
      enabled: {
        type: Boolean,
        default: true,
      },
      notifySprintStartedAssignees: {
        type: Boolean,
        default: true,
      },
      notifySprintStartedStakeholders: {
        type: Boolean,
        default: true,
      },
      notifyIssueAddedToActiveSprint: {
        type: Boolean,
        default: true,
      },
      notifyAssigneeChangedInActiveSprint: {
        type: Boolean,
        default: true,
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
    moduleOwnerships: [
      {
        moduleName: {
          type: String,
          trim: true,
          required: true,
        },
        teamId: {
          type: Schema.Types.ObjectId,
          ref: "Team",
          default: null,
        },
        developerId: {
          type: Schema.Types.ObjectId,
          ref: "User",
          default: null,
        },
        responsibleTeamName: {
          type: String,
          trim: true,
          default: "",
        },
        updatedBy: {
          type: Schema.Types.ObjectId,
          ref: "User",
          default: null,
        },
        updatedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    screenPermissions: {
      type: Schema.Types.Mixed,
      default: {},
    },
    workPermissions: {
      type: Schema.Types.Mixed,
      default: {},
    },
    aiSettings: {
      type: Schema.Types.Mixed,
      default: {},
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

module.exports =
  models.WorkspaceSetting || model("WorkspaceSetting", workspaceSettingSchema);
