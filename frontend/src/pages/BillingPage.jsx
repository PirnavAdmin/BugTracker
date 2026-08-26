import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { cancelBillingSubscription, createBillingSubscription, fetchBillingInvoices, fetchBillingPayments, fetchBillingSubscription, fetchCashfreeBillingSubscriptionStatus, retryBillingSubscription, verifyBillingSubscriptionAuthorization } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { openSubscriptionCheckout } from "@/lib/razorpayCheckout";
import CashfreeCheckoutButton from "@/components/billing/CashfreeCheckoutButton";
import { getCashfreeInitialNotice, getCashfreeVerifiedNotice, isCashfreeReturn, isCashfreeSubscriptionRecord } from "@/services/cashfreeCheckoutService";
import { formatPaymentStatus, formatProviderName, getBillingCycleLabel, getBillingIntervalLabel, getPlanName, getSubscriptionDateRows, getSubscriptionMessage, getSubscriptionPaymentStatus } from "@/services/billingPresentation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

const plans = {
  starter: { name: "Starter", monthly: 799, annual: 7990 },
  professional: { name: "Professional", monthly: 1999, annual: 19990 },
  business: { name: "Business", monthly: 3999, annual: 39990 },
};
const currentStatuses = new Set(["TRIAL", "PENDING", "ACTIVE", "PAST_DUE", "PAUSED"]);
const statusStyles = {
  ACTIVE: "border-emerald-200 bg-emerald-50 text-emerald-700",
  PENDING: "border-amber-200 bg-amber-50 text-amber-800",
  FAILED: "border-red-200 bg-red-50 text-red-700",
  CANCELLED: "border-slate-200 bg-slate-100 text-slate-700",
};
const money = (amount, currency = "INR") => new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(Number(amount || 0));
const errorMessage = (error) => error?.response?.data?.message || error?.message || "Unable to start checkout. Please try again.";

const History = ({ title, rows, loading, empty, children }) => (
  <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
    <h2 className="border-b px-5 py-4 text-lg font-black">{title}</h2>
    {loading ? <Skeleton className="m-5 h-16" /> : rows?.length ? <div className="overflow-x-auto">{children}</div> : <p className="p-5 text-sm text-slate-500">{empty}</p>}
  </section>
);

