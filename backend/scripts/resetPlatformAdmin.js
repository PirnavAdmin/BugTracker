require("../config/env");
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const { resetInitialPlatformAdmin } = require("../utils/platformBootstrap");

const run = async () => {
  try {
    await connectDB();
    const admin = await resetInitialPlatformAdmin();

    console.log("[platform] Platform admin reset from environment configuration");
    console.log(`email: ${admin.email}`);
    console.log(`role: ${admin.role}`);
  } catch (error) {
    console.error(`[platform] Reset failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
};

run();
