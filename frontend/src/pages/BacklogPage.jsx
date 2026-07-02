import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Flag, FolderKanban, Layers3 } from "lucide-react";
import {
  completeSprint,
  createEpic,
  createSprint,
  deleteEpic,
  deleteSprint,
  fetchBacklogBoard,
  fetchProjects,
  reorderIssuePlanning,
  startSprint,
  updateEpic,
  updateIssue,
  updateIssuePlanning,
  updateSprint,
} from "@/lib/api";
import {
  findProjectById,
  getProjectMembers,
  getProjectTeams,
  resolveTeamId,
} from "@/lib/project-teams";
import BacklogToolbar from "@/components/backlog/BacklogToolbar";
import EpicDialog from "@/components/backlog/EpicDialog";
import IssueDetailsDrawer from "@/components/backlog/IssueDetailsDrawer";
import IssuePlanningCard from "@/components/backlog/IssuePlanningCard";
import SprintCompletionDialog from "@/components/backlog/SprintCompletionDialog";
import SprintDialog from "@/components/backlog/SprintDialog";
import SprintSection from "@/components/backlog/SprintSection";
import EmptyState from "@/components/shared/EmptyState";
import ToastNotice from "@/components/shared/ToastNotice";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const BACKLOG_PROJECT_FILTER_STORAGE_KEY = "pirnav.backlog.projectId";

const readStoredBacklogProjectId = () => {
  if (typeof window === "undefined") {
    return "";
  }

  return window.localStorage.getItem(BACKLOG_PROJECT_FILTER_STORAGE_KEY) || "";
};

const persistBacklogProjectId = (projectId) => {
  if (typeof window === "undefined") {
    return;
  }

  if (projectId) {
    window.localStorage.setItem(BACKLOG_PROJECT_FILTER_STORAGE_KEY, String(projectId));
    return;
  }

  window.localStorage.removeItem(BACKLOG_PROJECT_FILTER_STORAGE_KEY);
};

const createDefaultFilters = () => ({
  projectId: readStoredBacklogProjectId(),
  teamId: "all",
  assigneeId: "all",
  epicId: "all",
  sprintId: "all",
  priority: "all",
  status: "all",
  search: "",
  dateFrom: "",
  dateTo: "",
  includeCompletedSprints: false,
});

const BACKLOG_PLANNING_TYPE_KEYS = new Set(["STORY"]);

const normalizeBacklogIssueType = (value = "") =>
  String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");

const isBacklogPlanningIssue = (issue) =>
  BACKLOG_PLANNING_TYPE_KEYS.has(normalizeBacklogIssueType(issue?.type));

const createBoardState = (data) => ({
  backlogIssues: Array.isArray(data?.backlogIssues)
    ? data.backlogIssues.filter(isBacklogPlanningIssue)
    : [],
  sprintSections: Array.isArray(data?.sprintSections)
    ? data.sprintSections.map((section) => ({
        ...section,
        issues: Array.isArray(section?.issues)
          ? section.issues.filter(isBacklogPlanningIssue)
          : [],
      }))
    : [],
});

const sortByCreatedAt = (left, right) =>
  new Date(left?.createdAt || 0).getTime() - new Date(right?.createdAt || 0).getTime();

const sortEpicsByPlanning = (epics = []) =>
  [...epics].sort((left, right) => {
    const planningDelta = Number(left?.planningOrder || 0) - Number(right?.planningOrder || 0);

    if (planningDelta !== 0) {
      return planningDelta;
    }

    return sortByCreatedAt(left, right);
  });

const resolveBacklogEpicId = (value) => String(value?._id || value || "");
const resolveBacklogAssigneeId = (issue) =>
  String(issue?.assigneeId || issue?.assignee?._id || issue?.assignee || "");
const resolveBacklogTeamId = (issue) => String(issue?.teamId?._id || issue?.teamId || "");

const issueMatchesBacklogFilters = (issue, filters) => {
  if (!issue) {
    return false;
  }

  if (!isBacklogPlanningIssue(issue)) {
    return false;
  }

  if (filters.teamId !== "all" && resolveBacklogTeamId(issue) !== String(filters.teamId)) {
    return false;
  }

  if (
    filters.assigneeId !== "all" &&
    resolveBacklogAssigneeId(issue) !== String(filters.assigneeId)
  ) {
    return false;
  }

  const sprintId = String(issue?.sprintId?._id || issue?.sprintId || "");

  if (filters.sprintId === "backlog" && sprintId) {
    return false;
  }

  if (
    filters.sprintId !== "all" &&
    filters.sprintId !== "backlog" &&
    sprintId !== String(filters.sprintId)
  ) {
    return false;
  }

  if (filters.priority !== "all" && issue.priority !== filters.priority) {
    return false;
  }

  if (filters.status !== "all" && issue.status !== filters.status) {
    return false;
  }

  if (filters.epicId === "unassigned" && resolveBacklogEpicId(issue?.epicId)) {
    return false;
  }

  if (
    filters.epicId !== "all" &&
    filters.epicId !== "unassigned" &&
    resolveBacklogEpicId(issue?.epicId) !== String(filters.epicId)
  ) {
    return false;
  }

  const searchTerm = filters.search?.trim().toLowerCase() || "";

  if (searchTerm) {
    const searchableFields = [issue.title, issue.description]
      .filter(Boolean)
      .map((value) => String(value).toLowerCase());

    if (!searchableFields.some((value) => value.includes(searchTerm))) {
      return false;
    }
  }

  const createdAt = issue?.createdAt ? new Date(issue.createdAt) : null;

  if (filters.dateFrom && createdAt) {
    const dateFrom = new Date(filters.dateFrom);
    dateFrom.setHours(0, 0, 0, 0);

    if (createdAt < dateFrom) {
      return false;
    }
  }

  if (filters.dateTo && createdAt) {
    const dateTo = new Date(filters.dateTo);
    dateTo.setHours(23, 59, 59, 999);

    if (createdAt > dateTo) {
      return false;
    }
  }

  return true;
};

