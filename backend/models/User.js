const bcrypt = require("bcrypt");
const mongoose = require("mongoose");
const { normalizeWorkspaceId } = require("../utils/workspace");
const { USER_ROLE_OPTIONS } = require("../utils/roles");

const { Schema, model, models } = mongoose;

const isBcryptHash = (value = "") => /^\$2[aby]\$\d{2}\$/.test(value);
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const userSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      minlength: [2, "Name must be at least 2 characters long"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      trim: true,
      lowercase: true,
      match: [emailRegex, "Please provide a valid email address"],
    },
    employeeId: {
      type: String,
      trim: true,
      uppercase: true,
      unique: true,
      sparse: true,
    },
    designation: {
      type: String,
      trim: true,
      default: "",
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [6, "Password must be at least 6 characters long"],
      select: false,
    },
    role: {
      type: String,
      enum: {
        values: USER_ROLE_OPTIONS,
        message: `Role must be one of ${USER_ROLE_OPTIONS.join(", ")}`,
      },
      default: "Developer",
    },
    avatarUrl: {
      type: String,
      trim: true,
      default: "",
    },
    workspaceId: {
      type: String,
      required: true,
      trim: true,
      index: true,
      default: normalizeWorkspaceId(),
    },
    senderPreference: {
      userId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        default: null,
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
    passwordResetOtpHash: {
      type: String,
      select: false,
      default: "",
    },
    passwordResetOtpExpiresAt: {
      type: Date,
      select: false,
      default: null,
    },
    passwordResetRequestedAt: {
      type: Date,
      select: false,
      default: null,
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

userSchema.pre("save", async function hashPassword(next) {
  try {
    if (!this.isModified("password")) {
      return next();
    }

    if (isBcryptHash(this.password)) {
      return next();
    }

    this.password = await bcrypt.hash(this.password, 10);
    return next();
  } catch (error) {
    return next(error);
  }
});

userSchema.methods.comparePassword = async function comparePassword(password) {
  if (!this.password) {
    return false;
  }

  if (isBcryptHash(this.password)) {
    return bcrypt.compare(password, this.password);
  }

  return password === this.password;
};

userSchema.statics.isPasswordHashed = isBcryptHash;
userSchema.statics.availableRoles = USER_ROLE_OPTIONS;

module.exports = models.User || model("User", userSchema);
