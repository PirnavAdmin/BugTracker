const bcrypt = require("bcrypt");
const mongoose = require("mongoose");
const {
  PLATFORM_ADMIN_STATUSES,
  PLATFORM_ROLE_OPTIONS,
  PLATFORM_ROLES,
} = require("../constants/platformRoles");

const { Schema, model, models } = mongoose;

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isBcryptHash = (value = "") => /^\$2[aby]\$\d{2}\$/.test(value);

const platformAdminSchema = new Schema(
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
      index: true,
    },
    passwordHash: {
      type: String,
      required: [true, "Password is required"],
      select: false,
    },
    role: {
      type: String,
      enum: {
        values: PLATFORM_ROLE_OPTIONS,
        message: `Role must be one of ${PLATFORM_ROLE_OPTIONS.join(", ")}`,
      },
      default: PLATFORM_ROLES.ADMIN,
    },
    status: {
      type: String,
      enum: Object.values(PLATFORM_ADMIN_STATUSES),
      default: PLATFORM_ADMIN_STATUSES.ACTIVE,
      index: true,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

platformAdminSchema.pre("save", async function hashPassword(next) {
  try {
    if (!this.isModified("passwordHash") || isBcryptHash(this.passwordHash)) {
      return next();
    }

    this.passwordHash = await bcrypt.hash(this.passwordHash, 10);
    return next();
  } catch (error) {
    return next(error);
  }
});

platformAdminSchema.methods.comparePassword = async function comparePassword(password) {
  if (!this.passwordHash) {
    return false;
  }

  return bcrypt.compare(password, this.passwordHash);
};

platformAdminSchema.statics.isPasswordHashed = isBcryptHash;
platformAdminSchema.statics.availableRoles = PLATFORM_ROLE_OPTIONS;

module.exports = models.PlatformAdmin || model("PlatformAdmin", platformAdminSchema);
