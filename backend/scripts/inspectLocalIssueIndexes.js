const mongoose = require("mongoose");
require("../config/env");

const main = async () => {
  if (!process.argv.includes("--confirm-isolated-local")) {
    throw new Error("Confirm localhost is not a tunnel and the database is isolated with --confirm-isolated-local.");
  }
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI is required.");
  let parsed;
  try { parsed = new URL(uri); } catch { throw new Error("MONGO_URI is invalid (value redacted)."); }
  const hostname = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!["localhost", "127.0.0.1", "::1"].includes(hostname)) {
    throw new Error("Refusing connection: MongoDB endpoint is not loopback.");
  }
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, "").split("/")[0] || "");
  if (databaseName !== "bugtracker") {
    throw new Error("Refusing connection: URI database must explicitly be bugtracker.");
  }
  try {
    await mongoose.connect(uri, { dbName: "bugtracker", autoIndex: false });
    const indexes = await mongoose.connection.collection("issues").indexes();
    for (const index of indexes) {
      console.log(JSON.stringify({ name: index.name, key: index.key, unique: Boolean(index.unique), partialFilterExpression: index.partialFilterExpression || undefined }));
    }
  } finally {
    await mongoose.disconnect();
  }
};

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