const SubscriptionDetails = ({ subscription }) => {
  const details = [
    ["Plan", getPlanName(subscription.planId)],
    ["Amount", money(subscription.amount, subscription.currency)],
    ["Billing Cycle", getBillingCycleLabel(subscription.billingCycle)],
    ...getSubscriptionDateRows(subscription).map(({ label, value }) => [label, formatDate(value, { fallback: "—" })]),
    ["Payment Status", getSubscriptionPaymentStatus(subscription.status)],
  ];
  return (
    <div className="mt-5 border-t border-slate-200 pt-5">
      <h3 className="text-sm font-black text-slate-900">Subscription Details</h3>
      <dl className="mt-3 grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
        {details.map(([label, value]) => <div key={label}><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-1 text-sm font-semibold text-slate-900">{value}</dd></div>)}
      </dl>
    </div>
  );
};

const SubscriptionCard = ({ record, historical, cashfreeRecord, retry, cancel, cashfreeRetry, onShowPlans }) => {
  const message = getSubscriptionMessage(record.status);
  const canCancel = currentStatuses.has(record.status);
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-bold text-slate-500">{historical ? "PREVIOUS SUBSCRIPTION" : "CURRENT PLAN"}</p>
      <div className="mt-2 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black">{getPlanName(record.planId)}</h2>
          <p className="mt-1 text-slate-700">{money(record.amount, record.currency)} / {getBillingIntervalLabel(record.billingCycle)}</p>
          {record.currentPeriodEnd ? <p className="mt-2 text-sm text-slate-600">Next billing date: {formatDate(record.currentPeriodEnd, { fallback: "—" })}</p> : null}
        </div>
        <Badge className={statusStyles[record.status] || ""}>{record.status}</Badge>
      </div>
      {message ? <p className={`mt-4 rounded-lg border p-3 text-sm ${record.status === "FAILED" ? "border-red-200 bg-red-50 text-red-700" : record.status === "PENDING" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-slate-200 bg-slate-50 text-slate-700"}`}>{message}</p> : null}
      <SubscriptionDetails subscription={record} />
      <div className="mt-5 flex flex-wrap gap-2">
        {record.status === "PENDING" && (cashfreeRecord ? cashfreeRetry : <Button disabled={retry.isPending} onClick={() => retry.mutate()}>Retry Payment</Button>)}
        {record.status === "FAILED" && cashfreeRecord ? cashfreeRetry : null}
        {canCancel ? <Button variant="outline" disabled={cancel.isPending || record.cancelAtPeriodEnd} onClick={() => cancel.mutate()}>{record.status === "ACTIVE" ? "Cancel at period end" : "Cancel Subscription"}</Button> : record.status === "FAILED" && cashfreeRecord ? null : <Button onClick={onShowPlans}>{record.status === "EXPIRED" ? "Choose a Plan" : "Subscribe Again"}</Button>}
      </div>
    </section>
  );
};

export default function BillingPage() {
  const client = useQueryClient();
  const [planId, setPlanId] = useState("professional");
  const [billingCycle, setBillingCycle] = useState("monthly");
  const [notice, setNotice] = useState(getCashfreeInitialNotice);
  const [showPlans, setShowPlans] = useState(false);
  const subscription = useQuery({ queryKey: ["billing-subscription"], queryFn: fetchBillingSubscription, refetchInterval: (query) => query.state.data?.status === "PENDING" ? 5000 : false });
  const payments = useQuery({ queryKey: ["billing-payments"], queryFn: fetchBillingPayments });
  const invoices = useQuery({ queryKey: ["billing-invoices"], queryFn: fetchBillingInvoices });
  const refresh = () => Promise.all([["billing-subscription"], ["billing-payments"], ["billing-invoices"]].map((queryKey) => client.invalidateQueries({ queryKey })));

  useEffect(() => {
    if (!isCashfreeReturn()) return;
    let active = true;
    fetchCashfreeBillingSubscriptionStatus().then((data) => {
      if (!active) return;
      setNotice(getCashfreeVerifiedNotice(data?.subscription?.status));
      refresh();
    }).catch(() => { if (active) setNotice("Unable to verify Cashfree payment status. Please try again."); });
    return () => { active = false; };
  }, []);

  const checkout = async (data) => {
    try {
      await openSubscriptionCheckout({
        key: import.meta.env.VITE_RAZORPAY_KEY_ID,
        subscriptionId: data?.checkout?.id || data?.subscription?.providerSubscriptionId,
        description: `${data?.subscription?.planId || planId} ${data?.subscription?.billingCycle || billingCycle}`,
        onSuccess: () => { setNotice("Payment submitted. Subscription activation is being confirmed."); refresh(); },
        onDismiss: () => setNotice("Checkout closed. Your subscription remains pending until payment is confirmed."),
      });
    } catch (error) { setNotice(errorMessage(error)); }
  };
  const create = useMutation({ mutationFn: () => createBillingSubscription({ planId, billingCycle }), onSuccess: (data) => { refresh(); checkout(data); }, onError: (error) => setNotice(errorMessage(error)) });
  const retry = useMutation({ mutationFn: retryBillingSubscription, onSuccess: checkout, onError: (error) => setNotice(errorMessage(error)) });
  const cancel = useMutation({ mutationFn: cancelBillingSubscription, onSuccess: () => { refresh(); setNotice("Subscription cancellation was confirmed."); }, onError: (error) => setNotice(errorMessage(error)) });

  const record = subscription.data;
  const cashfreeRecord = isCashfreeSubscriptionRecord(record);
  const historical = record && !currentStatuses.has(record.status);
  const cashfreeRetry = record ? <CashfreeCheckoutButton planId={record.planId} billingCycle={record.billingCycle} label="Retry Cashfree Payment" onNotice={setNotice} onStarted={refresh} /> : null;
  const chooser = (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-xl font-black">Choose a plan</h2>
      <div className="mt-4 flex gap-2">
        <Button variant={billingCycle === "monthly" ? "default" : "outline"} onClick={() => setBillingCycle("monthly")}>Monthly</Button>
        <Button variant={billingCycle === "annual" ? "default" : "outline"} onClick={() => setBillingCycle("annual")}>Annual</Button>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {Object.entries(plans).map(([id, plan]) => <button key={id} onClick={() => setPlanId(id)} className={`rounded-lg border p-4 text-left ${id === planId ? "border-violet-500 bg-violet-50" : "border-slate-200"}`}><b>{plan.name}</b><p>{money(plan[billingCycle])}/{billingCycle === "annual" ? "year" : "month"}</p></button>)}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button className="mt-5" disabled={create.isPending} onClick={() => create.mutate()}>{create.isPending ? "Starting checkout..." : "Choose Plan with Razorpay"}</Button>
        <CashfreeCheckoutButton planId={planId} billingCycle={billingCycle} onNotice={setNotice} onStarted={refresh} />
      </div>
    </section>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
      <div className="flex justify-between gap-4"><div><p className="font-bold text-violet-700">Billing & Subscription</p><h1 className="text-2xl font-black">Manage your CureCode plan</h1><p className="text-sm text-slate-600">Razorpay Test Mode</p></div><Button variant="outline" onClick={refresh}><RefreshCw className="h-4 w-4" />Refresh</Button></div>
      {notice ? <p className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">{notice}</p> : null}
      {subscription.isLoading ? <Skeleton className="h-48" /> : record ? <><SubscriptionCard record={record} historical={historical} cashfreeRecord={cashfreeRecord} retry={retry} cancel={cancel} cashfreeRetry={cashfreeRetry} onShowPlans={() => setShowPlans(true)} />{historical && showPlans ? chooser : null}</> : chooser}
      <History title="Payment History" rows={payments.data} loading={payments.isLoading} empty="No payments have been recorded.">
        <table className="w-full text-left text-sm"><thead className="border-b bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Amount</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">Provider</th></tr></thead><tbody>{payments.data?.map((payment) => <tr key={payment._id} className="border-b last:border-0"><td className="px-4 py-3 font-semibold">{money(payment.amount, payment.currency)}</td><td className="px-4 py-3">{formatPaymentStatus(payment.status)}</td><td className="px-4 py-3">{payment.createdAt ? formatDate(payment.createdAt, { fallback: "—" }) : "—"}</td><td className="px-4 py-3">{formatProviderName(payment.provider)}</td></tr>)}</tbody></table>
      </History>
      <History title="Invoices" rows={invoices.data} loading={invoices.isLoading} empty="No invoices have been recorded.">
        <table className="w-full text-left text-sm"><tbody>{invoices.data?.map((invoice) => <tr key={invoice._id}><td className="p-4">{invoice.invoiceNumber}</td><td>{money(invoice.amount, invoice.currency)}</td><td>{invoice.status}</td></tr>)}</tbody></table>
      </History>
    </div>
  );
}
