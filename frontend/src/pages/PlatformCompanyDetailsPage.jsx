import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Save } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import {
  createPlatformCompanyAdminUser,
  createPlatformSubscription,
  fetchPlatformCompany,
  fetchPlatformCompanies,
  fetchPlatformPlans,
  fetchPlatformBillingCompanyStatus,
  updatePlatformCompany,
  updatePlatformSubscription,
} from "@/lib/api";
import PlatformShell from "@/components/platform/PlatformShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/utils";
import {
  formatProviderName,
  getBillingCycleLabel,
  getBillingIntervalLabel,
  getPlanName,
  getSubscriptionDateRows,
  getSubscriptionPaymentStatus,
} from "@/services/billingPresentation";

const companyStatuses = ["Active", "Suspended"];
const subscriptionStatuses = ["Trial", "Active", "Past Due", "Suspended", "Cancelled", "Expired"];
const billingCycles = ["Monthly", "Yearly"];

const money = (amount, currency = "INR") =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(Number(amount || 0));

const limitText = (value, suffix = "") =>
  value === null || value === undefined ? "N/A" : `${value}${suffix}`;

const formatBytes = (value) => {
  const bytes = Number(value);
  if (!Number.isFinite(bytes)) return "N/A";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KiB", "MiB", "GiB", "TiB"];
  let amount = bytes / 1024;
  let index = 0;
  while (amount >= 1024 && index < units.length - 1) { amount /= 1024; index += 1; }
  return `${amount.toFixed(amount >= 10 ? 1 : 2)} ${units[index]}`;
};

const FutureSection = ({ title }) => (
  <section className="rounded-lg border border-slate-200 bg-white p-4">
    <p className="text-sm font-bold tracking-normal text-slate-950">{title}</p>
    <p className="mt-2 text-sm font-medium text-slate-500">Coming next</p>
  </section>
);
const BillingSection = ({ subscription }) => (
  <section className="rounded-lg border border-slate-200 bg-white p-4">
    <p className="text-sm font-bold text-slate-950">Payments</p>
    {subscription ? <dl className="mt-2 space-y-1 text-sm"><div><dt className="inline text-slate-500">Provider: </dt><dd className="inline font-semibold">{formatProviderName(subscription.provider)}</dd></div><div><dt className="inline text-slate-500">Payment: </dt><dd className="inline font-semibold">{getSubscriptionPaymentStatus(subscription)}</dd></div><div><dt className="inline text-slate-500">Amount: </dt><dd className="inline font-semibold">{money(subscription.amount, subscription.currency)}</dd></div></dl> : <p className="mt-2 text-sm text-slate-500">No provider billing subscription.</p>}
  </section>
);

