require("../config/env");
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const User = require("../models/User");
const UserEmailConfig = require("../models/UserEmailConfig");
const TeamMember = require("../models/TeamMember");
const WorkspaceSetting = require("../models/WorkspaceSetting");

const email = String(process.argv[2] || "").trim().toLowerCase();

if (!email) {
  console.error("Usage: node scripts/deleteUserByEmail.js <user-email>");
  process.exit(1);
}

const run = async () => {
  try {
    await connectDB();

    const user = await User.findOne({ email }).lean();

    if (!user) {
      console.log(`[deleteUser] No user found with email: ${email}`);
      return;
    }

    console.log(`[deleteUser] Found user to delete:`, {
      _id: String(user._id),
      name: user.name,
      email: user.email,
      role: user.role,
      workspaceId: user.workspaceId,
      tenantId: user.tenantId || "(none)",
    });

    const emailConfigs = await UserEmailConfig.deleteMany({ userId: user._id });
    console.log(`[deleteUser] Deleted ${emailConfigs.deletedCount || 0} SMTP email configs.`);

    const teamMemberships = await TeamMember.deleteMany({ userId: user._id });
    console.log(`[deleteUser] Deleted ${teamMemberships.deletedCount || 0} team memberships.`);

    await WorkspaceSetting.updateMany(
      { "workspaceSender.userId": user._id },
      {
        $set: {
          "workspaceSender.userId": null,
          "workspaceSender.enabled": false,
          "workspaceSender.updatedAt": new Date(),
        },
      }
    );

    await User.updateMany(
      { "senderPreference.userId": user._id },
      {
        $set: {
          "senderPreference.userId": null,
          "senderPreference.updatedAt": new Date(),
        },
      }
    );

    const deleteResult = await User.deleteOne({ _id: user._id });

    if (deleteResult.deletedCount > 0) {
      console.log(`[deleteUser] SUCCESS: User ${email} has been completely removed from the database.`);
      console.log(`[deleteUser] You can now go to Settings -> Invite User to send a fresh invitation.`);
    } else {
      console.warn(`[deleteUser] Failed to delete user document for ${email}`);
    }
  } catch (error) {
    console.error(`[deleteUser] Error deleting user: ${error.message}`);
    process.exitCode = 1;
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  }
};

run();
