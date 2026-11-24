const mongoose = require("mongoose");

const authSessionSchema = new mongoose.Schema(
  {
    principalId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    principalType: {
      type: String,
      enum: ["user", "platformAdmin"],
      required: true,
    },
    refreshTokenHash: {
      type: String,
      required: true,
      select: false,
    },
    rememberMe: {
      type: Boolean,
      default: false,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    revokedAt: {
      type: Date,
      default: null,
    },
    lastUsedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

authSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
authSessionSchema.index({ principalType: 1, principalId: 1, expiresAt: 1 });
authSessionSchema.index({ refreshTokenHash: 1 }, { unique: true });

module.exports =
  mongoose.models.AuthSession || mongoose.model("AuthSession", authSessionSchema);