const rebuildBacklogSummary = (data) => {
  const backlogIssues = Array.isArray(data?.backlogIssues)
    ? data.backlogIssues.filter(isBacklogPlanningIssue)
    : [];
  const sprintSections = Array.isArray(data?.sprintSections)
    ? data.sprintSections.map((section) => ({
        ...section,
        issues: Array.isArray(section?.issues)
          ? section.issues.filter(isBacklogPlanningIssue)
          : [],
      }))
    : [];
  const totalVisibleIssues =
    backlogIssues.length +
    sprintSections.reduce((total, section) => total + (section?.issues?.length || 0), 0);

  return {
    ...(data?.summary || {}),
    totalVisibleIssues,
    backlogIssueCount: backlogIssues.length,
    activeSprintCount: sprintSections.filter((section) => section?.sprint?.state === "ACTIVE")
      .length,
    plannedSprintCount: sprintSections.filter((section) => section?.sprint?.state === "PLANNED")
      .length,
    completedSprintCount: sprintSections.filter(
      (section) => section?.sprint?.state === "COMPLETED"
    ).length,
  };
};

const rebuildBacklogEpics = (epics = [], backlogIssues = [], sprintSections = []) => {
  const visibleIssues = [
    ...backlogIssues,
    ...sprintSections.flatMap((section) => section?.issues || []),
  ].filter(isBacklogPlanningIssue);
  const epicCounts = visibleIssues.reduce((counts, issue) => {
    const epicId = resolveBacklogEpicId(issue?.epicId);

    if (!epicId) {
      return counts;
    }

    counts.set(epicId, (counts.get(epicId) || 0) + 1);
    return counts;
  }, new Map());

  return sortEpicsByPlanning(epics).map((epic) => ({
    ...epic,
    issueCount: epicCounts.get(String(epic._id)) || 0,
  }));
};

const updateBacklogIssueCollections = (data, filters, updater) => {
  const backlogIssues = (data?.backlogIssues || [])
    .map((issue) => updater(issue))
    .filter((issue) => issueMatchesBacklogFilters(issue, filters));
  const sprintSections = (data?.sprintSections || []).map((section) => ({
    ...section,
    issues: (section?.issues || [])
      .map((issue) => updater(issue))
      .filter((issue) => issueMatchesBacklogFilters(issue, filters)),
  }));

  return {
    backlogIssues,
    sprintSections,
  };
};

const BacklogSkeleton = () => (
  <div className="space-y-4">
    <Skeleton className="h-[156px] w-full rounded-[32px]" />
    <Skeleton className="h-16 w-full rounded-[22px]" />
    <div className="grid gap-4 lg:grid-cols-[minmax(280px,0.4fr)_minmax(0,0.6fr)] xl:h-[calc(100vh-13.75rem)]">
      <Skeleton className="h-[560px] w-full rounded-[32px]" />
      <Skeleton className="h-[560px] w-full rounded-[32px]" />
    </div>
  </div>
);

const SummaryBadge = ({ label, value }) => (
  <div className="flex min-h-12 items-center justify-between gap-3 rounded-[18px] border border-white/70 bg-white/78 px-3.5 py-2 shadow-[0_12px_28px_-24px_rgba(15,23,42,0.38)] backdrop-blur-xl">
    <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
      {label}
    </span>
    <span className="text-lg font-semibold tracking-tight text-slate-950">{value}</span>
  </div>
);

const BacklogSummaryStrip = ({ summary = null, unassignedCount = 0 }) => (
  <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
    <SummaryBadge label="Backlog" value={summary?.backlogIssueCount || 0} />
    <SummaryBadge label="Active Sprint" value={summary?.activeSprintCount || 0} />
    <SummaryBadge label="Planned" value={summary?.plannedSprintCount || 0} />
    <SummaryBadge label="Unassigned" value={unassignedCount} />
  </section>
);

const findIssueById = (boardState, issueId) => {
  if (!issueId) {
    return null;
  }

  const backlogIssue = boardState.backlogIssues.find(
    (issue) => String(issue._id) === String(issueId)
  );

  if (backlogIssue) {
    return backlogIssue;
  }

  for (const section of boardState.sprintSections) {
    const sprintIssue = section.issues.find(
      (issue) => String(issue._id) === String(issueId)
    );

    if (sprintIssue) {
      return sprintIssue;
    }

  }

  return null;
};

