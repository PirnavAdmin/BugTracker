const mongoose = require("mongoose");

const { Schema, model, models } = mongoose;

const teamMemberSchema = new Schema(
  {
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Team",
      required: [true, "Team id is required"],
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User id is required"],
      index: true,
    },
    tenantId: {
      type: String,
      index: true,
      trim: true,
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

teamMemberSchema.index({ teamId: 1, userId: 1 }, { unique: true });

module.exports = models.TeamMember || model("TeamMember", teamMemberSchema);
