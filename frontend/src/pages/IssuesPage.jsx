import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  createIssue,
  deleteIssue,
  fetchEpics,
  fetchIssues,
  fetchProjects,
  fetchSprints,
  updateIssue,
  uploadIssueAttachment,
} from "@/lib/api";
import {
  ISSUE_TYPES,
  ISSUE_STATUS,
  filterIssues,
  getIssueDisplayKey,
  getIssueStatusLabel,
  getIssueWorkflowLane,
  normalizeIssueFilterAlias,
  sortIssues,
} from "@/lib/issues";
import {
  findProjectById,
  getProjectMembers,
  getProjectTeamMembers,
  getProjectTeams,
  resolveTeamId,
  resolveUserId,
} from "@/lib/project-teams";
import IssueBoard from "@/components/issues/IssueBoard";
import IssueCreateDialog from "@/components/issues/IssueCreateDialog";
import IssueDetailsDialog from "@/components/issues/IssueDetailsDialog";
import IssuesToolbar from "@/components/issues/IssuesToolbar";
import EmptyState from "@/components/shared/EmptyState";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { canCreateIssues, canDeleteIssues, hasAdminPanelAccess } from "@/lib/roles";

const WORK_ITEM_TYPE_OPTIONS = [ISSUE_TYPES.TASK];
const isValidWorkItemType = (value) => WORK_ITEM_TYPE_OPTIONS.includes(value);
const ALL_PROJECTS_VALUE = "ALL";
const HIGH_PRIORITY_QUERY_VALUE = "high";

const normalizeStatusFilterValue = (value) => {
  if (!value) {
    return "";
  }

  const normalizedValue = String(value).trim().toUpperCase();

  if (Object.values(ISSUE_STATUS).includes(normalizedValue)) {
    return normalizedValue;
  }

  return "";
};

const normalizeStatusGroupFilterValue = (value) => {
  const normalizedValue = String(value || "").trim().toLowerCase();

  return ["open", "closed"].includes(normalizedValue) ? normalizedValue : "";
};

const normalizePriorityFilterValue = (value) => {
  const normalizedValue = String(value || "").trim();

  return ["Critical", "High", "Medium", "Low"].includes(normalizedValue)
    ? normalizedValue
    : "all";
};

const normalizePriorityGroupFilterValue = (value) => {
  const normalizedValue = String(value || "").trim().toLowerCase();

  return normalizedValue === HIGH_PRIORITY_QUERY_VALUE ? HIGH_PRIORITY_QUERY_VALUE : "";
};

const normalizeProjectFilterValue = (value) => {
  if (!value) {
    return ALL_PROJECTS_VALUE;
  }

  return String(value).toLowerCase() === "all" ? ALL_PROJECTS_VALUE : String(value);
};

const sanitizeComposeParams = (searchParams, setSearchParams) => {
  const nextParams = new URLSearchParams(searchParams);
  nextParams.delete("compose");
  nextParams.delete("type");
  setSearchParams(nextParams, { replace: true });
};

const getAvailableTeams = (projects = [], projectId = ALL_PROJECTS_VALUE) => {
  if (projectId !== ALL_PROJECTS_VALUE) {
    return getProjectTeams(findProjectById(projects, projectId));
  }

  const uniqueTeams = new Map();

  projects.forEach((project) => {
    getProjectTeams(project).forEach((team) => {
      const teamId = resolveTeamId(team);

      if (!teamId || uniqueTeams.has(teamId)) {
        return;
      }

      uniqueTeams.set(teamId, team);
    });
  });

  return Array.from(uniqueTeams.values()).sort((left, right) =>
    (left.name || "").localeCompare(right.name || "")
  );
};