const getAllBoardIssues = (boardState) => [
  ...boardState.backlogIssues,
  ...boardState.sprintSections.flatMap((section) => section.issues),
];

const moveIssueLocally = ({ boardState, issueId, destinationSprintId = "", overIssueId = "" }) => {
  const nextState = {
    backlogIssues: [...boardState.backlogIssues],
    sprintSections: boardState.sprintSections.map((section) => ({
      ...section,
      issues: [...section.issues],
    })),
  };
  let movingIssue = null;

  nextState.backlogIssues = nextState.backlogIssues.filter((issue) => {
    if (String(issue._id) === String(issueId)) {
      movingIssue = issue;
      return false;
    }

    return true;
  });

  nextState.sprintSections = nextState.sprintSections.map((section) => {
    const filteredIssues = section.issues.filter((issue) => {
      if (String(issue._id) === String(issueId)) {
        movingIssue = issue;
        return false;
      }

      return true;
    });

    return {
      ...section,
      issues: filteredIssues,
    };
  });

  if (!movingIssue) {
    return boardState;
  }

  if (!isBacklogPlanningIssue(movingIssue)) {
    return boardState;
  }

  if (!destinationSprintId) {
    movingIssue = {
      ...movingIssue,
      sprintId: null,
    };
    const destinationIssues = [...nextState.backlogIssues];
    const insertIndex = overIssueId
      ? destinationIssues.findIndex((issue) => String(issue._id) === String(overIssueId))
      : -1;

    if (insertIndex >= 0) {
      destinationIssues.splice(insertIndex, 0, movingIssue);
    } else {
      destinationIssues.push(movingIssue);
    }

    nextState.backlogIssues = destinationIssues;
    return nextState;
  }

  nextState.sprintSections = nextState.sprintSections.map((section) => {
    if (String(section.sprint._id) !== String(destinationSprintId)) {
      return section;
    }

    const destinationIssues = [...section.issues];
    const insertIndex = overIssueId
      ? destinationIssues.findIndex((issue) => String(issue._id) === String(overIssueId))
      : -1;
    const nextIssue = {
      ...movingIssue,
      sprintId: section.sprint,
    };

    if (insertIndex >= 0) {
      destinationIssues.splice(insertIndex, 0, nextIssue);
    } else {
      destinationIssues.push(nextIssue);
    }

    return {
      ...section,
      issues: destinationIssues,
    };
  });

  return nextState;
};

