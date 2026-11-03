const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    const { MONGO_URI } = process.env;

    if (!MONGO_URI) {
      throw new Error("MONGO_URI environment variable is required");
    }

    await mongoose.connect(MONGO_URI, {
      dbName: "bugtracker",
      maxPoolSize: Number(process.env.MONGO_MAX_POOL_SIZE || 20),
      minPoolSize: Number(process.env.MONGO_MIN_POOL_SIZE || 2),
      serverSelectionTimeoutMS: Number(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS || 10_000),
      socketTimeoutMS: Number(process.env.MONGO_SOCKET_TIMEOUT_MS || 45_000),
    });

    console.log("MongoDB connected");
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);
    process.exit(1);
  }
};

module.exports = connectDB;
