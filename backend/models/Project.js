const mongoose = require("mongoose");
const { normalizeWorkspaceId } = require("../utils/workspace");

const { Schema, model, models } = mongoose;

const aiCodeReviewFindingSchema = new Schema(
  {
    severity: {
      type: String,
      trim: true,
      enum: ["CRITICAL", "HIGH", "MEDIUM", "LOW", "SUGGESTION", ""],
      default: "",
    },
    title: { type: String, trim: true, default: "" },
    category: {
      type: String,
      trim: true,
      enum: ["security", "bug", "performance", "quality", "testing", "devops", ""],
      default: "",
    },
    file: { type: String, trim: true, default: "" },
    line: { type: Number, default: null },
    confidence: { type: Number, default: null },
    description: { type: String, trim: true, default: "" },
    whyItMatters: { type: String, trim: true, default: "" },
    recommendation: { type: String, trim: true, default: "" },
    regressionImpact: { type: String, trim: true, default: "" },
  },
  { _id: false }
);

const aiReviewRiskSchema = new Schema(
  {
    level: {
      type: String,
      trim: true,
      enum: ["low", "medium", "high", "critical"],
      default: "low",
    },
    areas: { type: [String], default: [] },
    reason: { type: String, trim: true, default: "" },
  },
  { _id: false }
);

const aiReviewTestingSchema = new Schema(
  {
    risk: {
      type: String,
      trim: true,
      enum: ["low", "medium", "high", "critical"],
      default: "low",
    },
    recommendedTests: { type: [String], default: [] },
    edgeCases: { type: [String], default: [] },
    affectedModules: { type: [String], default: [] },
  },
  { _id: false }
);

const aiReviewReleaseSchema = new Schema(
  {
    readiness: {
      type: String,
      trim: true,
      enum: ["ready", "needs_attention", "blocked"],
      default: "needs_attention",
    },
    risks: { type: [String], default: [] },
    recommendations: { type: [String], default: [] },
  },
  { _id: false }
);

