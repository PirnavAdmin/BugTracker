const SCRIPT_ID = "razorpay-checkout-script";
import { verifyBillingSubscriptionAuthorization } from "@/lib/api";
export const loadRazorpayCheckout = () => new Promise((resolve, reject) => {
  if (window.Razorpay) return resolve(window.Razorpay);
  const existing = document.getElementById(SCRIPT_ID);
  if (existing) { existing.addEventListener("load", () => resolve(window.Razorpay), { once: true }); existing.addEventListener("error", reject, { once: true }); return; }
  const script = document.createElement("script"); script.id = SCRIPT_ID; script.src = "https://checkout.razorpay.com/v1/checkout.js"; script.async = true;
  script.onload = () => window.Razorpay ? resolve(window.Razorpay) : reject(new Error("Razorpay Checkout did not load.")); script.onerror = () => reject(new Error("Unable to load Razorpay Checkout.")); document.head.appendChild(script);
});
export const openSubscriptionCheckout = async ({ key, subscriptionId, name = "CureCode", description, onSuccess, onDismiss }) => {
  if (!key?.startsWith("rzp_test_")) throw new Error("Razorpay Test Mode public key is not configured.");
  if (!subscriptionId) throw new Error("Razorpay subscription ID is missing.");
  const Razorpay = await loadRazorpayCheckout();
  const options = { key, subscription_id: subscriptionId, recurring: true, name, description, handler: async (response) => { console.info("[BILLING] Razorpay Checkout success", { paymentId: response?.razorpay_payment_id, subscriptionId: response?.razorpay_subscription_id, hasSignature: Boolean(response?.razorpay_signature) }); await verifyBillingSubscriptionAuthorization({ razorpayPaymentId: response?.razorpay_payment_id, razorpaySubscriptionId: response?.razorpay_subscription_id, razorpaySignature: response?.razorpay_signature }); onSuccess?.(response); }, modal: { ondismiss: onDismiss } };
  console.info("[billing] Razorpay checkout", { checkoutMode: "subscription", hasKey: Boolean(options.key), subscriptionId: options.subscription_id, hasSubscriptionId: Boolean(options.subscription_id) });
  const checkout = new Razorpay(options);
  checkout.on?.("payment.failed", (error) => console.warn("[billing] Razorpay checkout error", { source: error?.error?.source, reason: error?.error?.reason, code: error?.error?.code, description: error?.error?.description }));
  checkout.open();
};
