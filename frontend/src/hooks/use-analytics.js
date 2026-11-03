import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import {
  fetchAnalyticsOverview,
  fetchAnalyticsIssues,
  fetchAnalyticsPriorities,
  fetchAnalyticsProjects,
  fetchAnalyticsRecentActivity,
  fetchAnalyticsTeams,
  fetchAnalyticsTrends,
  fetchDeveloperDashboardAnalytics,
  fetchQAMetrics,
  fetchDeveloperMetrics,
} from "@/lib/api";

const createAnalyticsFilters = (filters = {}) => ({
  dateFrom: filters.dateFrom || "",
  dateTo: filters.dateTo || "",
  projectId: filters.projectId || "all",
  teamId: filters.teamId || "all",
  assigneeId: filters.assigneeId || "all",
  status: filters.status || "all",
  statusGroup: filters.statusGroup || "all",
  priority: filters.priority || "all",
  priorityGroup: filters.priorityGroup || "all",
  type: filters.type || "all",
  excludeType: filters.excludeType || "all",
  sprintId: filters.sprintId || "all",
  epicId: filters.epicId || "all",
  developerId: filters.developerId || "all",
  testerId: filters.testerId || "all",
  severity: filters.severity || "all",
  search: filters.search || "",
});

export const analyticsQueryKeys = {
  root: ["analytics"],
  overview: (filters) => [...analyticsQueryKeys.root, "overview", filters],
  trends: (filters) => [...analyticsQueryKeys.root, "trends", filters],
  priorities: (filters) => [...analyticsQueryKeys.root, "priorities", filters],
  projects: (filters) => [...analyticsQueryKeys.root, "projects", filters],
  teams: (filters) => [...analyticsQueryKeys.root, "teams", filters],
  recentActivity: (filters) => [
    ...analyticsQueryKeys.root,
    "recent-activity",
    filters,
  ],
  issues: (filters) => [...analyticsQueryKeys.root, "issues", filters],
};

export const useAnalyticsOverview = (filters = {}, options = {}) => {
  const normalizedFilters = useMemo(() => createAnalyticsFilters(filters), [filters]);

  return useQuery({
    queryKey: analyticsQueryKeys.overview(normalizedFilters),
    queryFn: () => fetchAnalyticsOverview(normalizedFilters),
    staleTime: 30_000,
    ...options,
  });
};

const analyticsQueries = [
  {
    key: "overview",
    queryKey: analyticsQueryKeys.overview,
    queryFn: fetchAnalyticsOverview,
  },
  {
    key: "trends",
    queryKey: analyticsQueryKeys.trends,
    queryFn: fetchAnalyticsTrends,
  },
  {
    key: "priorities",
    queryKey: analyticsQueryKeys.priorities,
    queryFn: fetchAnalyticsPriorities,
  },
  {
    key: "projects",
    queryKey: analyticsQueryKeys.projects,
    queryFn: fetchAnalyticsProjects,
  },
  {
    key: "teams",
    queryKey: analyticsQueryKeys.teams,
    queryFn: fetchAnalyticsTeams,
  },
  {
    key: "recentActivity",
    queryKey: analyticsQueryKeys.recentActivity,
    queryFn: fetchAnalyticsRecentActivity,
  },
  {
    key: "issues",
    queryKey: analyticsQueryKeys.issues,
    queryFn: fetchAnalyticsIssues,
    optional: true,
  },
];

export const useDeveloperDashboard = (filters = {}, options = {}) => {
  const normalizedFilters = useMemo(() => createAnalyticsFilters(filters), [filters]);

  return useQuery({
    queryKey: ["developer-dashboard", normalizedFilters],
    queryFn: () => fetchDeveloperDashboardAnalytics(normalizedFilters),
    staleTime: 30_000,
    ...options,
  });
};

export const useQAMetrics = (filters = {}, options = {}) => {
  const { cacheScope, ...queryOptions } = options;
  const normalizedFilters = useMemo(() => createAnalyticsFilters(filters), [filters]);
  return useQuery({
    queryKey: cacheScope
      ? [...analyticsQueryKeys.root, "qa-metrics", cacheScope, normalizedFilters]
      : [...analyticsQueryKeys.root, "qa-metrics", normalizedFilters],
    queryFn: ({ signal }) => fetchQAMetrics(normalizedFilters, signal),
    staleTime: 30_000,
    ...queryOptions,
  });
};

export const useDeveloperMetrics = (filters = {}, options = {}) => {
  const { cacheScope, ...queryOptions } = options;
  const normalizedFilters = useMemo(() => createAnalyticsFilters(filters), [filters]);
  return useQuery({
    queryKey: cacheScope
      ? [...analyticsQueryKeys.root, "developer-metrics", cacheScope, normalizedFilters]
      : [...analyticsQueryKeys.root, "developer-metrics", normalizedFilters],
    queryFn: ({ signal }) => fetchDeveloperMetrics(normalizedFilters, signal),
    staleTime: 30_000,
    ...queryOptions,
  });
};

export const useAnalyticsIssues = (filters = {}, options = {}) => {
  const { cacheScope, ...queryOptions } = options;
  const normalizedFilters = useMemo(() => createAnalyticsFilters(filters), [filters]);

  return useQuery({
    queryKey: cacheScope
      ? [...analyticsQueryKeys.root, "issues", cacheScope, normalizedFilters]
      : analyticsQueryKeys.issues(normalizedFilters),
    queryFn: ({ signal }) => fetchAnalyticsIssues(normalizedFilters, signal),
    staleTime: 5 * 60_000,
    ...queryOptions,
  });
};

export const useAnalytics = (filters = {}, options = {}) => {
  const normalizedFilters = useMemo(() => createAnalyticsFilters(filters), [filters]);
  const results = useQueries({
    queries: analyticsQueries.map((query) => ({
      queryKey: query.queryKey(normalizedFilters),
      queryFn: () => query.queryFn(normalizedFilters),
      staleTime: 30_000,
      refetchInterval: options.refetchInterval,
      refetchIntervalInBackground: options.refetchIntervalInBackground,
      enabled:
        (options.enabled ?? true) &&
        (!query.optional || Boolean(options.includeIssues)),
    })),
  });

  return analyticsQueries.reduce(
    (analytics, query, index) => {
      const result = results[index];

      analytics[query.key] = result.data;
      analytics.isLoading = analytics.isLoading || result.isLoading;
      analytics.isFetching = analytics.isFetching || result.isFetching;
      analytics.error = analytics.error || result.error;
      analytics.results[query.key] = result;

      return analytics;
    },
    {
      filters: normalizedFilters,
      overview: null,
      trends: null,
      priorities: null,
      projects: null,
      teams: null,
      recentActivity: null,
      issues: null,
      isLoading: false,
      isFetching: false,
      error: null,
      results: {},
    }
  );
};

export default useAnalytics;
