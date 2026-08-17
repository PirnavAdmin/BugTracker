import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, RefreshCw, Save, ShieldCheck } from "lucide-react";
import { fetchAISettings, fetchAIUsage, saveAISettings } from "@/lib/api";
import {
  ROLE_ADMIN,
  ROLE_DEVELOPER,
  ROLE_MANAGER,
  ROLE_QA_LEAD,
  ROLE_TEAM_LEAD,
  ROLE_TESTER,
} from "@/lib/roles";
import SettingsPanel from "@/components/settings/SettingsPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const ROLE_OPTIONS = [
  ROLE_ADMIN,
  ROLE_MANAGER,
  ROLE_TEAM_LEAD,
  ROLE_QA_LEAD,
  ROLE_DEVELOPER,
  ROLE_TESTER,
];

const FEATURE_LABELS = {
  "ai.description": "Description Generation",
  "ai.code-review": "Code Review",
  "ai.qa-insights": "QA Insights",
  "ai.test-generation": "Test Generation",
  "ai.bug-triage": "Bug Triage",
  "ai.duplicate-detection": "Duplicate Detection",
  "ai.project-insights": "Project Insights",
};

const LIMIT_LABELS = {
  dailyRequests: "Daily requests",
  monthlyRequests: "Monthly requests",
  perUserDailyRequests: "User daily requests",
  perUserMonthlyRequests: "User monthly requests",
  dailyBudget: "Daily budget",
  monthlyBudget: "Monthly budget",
};

const formatNumber = (value) => Number(value || 0).toLocaleString();
const formatCost = (value) => `$${Number(value || 0).toFixed(4)}`;

const cloneSettings = (settings = {}) => ({
  ...settings,
  features: Object.fromEntries(
    Object.entries(settings.features || {}).map(([feature, config]) => [
      feature,
      {
        enabled: Boolean(config?.enabled),
        allowedRoles: Array.isArray(config?.allowedRoles) ? [...config.allowedRoles] : [],
      },
    ])
  ),
  limits: { ...(settings.limits || {}) },
  alerts: {
    thresholds: Array.isArray(settings.alerts?.thresholds)
      ? [...settings.alerts.thresholds]
      : [],
  },
});

const StatTile = ({ label, value, tone = "blue" }) => (
  <div
    className={cn(
      "rounded-xl border p-4",
      tone === "green" && "border-emerald-100 bg-emerald-50/70",
      tone === "amber" && "border-amber-100 bg-amber-50/70",
      tone === "blue" && "border-blue-100 bg-blue-50/70",
      tone === "slate" && "border-slate-200 bg-slate-50"
    )}
  >
    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
      {label}
    </p>
    <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
  </div>
);

const EmptyRows = ({ message }) => (
  <div className="rounded-xl border border-dashed border-slate-200 p-5 text-sm text-slate-500">
    {message}
  </div>
);