const BacklogPage = () => {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState(createDefaultFilters);
  const [boardState, setBoardState] = useState(createBoardState(null));
  const [selectedIssueId, setSelectedIssueId] = useState("");
  const [draggedIssueId, setDraggedIssueId] = useState("");
  const [toast, setToast] = useState(null);
  const [epicDialogState, setEpicDialogState] = useState({
    open: false,
    epic: null,
  });
  const [sprintDialogState, setSprintDialogState] = useState({
    open: false,
    sprint: null,
  });
  const [completionSprint, setCompletionSprint] = useState(null);
  const [isEpicSubmitting, setIsEpicSubmitting] = useState(false);
  const previousProjectIdRef = useRef(filters.projectId);
  const deferredSearch = useDeferredValue(filters.search);
  const queryFilters = useMemo(
    () => ({
      ...filters,
      search: deferredSearch,
    }),
    [deferredSearch, filters]
  );

  const {
    data: projects = [],
    isLoading: isProjectsLoading,
    error: projectsError,
  } = useQuery({
    queryKey: ["projects"],
    queryFn: fetchProjects,
  });

  useEffect(() => {
    persistBacklogProjectId(filters.projectId);
  }, [filters.projectId]);

  useEffect(() => {
    if (isProjectsLoading || !filters.projectId) {
      return;
    }

    if (projects.some((project) => String(project._id) === String(filters.projectId))) {
      return;
    }

    setFilters((current) => ({
      ...current,
      projectId: "",
      teamId: "all",
      assigneeId: "all",
      epicId: "all",
      sprintId: "all",
      priority: "all",
      status: "all",
    }));
  }, [filters.projectId, isProjectsLoading, projects]);

  useEffect(() => {
    if (previousProjectIdRef.current === filters.projectId) {
      return;
    }

    previousProjectIdRef.current = filters.projectId;
    setBoardState(createBoardState(null));
    setSelectedIssueId("");
  }, [filters.projectId]);

  const selectedProject = useMemo(
    () => findProjectById(projects, filters.projectId),
    [filters.projectId, projects]
  );
  const availableTeams = useMemo(
    () => getProjectTeams(selectedProject),
    [selectedProject]
  );
  const availableMembers = useMemo(
    () => getProjectMembers(selectedProject),
    [selectedProject]
  );

  useEffect(() => {
    if (!availableTeams.length) {
      if (filters.teamId !== "all") {
        setFilters((current) => ({
          ...current,
          teamId: "all",
        }));
      }
      return;
    }

    if (
      filters.teamId === "all" ||
      availableTeams.some((team) => resolveTeamId(team) === String(filters.teamId))
    ) {
      return;
    }

    setFilters((current) => ({
      ...current,
      teamId: "all",
    }));
  }, [availableTeams, filters.teamId]);

  useEffect(() => {
    if (!availableMembers.length) {
      if (filters.assigneeId !== "all") {
        setFilters((current) => ({
          ...current,
          assigneeId: "all",
        }));
      }
      return;
    }

    if (
      filters.assigneeId === "all" ||
      availableMembers.some((member) => String(member._id) === String(filters.assigneeId))
    ) {
      return;
    }

    setFilters((current) => ({
      ...current,
      assigneeId: "all",
    }));
  }, [availableMembers, filters.assigneeId]);

  const {
    data: backlogData,
    isLoading: isBacklogLoading,
    error: backlogError,
  } = useQuery({
    queryKey: ["backlog", queryFilters],
    queryFn: () => fetchBacklogBoard(queryFilters),
    enabled: Boolean(filters.projectId),
  });

  useEffect(() => {
    if (!backlogData) {
      return;
    }

    setBoardState(createBoardState(backlogData));
  }, [backlogData]);

  useEffect(() => {
    if (
      filters.epicId === "all" ||
      filters.epicId === "unassigned" ||
      !backlogData?.epics
    ) {
      return;
    }

    if (
      backlogData.epics.some((epic) => String(epic._id) === String(filters.epicId))
    ) {
      return;
    }

    setFilters((current) => ({
      ...current,
      epicId: "all",
    }));
  }, [backlogData?.epics, filters.epicId]);

  useEffect(() => {
    if (!selectedIssueId) {
      return;
    }

    if (findIssueById(boardState, selectedIssueId)) {
      return;
    }

    setSelectedIssueId("");
  }, [boardState, selectedIssueId]);

  const permissions = backlogData?.permissions || {};
  const selectedIssue = useMemo(
    () => findIssueById(boardState, selectedIssueId),
    [boardState, selectedIssueId]
  );
  const selectedEpic = useMemo(
    () =>
      (backlogData?.epics || []).find((epic) => String(epic._id) === String(filters.epicId)) ||
      null,
    [backlogData?.epics, filters.epicId]
  );
  const allSprints = useMemo(
    () => boardState.sprintSections.map((section) => section.sprint),
    [boardState.sprintSections]
  );
  const assignableSprints = useMemo(
    () => allSprints.filter((sprint) => sprint.state !== "COMPLETED"),
    [allSprints]
  );
  const plannedSprints = useMemo(
    () => allSprints.filter((sprint) => sprint.state === "PLANNED"),
    [allSprints]
  );
  const planningIssues = useMemo(() => getAllBoardIssues(boardState), [boardState]);
  const unassignedEpicCount = useMemo(
    () => planningIssues.filter((issue) => !issue?.epicId?._id && !issue?.epicId).length,
    [planningIssues]
  );

  const syncCurrentBacklogData = (updater) => {
    queryClient.setQueryData(["backlog", queryFilters], (current) => {
      if (!current) {
        return current;
      }

      const nextData = updater(current);

      if (!nextData) {
        return current;
      }

      return {
        ...nextData,
        summary: rebuildBacklogSummary(nextData),
      };
    });
  };

  const insertEpicIntoCurrentBacklog = (epic) => {
    syncCurrentBacklogData((current) => {
      const epicsById = new Map(
        (current?.epics || []).map((currentEpic) => [String(currentEpic._id), currentEpic])
      );

      epicsById.set(String(epic._id), {
        ...epic,
        issueCount: epicsById.get(String(epic._id))?.issueCount || 0,
      });

      return {
        ...current,
        epics: rebuildBacklogEpics(
          Array.from(epicsById.values()),
          current.backlogIssues,
          current.sprintSections
        ),
      };
    });
  };

  const updateEpicInCurrentBacklog = (epic) => {
    syncCurrentBacklogData((current) => {
      const currentEpics = current?.epics || [];

      if (!currentEpics.some((currentEpic) => String(currentEpic._id) === String(epic._id))) {
        return current;
      }

      const { backlogIssues, sprintSections } = updateBacklogIssueCollections(
        current,
        queryFilters,
        (issue) => {
          if (resolveBacklogEpicId(issue?.epicId) !== String(epic._id)) {
            return issue;
          }

          return {
            ...issue,
            epicId: {
              ...(typeof issue?.epicId === "object" && issue?.epicId ? issue.epicId : {}),
              ...epic,
            },
          };
        }
      );

      return {
        ...current,
        backlogIssues,
        sprintSections,
        epics: rebuildBacklogEpics(
          currentEpics.map((currentEpic) =>
            String(currentEpic._id) === String(epic._id)
              ? {
                  ...currentEpic,
                  ...epic,
                }
              : currentEpic
          ),
          backlogIssues,
          sprintSections
        ),
      };
    });
  };

  const removeEpicFromCurrentBacklog = (epicId) => {
    syncCurrentBacklogData((current) => ({
      ...current,
      epics: rebuildBacklogEpics(
        (current?.epics || []).filter(
          (currentEpic) => String(currentEpic._id) !== String(epicId)
        ),
        current.backlogIssues,
        current.sprintSections
      ),
    }));
  };

  const assignIssuesToEpicInCurrentBacklog = (epic, issueIds = []) => {
    if (!issueIds.length) {
      return;
    }

    const issueIdSet = new Set(issueIds.map((issueId) => String(issueId)));

    syncCurrentBacklogData((current) => {
      const { backlogIssues, sprintSections } = updateBacklogIssueCollections(
        current,
        queryFilters,
        (issue) => {
          if (!issueIdSet.has(String(issue?._id))) {
            return issue;
          }

          return {
            ...issue,
            epicId: epic,
          };
        }
      );

      return {
        ...current,
        backlogIssues,
        sprintSections,
        epics: rebuildBacklogEpics(
          (current?.epics || []).map((currentEpic) =>
            String(currentEpic._id) === String(epic._id)
              ? {
                  ...currentEpic,
                  ...epic,
                }
              : currentEpic
          ),
          backlogIssues,
          sprintSections
        ),
      };
    });
  };

  const invalidatePlanningQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["backlog"],
      }),
      queryClient.invalidateQueries({
        queryKey: ["issues"],
      }),
      queryClient.invalidateQueries({
        queryKey: ["reports"],
      }),
      queryClient.invalidateQueries({
        queryKey: ["analytics"],
      }),
    ]);
  };

  const createEpicMutation = useMutation({
    mutationFn: createEpic,
  });
  const updateEpicMutation = useMutation({
    mutationFn: updateEpic,
  });
  const deleteEpicMutation = useMutation({
    mutationFn: deleteEpic,
    onSuccess: async (_response, variables) => {
      setFilters((current) => ({
        ...current,
        epicId: "all",
      }));
      removeEpicFromCurrentBacklog(variables?.id);
      await invalidatePlanningQueries();
    },
  });
  const createSprintMutation = useMutation({
    mutationFn: createSprint,
    onSuccess: async () => invalidatePlanningQueries(),
  });
  const updateSprintMutation = useMutation({
    mutationFn: updateSprint,
    onSuccess: async () => invalidatePlanningQueries(),
  });
  const deleteSprintMutation = useMutation({
    mutationFn: deleteSprint,
    onSuccess: async () => invalidatePlanningQueries(),
  });
  const startSprintMutation = useMutation({
    mutationFn: startSprint,
    onSuccess: async () => invalidatePlanningQueries(),
  });
  const completeSprintMutation = useMutation({
    mutationFn: completeSprint,
    onSuccess: async () => invalidatePlanningQueries(),
  });
  const updatePlanningMutation = useMutation({
    mutationFn: updateIssuePlanning,
    onSuccess: async () => invalidatePlanningQueries(),
  });
  const updateStatusMutation = useMutation({
    mutationFn: updateIssue,
    onSuccess: async () => invalidatePlanningQueries(),
  });
  const reorderMutation = useMutation({
    mutationFn: reorderIssuePlanning,
    onSuccess: async () => invalidatePlanningQueries(),
  });
  const planningUpdatingIssueId = updatePlanningMutation.isPending
    ? updatePlanningMutation.variables?.id || ""
    : "";
  const startingSprintId = startSprintMutation.isPending
    ? startSprintMutation.variables || ""
    : "";

  const handleFilterChange = (field, value) => {
    if (field === "projectId") {
      setFilters((current) => {
        const nextProjectId = String(value || "");

        if (String(current.projectId) === nextProjectId) {
          return current;
        }

        return {
          ...current,
          projectId: nextProjectId,
          teamId: "all",
          assigneeId: "all",
          epicId: "all",
          sprintId: "all",
          priority: "all",
          status: "all",
        };
      });
      return;
    }

    setFilters((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handlePlanningDrop = async ({ destinationSprintId = "", overIssueId = "" }) => {
    if (!draggedIssueId || !permissions.canReorderIssues) {
      return;
    }

    const previousState = boardState;
    const nextState = moveIssueLocally({
      boardState,
      issueId: draggedIssueId,
      destinationSprintId,
      overIssueId,
    });
    const destinationIssues = destinationSprintId
      ? nextState.sprintSections.find(
          (section) => String(section.sprint._id) === String(destinationSprintId)
        )?.issues || []
      : nextState.backlogIssues;
    const droppedIndex = destinationIssues.findIndex(
      (issue) => String(issue._id) === String(draggedIssueId)
    );
    const beforeIssueId =
      droppedIndex > 0 ? destinationIssues[droppedIndex - 1]?._id || "" : "";

    setBoardState(nextState);
    setDraggedIssueId("");

    try {
      await reorderMutation.mutateAsync({
        issueId: draggedIssueId,
        destinationSprintId: destinationSprintId || null,
        beforeIssueId,
        afterIssueId: overIssueId || "",
      });
    } catch (error) {
      setBoardState(previousState);
      setToast({
        type: "error",
        title: "Unable to reorder work item",
        message:
          error.response?.data?.message ||
          "The backlog order could not be saved. Your previous view was restored.",
      });
    }
  };

  const handleQuickMoveIssue = async (issueId, destinationSprintId = "") => {
    if (!permissions.canAssignIssues) {
      return;
    }

    const issue = findIssueById(boardState, issueId);

    if (!issue) {
      return;
    }

    const currentSprintId = String(issue?.sprintId?._id || issue?.sprintId || "");
    const nextSprintId = String(destinationSprintId || "");

    if (currentSprintId === nextSprintId) {
      return;
    }

    const previousState = boardState;
    const nextState = moveIssueLocally({
      boardState,
      issueId,
      destinationSprintId,
    });

    setBoardState(nextState);

    try {
      await updatePlanningMutation.mutateAsync({
        id: issueId,
        payload: {
          sprintId: destinationSprintId || null,
        },
      });
    } catch (error) {
      setBoardState(previousState);
      setToast({
        type: "error",
        title: "Unable to move work item",
        message:
          error.response?.data?.message ||
          "That work item could not be reassigned to the selected sprint.",
      });
    }
  };

  const handleResetFilters = () =>
    setFilters((current) => ({
      ...createDefaultFilters(),
      projectId: current.projectId,
    }));

  if (projectsError || backlogError) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-rose-700">
          {projectsError?.response?.data?.message ||
            backlogError?.response?.data?.message ||
            "Unable to load backlog planning data right now."}
        </CardContent>
      </Card>
    );
  }

  if (!isProjectsLoading && !projects.length) {
    return (
      <EmptyState
        title="No accessible project backlog yet"
        description="Attach the current user to a project team or create a new project first. Backlog planning appears per project."
        icon={<FolderKanban className="h-5 w-5" />}
      />
    );
  }

  if (isProjectsLoading || (filters.projectId && isBacklogLoading && !backlogData)) {
    return <BacklogSkeleton />;
  }

  if (!filters.projectId) {
    return (
      <div className="space-y-4">
        <BacklogToolbar
          filters={filters}
          projects={projects}
          teams={availableTeams}
          members={availableMembers}
          epics={[]}
          permissions={{}}
          selectedEpic={null}
          onChange={handleFilterChange}
          onResetFilters={handleResetFilters}
          onCreateSprint={() =>
            setSprintDialogState({
              open: true,
              sprint: null,
            })
          }
          onCreateEpic={() =>
            setEpicDialogState({
              open: true,
              epic: null,
            })
          }
        />

        <Card className="border-white/70 bg-white/92 shadow-[0_18px_50px_-34px_rgba(15,23,42,0.45)] backdrop-blur">
          <CardContent className="p-8">
            <EmptyState
              title="Select a project backlog"
              description="Choose a project from the filter bar to load backlog planning. The page now keeps your last valid project selection instead of auto-switching to the first project."
              icon={<FolderKanban className="h-5 w-5" />}
            />
          </CardContent>
        </Card>

        <ToastNotice toast={toast} onDismiss={() => setToast(null)} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <BacklogToolbar
        filters={filters}
        projects={projects}
        teams={availableTeams}
        members={availableMembers}
        epics={backlogData?.epics || []}
        sprints={(backlogData?.sprintSections || []).map((section) => section.sprint)}
        permissions={permissions}
        selectedEpic={selectedEpic}
        onChange={handleFilterChange}
        onResetFilters={handleResetFilters}
        onCreateSprint={() =>
          setSprintDialogState({
            open: true,
            sprint: null,
          })
        }
        onCreateEpic={() =>
          setEpicDialogState({
            open: true,
            epic: null,
          })
        }
        onEditEpic={() =>
          setEpicDialogState({
            open: true,
            epic: selectedEpic,
          })
        }
        onDeleteEpic={async () => {
          if (!selectedEpic) {
            return;
          }

          try {
            await deleteEpicMutation.mutateAsync({
              id: selectedEpic._id,
            });
            setToast({
              type: "success",
              message: `${selectedEpic.name} was removed from backlog planning.`,
            });
          } catch (error) {
            setToast({
              type: "error",
              message:
                error.response?.data?.message || "Unable to delete that epic right now.",
            });
          }
        }}
      />

      <BacklogSummaryStrip
        summary={backlogData?.summary}
        unassignedCount={unassignedEpicCount}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(280px,0.4fr)_minmax(0,0.6fr)] xl:h-[calc(100vh-14rem)]">
        <Card className="overflow-hidden border-white/70 bg-white/90 shadow-[0_18px_48px_-36px_rgba(15,23,42,0.42)] backdrop-blur-xl xl:h-full">
          <CardContent
            className="flex h-full min-h-0 flex-col p-0"
            onDragOver={(event) => {
              if (!permissions.canReorderIssues) {
                return;
              }

              event.preventDefault();
            }}
            onDrop={(event) => {
              if (!permissions.canReorderIssues) {
                return;
              }

              event.preventDefault();
              handlePlanningDrop({
                destinationSprintId: "",
              });
            }}
          >
            <div className="border-b border-white/60 px-4 py-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/65 bg-white/68 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.22em] text-slate-500 shadow-sm backdrop-blur-xl">
                <Layers3 className="h-3.5 w-3.5" />
                <span>Backlog</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-base font-semibold text-slate-950">Backlog Queue</p>
                  <p className="mt-0.5 text-sm text-slate-600">
                    Drag straight into a sprint or use the row picker to schedule work quickly.
                  </p>
                </div>
                <span className="rounded-full border border-white/65 bg-white/72 px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm">
                  {boardState.backlogIssues.length} work items
                </span>
              </div>
            </div>

            <div className="min-h-0 overflow-y-auto p-2.5">
              <div className="space-y-2">
                {boardState.backlogIssues.length ? (
                  boardState.backlogIssues.map((issue) => (
                    <IssuePlanningCard
                      key={issue._id}
                      issue={issue}
                      canDrag={permissions.canReorderIssues}
                      canManagePlanning={permissions.canAssignIssues}
                      isUpdating={planningUpdatingIssueId === issue._id}
                      availableSprints={assignableSprints}
                      onDragStart={(dragIssue) => setDraggedIssueId(dragIssue._id)}
                      onDragEnd={() => setDraggedIssueId("")}
                      onDropBefore={(overIssue) =>
                        handlePlanningDrop({
                          destinationSprintId: "",
                          overIssueId: overIssue._id,
                        })
                      }
                      onSelectIssue={(nextIssue) => setSelectedIssueId(nextIssue._id)}
                      onMoveIssue={handleQuickMoveIssue}
                    />
                  ))
                ) : (
                  <div className="rounded-[18px] border border-dashed border-slate-200 bg-slate-50/80 px-4 py-8 text-center text-sm leading-6 text-slate-500">
                    No backlog items match the current filter set.
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-blue-100/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(239,246,255,0.72))] shadow-[0_24px_60px_-40px_rgba(37,99,235,0.42)] backdrop-blur-xl xl:h-full">
          <CardContent className="flex h-full min-h-0 flex-col p-0">
            <div className="border-b border-white/70 px-4 py-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/65 bg-white/68 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.22em] text-slate-500 shadow-sm backdrop-blur-xl">
                <Flag className="h-3.5 w-3.5" />
                <span>Sprint Planning</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-base font-semibold text-slate-950">Sprint Planning</p>
                  <p className="mt-0.5 text-sm text-slate-600">
                    Sprint scope stays visible while you assign work items, reorder work, and start planning.
                  </p>
                </div>
                <span className="rounded-full border border-white/65 bg-white/72 px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm">
                  {boardState.sprintSections.length} sprints
                </span>
              </div>
            </div>

            <div className="min-h-0 overflow-y-auto p-3">
              <div className="space-y-3">
                {boardState.sprintSections.length ? (
                  boardState.sprintSections.map((section) => (
                    <SprintSection
                      key={section.sprint._id}
                      sprint={section.sprint}
                      issues={section.issues}
                      availableSprints={assignableSprints}
                      canManageSprints={permissions.canManageSprints}
                      canManagePlanning={permissions.canAssignIssues}
                      canReorderIssues={permissions.canReorderIssues}
                      planningUpdatingIssueId={planningUpdatingIssueId}
                      onSelectIssue={(issue) => setSelectedIssueId(issue._id)}
                      onDragStartIssue={(issue) => setDraggedIssueId(issue._id)}
                      onDragEndIssue={() => setDraggedIssueId("")}
                      onDropIssueBefore={(sprintId, overIssueId) =>
                        handlePlanningDrop({
                          destinationSprintId: sprintId,
                          overIssueId,
                        })
                      }
                      onDropToContainer={(sprintId) =>
                        handlePlanningDrop({
                          destinationSprintId: sprintId,
                        })
                      }
                      onMoveIssue={handleQuickMoveIssue}
                      onEditSprint={() =>
                        setSprintDialogState({
                          open: true,
                          sprint: section.sprint,
                        })
                      }
                      onDeleteSprint={async () => {
                        try {
                          await deleteSprintMutation.mutateAsync(section.sprint._id);
                          setToast({
                            type: "success",
                            message: `${section.sprint.name} was deleted.`,
                          });
                        } catch (error) {
                          setToast({
                            type: "error",
                            message:
                              error.response?.data?.message ||
                              "Unable to delete that sprint right now.",
                          });
                        }
                      }}
                      onStartSprint={async () => {
                        if (startSprintMutation.isPending) {
                          return;
                        }

                        try {
                          const startedSprint = await startSprintMutation.mutateAsync(
                            section.sprint._id
                          );
                          const startedState = String(
                            startedSprint?.state || startedSprint?.status || ""
                          )
                            .trim()
                            .toUpperCase();

                          if (startedState !== "ACTIVE") {
                            throw new Error(
                              "Sprint start was acknowledged, but the sprint is not active yet."
                            );
                          }

                          setToast({
                            type: "success",
                            title: "Sprint started",
                            message: `${startedSprint.name || section.sprint.name} is now active.`,
                          });
                        } catch (error) {
                          setToast({
                            type: "error",
                            title: "Sprint not started",
                            message:
                              error.response?.data?.message ||
                              "Unable to start that sprint right now.",
                          });
                        }
                      }}
                      isStartPending={startingSprintId === section.sprint._id}
                      onCompleteSprint={() => setCompletionSprint(section.sprint)}
                    />
                  ))
                ) : (
                  <div className="rounded-[22px] border border-dashed border-blue-200/80 bg-white/68 p-8 shadow-inner">
                    <EmptyState
                      title="No sprint sections yet"
                      description="Create the first sprint to begin planning scoped work from the backlog."
                      icon={<Layers3 className="h-5 w-5" />}
                    />
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <IssueDetailsDrawer
        issue={selectedIssue}
        open={Boolean(selectedIssue)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedIssueId("");
          }
        }}
        project={selectedProject}
        epics={backlogData?.epics || []}
        sprints={assignableSprints}
        permissions={permissions}
        onUpdatePlanning={(id, payload) =>
          updatePlanningMutation.mutateAsync({
            id,
            payload,
          })
        }
        onUpdateIssue={(id, payload) =>
          updateStatusMutation.mutateAsync({
            id,
            payload,
          })
        }
        onUpdateStatus={(id, status) =>
          updateStatusMutation.mutateAsync({
            id,
            payload: { status },
          })
        }
        isPlanningPending={updatePlanningMutation.isPending}
        isStatusPending={updateStatusMutation.isPending}
      />

      <EpicDialog
        open={epicDialogState.open}
        onOpenChange={(open) =>
          setEpicDialogState((current) => ({
            ...current,
            open,
          }))
        }
        initialEpic={epicDialogState.epic}
        issues={planningIssues}
        members={availableMembers}
        isPending={
          createEpicMutation.isPending || updateEpicMutation.isPending || isEpicSubmitting
        }
        onSubmit={async (payload) => {
          setIsEpicSubmitting(true);

          try {
            if (epicDialogState.epic) {
              const { issueIds: _issueIds, ...epicPayload } = payload;
              const updatedEpic = await updateEpicMutation.mutateAsync({
                id: epicDialogState.epic._id,
                payload: epicPayload,
              });
              updateEpicInCurrentBacklog(updatedEpic);
              await invalidatePlanningQueries();

              setToast({
                type: "success",
                message: `${epicPayload.name} was updated.`,
              });

              return updatedEpic;
            }

            const { issueIds = [], ...epicPayload } = payload;
            const createdEpic = await createEpicMutation.mutateAsync({
              projectId: filters.projectId,
              ...epicPayload,
            });
            insertEpicIntoCurrentBacklog(createdEpic);

            if (issueIds.length) {
              try {
                await Promise.all(
                  issueIds.map((issueId) =>
                    updateIssuePlanning({
                      id: issueId,
                      payload: {
                        epicId: createdEpic._id,
                      },
                    })
                  )
                );
                assignIssuesToEpicInCurrentBacklog(createdEpic, issueIds);
                await invalidatePlanningQueries();
                setToast({
                  type: "success",
                  message: `${createdEpic.name} created and linked to ${issueIds.length} work item${issueIds.length === 1 ? "" : "s"}.`,
                });
              } catch (error) {
                await invalidatePlanningQueries();
                setToast({
                  type: "error",
                  title: "Epic created, assignments need attention",
                  message:
                    error.response?.data?.message ||
                    "The epic was created, but one or more work items could not be linked.",
                });
              }
            } else {
              await invalidatePlanningQueries();
              setToast({
                type: "success",
                message: `${createdEpic.name} was created.`,
              });
            }

            return createdEpic;
          } finally {
            setIsEpicSubmitting(false);
          }
        }}
      />

      <SprintDialog
        open={sprintDialogState.open}
        onOpenChange={(open) =>
          setSprintDialogState((current) => ({
            ...current,
            open,
          }))
        }
        initialSprint={sprintDialogState.sprint}
        teams={availableTeams}
        isPending={createSprintMutation.isPending || updateSprintMutation.isPending}
        onSubmit={(payload) => {
          if (sprintDialogState.sprint) {
            return updateSprintMutation.mutateAsync({
              id: sprintDialogState.sprint._id,
              payload,
            });
          }

          return createSprintMutation.mutateAsync({
            projectId: filters.projectId,
            ...payload,
          });
        }}
      />

      <SprintCompletionDialog
        open={Boolean(completionSprint)}
        onOpenChange={(open) => {
          if (!open) {
            setCompletionSprint(null);
          }
        }}
        sprint={completionSprint}
        plannedSprints={plannedSprints.filter(
          (sprint) => String(sprint._id) !== String(completionSprint?._id || "")
        )}
        isPending={completeSprintMutation.isPending}
        onSubmit={(payload) =>
          completeSprintMutation.mutateAsync({
            id: completionSprint._id,
            payload,
          })
        }
      />

      <ToastNotice toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
};

export default BacklogPage;
