const Razorpay = require("razorpay");
const billingError = (code, message, status = 400) => Object.assign(new Error(message), { code, status });
const isTestMode = () => process.env.RAZORPAY_MODE === "test";
const getClient = () => {
  if (!isTestMode()) throw billingError("BILLING_TEST_MODE_REQUIRED", "Automated billing is available only in Razorpay test mode.", 503);
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) throw billingError("BILLING_PROVIDER_NOT_CONFIGURED", "Billing provider is not configured.", 503);
  return new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
};
const normalizeProviderError = (error) => billingError("BILLING_PROVIDER_ERROR", "The billing provider could not complete this request.", error?.statusCode >= 400 && error.statusCode < 500 ? 400 : 502);
const createSubscription = async (data) => { try { return await getClient().subscriptions.create(data); } catch (error) { if (error.code) throw error; throw normalizeProviderError(error); } };
const fetchSubscription = async (id) => { try { return await getClient().subscriptions.fetch(id); } catch (error) { throw normalizeProviderError(error); } };
const cancelSubscription = async (id, cancelAtCycleEnd = true) => { try { return await getClient().subscriptions.cancel(id, cancelAtCycleEnd); } catch (error) { throw normalizeProviderError(error); } };
module.exports = { createSubscription, fetchSubscription, cancelSubscription, isTestMode };