const aiCodeReviewSchema = new Schema(
  {
    status: {
      type: String,
      trim: true,
      enum: ["NOT_REVIEWED", "REVIEWING", "COMPLETED", "FAILED"],
      default: "NOT_REVIEWED",
    },
    score: { type: Number, default: null, min: 0, max: 100 },
    rating: { type: String, trim: true, default: "" },
    summary: { type: String, trim: true, default: "" },
    findings: { type: [aiCodeReviewFindingSchema], default: [] },
    security: { type: [aiCodeReviewFindingSchema], default: [] },
    performance: { type: [aiCodeReviewFindingSchema], default: [] },
    codeQuality: { type: [aiCodeReviewFindingSchema], default: [] },
    regressionRisk: {
      type: aiReviewRiskSchema,
      default: () => ({ level: "low", areas: [], reason: "" }),
    },
    testing: {
      type: aiReviewTestingSchema,
      default: () => ({
        risk: "low",
        recommendedTests: [],
        edgeCases: [],
        affectedModules: [],
      }),
    },
    release: {
      type: aiReviewReleaseSchema,
      default: () => ({
        readiness: "needs_attention",
        risks: [],
        recommendations: [],
      }),
    },
    testingRecommendations: { type: [String], default: [] },
    positiveObservations: { type: [String], default: [] },
    reviewedAt: { type: Date, default: null },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    error: { type: String, trim: true, default: "" },
  },
  { _id: false }
);

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
    repository: {
      enabled: {
        type: Boolean,
        default: true,
      },
      provider: {
        type: String,
        trim: true,
        enum: ["GitHub", "GitLab", "Bitbucket", ""],
        default: "GitHub",
      },
      name: {
        type: String,
        trim: true,
        default: "",
      },
      url: {
        type: String,
        trim: true,
        default: "",
      },
      defaultBranch: {
        type: String,
        trim: true,
        default: "main",
      },
      developmentBranch: {
        type: String,
        trim: true,
        default: "develop",
      },
      qaBranch: {
        type: String,
        trim: true,
        default: "qa",
      },
      releaseBranch: {
        type: String,
        trim: true,
        default: "release",
      },
      webhookEnabled: {
        type: Boolean,
        default: true,
      },
      webhookSecret: {
        type: String,
        trim: true,
        default: "",
      },
      webhookEndpoint: {
        type: String,
        trim: true,
        default: "/api/webhooks/github",
      },
      repositoryIdentifier: {
        type: String,
        trim: true,
        default: "",
      },
      branchStrategy: {
        mainBranch: {
          type: String,
          trim: true,
          default: "main",
        },
        developmentBranch: {
          type: String,
          trim: true,
          default: "develop",
        },
        featurePattern: {
          type: String,
          trim: true,
          default: "feature/*",
        },
        hotfixPattern: {
          type: String,
          trim: true,
          default: "hotfix/*",
        },
        releasePattern: {
          type: String,
          trim: true,
          default: "release/*",
        },
      },
      status: {
        type: String,
        trim: true,
        default: "Not Configured",
      },
    },
    git: {
      enabled: {
        type: Boolean,
        default: true,
      },
      provider: {
        type: String,
        trim: true,
        enum: ["GitHub", ""],
        default: "GitHub",
      },
      repositoryOwner: {
        type: String,
        trim: true,
        default: "",
      },
      repositoryName: {
        type: String,
        trim: true,
        default: "",
      },
      repositoryUrl: {
        type: String,
        trim: true,
        default: "",
      },
      defaultBranch: {
        type: String,
        trim: true,
        default: "main",
      },
      encryptedToken: {
        type: String,
        default: "",
        select: false,
      },
      tokenConfigured: {
        type: Boolean,
        default: false,
      },
      tokenUpdatedAt: {
        type: Date,
        default: null,
      },
      webhookEndpoint: {
        type: String,
        trim: true,
        default: "/api/webhooks/github",
      },
      webhookSecret: {
        type: String,
        trim: true,
        default: "",
      },
      webhookEvents: {
        type: [String],
        default: ["push", "pull_request"],
      },
      automationRules: {
        autoNotifyQa: {
          type: Boolean,
          default: true,
        },
        autoDetectChangedModules: {
          type: Boolean,
          default: true,
        },
        autoLinkCommitsToTasks: {
          type: Boolean,
          default: true,
        },
        autoLinkCommitsToBugs: {
          type: Boolean,
          default: true,
        },
        autoGenerateReleaseNotes: {
          type: Boolean,
          default: true,
        },
        autoCreateQaSession: {
          type: Boolean,
          default: false,
        },
        autoUpdateTaskStatus: {
          type: Boolean,
          default: true,
        },
        notifyAssignedDevelopers: {
          type: Boolean,
          default: true,
        },
      },
      moduleMappings: {
        type: [
          {
            module: {
              type: String,
              trim: true,
              required: true,
            },
            paths: {
              type: [String],
              default: [],
            },
          },
        ],
        default: [],
      },
      status: {
        connectionStatus: {
          type: String,
          trim: true,
          default: "Not Configured",
        },
        latestCommitHash: {
          type: String,
          trim: true,
          default: "",
        },
        latestCommitMessage: {
          type: String,
          trim: true,
          default: "",
        },
        lastPushTime: {
          type: Date,
          default: null,
        },
        lastSyncTime: {
          type: Date,
          default: null,
        },
        webhookStatus: {
          type: String,
          trim: true,
          default: "Not Configured",
        },
        connectionHealth: {
          type: String,
          trim: true,
          default: "Unknown",
        },
        lastError: {
          type: String,
          trim: true,
          default: "",
        },
      },
      auditLog: {
        type: [
          {
            action: {
              type: String,
              trim: true,
              required: true,
            },
            actor: {
              type: Schema.Types.ObjectId,
              ref: "User",
              default: null,
            },
            actorName: {
              type: String,
              trim: true,
              default: "",
            },
            message: {
              type: String,
              trim: true,
              default: "",
            },
            createdAt: {
              type: Date,
              default: Date.now,
            },
          },
        ],
        default: [],
      },
    },
    deliveryWorkflow: {
      autoModuleDetection: {
        type: Boolean,
        default: true,
      },
      autoQaNotification: {
        type: Boolean,
        default: true,
      },
      releaseApprovalRequired: {
        type: Boolean,
        default: true,
      },
      qaRequired: {
        type: Boolean,
        default: true,
      },
      autoLinkCommitsToTasks: {
        type: Boolean,
        default: true,
      },
      autoLinkCommitsToBugs: {
        type: Boolean,
        default: true,
      },
      releaseNotesGeneration: {
        type: Boolean,
        default: true,
      },
    },
    deliveryModules: {
      type: [
        {
          name: {
            type: String,
            trim: true,
            required: true,
          },
          description: {
            type: String,
            trim: true,
            default: "",
          },
          ownerRole: {
            type: String,
            trim: true,
            default: "Shared",
          },
          order: {
            type: Number,
            default: 0,
          },
          sourcePaths: {
            type: [String],
            default: [],
          },
          defaultTestSuites: {
            type: [String],
            default: [],
          },
        },
      ],
      default: [],
    },
    defaultTestSuites: {
      type: [String],
      default: ["Smoke Testing", "Regression", "API Testing"],
    },
    testCases: {
      type: [
        {
          module: {
            type: String,
            trim: true,
            default: "",
          },
          title: {
            type: String,
            trim: true,
            required: true,
          },
          description: {
            type: String,
            trim: true,
            default: "",
          },
          estimatedMinutes: {
            type: Number,
            default: 10,
            min: 0,
          },
          active: {
            type: Boolean,
            default: true,
          },
        },
      ],
      default: [],
    },
    latestGitActivity: {
      commitSha: {
        type: String,
        trim: true,
        default: "",
      },
      commitMessage: {
        type: String,
        trim: true,
        default: "",
      },
      branch: {
        type: String,
        trim: true,
        default: "",
      },
      pushedByName: {
        type: String,
        trim: true,
        default: "",
      },
      pushedAt: {
        type: Date,
        default: null,
      },
      filesChanged: {
        type: [String],
        default: [],
      },
      additions: {
        type: Number,
        default: null,
      },
      deletions: {
        type: Number,
        default: null,
      },
      modulesChanged: {
        type: [String],
        default: [],
      },
      qaStatus: {
        type: String,
        trim: true,
        default: "Waiting for QA",
      },
      aiReview: {
        type: aiCodeReviewSchema,
        default: () => ({ status: "NOT_REVIEWED" }),
      },
    },
    gitActivityHistory: {
      type: [
        {
          commitSha: {
            type: String,
            trim: true,
            default: "",
          },
          commitMessage: {
            type: String,
            trim: true,
            default: "",
          },
          branch: {
            type: String,
            trim: true,
            default: "",
          },
          pushedByName: {
            type: String,
            trim: true,
            default: "",
          },
          pushedAt: {
            type: Date,
            default: null,
          },
          filesChanged: {
            type: [String],
            default: [],
          },
          additions: {
            type: Number,
            default: null,
          },
          deletions: {
            type: Number,
            default: null,
          },
          modulesChanged: {
            type: [String],
            default: [],
          },
          qaStatus: {
            type: String,
            trim: true,
            default: "Waiting for QA",
          },
          aiReview: {
            type: aiCodeReviewSchema,
            default: () => ({ status: "NOT_REVIEWED" }),
          },
          event: {
            type: String,
            trim: true,
            default: "push",
          },
          deliveryId: {
            type: String,
            trim: true,
            default: "",
          },
          recordedAt: {
            type: Date,
            default: Date.now,
          },
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
    tenantId: {
      type: String,
      index: true,
      trim: true,
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
