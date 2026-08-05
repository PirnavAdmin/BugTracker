const mongoose = require("mongoose");
const { normalizeWorkspaceId } = require("../utils/workspace");

const { Schema, model, models } = mongoose;

const projectSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, "Project name is required"],
      trim: true,
      minlength: [2, "Project name must be at least 2 characters long"],
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    shortCode: {
      type: String,
      trim: true,
      uppercase: true,
      default: undefined,
      index: true,
    },
    issueSequence: {
      type: Number,
      default: 0,
      min: 0,
    },
    status: {
      type: String,
      enum: {
        values: ["Active", "On Hold", "Completed"],
        message: "Project status must be Active, On Hold, or Completed",
      },
      default: "Active",
      index: true,
    },
    priority: {
      type: String,
      enum: {
        values: ["Low", "Medium", "High", "Critical"],
        message: "Project priority must be Low, Medium, High, or Critical",
      },
      default: "Medium",
    },
    themeColor: {
      type: String,
      trim: true,
      default: "#2563EB",
    },
    startDate: {
      type: Date,
      default: null,
    },
    targetDate: {
      type: Date,
      default: null,
    },
    epics: {
      type: [
        {
          type: String,
          trim: true,
        },
      ],
      default: [],
    },
    manager: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    projectManager: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    teamLead: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    qaLead: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    attachedTeams: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Team",
        },
      ],
      default: [],
      index: true,
    },
    teamIds: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Team",
        },
      ],
      default: [],
      index: true,
    },
    workspaceId: {
      type: String,
      required: true,
      trim: true,
      index: true,
      default: normalizeWorkspaceId(),
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Created by user is required"],
      index: true,
    },
    isCompleted: {
      type: Boolean,
      default: false,
      index: true,
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

projectSchema.index({ workspaceId: 1, createdAt: -1 });
projectSchema.index({ workspaceId: 1, createdBy: 1, createdAt: -1 });
projectSchema.index({ workspaceId: 1, shortCode: 1 }, { unique: true, sparse: true });

module.exports = models.Project || model("Project", projectSchema);