const AISettings = ({ showToast }) => {
  const queryClient = useQueryClient();
  const [draftSettings, setDraftSettings] = useState(null);
  const [range, setRange] = useState("30d");
  const [usageFilters, setUsageFilters] = useState({
    feature: "all",
    role: "all",
    startDate: "",
    endDate: "",
  });
  const [projectSort, setProjectSort] = useState("estimatedCost");
  const [userSort, setUserSort] = useState("estimatedCost");

  const settingsQuery = useQuery({
    queryKey: ["ai-settings"],
    queryFn: fetchAISettings,
  });

  const usageQuery = useQuery({
    queryKey: ["ai-usage", range, usageFilters],
    queryFn: () =>
      fetchAIUsage({
        range,
        ...usageFilters,
      }),
  });

  useEffect(() => {
    if (settingsQuery.data) {
      setDraftSettings(cloneSettings(settingsQuery.data));
    }
  }, [settingsQuery.data]);

  const saveMutation = useMutation({
    mutationFn: saveAISettings,
    onSuccess: (data) => {
      setDraftSettings(cloneSettings(data.settings));
      queryClient.setQueryData(["ai-settings"], data.settings);
      queryClient.invalidateQueries({ queryKey: ["ai-usage"] });
      showToast?.("success", data.message || "AI settings saved.");
    },
    onError: (error) => {
      showToast?.(
        "error",
        error.response?.data?.message || "Unable to save AI settings right now."
      );
    },
  });

  const features = useMemo(
    () => Object.entries(draftSettings?.features || {}),
    [draftSettings?.features]
  );
  const usage = usageQuery.data || {};
  const summary = usage.summary || {};
  const today = usage.today || {};
  const thisMonth = usage.thisMonth || {};
  const monthlyBudget = usage.budgetProgress?.monthly || {};
  const dailyBudget = usage.budgetProgress?.daily || {};
  const codeReviewAnalytics = usage.codeReviewAnalytics || {};

  const sortedProjectUsage = useMemo(
    () =>
      [...(usage.byProject || [])].sort(
        (left, right) => Number(right[projectSort] || 0) - Number(left[projectSort] || 0)
      ),
    [projectSort, usage.byProject]
  );
  const sortedUserUsage = useMemo(
    () =>
      [...(usage.byUser || [])].sort(
        (left, right) => Number(right[userSort] || 0) - Number(left[userSort] || 0)
      ),
    [userSort, usage.byUser]
  );

  const updateDraft = (updater) => {
    setDraftSettings((current) => updater(cloneSettings(current || {})));
  };

  const toggleFeature = (feature) => {
    updateDraft((current) => {
      current.features[feature].enabled = !current.features[feature].enabled;
      return current;
    });
  };

  const toggleRole = (feature, role) => {
    updateDraft((current) => {
      const roles = new Set(current.features[feature].allowedRoles || []);

      if (roles.has(role)) {
        roles.delete(role);
      } else {
        roles.add(role);
      }

      current.features[feature].allowedRoles = Array.from(roles);
      return current;
    });
  };

  const updateLimit = (key, value) => {
    updateDraft((current) => {
      current.limits[key] = value;
      return current;
    });
  };

  const updateThresholds = (value) => {
    updateDraft((current) => {
      current.alerts.thresholds = value
        .split(",")
        .map((item) => Number(item.trim()))
        .filter((item) => Number.isFinite(item) && item > 0 && item <= 100);
      return current;
    });
  };

  const handleSave = () => {
    saveMutation.mutate(draftSettings);
  };

  if (settingsQuery.isLoading || !draftSettings) {
    return (
      <SettingsPanel title="AI Settings" description="Control workspace AI access, limits, and usage.">
        <div className="grid gap-4 lg:grid-cols-3">
          {[1, 2, 3].map((item) => (
            <Skeleton key={item} className="h-28 rounded-xl" />
          ))}
        </div>
      </SettingsPanel>
    );
  }

  if (settingsQuery.error) {
    return (
      <SettingsPanel title="AI Settings">
        <Card className="border-rose-200 bg-rose-50">
          <CardContent className="p-4 text-sm text-rose-700">
            {settingsQuery.error.response?.data?.message || "Unable to load AI settings."}
          </CardContent>
        </Card>
      </SettingsPanel>
    );
  }

  return (
    <SettingsPanel
      title="AI Settings"
      description="Control AI feature availability, role access, request limits, and monthly usage from one workspace policy."
      actions={
        <Button onClick={handleSave} disabled={saveMutation.isPending}>
          <Save className="h-4 w-4" aria-hidden="true" />
          {saveMutation.isPending ? "Saving..." : "Save Settings"}
        </Button>
      }
    >
      <div className="space-y-6">
        <section className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 rounded-xl bg-blue-100 p-2 text-blue-700">
                <ShieldCheck className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <h3 className="font-semibold text-slate-950">Workspace AI</h3>
                <p className="text-sm text-slate-600">
                  Existing AI tools stay enabled unless this master switch or a feature switch is turned off.
                </p>
              </div>
            </div>
            <label className="inline-flex items-center gap-3 text-sm font-semibold text-slate-700">
              <input
                type="checkbox"
                className="h-5 w-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                checked={Boolean(draftSettings.masterEnabled)}
                onChange={(event) =>
                  updateDraft((current) => {
                    current.masterEnabled = event.target.checked;
                    return current;
                  })
                }
              />
              Enabled
            </label>
          </div>
        </section>

        <section className="grid gap-3">
          {features.map(([feature, config]) => (
            <div key={feature} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-slate-950">
                      {FEATURE_LABELS[feature] || feature}
                    </h3>
                    <Badge variant={config.enabled ? "default" : "secondary"}>
                      {config.enabled ? "Enabled" : "Disabled"}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs font-mono text-slate-500">{feature}</p>
                </div>
                <label className="inline-flex items-center gap-3 text-sm font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    className="h-5 w-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    checked={Boolean(config.enabled)}
                    onChange={() => toggleFeature(feature)}
                  />
                  Feature on
                </label>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {ROLE_OPTIONS.map((role) => (
                  <label
                    key={role}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      checked={(config.allowedRoles || []).includes(role)}
                      onChange={() => toggleRole(feature, role)}
                    />
                    {role}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </section>

        <section>
          <h3 className="mb-3 font-semibold text-slate-950">Limits</h3>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {Object.entries(LIMIT_LABELS).map(([key, label]) => (
              <label key={key} className="block rounded-xl border border-slate-200 bg-white p-4">
                <span className="text-sm font-semibold text-slate-600">{label}</span>
                <input
                  type="number"
                  min="0"
                  step={key.toLowerCase().includes("budget") ? "0.01" : "1"}
                  value={draftSettings.limits?.[key] ?? ""}
                  onChange={(event) => updateLimit(key, event.target.value)}
                  className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
              </label>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="font-semibold text-slate-950">Alerts</h3>
          <p className="mt-1 text-sm text-slate-600">
            Admins and managers are notified once per usage period when budget thresholds are crossed.
          </p>
          <label className="mt-4 block max-w-md">
            <span className="text-sm font-semibold text-slate-600">Budget thresholds</span>
            <input
              type="text"
              value={(draftSettings.alerts?.thresholds || []).join(", ")}
              onChange={(event) => updateThresholds(event.target.value)}
              className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </label>
        </section>

        <section className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-semibold text-slate-950">Usage & Cost</h3>
              <p className="text-sm text-slate-600">Successful AI calls are counted after Bedrock returns.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={range}
                onChange={(event) => setRange(event.target.value)}
                className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm"
              >
                <option value="today">Today</option>
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
                <option value="this_month">This month</option>
                <option value="previous_month">Previous month</option>
                <option value="custom">Custom</option>
              </select>
              <select
                value={usageFilters.feature}
                onChange={(event) =>
                  setUsageFilters((current) => ({ ...current, feature: event.target.value }))
                }
                className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm"
              >
                <option value="all">All features</option>
                {features.map(([feature]) => (
                  <option key={feature} value={feature}>
                    {FEATURE_LABELS[feature] || feature}
                  </option>
                ))}
              </select>
              <select
                value={usageFilters.role}
                onChange={(event) =>
                  setUsageFilters((current) => ({ ...current, role: event.target.value }))
                }
                className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm"
              >
                <option value="all">All roles</option>
                {ROLE_OPTIONS.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => usageQuery.refetch()}
                aria-label="Refresh AI usage"
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </div>

          {range === "custom" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-semibold text-slate-600">Start date</span>
                <input
                  type="date"
                  value={usageFilters.startDate}
                  onChange={(event) =>
                    setUsageFilters((current) => ({ ...current, startDate: event.target.value }))
                  }
                  className="mt-2 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-slate-600">End date</span>
                <input
                  type="date"
                  value={usageFilters.endDate}
                  onChange={(event) =>
                    setUsageFilters((current) => ({ ...current, endDate: event.target.value }))
                  }
                  className="mt-2 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"
                />
              </label>
            </div>
          ) : null}

          {usageQuery.isLoading ? (
            <div className="grid gap-3 md:grid-cols-4">
              {[1, 2, 3, 4].map((item) => (
                <Skeleton key={item} className="h-24 rounded-xl" />
              ))}
            </div>
          ) : (
            <>
              {!summary.requests && !today.requests && !thisMonth.requests ? (
                <EmptyRows message="No AI usage recorded yet." />
              ) : null}

              <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
                <StatTile label="AI spend this month" value={formatCost(thisMonth.estimatedCost)} tone="green" />
                <StatTile label="AI spend today" value={formatCost(today.estimatedCost)} tone="amber" />
                <StatTile label="AI requests" value={formatNumber(summary.requests)} />
                <StatTile label="Input tokens" value={formatNumber(summary.inputTokens)} tone="slate" />
                <StatTile label="Output tokens" value={formatNumber(summary.outputTokens)} tone="slate" />
                <StatTile label="Total tokens" value={formatNumber(summary.totalTokens)} tone="slate" />
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                {[
                  { title: "Monthly budget", data: monthlyBudget },
                  { title: "Daily budget", data: dailyBudget },
                ].map((item) => (
                  <div key={item.title} className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="flex items-center justify-between gap-3">
                      <h4 className="font-semibold text-slate-950">{item.title}</h4>
                      <Badge variant={item.data.hardLimitReached ? "danger" : item.data.warningThresholds?.length ? "warning" : "success"}>
                        {Number(item.data.percent || 0).toFixed(1)}%
                      </Badge>
                    </div>
                    <p className="mt-3 text-sm text-slate-600">
                      {formatCost(item.data.spent)} / {formatCost(item.data.budget)} spent
                    </p>
                    <div className="mt-3 h-2 rounded-full bg-slate-100">
                      <div
                        className={cn(
                          "h-2 rounded-full",
                          item.data.hardLimitReached ? "bg-rose-500" : item.data.warningThresholds?.length ? "bg-amber-500" : "bg-emerald-500"
                        )}
                        style={{ width: `${Math.min(100, item.data.percent || 0)}%` }}
                      />
                    </div>
                    <p className="mt-2 text-sm text-slate-500">
                      Remaining: {formatCost(item.data.remaining)}
                    </p>
                  </div>
                ))}
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <h4 className="mb-3 font-semibold text-slate-950">AI Code Review Analytics</h4>
                <div className="grid gap-3 md:grid-cols-4">
                  <StatTile label="Total reviews" value={formatNumber(codeReviewAnalytics.totalReviews)} />
                  <StatTile label="Average score" value={codeReviewAnalytics.averageScore ?? "Not tracked"} tone="slate" />
                  <StatTile label="Estimated cost" value={formatCost(codeReviewAnalytics.estimatedCost)} tone="green" />
                  <StatTile label="Avg cost / review" value={formatCost(codeReviewAnalytics.averageCostPerReview)} tone="amber" />
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <h4 className="mb-3 flex items-center gap-2 font-semibold text-slate-950">
                    <Bot className="h-4 w-4 text-blue-600" aria-hidden="true" />
                    By feature
                  </h4>
                  {usage.byFeature?.length ? (
                    <div className="space-y-3">
                      {usage.byFeature.map((row) => (
                        <div key={row.feature} className="text-sm">
                          <div className="flex justify-between gap-3">
                            <span className="font-medium text-slate-700">{row.label}</span>
                            <span className="text-slate-500">{formatCost(row.estimatedCost)}</span>
                          </div>
                          <p className="mt-1 text-xs text-slate-500">
                            {formatNumber(row.requests)} requests - {formatNumber(row.totalTokens)} tokens - {Number(row.percentageOfCost || 0).toFixed(1)}%
                          </p>
                          <div className="mt-1 h-2 rounded-full bg-slate-100">
                            <div
                              className="h-2 rounded-full bg-blue-600"
                              style={{ width: `${Math.min(100, row.percentageOfCost || 0)}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyRows message="No feature usage for this range." />
                  )}
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h4 className="font-semibold text-slate-950">Project AI Usage</h4>
                    <select
                      value={projectSort}
                      onChange={(event) => setProjectSort(event.target.value)}
                      className="h-9 rounded-xl border border-slate-200 bg-white px-2 text-xs"
                    >
                      <option value="estimatedCost">Cost</option>
                      <option value="requests">Requests</option>
                      <option value="totalTokens">Tokens</option>
                    </select>
                  </div>
                  {sortedProjectUsage.length ? (
                    <div className="space-y-2 text-sm">
                      {sortedProjectUsage.map((row) => (
                        <div key={row._id || "none"} className="flex justify-between gap-3">
                          <span className="truncate text-slate-700">{row.name || row._id || "No project"}</span>
                          <span className="shrink-0 text-slate-500">
                            {formatNumber(row.requests)} - {formatNumber(row.totalTokens)} - {formatCost(row.estimatedCost)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyRows message="No project usage for this range." />
                  )}
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h4 className="font-semibold text-slate-950">Top AI Users</h4>
                    <select
                      value={userSort}
                      onChange={(event) => setUserSort(event.target.value)}
                      className="h-9 rounded-xl border border-slate-200 bg-white px-2 text-xs"
                    >
                      <option value="estimatedCost">Cost</option>
                      <option value="requests">Requests</option>
                      <option value="totalTokens">Tokens</option>
                    </select>
                  </div>
                  {sortedUserUsage.length ? (
                    <div className="space-y-2 text-sm">
                      {sortedUserUsage.map((row) => (
                        <div key={row._id || "none"} className="flex justify-between gap-3">
                          <span className="truncate text-slate-700">
                            {row.name || row._id || "Unknown user"} {row.role ? `(${row.role})` : ""}
                          </span>
                          <span className="shrink-0 text-slate-500">
                            {formatNumber(row.requests)} - {formatNumber(row.totalTokens)} - {formatCost(row.estimatedCost)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyRows message="No user usage for this range." />
                  )}
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </SettingsPanel>
  );
};

export default AISettings;