const getAvailableAssignees = (
  projects = [],
  projectId = ALL_PROJECTS_VALUE,
  teamId = "all"
) => {
  const uniqueAssignees = new Map();
  const collectAssignees = (assignees = []) => {
    assignees.forEach((assignee) => {
      const assigneeId = resolveUserId(assignee);

      if (!assigneeId || uniqueAssignees.has(assigneeId)) {
        return;
      }

      uniqueAssignees.set(assigneeId, assignee);
    });
  };

  if (projectId !== ALL_PROJECTS_VALUE) {
    const project = findProjectById(projects, projectId);
    collectAssignees(
      teamId !== "all"
        ? getProjectTeamMembers(project, teamId)
        : getProjectMembers(project)
    );

    return Array.from(uniqueAssignees.values()).sort((left, right) =>
      (left.name || "").localeCompare(right.name || "")
    );
  }

  projects.forEach((project) => {
    collectAssignees(
      teamId !== "all"
        ? getProjectTeamMembers(project, teamId)
        : getProjectMembers(project)
    );
  });

  return Array.from(uniqueAssignees.values()).sort((left, right) =>
    (left.name || "").localeCompare(right.name || "")
  );
};

const buildIssueListCacheFilters = (queryKey = []) => ({
  search: queryKey[10] || "",
  status: queryKey[11] || "all",
  statusGroup: queryKey[12] || "all",
  priority: queryKey[13] || "all",
  priorityGroup: queryKey[14] || "all",
  projectId: queryKey[4] || ALL_PROJECTS_VALUE,
  teamId: queryKey[5] || "all",
  epicId: queryKey[6] || "all",
  sprintId: queryKey[7] || "all",
  assigneeId: queryKey[8] || "all",
  type: queryKey[9] || "all",
  dateFrom: queryKey[15] || "",
  dateTo: queryKey[16] || "",
  filter: queryKey[17] || "all",
});

const IssueBoardSkeleton = () => (
  <Card className="overflow-hidden border-white/70 bg-white/92 shadow-[0_18px_50px_-34px_rgba(15,23,42,0.45)] backdrop-blur">
    <CardContent className="grid gap-4 p-4 xl:grid-cols-3">
      {Array.from({ length: 3 }, (_, index) => (
        <div
          key={`issue-column-skeleton-${index}`}
          className="rounded-[28px] border border-slate-200 bg-slate-50/80 p-4"
        >
          <div className="space-y-3">
            <Skeleton className="h-6 w-32 rounded-full" />
            <Skeleton className="h-40 w-full rounded-[24px]" />
            <Skeleton className="h-40 w-full rounded-[24px]" />
          </div>
        </div>
      ))}
    </CardContent>
  </Card>
);

