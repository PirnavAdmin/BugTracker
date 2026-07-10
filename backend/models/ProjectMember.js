const mongoose = require("mongoose");

const { Schema, model, models } = mongoose;

const projectMemberSchema = new Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: [true, "Project id is required"],
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User id is required"],
      index: true,
    },
    role: {
      type: String,
      enum: ["Developer", "Tester", "Q/A Lead", "Team Lead", "Manager"],
      required: [true, "Project member role is required"],
      default: "Developer",
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
    collection: "project_members",
    versionKey: false,
  }
);

projectMemberSchema.index({ projectId: 1, userId: 1 }, { unique: true });

projectMemberSchema.pre("save", function updateTimestamp(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = models.ProjectMember || model("ProjectMember", projectMemberSchema);
