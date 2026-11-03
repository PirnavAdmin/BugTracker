require("../config/env");

const uri = process.env.MONGO_URI;
if (!uri) {
  console.error("MongoDB target unavailable: MONGO_URI is not configured.");
  process.exitCode = 1;
} else {
  try {
    const parsed = new URL(uri);
    const hostname = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
    const loopback = ["localhost", "127.0.0.1", "::1"].includes(hostname);
    const uriDatabase = decodeURIComponent(parsed.pathname.replace(/^\//, "").split("/")[0] || "(URI default)");
    console.log(`MongoDB endpoint class: ${loopback ? "loopback" : "remote"}`);
    console.log(`Database selected by application: bugtracker`);
    console.log(`Database path in URI: ${uriDatabase}`);
    console.log("Credentials displayed: no; database connection performed: no");
    if (!loopback) process.exitCode = 1;
    if (uriDatabase !== "bugtracker") {
      console.error("URI database does not match the application's selected database; isolation is unverified.");
      process.exitCode = 1;
    }
  } catch {
    console.error("MongoDB target unavailable: MONGO_URI could not be parsed (value redacted).");
    process.exitCode = 1;
  }
}
