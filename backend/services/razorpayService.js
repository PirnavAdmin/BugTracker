const Razorpay = require("razorpay");
const billingError = (code, message, status = 400) => Object.assign(new Error(message), { code, status });
const isTestMode = () => process.env.RAZORPAY_MODE === "test";
const getClient = () => {
  if (!isTestMode()) throw billingError("BILLING_TEST_MODE_REQUIRED", "Automated billing is available only in Razorpay test mode.", 503);
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) throw billingError("BILLING_PROVIDER_NOT_CONFIGURED", "Billing provider is not configured.", 503);
  return new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
};
const providerDetails = (error) => (error && typeof error === "object" && error.error && typeof error.error === "object" ? error.error : {});
const diagnosticValue = (error, field) => {
  const nested = providerDetails(error);
  const value = error?.[field] ?? nested[field];
  return typeof value === "string" || typeof value === "number" ? value : undefined;
};
const logProviderError = (operation, error) => {
  // Deliberately construct this allow-listed object rather than serializing the provider error.
  // Provider errors can contain request configuration, headers, or other sensitive information.
  const diagnostic = {
    operation,
    statusCode: diagnosticValue(error, "statusCode") ?? diagnosticValue(error, "status"),
    errorCode: diagnosticValue(error, "code"),
    description: diagnosticValue(error, "description"),
    source: diagnosticValue(error, "source"),
    reason: diagnosticValue(error, "reason"),
    field: diagnosticValue(error, "field"),
  };
  Object.keys(diagnostic).forEach((key) => diagnostic[key] === undefined && delete diagnostic[key]);
  console.error("[billing] Razorpay provider error", diagnostic);
};
const normalizeProviderError = (operation, error) => {
  logProviderError(operation, error);
  const statusCode = diagnosticValue(error, "statusCode") ?? diagnosticValue(error, "status");
  return billingError("BILLING_PROVIDER_ERROR", "The billing provider could not complete this request.", statusCode >= 400 && statusCode < 500 ? 400 : 502);
};
const createSubscription = async (data) => { try { return await getClient().subscriptions.create(data); } catch (error) { if (String(error?.code || "").startsWith("BILLING_")) throw error; throw normalizeProviderError("createSubscription", error); } };
const fetchSubscription = async (id) => { try { return await getClient().subscriptions.fetch(id); } catch (error) { if (String(error?.code || "").startsWith("BILLING_")) throw error; throw normalizeProviderError("fetchSubscription", error); } };
const cancelSubscription = async (id, cancelAtCycleEnd = true) => { try { return await getClient().subscriptions.cancel(id, cancelAtCycleEnd); } catch (error) { if (String(error?.code || "").startsWith("BILLING_")) throw error; throw normalizeProviderError("cancelSubscription", error); } };
module.exports = { createSubscription, fetchSubscription, cancelSubscription, isTestMode, normalizeProviderError };
