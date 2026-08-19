import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  ArrowUpDown,
  Building2,
  CreditCard,
  Database,
  LayoutDashboard,
  LogOut,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useLocation, useNavigate } from "react-router-dom";
import {
  fetchPlatformDashboardAICostByCompany,
  fetchPlatformDashboardAIUsage,
  fetchPlatformDashboardActivity,
  fetchPlatformDashboardAlerts,
  fetchPlatformDashboardGrowth,
  fetchPlatformDashboardPayments,
  fetchPlatformDashboardRevenue,
  fetchPlatformDashboardSubscriptions,
  fetchPlatformDashboardSummary,
} from "@/lib/api";
import { usePlatformAuth } from "@/hooks/use-platform-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const navItems = [
  { key: "dashboard", label: "Dashboard", path: "/platform/dashboard", Icon: LayoutDashboard },
  { key: "companies", label: "Companies", path: "/platform/companies", Icon: Building2 },
  { key: "subscriptions", label: "Subscriptions", path: "/platform/subscriptions", Icon: ShieldCheck },
  { key: "payments", label: "Payments", path: "/platform/payments", Icon: CreditCard },
  { key: "ai-usage", label: "AI Usage", path: "/platform/ai-usage", Icon: Sparkles },
  { key: "storage", label: "Storage", path: "/platform/storage", Icon: Database },
  { key: "settings", label: "Platform Settings", path: "/platform/settings", Icon: Settings },
];

const dateRangeOptions = [
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "180", label: "180 days" },
  { value: "365", label: "12 months" },
];

