import { useQuery } from "@tanstack/react-query";
import PlatformShell from "@/components/platform/PlatformShell";
import { fetchPlatformBillingPayments, fetchPlatformBillingSubscriptions } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";

const money = (amount, currency = "INR") => new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(Number(amount || 0));
const PlatformPaymentsPage = () => {
  const payments = useQuery({ queryKey: ["platform-billing-payments"], queryFn: fetchPlatformBillingPayments });
  const subscriptions = useQuery({ queryKey: ["platform-billing-subscriptions"], queryFn: fetchPlatformBillingSubscriptions });
  const rows = payments.data || []; const plans = subscriptions.data || [];
  const count = (status) => plans.filter((item) => item.status === status).length;
  return <PlatformShell title="Payments"><div className="space-y-4 p-4 xl:p-5">{payments.isLoading || subscriptions.isLoading ? <Skeleton className="h-72 rounded-lg" /> : <><section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{[["Active", count("ACTIVE")], ["Trial", count("TRIAL")], ["Past due", count("PAST_DUE")], ["Cancelled", count("CANCELLED")], ["Failed payments", rows.filter((item) => item.status === "failed").length]].map(([label, value]) => <div key={label} className="rounded-lg border border-slate-200 bg-white p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold">{value}</p></div>)}</section><section className="overflow-hidden rounded-lg border border-slate-200 bg-white"><div className="border-b border-slate-200 px-4 py-3"><h2 className="font-bold">Payment activity</h2></div>{rows.length ? <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Tenant</th><th className="px-4 py-3">Amount</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Payment ID</th><th className="px-4 py-3">Date</th></tr></thead><tbody>{rows.map((payment) => <tr key={payment._id} className="border-t border-slate-100"><td className="px-4 py-3">{payment.tenantId}</td><td className="px-4 py-3">{money(payment.amount, payment.currency)}</td><td className="px-4 py-3 capitalize">{payment.status}</td><td className="px-4 py-3 font-mono text-xs">{payment.providerPaymentId || "—"}</td><td className="px-4 py-3">{new Date(payment.createdAt).toLocaleDateString("en-IN")}</td></tr>)}</tbody></table></div> : <p className="p-5 text-sm text-slate-500">No Razorpay test payments have been recorded.</p>}</section></>}</div></PlatformShell>;
};
export default PlatformPaymentsPage;
