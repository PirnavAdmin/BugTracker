import { useQuery } from "@tanstack/react-query";
import { fetchPlatformBillingSubscriptions } from "@/lib/api";
import PlatformShell from "@/components/platform/PlatformShell";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

const formatDate = (value) =>
  value
    ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date(value))
    : "N/A";

const formatAmount = (value, currency = "INR") =>
  value === null || value === undefined
    ? "N/A"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      }).format(Number(value || 0));

const statusVariant = (status = "") => {
  if (status === "ACTIVE") return "success";
  if (["PAST_DUE", "PAUSED", "PENDING"].includes(status)) return "warning";
  if (["CANCELLED", "EXPIRED", "SUSPENDED"].includes(status)) return "danger";
  return "default";
};

const PlatformSubscriptionsPage = () => {
  const subscriptionsQuery = useQuery({
    queryKey: ["platform-subscriptions"],
    queryFn: fetchPlatformBillingSubscriptions,
  });
  const subscriptions = subscriptionsQuery.data?.subscriptions || [];

  return (
    <PlatformShell title="Subscriptions">
      <div className="p-4 xl:p-5">
        <section className="rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-bold tracking-normal text-slate-900">Platform Subscriptions</h2>
          </div>
          {subscriptionsQuery.isLoading ? (
            <div className="p-4">
              <Skeleton className="h-[320px] rounded-lg" />
            </div>
          ) : subscriptions.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
                    <th className="px-4 py-3">Company</th>
                    <th className="px-4 py-3">Tenant</th>
                    <th className="px-4 py-3">Plan</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Billing Cycle</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Provider Status</th>
                    <th className="px-4 py-3">Current Period</th>
                    <th className="px-4 py-3">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {subscriptions.map((subscription) => (
                    <tr key={subscription._id} className="border-b border-slate-50">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-950">{subscription.company?.name || subscription.companyId || "N/A"}</p>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{subscription.tenantId}</td>
                      <td className="px-4 py-3 capitalize">{subscription.planId}</td>
                      <td className="px-4 py-3">
                        <Badge className="px-2 py-0.5" variant={statusVariant(subscription.status)}>
                          {subscription.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">{subscription.billingCycle}</td>
                      <td className="px-4 py-3">{formatAmount(subscription.amount, subscription.currency)}</td>
                      <td className="px-4 py-3">{subscription.providerStatus || "N/A"}</td>
                      <td className="px-4 py-3">{formatDate(subscription.currentPeriodStart)} – {formatDate(subscription.currentPeriodEnd)}</td>
                      <td className="px-4 py-3">{formatDate(subscription.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="grid min-h-[240px] place-items-center px-4 py-8 text-center text-sm font-medium text-slate-500">
              No subscription data available yet
            </div>
          )}
        </section>
      </div>
    </PlatformShell>
  );
};

export default PlatformSubscriptionsPage;
