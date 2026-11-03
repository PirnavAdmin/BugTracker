const mongoose = require("mongoose");
require("../config/env");

const INDEX = {
  projectId: 1,
  type: 1,
  updatedAt: -1,
  createdAt: -1,
};
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

const main = async () => {
  if (!process.argv.includes("--apply")) {
    throw new Error("Pass --apply to create the performance index on local MongoDB.");
  }
  if (!process.argv.includes("--confirm-isolated-local")) {
    throw new Error("Confirm that localhost is not a tunnel and is an isolated local database with --confirm-isolated-local.");
  }

  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI is required.");

  let parsed;
  try {
    parsed = new URL(uri);
  } catch {
    throw new Error("MONGO_URI is not a valid MongoDB URL.");
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!LOCAL_HOSTS.has(hostname)) {
    throw new Error("Refusing index creation: MONGO_URI must point to localhost or loopback.");
  }

  const uriDatabase = decodeURIComponent(parsed.pathname.replace(/^\//, "").split("/")[0] || "");
  const databaseName = uriDatabase || "bugtracker";
  if (databaseName !== "bugtracker") {
    throw new Error("Refusing index creation: URI database must explicitly be bugtracker, matching the application's selected database.");
  }

  try {
    await mongoose.connect(uri, { dbName: "bugtracker", autoIndex: false });
    const collection = mongoose.connection.collection("issues");
    const indexes = await collection.indexes();
    const equivalent = indexes.find((index) =>
      JSON.stringify(Object.entries(index.key)) === JSON.stringify(Object.entries(INDEX))
    );
    if (equivalent) {
      console.log(`Equivalent index already exists: ${equivalent.name}`);
      return;
    }

    console.log(`Inspected ${indexes.length} existing indexes; no equivalent target index exists.`);

    const name = await collection.createIndex(INDEX, { name: "project_type_updated_created" });
    console.log(`Created index: ${name}`);
  } finally {
    await mongoose.disconnect();
  }
};

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