const compactNumber = (value) => {
  if (value === null || value === undefined) {
    return "N/A";
  }

  return new Intl.NumberFormat("en-IN", {
    notation: Number(value) >= 100000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(Number(value || 0));
};

const formatCurrency = (value, currency = "USD") => {
  if (value === null || value === undefined) {
    return "N/A";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: Number(value) < 10 ? 4 : 0,
  }).format(Number(value || 0));
};

const formatDateTime = (value) => {
  if (!value) {
    return "N/A";
  }

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
};

const EmptyState = ({ children }) => (
  <div className="grid min-h-[180px] place-items-center rounded-lg border border-dashed border-slate-200 bg-slate-50/70 px-4 py-6 text-center text-sm font-medium text-slate-500">
    {children}
  </div>
);

const Panel = ({ action, children, className, title }) => (
  <section className={cn("rounded-lg border border-slate-200 bg-white", className)}>
    <div className="flex min-h-12 items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
      <h2 className="text-sm font-bold tracking-normal text-slate-900">{title}</h2>
      {action}
    </div>
    <div className="p-4">{children}</div>
  </section>
);

const ChartSkeleton = () => <Skeleton className="h-[260px] rounded-lg" />;

const PlatformDashboardPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout, platformAdmin } = usePlatformAuth();
  const [rangeDays, setRangeDays] = useState("30");
  const [companySearch, setCompanySearch] = useState("");
  const [sortKey, setSortKey] = useState("estimatedCost");
  const [sortDirection, setSortDirection] = useState("desc");
  const params = useMemo(() => ({ rangeDays }), [rangeDays]);

  const summaryQuery = useQuery({
    queryKey: ["platform-dashboard-summary"],
    queryFn: fetchPlatformDashboardSummary,
  });
  const revenueQuery = useQuery({
    queryKey: ["platform-dashboard-revenue", params],
    queryFn: () => fetchPlatformDashboardRevenue(params),
  });
  const subscriptionsQuery = useQuery({
    queryKey: ["platform-dashboard-subscriptions", params],
    queryFn: () => fetchPlatformDashboardSubscriptions(params),
  });
  const aiUsageQuery = useQuery({
    queryKey: ["platform-dashboard-ai-usage", params],
    queryFn: () => fetchPlatformDashboardAIUsage(params),
  });
  const aiCostQuery = useQuery({
    queryKey: ["platform-dashboard-ai-cost-by-company", params],
    queryFn: () => fetchPlatformDashboardAICostByCompany(params),
  });
  const paymentsQuery = useQuery({
    queryKey: ["platform-dashboard-payments", params],
    queryFn: () => fetchPlatformDashboardPayments(params),
  });
  const growthQuery = useQuery({
    queryKey: ["platform-dashboard-growth", params],
    queryFn: () => fetchPlatformDashboardGrowth(params),
  });
  const activityQuery = useQuery({
    queryKey: ["platform-dashboard-activity"],
    queryFn: fetchPlatformDashboardActivity,
  });
  const alertsQuery = useQuery({
    queryKey: ["platform-dashboard-alerts"],
    queryFn: fetchPlatformDashboardAlerts,
  });

  const summary = summaryQuery.data || {};
  const aiUsage = aiUsageQuery.data || {};
  const revenue = revenueQuery.data || {};
  const subscriptions = subscriptionsQuery.data || {};
  const payments = paymentsQuery.data || {};
  const growth = growthQuery.data || {};
  const activity = activityQuery.data || {};
  const alerts = alertsQuery.data || {};

  const filteredCompanies = useMemo(() => {
    const query = companySearch.trim().toLowerCase();
    const rows = aiCostQuery.data?.companies || [];
    const visibleRows = query
      ? rows.filter((row) =>
          [row.companyName, row.workspaceId].some((value) =>
            String(value || "").toLowerCase().includes(query)
          )
        )
      : rows;

    return [...visibleRows].sort((a, b) => {
      const first = a[sortKey];
      const second = b[sortKey];
      const modifier = sortDirection === "asc" ? 1 : -1;

      if (typeof first === "number" || typeof second === "number") {
        return ((Number(first) || 0) - (Number(second) || 0)) * modifier;
      }

      return String(first || "").localeCompare(String(second || "")) * modifier;
    });
  }, [aiCostQuery.data?.companies, companySearch, sortDirection, sortKey]);

  const hasRevenueData = (revenue.trend || []).some((row) => row.revenue || row.mrr);
  const hasAIUsageData = (aiUsage.trend || []).some((row) => row.requests || row.tokens || row.estimatedCost);
  const hasGrowthData = (growth.trend || []).some((row) => row.companies || row.users);
  const activeNavPath = navItems.find((item) => location.pathname.startsWith(item.path))?.path;

  const handleLogout = async () => {
    await logout();
    navigate("/platform/login", { replace: true });
  };

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDirection((value) => (value === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(key);
    setSortDirection(key === "companyName" ? "asc" : "desc");
  };

  const topMetrics = [
    { label: "Companies", value: compactNumber(summary.companies), note: "workspaces" },
    { label: "Users", value: compactNumber(summary.users), note: "accounts" },
    { label: "MRR", value: formatCurrency(summary.mrr, summary.currency), note: "billing pending" },
    { label: "AI Cost", value: formatCurrency(summary.aiCost, summary.currency), note: `${compactNumber(summary.aiRequests)} requests` },
    { label: "Storage", value: compactNumber(summary.storage), note: "metering pending" },
  ];

  const pageTitle = activeNavPath === "/platform/dashboard" ? "SaaS Control Center" : "SaaS Control Center";

  return (
    <main className="h-[var(--app-viewport-height)] overflow-hidden bg-slate-100 text-slate-950">
      <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] lg:grid-cols-[244px_1fr] lg:grid-rows-none">
        <aside className="min-h-0 border-r border-slate-200 bg-white px-4 py-5 lg:overflow-y-auto">
          <div className="flex items-center gap-3 px-2">
            <img src="/icons/icon-192x192.png?v=20260727-3" alt="" className="h-10 w-10 rounded-xl" />
            <div>
              <p className="text-lg font-bold tracking-normal">CureCode</p>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-700">Platform</p>
            </div>
          </div>

          <nav className="mt-7 space-y-1">
            {navItems.map(({ label, Icon, path }) => {
              const active = activeNavPath === path;

              return (
                <button
                  key={label}
                  className={cn(
                    "flex h-9 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-semibold transition",
                    active ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                  )}
                  type="button"
                  onClick={() => navigate(path)}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              );
            })}
          </nav>
        </aside>

        <section className="flex min-h-0 min-w-0 flex-col">
          <header className="flex flex-col gap-4 border-b border-slate-200 bg-white px-5 py-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">
                CureCode Platform
              </p>
              <h1 className="mt-1 text-2xl font-bold tracking-normal">{pageTitle}</h1>
              <p className="mt-1 text-sm text-slate-500">
                {platformAdmin?.name || "Platform Admin"} · {platformAdmin?.role || "SaaS Admin"}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
                value={rangeDays}
                onChange={(event) => setRangeDays(event.target.value)}
              >
                {dateRangeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <Button className="h-10 rounded-lg" type="button" variant="outline" onClick={handleLogout}>
                <LogOut className="h-4 w-4" />
                Logout
              </Button>
            </div>
          </header>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 xl:p-5">
            <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              {summaryQuery.isLoading
                ? Array.from({ length: 5 }).map((_, index) => (
                    <Skeleton key={index} className="h-20 rounded-lg" />
                  ))
                : topMetrics.map((metric) => (
                    <div key={metric.label} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">{metric.label}</p>
                      <p className="mt-1 text-xl font-bold tracking-normal text-slate-950">{metric.value}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{metric.note}</p>
                    </div>
                  ))}
            </section>

            {(summaryQuery.isError ||
              revenueQuery.isError ||
              aiUsageQuery.isError ||
              aiCostQuery.isError ||
              paymentsQuery.isError ||
              activityQuery.isError) && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                Some platform metrics could not be loaded.
              </div>
            )}

            <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
              <Panel title="Revenue Overview">
                {revenueQuery.isLoading ? (
                  <ChartSkeleton />
                ) : hasRevenueData ? (
                  <div className="h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={revenue.trend}>
                        <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Area dataKey="revenue" fill="#bfdbfe" stroke="#2563eb" />
                        <Line dataKey="mrr" stroke="#0f766e" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <EmptyState>{revenue.emptyState || "No revenue data available yet"}</EmptyState>
                )}
              </Panel>

              <Panel title="AI Usage & Cost">
                {aiUsageQuery.isLoading ? (
                  <ChartSkeleton />
                ) : (
                  <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded-lg bg-blue-50 px-3 py-2">
                        <p className="text-[11px] font-bold uppercase text-blue-700">Requests</p>
                        <p className="text-lg font-bold">{compactNumber(aiUsage.summary?.requests)}</p>
                      </div>
                      <div className="rounded-lg bg-slate-50 px-3 py-2">
                        <p className="text-[11px] font-bold uppercase text-slate-600">Tokens</p>
                        <p className="text-lg font-bold">{compactNumber(aiUsage.summary?.totalTokens)}</p>
                      </div>
                      <div className="rounded-lg bg-emerald-50 px-3 py-2">
                        <p className="text-[11px] font-bold uppercase text-emerald-700">Cost</p>
                        <p className="text-lg font-bold">{formatCurrency(aiUsage.summary?.estimatedCost, aiUsage.currency)}</p>
                      </div>
                    </div>
                    {hasAIUsageData ? (
                      <div className="h-[190px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={aiUsage.trend}>
                            <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                            <YAxis tick={{ fontSize: 11 }} />
                            <Tooltip />
                            <Area dataKey="requests" fill="#ccfbf1" stroke="#0f766e" />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <EmptyState>{aiUsage.emptyState || "No AI usage data available yet"}</EmptyState>
                    )}
                  </div>
                )}
              </Panel>
            </section>

            <section className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
              <Panel title="Subscription Overview">
                {subscriptionsQuery.isLoading ? (
                  <Skeleton className="h-[220px] rounded-lg" />
                ) : subscriptions.plans?.length ? (
                  <div className="space-y-2">
                    {subscriptions.plans.map((plan) => (
                      <div key={plan.name} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm">
                        <span className="font-semibold">{plan.name}</span>
                        <span className="text-slate-500">{compactNumber(plan.activeSubscriptions)} active</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState>{subscriptions.emptyState || "No subscription data available yet"}</EmptyState>
                )}
              </Panel>

              <Panel title="Company/User Growth">
                {growthQuery.isLoading ? (
                  <Skeleton className="h-[220px] rounded-lg" />
                ) : hasGrowthData ? (
                  <div className="h-[220px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={growth.trend}>
                        <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Line dataKey="users" stroke="#2563eb" strokeWidth={2} />
                        <Line dataKey="companies" stroke="#7c3aed" strokeWidth={2} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <EmptyState>{growth.emptyState || "No company or user growth data available yet"}</EmptyState>
                )}
              </Panel>
            </section>

            <Panel
              title="AI Cost by Company"
              action={
                <div className="relative w-64 max-w-full">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    className="h-9 rounded-lg pl-9"
                    placeholder="Search company"
                    value={companySearch}
                    onChange={(event) => setCompanySearch(event.target.value)}
                  />
                </div>
              }
            >
              {aiCostQuery.isLoading ? (
                <Skeleton className="h-[260px] rounded-lg" />
              ) : filteredCompanies.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
                        {[
                          ["companyName", "Company"],
                          ["users", "Users"],
                          ["projects", "Projects"],
                          ["requests", "Requests"],
                          ["tokens", "Tokens"],
                          ["estimatedCost", "Cost"],
                        ].map(([key, label]) => (
                          <th key={key} className="px-3 py-2">
                            <button className="inline-flex items-center gap-1" type="button" onClick={() => toggleSort(key)}>
                              {label}
                              <ArrowUpDown className="h-3 w-3" />
                            </button>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCompanies.map((row) => (
                        <tr key={row.id} className="border-b border-slate-50">
                          <td className="px-3 py-2 font-semibold text-slate-900">{row.companyName}</td>
                          <td className="px-3 py-2">{compactNumber(row.users)}</td>
                          <td className="px-3 py-2">{compactNumber(row.projects)}</td>
                          <td className="px-3 py-2">{compactNumber(row.requests)}</td>
                          <td className="px-3 py-2">{compactNumber(row.tokens)}</td>
                          <td className="px-3 py-2 font-semibold">{formatCurrency(row.estimatedCost, aiCostQuery.data?.currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState>{aiCostQuery.data?.emptyState || "No AI cost data available yet"}</EmptyState>
              )}
            </Panel>

            <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
              <Panel title="Recent Payments">
                {paymentsQuery.isLoading ? (
                  <Skeleton className="h-[220px] rounded-lg" />
                ) : payments.payments?.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[680px] text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
                          <th className="px-3 py-2">Company</th>
                          <th className="px-3 py-2">Amount</th>
                          <th className="px-3 py-2">Status</th>
                          <th className="px-3 py-2">Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {payments.payments.map((payment) => (
                          <tr key={payment.id} className="border-b border-slate-50">
                            <td className="px-3 py-2 font-semibold">{payment.companyName}</td>
                            <td className="px-3 py-2">{formatCurrency(payment.amount, payments.currency)}</td>
                            <td className="px-3 py-2">{payment.status}</td>
                            <td className="px-3 py-2">{formatDateTime(payment.createdAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <EmptyState>{payments.emptyState || "No payment data available yet"}</EmptyState>
                )}
              </Panel>

              <Panel title="Recent Activity">
                {activityQuery.isLoading ? (
                  <Skeleton className="h-[220px] rounded-lg" />
                ) : activity.activity?.length ? (
                  <div className="max-h-[260px] space-y-3 overflow-auto pr-1">
                    {activity.activity.map((item) => (
                      <div key={item.id} className="flex gap-3 border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                        <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-blue-50 text-blue-700">
                          <Activity className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900">{item.action}</p>
                          <p className="text-xs text-slate-500">
                            {item.actorEmail || "Platform"} · {formatDateTime(item.createdAt)}
                          </p>
                        </div>
                        <Badge className="ml-auto shrink-0 px-2 py-0.5" variant={item.status === "FAILED" ? "danger" : "success"}>
                          {item.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState>{activity.emptyState || "No platform activity available yet"}</EmptyState>
                )}
              </Panel>
            </section>

            <Panel
              title="Attention Required"
              action={<AlertTriangle className="h-4 w-4 text-amber-500" />}
            >
              {alertsQuery.isLoading ? (
                <Skeleton className="h-[120px] rounded-lg" />
              ) : alerts.alerts?.length ? (
                <div className="grid gap-2 md:grid-cols-2">
                  {alerts.alerts.map((alert) => (
                    <div key={alert.id} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
                      <p className="font-semibold text-amber-900">{alert.title}</p>
                      <p className="text-amber-700">{alert.message}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState>{alerts.emptyState || "No platform alerts require attention"}</EmptyState>
              )}
            </Panel>

            <section className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-xs text-slate-500">
              Billing, storage, and tenant-level controls are intentionally read-only placeholders until the next SaaS phases add real models and providers.
            </section>
          </div>
        </section>
      </div>
    </main>
  );
};

export default PlatformDashboardPage;