const ProviderManagedSubscription = ({ subscription }) => {
  const details = [
    ["Provider", formatProviderName(subscription.provider)],
    ["Plan", subscription.planName || getPlanName(subscription.planId)],
    ["Status", subscription.status],
    ["Amount", `${money(subscription.amount, subscription.currency)} / ${getBillingIntervalLabel(subscription.billingCycle)}`],
    ["Billing Cycle", getBillingCycleLabel(subscription.billingCycle)],
    ...getSubscriptionDateRows(subscription).map(({ label, value }) => [label, formatDate(value, { fallback: "N/A" })]),
    ["Payment Status", getSubscriptionPaymentStatus(subscription)],
  ];
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <div><h2 className="text-base font-bold tracking-normal">Subscription</h2><p className="mt-1 text-xs font-semibold text-slate-500">Provider-managed subscription · Read only</p></div>
        <Badge>{subscription.status}</Badge>
      </div>
      <dl className="mt-4 grid gap-4 md:grid-cols-2">
        {details.map(([label, value]) => <div key={label}><dt className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-1 text-sm font-semibold text-slate-950">{value}</dd></div>)}
      </dl>
      <div className="mt-4 border-t border-slate-200 pt-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Subscription ID</p><p className="mt-1 break-all font-mono text-sm font-semibold text-slate-900">{subscription.providerSubscriptionId}</p></div>
    </section>
  );
};

const StorageSection = ({ company, storage }) => {
  if (!company?.linked || !storage) {
    return <section className="rounded-lg border border-slate-200 bg-white p-4"><p className="text-sm font-bold text-slate-950">Storage</p><p className="mt-2 text-sm font-medium text-slate-500">Not available</p><p className="mt-1 text-xs text-slate-500">Company is not linked to a CureCode tenant.</p></section>;
  }
  const percent = storage.unlimited ? 0 : Math.min(Number(storage.usagePercent) || 0, 100);
  return <section className="rounded-lg border border-slate-200 bg-white p-4"><div className="flex items-center justify-between gap-2"><p className="text-sm font-bold text-slate-950">Storage</p><Badge variant="outline">{storage.unlimited ? "Unlimited" : `${percent.toFixed(1)}%`}</Badge></div><p className="mt-2 text-sm font-semibold text-slate-900">{formatBytes(storage.usedBytes)} / {storage.unlimited ? "Unlimited" : formatBytes(storage.limitBytes)}</p><div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600" style={{ width: `${percent}%` }} /></div><p className="mt-2 text-xs text-slate-500">Customer storage is separate from database utilization.</p></section>;
};

const PlatformCompanyDetailsPage = () => {
  const { companyId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [companyForm, setCompanyForm] = useState(null);
  const [subscriptionForm, setSubscriptionForm] = useState(null);
  const [adminForm, setAdminForm] = useState({
    name: "",
    email: "",
    password: "",
  });
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [error, setError] = useState("");

  const companyQuery = useQuery({
    queryKey: ["platform-company", companyId],
    queryFn: () => fetchPlatformCompany(companyId),
    enabled: Boolean(companyId),
  });
  const company = companyQuery.data;
  const companyUsageQuery = useQuery({
    queryKey: ["platform-company-storage", companyId, company?.email],
    queryFn: () => fetchPlatformCompanies({ page: 1, limit: 10, search: company?.email || "" }),
    enabled: Boolean(company?.email),
  });
  const plansQuery = useQuery({
    queryKey: ["platform-plans"],
    queryFn: fetchPlatformPlans,
  });
  const billingStatusQuery = useQuery({
    queryKey: ["platform-billing-company-status", companyId],
    queryFn: () => fetchPlatformBillingCompanyStatus(companyId),
    enabled: Boolean(companyId),
    refetchInterval: (query) =>
      query.state.data?.subscription?.status === "PENDING" ? 5000 : false,
  });
  const billingSubscription = billingStatusQuery.data?.subscription || null;
  const providerManaged = billingSubscription?.provider === "cashfree";

  const companyStorage = companyUsageQuery.data?.companies?.find(
    (candidate) => String(candidate._id) === String(companyId)
  )?.usage?.storage || null;
  const plans = plansQuery.data || [];
  const selectedPlan = useMemo(
    () =>
      plans.find(
        (plan) =>
          plan.id ===
          (providerManaged
            ? billingSubscription?.planId
            : subscriptionForm?.planId || company?.planId)
      ) || company?.plan,
    [billingSubscription?.planId, company?.plan, company?.planId, plans, providerManaged, subscriptionForm?.planId]
  );

  useEffect(() => {
    if (!company) {
      return;
    }

    setCompanyForm({
      name: company.name || "",
      email: company.email || "",
      contactPerson: company.contactPerson || "",
      contactEmail: company.contactEmail || "",
      contactPhone: company.contactPhone || "",
      status: company.status || "Active",
    });
  }, [company]);

  useEffect(() => {
    if (!company) {
      return;
    }

    setSubscriptionForm({
      planId: company.subscription?.planId || company.planId || "starter",
      status: company.subscription?.status || "Trial",
      billingCycle: company.subscription?.billingCycle || "Monthly",
      amount: company.subscription?.amount ?? "",
      startDate: company.subscription?.startDate?.slice?.(0, 10) || "",
      endDate: company.subscription?.endDate?.slice?.(0, 10) || "",
    });
    setAdminForm({
      name: company.adminUser?.name || company.contactPerson || "",
      email: company.adminUser?.email || company.contactEmail || company.email || "",
      password: "",
    });
  }, [company]);

  const invalidateCompany = () => {
    queryClient.invalidateQueries({ queryKey: ["platform-company", companyId] });
    queryClient.invalidateQueries({ queryKey: ["platform-billing-company-status", companyId] });
    queryClient.invalidateQueries({ queryKey: ["platform-companies"] });
    queryClient.invalidateQueries({ queryKey: ["platform-subscriptions"] });
    queryClient.invalidateQueries({ queryKey: ["platform-dashboard-summary"] });
  };

  const companyMutation = useMutation({
    mutationFn: (payload) => updatePlatformCompany({ companyId, payload }),
    onSuccess: () => {
      setError("");
      invalidateCompany();
    },
    onError: (mutationError) => {
      setError(mutationError?.response?.data?.message || "Unable to save company");
    },
  });
  const subscriptionMutation = useMutation({
    mutationFn: (payload) =>
      company?.subscription?._id
        ? updatePlatformSubscription({ subscriptionId: company.subscription._id, payload })
        : createPlatformSubscription({ companyId, ...payload }),
    onSuccess: () => {
      setError("");
      invalidateCompany();
    },
    onError: (mutationError) => {
      setError(mutationError?.response?.data?.message || "Unable to update subscription");
    },
  });
  const adminMutation = useMutation({
    mutationFn: (payload) => createPlatformCompanyAdminUser({ companyId, payload }),
    onSuccess: (result) => {
      setError("");
      setTemporaryPassword(result?.temporaryPassword || "");
      invalidateCompany();
    },
    onError: (mutationError) => {
      setError(mutationError?.response?.data?.message || "Unable to create company admin");
    },
  });

  const updateCompanyForm = (key, value) => {
    setCompanyForm((current) => ({ ...current, [key]: value }));
  };

  const updateSubscriptionForm = (key, value) => {
    setSubscriptionForm((current) => ({ ...current, [key]: value }));
  };

  const updateAdminForm = (key, value) => {
    setAdminForm((current) => ({ ...current, [key]: value }));
  };

  const saveCompany = (event) => {
    event.preventDefault();
    companyMutation.mutate(companyForm);
  };

  const saveSubscription = (event) => {
    event.preventDefault();
    subscriptionMutation.mutate(subscriptionForm);
  };

  const setSubscriptionStatus = (status) => {
    subscriptionMutation.mutate({
      ...subscriptionForm,
      status,
    });
  };

  const saveCompanyAdmin = (event) => {
    event.preventDefault();
    setTemporaryPassword("");
    adminMutation.mutate(adminForm);
  };

  return (
    <PlatformShell
      title={company?.name || "Company Details"}
      actions={
        <Button className="h-10 rounded-lg" type="button" variant="outline" onClick={() => navigate("/platform/companies")}>
          <ArrowLeft className="h-4 w-4" />
          Companies
        </Button>
      }
    >
      <div className="space-y-4 p-4 xl:p-5">
        {companyQuery.isLoading ? (
          <Skeleton className="h-[420px] rounded-lg" />
        ) : companyQuery.isError ? (
          <section className="rounded-lg border border-rose-200 bg-rose-50 p-5 text-sm font-semibold text-rose-700">
            Company not found
          </section>
        ) : (
          <>
            {error ? (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                {error}
              </div>
            ) : null}

            <section className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
              <form className="rounded-lg border border-slate-200 bg-white p-4" onSubmit={saveCompany}>
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-base font-bold tracking-normal">Company</h2>
                  <Badge variant={company.status === "Active" ? "success" : "warning"}>{company.status}</Badge>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <label className="space-y-1 text-sm font-semibold">
                    <span>Company Name</span>
                    <Input value={companyForm?.name || ""} onChange={(event) => updateCompanyForm("name", event.target.value)} required />
                  </label>
                  <label className="space-y-1 text-sm font-semibold">
                    <span>Company Email</span>
                    <Input type="email" value={companyForm?.email || ""} onChange={(event) => updateCompanyForm("email", event.target.value)} required />
                  </label>
                  <label className="space-y-1 text-sm font-semibold">
                    <span>Contact Person</span>
                    <Input value={companyForm?.contactPerson || ""} onChange={(event) => updateCompanyForm("contactPerson", event.target.value)} />
                  </label>
                  <label className="space-y-1 text-sm font-semibold">
                    <span>Contact Email</span>
                    <Input type="email" value={companyForm?.contactEmail || ""} onChange={(event) => updateCompanyForm("contactEmail", event.target.value)} />
                  </label>
                  <label className="space-y-1 text-sm font-semibold">
                    <span>Contact Phone</span>
                    <Input value={companyForm?.contactPhone || ""} onChange={(event) => updateCompanyForm("contactPhone", event.target.value)} />
                  </label>
                  <label className="space-y-1 text-sm font-semibold">
                    <span>Status</span>
                    <select className="h-11 w-full rounded-2xl border border-gray-300 bg-white px-4 text-sm" value={companyForm?.status || "Active"} onChange={(event) => updateCompanyForm("status", event.target.value)}>
                      {companyStatuses.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="mt-4 flex justify-end">
                  <Button className="rounded-lg" disabled={companyMutation.isPending} type="submit">
                    <Save className="h-4 w-4" />
                    {companyMutation.isPending ? "Saving..." : "Save Company"}
                  </Button>
                </div>
              </form>

              {providerManaged ? (
                <ProviderManagedSubscription subscription={billingSubscription} />
              ) : (
              <form className="rounded-lg border border-slate-200 bg-white p-4" onSubmit={saveSubscription}>
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-base font-bold tracking-normal">Subscription</h2>
                  <Badge>{company.subscription?.status || "Not assigned"}</Badge>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <label className="space-y-1 text-sm font-semibold">
                    <span>Plan</span>
                    <select className="h-11 w-full rounded-2xl border border-gray-300 bg-white px-4 text-sm" value={subscriptionForm?.planId || "starter"} onChange={(event) => updateSubscriptionForm("planId", event.target.value)}>
                      {plans.map((plan) => (
                        <option key={plan.id} value={plan.id}>
                          {plan.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1 text-sm font-semibold">
                    <span>Status</span>
                    <select className="h-11 w-full rounded-2xl border border-gray-300 bg-white px-4 text-sm" value={subscriptionForm?.status || "Trial"} onChange={(event) => updateSubscriptionForm("status", event.target.value)}>
                      {subscriptionStatuses.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1 text-sm font-semibold">
                    <span>Billing Cycle</span>
                    <select className="h-11 w-full rounded-2xl border border-gray-300 bg-white px-4 text-sm" value={subscriptionForm?.billingCycle || "Monthly"} onChange={(event) => updateSubscriptionForm("billingCycle", event.target.value)}>
                      {billingCycles.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1 text-sm font-semibold">
                    <span>Amount</span>
                    <Input min="0" step="0.01" type="number" value={subscriptionForm?.amount || ""} onChange={(event) => updateSubscriptionForm("amount", event.target.value)} />
                  </label>
                </div>
                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  <Button className="rounded-lg" type="button" variant="outline" onClick={() => setSubscriptionStatus("Active")}>
                    Activate
                  </Button>
                  <Button className="rounded-lg" type="button" variant="outline" onClick={() => setSubscriptionStatus("Suspended")}>
                    Suspend
                  </Button>
                  <Button className="rounded-lg" type="button" variant="outline" onClick={() => setSubscriptionStatus("Cancelled")}>
                    Cancel Subscription
                  </Button>
                  <Button className="rounded-lg" disabled={subscriptionMutation.isPending} type="submit">
                    {subscriptionMutation.isPending ? "Saving..." : "Save Subscription"}
                  </Button>
                </div>
              </form>
              )}
            </section>

            <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Tenant ID</p>
                <p className="mt-1 font-mono text-lg font-bold">{company.tenantId || "N/A"}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">User Limit</p>
                <p className="mt-1 text-lg font-bold">{limitText(selectedPlan?.limits?.users)}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Project Limit</p>
                <p className="mt-1 text-lg font-bold">{limitText(selectedPlan?.limits?.projects)}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Storage Limit</p>
                <p className="mt-1 text-lg font-bold">{limitText(selectedPlan?.limits?.storageGb, " GB")}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">AI Limit</p>
                <p className="mt-1 text-lg font-bold">{limitText(selectedPlan?.limits?.aiRequestsPerMonth, "/month")}</p>
              </div>
            </section>

            <form className="rounded-lg border border-slate-200 bg-white p-4" onSubmit={saveCompanyAdmin}>
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div>
                  <h2 className="text-base font-bold tracking-normal">Company Admin User</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Normal CureCode Admin - {company.tenantId}.
                  </p>
                </div>
                {company.adminUser ? (
                  <Badge variant="success">Linked</Badge>
                ) : (
                  <Badge variant="warning">Not linked</Badge>
                )}
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <label className="space-y-1 text-sm font-semibold">
                  <span>Name</span>
                  <Input value={adminForm.name} onChange={(event) => updateAdminForm("name", event.target.value)} required />
                </label>
                <label className="space-y-1 text-sm font-semibold">
                  <span>Email</span>
                  <Input type="email" value={adminForm.email} onChange={(event) => updateAdminForm("email", event.target.value)} required />
                </label>
                <label className="space-y-1 text-sm font-semibold">
                  <span>Password</span>
                  <Input type="password" value={adminForm.password} placeholder="Auto-generate if blank" onChange={(event) => updateAdminForm("password", event.target.value)} />
                </label>
              </div>
              {temporaryPassword ? (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
                  Temporary password generated. Share it securely once: <span className="font-mono">{temporaryPassword}</span>
                </div>
              ) : null}
              <div className="mt-4 flex justify-end">
                <Button className="rounded-lg" disabled={adminMutation.isPending} type="submit">
                  {adminMutation.isPending ? "Saving..." : company.adminUser ? "Update Link" : "Create Company Admin"}
                </Button>
              </div>
            </form>

            <section className="rounded-lg border border-slate-200 bg-white p-4">
              <h2 className="text-base font-bold tracking-normal">Details</h2>
              <dl className="mt-3 grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
                <div>
                  <dt className="font-bold text-slate-500">Plan</dt>
                  <dd className="mt-1">{selectedPlan?.name || "N/A"}</dd>
                </div>
                <div>
                  <dt className="font-bold text-slate-500">Created Date</dt>
                  <dd className="mt-1">{formatDate(company.createdAt)}</dd>
                </div>
                <div>
                  <dt className="font-bold text-slate-500">Subscription Status</dt>
                  <dd className="mt-1">{providerManaged ? billingSubscription.status : company.subscription?.status || "N/A"}</dd>
                </div>
                <div>
                  <dt className="font-bold text-slate-500">Company Status</dt>
                  <dd className="mt-1">{company.status}</dd>
                </div>
                <div>
                  <dt className="font-bold text-slate-500">Admin/User Association</dt>
                  <dd className="mt-1">{company.adminUser?.email || "Not linked"}</dd>
                </div>
              </dl>
            </section>

            <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <BillingSection subscription={billingSubscription} />
              <FutureSection title="AI Usage" />
              <StorageSection company={company} storage={companyStorage} />
              <FutureSection title="Users" />
              <FutureSection title="Activity" />
            </section>
          </>
        )}
      </div>
    </PlatformShell>
  );
};

export default PlatformCompanyDetailsPage;
