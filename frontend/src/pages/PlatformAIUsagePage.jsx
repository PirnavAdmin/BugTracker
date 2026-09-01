import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpDown, Coins, RefreshCw, Search, Sparkles, Text } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import PlatformShell from "@/components/platform/PlatformShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  fetchPlatformDashboardAICostByCompany,
  fetchPlatformDashboardAIUsage,
} from "@/lib/api";

const rangeOptions = [
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "180", label: "Last 180 days" },
  { value: "365", label: "Last 12 months" },
];

const formatNumber = (value) =>
  new Intl.NumberFormat("en-IN", {
    notation: Number(value) >= 100000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(Number(value || 0));

const formatCurrency = (value, currency = "USD") =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: Number(value || 0) < 10 ? 4 : 2,
  }).format(Number(value || 0));

const MetricCard = ({ icon: Icon, label, note, value }) => (
  <section className="rounded-lg border border-slate-200 bg-white p-4">
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</p>
        <p className="mt-1 text-xl font-bold text-slate-950">{value}</p>
        <p className="mt-1 text-xs text-slate-500">{note}</p>
      </div>
      <span className="rounded-lg bg-blue-50 p-2 text-blue-700"><Icon className="h-4 w-4" /></span>
    </div>
  </section>
);

const EmptyState = ({ children }) => (
  <div className="grid min-h-[220px] place-items-center rounded-lg border border-dashed border-slate-200 bg-slate-50/70 p-6 text-center text-sm font-medium text-slate-500">
    {children}
  </div>
);