const IssuesPage = () => {
  const queryClient = useQueryClient();
  const { role } = useAuth();
  const navigate = useNavigate();
  const { issueId: routeIssueId = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialFilterAlias = normalizeIssueFilterAlias(
    searchParams.get("filter") || searchParams.get("status")
  );
  const [filters, setFilters] = useState({
    projectId: normalizeProjectFilterValue(searchParams.get("projectId")),
    teamId: searchParams.get("teamId") || "all",
    epicId: searchParams.get("epicId") || "all",
    sprintId: searchParams.get("sprintId") || "all",
    assigneeId: searchParams.get("assigneeId") || "all",
    type: ISSUE_TYPES.TASK,
    status: normalizeStatusFilterValue(searchParams.get("status")) || "all",
    statusGroup:
      initialFilterAlias === "open" || initialFilterAlias === "closed"
        ? initialFilterAlias
        : normalizeStatusGroupFilterValue(searchParams.get("statusGroup")) || "all",
    priority: normalizePriorityFilterValue(searchParams.get("priority")),
    priorityGroup:
      normalizePriorityGroupFilterValue(searchParams.get("priorityGroup")) || "all",
    dateFrom: searchParams.get("dateFrom") || "",
    dateTo: searchParams.get("dateTo") || "",
    filter: initialFilterAlias || "all",
    search: searchParams.get("search") || "",
  });
  const [selectedIssue, setSelectedIssue] = useState(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const deferredSearch = useDeferredValue(filters.search);
  const isAdminView = hasAdminPanelAccess(role);
  const canCreateIssue = canCreateIssues(role);
  const canDeleteIssue = canDeleteIssues(role);

  const {
    data: projectsData = [],
    isLoading: isProjectsLoading,
    error: projectsError,
  } = useQuery({
    queryKey: ["projects"],
    queryFn: fetchProjects,
  });
  const projects = useMemo(
    () => (Array.isArray(projectsData) ? projectsData : []),
    [projectsData]
  );

  useEffect(() => {
    if (!projects.length) {
      return;
    }

    setFilters((current) => {
      const requestedProjectId = normalizeProjectFilterValue(
        searchParams.get("projectId") || current.projectId
      );
      const nextProject =
        requestedProjectId === ALL_PROJECTS_VALUE
          ? null
          : findProjectById(projects, requestedProjectId);
      const nextProjectId = nextProject?._id || ALL_PROJECTS_VALUE;
      const requestedTeamId = searchParams.get("teamId") || current.teamId;
      const nextAvailableTeams = getAvailableTeams(projects, nextProjectId);
      const nextTeamId = nextAvailableTeams.some(
        (team) => resolveTeamId(team) === String(requestedTeamId)
      )
        ? String(requestedTeamId)
        : "all";
      const nextEpicId = searchParams.get("epicId") || current.epicId || "all";
      const nextSprintId = searchParams.get("sprintId") || current.sprintId || "all";
      const nextSearch = searchParams.get("search") || current.search;
      const requestedAssigneeId = searchParams.get("assigneeId") || current.assigneeId;
      const nextStatus = normalizeStatusFilterValue(searchParams.get("status")) || "all";
      const nextFilterAlias = normalizeIssueFilterAlias(
        searchParams.get("filter") || searchParams.get("status")
      );
      const nextStatusGroup =
        nextFilterAlias === "open" || nextFilterAlias === "closed"
          ? nextFilterAlias
          : normalizeStatusGroupFilterValue(searchParams.get("statusGroup")) || "all";
      const nextPriority = normalizePriorityFilterValue(searchParams.get("priority"));
      const nextPriorityGroup =
        normalizePriorityGroupFilterValue(searchParams.get("priorityGroup")) || "all";
      const nextDateFrom = searchParams.get("dateFrom") || "";
      const nextDateTo = searchParams.get("dateTo") || "";

      if (
        current.projectId === nextProjectId &&
        current.teamId === nextTeamId &&
        current.epicId === nextEpicId &&
        current.sprintId === nextSprintId &&
        current.assigneeId === requestedAssigneeId &&
        current.status === nextStatus &&
        current.statusGroup === nextStatusGroup &&
        current.priority === nextPriority &&
        current.priorityGroup === nextPriorityGroup &&
        current.dateFrom === nextDateFrom &&
        current.dateTo === nextDateTo &&
        current.filter === (nextFilterAlias || "all") &&
        current.search === nextSearch
      ) {
        return current;
      }

      return {
        projectId: nextProjectId,
        teamId: nextTeamId,
        epicId: nextEpicId,
        sprintId: nextSprintId,
        assigneeId: requestedAssigneeId,
        type: current.type,
        status: nextStatus,
        statusGroup: nextStatusGroup,
        priority: nextPriority,
        priorityGroup: nextPriorityGroup,
        dateFrom: nextDateFrom,
        dateTo: nextDateTo,
        filter: nextFilterAlias || "all",
        search: nextSearch,
      };
    });
  }, [projects, searchParams]);

  useEffect(() => {
    if (searchParams.get("compose") !== "1") {
      return;
    }

    if (!canCreateIssue) {
      sanitizeComposeParams(searchParams, setSearchParams);
      setIsCreateDialogOpen(false);
      return;
    }

    if (projects.length) {
      setIsCreateDialogOpen(true);
    }
  }, [canCreateIssue, projects.length, searchParams, setSearchParams]);

  const selectedProject = useMemo(
    () => findProjectById(projects, filters.projectId),
    [filters.projectId, projects]
  );
  const selectedProjectId =
    selectedProject && filters.projectId !== ALL_PROJECTS_VALUE ? selectedProject._id : "";
  const {
    data: selectedProjectEpicsData = [],
    isFetched: areSelectedProjectEpicsFetched,
  } = useQuery({
    queryKey: ["project-epics", selectedProjectId],
    queryFn: () => fetchEpics({ projectId: selectedProjectId }),
    enabled: Boolean(selectedProjectId),
  });
  const {
    data: selectedProjectSprintsData = [],
    isFetched: areSelectedProjectSprintsFetched,
  } = useQuery({
    queryKey: ["project-sprints", selectedProjectId],
    queryFn: () => fetchSprints({ projectId: selectedProjectId }),
    enabled: Boolean(selectedProjectId),
  });
  const availableEpics = useMemo(
    () =>
      (Array.isArray(selectedProjectEpicsData) ? selectedProjectEpicsData : []).filter(
        (epic) => String(epic?.status || "ACTIVE") !== "ARCHIVED"
      ),
    [selectedProjectEpicsData]
  );
  const availableSprints = useMemo(
    () =>
      (Array.isArray(selectedProjectSprintsData) ? selectedProjectSprintsData : [])
        .filter((sprint) => ["ACTIVE", "PLANNED"].includes(String(sprint?.state || "")))
        .sort((left, right) => {
          const stateDelta =
            (left.state === "ACTIVE" ? 0 : 1) - (right.state === "ACTIVE" ? 0 : 1);

          if (stateDelta !== 0) {
            return stateDelta;
          }

          return new Date(left.startDate || left.createdAt || 0) -
            new Date(right.startDate || right.createdAt || 0);
        }),
    [selectedProjectSprintsData]
  );
  const availableTeams = useMemo(
    () => getAvailableTeams(projects, filters.projectId),
    [filters.projectId, projects]
  );
  const availableAssignees = useMemo(
    () => getAvailableAssignees(projects, filters.projectId, filters.teamId),
    [filters.projectId, filters.teamId, projects]
  );

  useEffect(() => {
    if (
      filters.assigneeId === "all" ||
      availableAssignees.some(
        (assignee) => resolveUserId(assignee) === String(filters.assigneeId)
      )
    ) {
      return;
    }

    setFilters((current) => ({
      ...current,
      assigneeId: "all",
    }));
  }, [availableAssignees, filters.assigneeId]);

  useEffect(() => {
    if (selectedProjectId && !areSelectedProjectEpicsFetched) {
      return;
    }

    if (
      filters.epicId === "all" ||
      filters.epicId === "unassigned" ||
      availableEpics.some((epic) => String(epic._id) === String(filters.epicId))
    ) {
      return;
    }

    setFilters((current) => ({
      ...current,
      epicId: "all",
    }));
  }, [areSelectedProjectEpicsFetched, availableEpics, filters.epicId, selectedProjectId]);

  useEffect(() => {
    if (selectedProjectId && !areSelectedProjectSprintsFetched) {
      return;
    }

    if (
      filters.sprintId === "all" ||
      filters.sprintId === "backlog" ||
      availableSprints.some((sprint) => String(sprint._id) === String(filters.sprintId))
    ) {
      return;
    }

    setFilters((current) => ({
      ...current,
      sprintId: "all",
    }));
  }, [
    areSelectedProjectSprintsFetched,
    availableSprints,
    filters.sprintId,
    selectedProjectId,
  ]);

  const {
    data: issuesData = [],
    isLoading: isIssuesLoading,
    error: issuesError,
  } = useQuery({
    queryKey: [
      "issues",
      "issues-page",
      "list",
      role,
      filters.projectId,
      filters.teamId,
      filters.epicId,
      filters.sprintId,
      filters.assigneeId,
      filters.type,
      deferredSearch,
      filters.status,
      filters.statusGroup,
      filters.priority,
      filters.priorityGroup,
      filters.dateFrom,
      filters.dateTo,
      filters.filter,
    ],
    queryFn: () =>
      fetchIssues({
        projectId:
          filters.projectId === ALL_PROJECTS_VALUE ? "" : filters.projectId,
        teamId: filters.teamId,
        epicId: filters.epicId,
        sprintId: filters.sprintId,
        assigneeId: filters.assigneeId,
        type: filters.type,
        excludeType: ISSUE_TYPES.BUG,
        status: filters.status,
        statusGroup: filters.statusGroup,
        priority: filters.priority,
        priorityGroup: filters.priorityGroup,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        filter: filters.filter,
        search: deferredSearch,
      }),
    enabled: Boolean(projects.length),
  });
  const issues = useMemo(
    () => (Array.isArray(issuesData) ? issuesData : []),
    [issuesData]
  );

  const filteredIssues = useMemo(() => sortIssues(issues, "newest"), [issues]);

  const visibleBoardColumnKeys = useMemo(() => {
    if (filters.status && filters.status !== "all") {
      return [getIssueWorkflowLane(filters.status)];
    }

    if (filters.statusGroup === "closed" || filters.filter === "closed") {
      return [ISSUE_STATUS.DONE];
    }

    if (filters.statusGroup === "open" || filters.filter === "open") {
      return [ISSUE_STATUS.TODO, ISSUE_STATUS.IN_PROGRESS];
    }

    return [];
  }, [filters.filter, filters.status, filters.statusGroup]);

  const activeStatusLabel = useMemo(() => {
    if (filters.statusGroup === "open") {
      return "Showing: Open / In Progress / Reopened / Pending / To Do";
    }

    if (filters.statusGroup === "closed") {
      return "Showing: Closed / Resolved / Done";
    }

    if (filters.status && filters.status !== "all") {
      return `Showing: ${getIssueStatusLabel(filters.status)}`;
    }

    if (filters.priorityGroup === HIGH_PRIORITY_QUERY_VALUE) {
      return "Showing: High / Critical / Urgent priority";
    }

    if (filters.priority && filters.priority !== "all") {
      return `Showing: ${filters.priority} priority`;
    }

    return "";
  }, [filters.priority, filters.priorityGroup, filters.status, filters.statusGroup]);

  const { data: dependencyIssuesData = [] } = useQuery({
    queryKey: ["issues", "issues-page", "dependency-options", role],
    queryFn: () => fetchIssues({ excludeType: ISSUE_TYPES.BUG }),
    enabled:
      Boolean(projects.length) &&
      Boolean(isCreateDialogOpen || (isAdminView && selectedIssue)),
  });
  const dependencyIssues = useMemo(
    () => (Array.isArray(dependencyIssuesData) ? dependencyIssuesData : []),
    [dependencyIssuesData]
  );

  useEffect(() => {
    if (!selectedIssue) {
      return;
    }

    const nextIssue = issues.find((issue) => issue._id === selectedIssue._id);
    setSelectedIssue(nextIssue || null);
  }, [issues, selectedIssue]);

  useEffect(() => {
    if (!routeIssueId || isIssuesLoading) {
      return;
    }

    const routedIssue = issues.find(
      (issue) =>
        String(issue._id) === String(routeIssueId) ||
        getIssueDisplayKey(issue).toLowerCase() ===
          String(routeIssueId).trim().toLowerCase()
    );

    if (routedIssue && String(selectedIssue?._id || "") !== String(routedIssue._id)) {
      setSelectedIssue(routedIssue);
    }
  }, [isIssuesLoading, issues, routeIssueId, selectedIssue?._id]);

  const syncIssueDependencyOptions = (issue, mode = "upsert") => {
    queryClient.setQueryData(["issues", "issues-page", "dependency-options", role], (current) => {
      if (!Array.isArray(current)) {
        return current;
      }

      if (mode === "remove") {
        return current.filter((currentIssue) => String(currentIssue._id) !== String(issue));
      }

      return sortIssues(
        [
          issue,
          ...current.filter((currentIssue) => String(currentIssue._id) !== String(issue._id)),
        ],
        "newest"
      );
    });
  };

  const syncIssueWorkspaceLists = (issue, mode = "upsert") => {
    queryClient
      .getQueriesData({
        queryKey: ["issues", "issues-page", "list"],
      })
      .forEach(([queryKey, currentData]) => {
        if (!Array.isArray(currentData)) {
          return;
        }

        const cacheFilters = buildIssueListCacheFilters(queryKey);
        const nextIssues = currentData.filter(
          (currentIssue) => String(currentIssue._id) !== String(issue?._id || issue)
        );

        if (mode === "remove") {
          queryClient.setQueryData(queryKey, nextIssues);
          return;
        }

        const shouldInclude = filterIssues([issue], cacheFilters).length > 0;
        queryClient.setQueryData(
          queryKey,
          shouldInclude ? sortIssues([issue, ...nextIssues], "newest") : nextIssues
        );
      });
  };

  const invalidateIssueWorkspaceQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["issues"] }),
      queryClient.invalidateQueries({ queryKey: ["backlog"] }),
      queryClient.invalidateQueries({ queryKey: ["projects"] }),
      queryClient.invalidateQueries({ queryKey: ["reports"] }),
      queryClient.invalidateQueries({ queryKey: ["analytics"] }),
    ]);
  };

  const createIssueMutation = useMutation({
    mutationFn: createIssue,
    onSuccess: async (createdIssue) => {
      syncIssueWorkspaceLists(createdIssue);
      syncIssueDependencyOptions(createdIssue);
      await invalidateIssueWorkspaceQueries();
    },
  });

  const updateIssueMutation = useMutation({
    mutationFn: updateIssue,
    onSuccess: async (updatedIssue) => {
      syncIssueWorkspaceLists(updatedIssue);
      syncIssueDependencyOptions(updatedIssue);
      await invalidateIssueWorkspaceQueries();
    },
  });

  const deleteIssueMutation = useMutation({
    mutationFn: deleteIssue,
    onSuccess: async (_response, deletedIssueId) => {
      syncIssueWorkspaceLists(deletedIssueId, "remove");
      syncIssueDependencyOptions(deletedIssueId, "remove");
      setSelectedIssue((current) =>
        String(current?._id || "") === String(deletedIssueId) ? null : current
      );
      await invalidateIssueWorkspaceQueries();
    },
  });

  const handleProjectChange = (projectId) => {
    const nextProjectId = normalizeProjectFilterValue(projectId);

    setFilters((current) => {
      const nextAvailableTeams = getAvailableTeams(projects, nextProjectId);
      const nextTeamId = nextAvailableTeams.some(
        (team) => resolveTeamId(team) === String(current.teamId)
      )
        ? current.teamId
        : "all";
      const nextAvailableAssignees = getAvailableAssignees(
        projects,
        nextProjectId,
        nextTeamId
      );

      return {
        ...current,
        projectId: nextProjectId,
        teamId: nextTeamId,
        epicId: "all",
        sprintId: "all",
        assigneeId: nextAvailableAssignees.some(
          (assignee) => resolveUserId(assignee) === String(current.assigneeId)
        )
          ? current.assigneeId
          : "all",
      };
    });
  };

  const handleTeamChange = (teamId) => {
    const nextAvailableAssignees = getAvailableAssignees(
      projects,
      filters.projectId,
      teamId
    );

    setFilters((current) => ({
      ...current,
      teamId,
      sprintId: "all",
      assigneeId: nextAvailableAssignees.some(
        (assignee) => resolveUserId(assignee) === String(current.assigneeId)
      )
        ? current.assigneeId
        : "all",
    }));
  };

  const handleAssigneeChange = (assigneeId) => {
    setFilters((current) => ({
      ...current,
      assigneeId,
    }));
  };

  const handleEpicChange = (epicId) => {
    setFilters((current) => ({
      ...current,
      epicId,
    }));
  };

  const handleSprintChange = (sprintId) => {
    setFilters((current) => ({
      ...current,
      sprintId,
    }));
  };

  const handleTypeChange = (type) => {
    setFilters((current) => ({
      ...current,
      type,
    }));
  };

  const handleSearchChange = (search) => {
    setFilters((current) => ({
      ...current,
      search,
    }));
  };

  const error = projectsError || issuesError;
  const composeType = isValidWorkItemType(searchParams.get("type"))
    ? searchParams.get("type")
    : "Task";
  const lockComposeType = isValidWorkItemType(searchParams.get("type"));
  const hasVisibleFilters = Boolean(
    filters.status !== "all" ||
      filters.statusGroup !== "all" ||
      filters.priority !== "all" ||
      filters.priorityGroup !== "all" ||
      filters.dateFrom ||
      filters.dateTo ||
      filters.projectId !== ALL_PROJECTS_VALUE ||
      filters.teamId !== "all" ||
      filters.epicId !== "all" ||
      filters.sprintId !== "all" ||
      filters.assigneeId !== "all" ||
      filters.type !== "all" ||
      filters.search.trim()
  );

  if (error) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-rose-700">
          {error.response?.data?.message || "Unable to load the issue workspace."}
        </CardContent>
      </Card>
    );
  }

  if (!isProjectsLoading && !projects.length) {
    return (
      <EmptyState
        title="Create a project before planning work"
        description="Projects and attached teams define who can own delivery work. Add a project first, then attach a team to start managing issues and backlog items."
      />
    );
  }

  return (
    <div className="space-y-4">
      <IssuesToolbar
        filters={filters}
        projects={projects}
        teams={availableTeams}
        epics={availableEpics}
        sprints={availableSprints}
        assignees={availableAssignees}
        issueTypes={WORK_ITEM_TYPE_OPTIONS}
        visibleIssueCount={filteredIssues.length}
        activeStatusLabel={activeStatusLabel}
        selectedProject={selectedProject}
        canCreateIssue={canCreateIssue}
        isCreateDisabled={!projects.length || !canCreateIssue}
        onProjectChange={handleProjectChange}
        onTeamChange={handleTeamChange}
        onEpicChange={handleEpicChange}
        onSprintChange={handleSprintChange}
        onAssigneeChange={handleAssigneeChange}
        onTypeChange={handleTypeChange}
        onSearchChange={handleSearchChange}
        onCreateIssue={() => setIsCreateDialogOpen(true)}
      />

      {isProjectsLoading || isIssuesLoading ? (
        <IssueBoardSkeleton />
      ) : (
        <IssueBoard
          issues={filteredIssues}
          visibleColumnKeys={visibleBoardColumnKeys}
          updatingId={updateIssueMutation.isPending ? updateIssueMutation.variables?.id : ""}
          canEditIssue={isAdminView}
          canChangeStatus
          onSelectIssue={setSelectedIssue}
          onStatusChange={(id, status) =>
            updateIssueMutation.mutateAsync({
              id,
              payload: { status },
            })
          }
          emptyStateTitle={
            hasVisibleFilters ? "No work items match this view" : "No work items in this board"
          }
          emptyStateDescription={
            hasVisibleFilters
              ? "Adjust the project, team, assignee, type, or search filters to widen the board."
              : "Create the first work item to populate this workflow board."
          }
        />
      )}

      <IssueCreateDialog
        open={canCreateIssue && isCreateDialogOpen}
        onOpenChange={(open) => {
          setIsCreateDialogOpen(open);

          if (!open && searchParams.get("compose") === "1") {
            sanitizeComposeParams(searchParams, setSearchParams);
          }
        }}
        projects={projects}
        availableIssues={dependencyIssues}
        defaultProjectId={
          filters.projectId === ALL_PROJECTS_VALUE ? "" : filters.projectId
        }
        defaultTeamId={filters.teamId !== "all" ? filters.teamId : ""}
        defaultType={composeType}
        allowedTypes={WORK_ITEM_TYPE_OPTIONS}
        lockType={lockComposeType}
        isPending={createIssueMutation.isPending}
        onSubmit={async (payload) => {
          const createdIssue = await createIssueMutation.mutateAsync(payload);
          setIsCreateDialogOpen(false);
          sanitizeComposeParams(searchParams, setSearchParams);
          return createdIssue;
        }}
        onUploadAttachment={uploadIssueAttachment}
      />

      <IssueDetailsDialog
        issue={selectedIssue}
        open={Boolean(selectedIssue)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedIssue(null);

            if (routeIssueId) {
              navigate("/issues", { replace: true });
            }
          }
        }}
        projects={projects}
        availableIssues={dependencyIssues}
        onUpdateIssue={(id, payload) =>
          updateIssueMutation.mutateAsync({ id, payload })
        }
        onDeleteIssue={(id) => deleteIssueMutation.mutateAsync(id)}
        updatingId={updateIssueMutation.isPending ? updateIssueMutation.variables?.id : ""}
        deletingId={deleteIssueMutation.isPending ? deleteIssueMutation.variables : ""}
        canEditCoreDetails={isAdminView}
        canEditPriority={isAdminView}
        canEditAssignee={isAdminView}
        canDeleteIssue={canDeleteIssue}
      />
    </div>
  );
};

export default IssuesPage;
