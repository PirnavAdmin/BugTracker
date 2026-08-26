const cashfreeConfig = {
  environment: process.env.CASHFREE_ENV || "sandbox",
  appId: process.env.CASHFREE_APP_ID,
  secretKey: process.env.CASHFREE_SECRET_KEY,
};

const requiredVariables = [
  ["CASHFREE_ENV", process.env.CASHFREE_ENV],
  ["CASHFREE_APP_ID", cashfreeConfig.appId],
  ["CASHFREE_SECRET_KEY", cashfreeConfig.secretKey],
];

const missingVariables = requiredVariables
  .filter(([, value]) => !String(value || "").trim())
  .map(([name]) => name);

if (missingVariables.length > 0) {
  throw new Error(
    `Missing required Cashfree environment variables: ${missingVariables.join(", ")}`
  );
}

console.log("Cashfree configuration loaded");
console.log(`Environment: ${cashfreeConfig.environment}`);
console.log("App ID: configured");
console.log("Secret Key: configured");

module.exports = cashfreeConfig;