const PlatformAIUsagePage = () => {
  const queryClient = useQueryClient();
  const [rangeDays, setRangeDays] = useState("30");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("estimatedCost");
  const [sortDirection, setSortDirection] = useState("desc");
  const params = useMemo(() => ({ rangeDays }), [rangeDays]);

  const usageQuery = useQuery({
    queryKey: ["platform-dashboard-ai-usage", params],
    queryFn: () => fetchPlatformDashboardAIUsage(params),
  });
  const companiesQuery = useQuery({
    queryKey: ["platform-dashboard-ai-cost-by-company", params],
    queryFn: () => fetchPlatformDashboardAICostByCompany(params),
  });

  const usage = usageQuery.data || {};
  const summary = usage.summary || {};
  const currency = usage.currency || companiesQuery.data?.currency || "USD";
  const companies = companiesQuery.data?.companies || [];
  const activeCompanies = companies.filter((company) => company.requests > 0).length;
  const averageCost = summary.requests ? summary.estimatedCost / summary.requests : 0;
  const hasTrend = (usage.trend || []).some(
    (row) => row.requests || row.tokens || row.estimatedCost
  );

  const visibleCompanies = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = query
      ? companies.filter((company) =>
          [company.companyName, company.tenantId].some((value) =>
            String(value || "").toLowerCase().includes(query)
          )
        )
      : companies;

    return [...filtered].sort((first, second) => {
      const modifier = sortDirection === "asc" ? 1 : -1;
      if (sortKey === "companyName" || sortKey === "tenantId") {
        return String(first[sortKey] || "").localeCompare(String(second[sortKey] || "")) * modifier;
      }
      return ((Number(first[sortKey]) || 0) - (Number(second[sortKey]) || 0)) * modifier;
    });
  }, [companies, search, sortDirection, sortKey]);

  const toggleSort = (key) => {
    if (key === sortKey) {
      setSortDirection((current) => current === "asc" ? "desc" : "asc");
      return;
    }
    setSortKey(key);
    setSortDirection(key === "companyName" || key === "tenantId" ? "asc" : "desc");
  };

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["platform-dashboard-ai-usage"] });
    queryClient.invalidateQueries({ queryKey: ["platform-dashboard-ai-cost-by-company"] });
  };

  const actions = (
    <>
      <select
        aria-label="AI usage date range"
        className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
        value={rangeDays}
        onChange={(event) => setRangeDays(event.target.value)}
      >
        {rangeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <Button className="h-10 rounded-lg" type="button" variant="outline" onClick={refresh}>
        <RefreshCw className="h-4 w-4" />Refresh
      </Button>
    </>
  );

  const isLoading = usageQuery.isLoading || companiesQuery.isLoading;

  return (
    <PlatformShell title="AI Usage" actions={actions}>
      <div className="space-y-4 p-4 xl:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <span>Platform-wide successful AI requests, token consumption, and estimated cost.</span>
          <span>
            Last updated: {usageQuery.dataUpdatedAt
              ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(usageQuery.dataUpdatedAt))
              : "Loading..."}
          </span>
        </div>

        {(usageQuery.isError || companiesQuery.isError) && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
            AI usage metrics could not be loaded. Refresh to try again.
          </div>
        )}

        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-28 rounded-lg" />)}
          </div>
        ) : (
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard icon={Sparkles} label="AI Requests" value={formatNumber(summary.requests)} note={`${activeCompanies} active compan${activeCompanies === 1 ? "y" : "ies"}`} />
            <MetricCard icon={Text} label="Total Tokens" value={formatNumber(summary.totalTokens)} note={`${formatNumber(summary.inputTokens)} input · ${formatNumber(summary.outputTokens)} output`} />
            <MetricCard icon={Coins} label="Estimated Cost" value={formatCurrency(summary.estimatedCost, currency)} note={`${formatCurrency(averageCost, currency)} per request`} />
            <MetricCard icon={Sparkles} label="Tracked Companies" value={formatNumber(companies.length)} note="Companies included in platform reporting" />
          </section>
        )}

        <section className="grid gap-4 xl:grid-cols-2">
          <section className="rounded-lg border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-4 py-3">
              <h2 className="text-sm font-bold text-slate-900">Requests & Tokens</h2>
              <p className="mt-1 text-xs text-slate-500">Daily AI activity for the selected period.</p>
            </div>
            <div className="p-4">
              {usageQuery.isLoading ? <Skeleton className="h-[280px] rounded-lg" /> : hasTrend ? (
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={usage.trend}>
                      <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={24} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={formatNumber} />
                      <Tooltip formatter={(value) => formatNumber(value)} />
                      <Area dataKey="tokens" name="Tokens" fill="#dbeafe" stroke="#2563eb" strokeWidth={2} />
                      <Area dataKey="requests" name="Requests" fill="#ccfbf1" stroke="#0f766e" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : <EmptyState>{usage.emptyState || "No AI usage data available yet"}</EmptyState>}
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-4 py-3">
              <h2 className="text-sm font-bold text-slate-900">Estimated Cost Trend</h2>
              <p className="mt-1 text-xs text-slate-500">Daily estimated model cost in {currency}.</p>
            </div>
            <div className="p-4">
              {usageQuery.isLoading ? <Skeleton className="h-[280px] rounded-lg" /> : hasTrend ? (
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={usage.trend}>
                      <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={24} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(value) => formatCurrency(value, currency)} width={72} />
                      <Tooltip formatter={(value) => formatCurrency(value, currency)} />
                      <Area dataKey="estimatedCost" name="Estimated cost" fill="#dcfce7" stroke="#16a34a" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : <EmptyState>{usage.emptyState || "No AI cost data available yet"}</EmptyState>}
            </div>
          </section>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white">
          <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Usage by Company</h2>
              <p className="mt-1 text-xs text-slate-500">Tenant-level usage and cost from the same reporting source as the platform dashboard.</p>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input className="h-9 rounded-lg pl-9" placeholder="Search company or tenant" value={search} onChange={(event) => setSearch(event.target.value)} />
            </div>
          </div>
          {companiesQuery.isLoading ? <div className="p-4"><Skeleton className="h-64 rounded-lg" /></div> : visibleCompanies.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
                    {[["companyName", "Company"], ["tenantId", "Tenant ID"], ["users", "Users"], ["projects", "Projects"], ["requests", "Requests"], ["tokens", "Tokens"], ["estimatedCost", "Est. Cost"]].map(([key, label]) => (
                      <th key={key} className="px-4 py-3">
                        <button className="inline-flex items-center gap-1" type="button" onClick={() => toggleSort(key)}>{label}<ArrowUpDown className="h-3 w-3" /></button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleCompanies.map((company) => (
                    <tr key={`${company.id}-${company.tenantId}`} className="border-b border-slate-50">
                      <td className="px-4 py-3 font-semibold text-slate-950">{company.companyName}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">{company.tenantId || "N/A"}</td>
                      <td className="px-4 py-3">{formatNumber(company.users)}</td>
                      <td className="px-4 py-3">{formatNumber(company.projects)}</td>
                      <td className="px-4 py-3">{formatNumber(company.requests)}</td>
                      <td className="px-4 py-3">{formatNumber(company.tokens)}</td>
                      <td className="px-4 py-3 font-semibold">{formatCurrency(company.estimatedCost, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div className="p-4"><EmptyState>{companiesQuery.data?.emptyState || "No AI usage data available yet"}</EmptyState></div>}
        </section>
      </div>
    </PlatformShell>
  );
};

export default PlatformAIUsagePage;
