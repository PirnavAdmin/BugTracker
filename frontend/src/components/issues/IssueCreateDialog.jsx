import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Select from "react-select";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  BUG_PRIORITY_OPTIONS,
  ISSUE_STATUS,
  ISSUE_TYPE_OPTIONS,
  getIssueDisplayKey,
  resolveIssueProjectId,
} from "@/lib/issues";
import {
  fetchEpics,
  fetchIssues,
  fetchProjectTeams,
  fetchSprints,
  logTeamSelectionDebug,
} from "@/lib/api";
import {
  findProjectById,
  getProjectMembers,
  getProjectTeamMembers,
  getProjectTeams,
  resolveProjectId,
  resolveTeamId,
  resolveUserId,
} from "@/lib/project-teams";
import { hasAdminPanelAccess } from "@/lib/roles";
import { formatDate, getInitials } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";

const ISSUE_TYPES = ISSUE_TYPE_OPTIONS;
const ISSUE_PRIORITIES = ["Low", "Medium", "High", "Critical"];
const SELECT_MENU_MAX_HEIGHT = 220;
const PROJECT_COLOR_PALETTE = [
  { accent: "#2563eb", soft: "#dbeafe", border: "#bfdbfe" },
  { accent: "#7c3aed", soft: "#ede9fe", border: "#ddd6fe" },
  { accent: "#0891b2", soft: "#cffafe", border: "#a5f3fc" },
  { accent: "#ea580c", soft: "#ffedd5", border: "#fed7aa" },
  { accent: "#16a34a", soft: "#dcfce7", border: "#bbf7d0" },
  { accent: "#db2777", soft: "#fce7f3", border: "#fbcfe8" },
];

const resolveProjectSelection = (defaultProjectId, projects = []) => {
  if (
    defaultProjectId &&
    defaultProjectId !== "all" &&
    findProjectById(projects, defaultProjectId)
  ) {
    return String(defaultProjectId);
  }

  return resolveProjectId(projects[0]);
};

const resolveTeamSelection = (teams = [], defaultTeamId = "") => {
  const projectTeams = getProjectTeams({ teams });

  if (
    defaultTeamId &&
    defaultTeamId !== "all" &&
    projectTeams.some((team) => resolveTeamId(team) === String(defaultTeamId))
  ) {
    return String(defaultTeamId);
  }

  return resolveTeamId(projectTeams[0]);
};

const buildInitialState = ({
  projects,
  defaultProjectId,
  defaultTeamId,
  defaultType,
  defaultParentStoryId = "",
}) => {
  const projectId = resolveProjectSelection(defaultProjectId, projects);
  const project = findProjectById(projects, projectId);
  const isBug = defaultType === "Bug";

  return {
    title: "",
    description: "",
    projectId,
    teamId: resolveTeamSelection(getProjectTeams(project), defaultTeamId),
    assigneeId: "",
    priority: isBug ? "High" : "Medium",
    type: defaultType,
    status: isBug ? ISSUE_STATUS.NEW : ISSUE_STATUS.TODO,
    epicId: "",
    sprintId: "",
    dueAt: "",
    dependsOnIssueId: "",
    parentStoryId: defaultParentStoryId,
    storyPoints: "",
    acceptanceCriteria: "",
    definitionOfDone: "",
    labels: "",
    timeEstimateMinutes: "",
    bugDetails: {
      severity: "",
      testerOwnerId: "",
      developerLeadId: "",
      stepsToReproduce: "",
      expectedResult: "",
      actualResult: "",
    },
  };
};

const formatDependencyOption = (issue) => `${getIssueDisplayKey(issue)} ${issue.title}`;

const hashValue = (value = "") =>
  String(value)
    .split("")
    .reduce((total, character) => total + character.charCodeAt(0), 0);

const getProjectTheme = (project) =>
  PROJECT_COLOR_PALETTE[
    hashValue(project?._id || project?.name || "project") % PROJECT_COLOR_PALETTE.length
  ];

const buildProjectOption = (project) => ({
  value: resolveProjectId(project),
  label: project?.name || "Untitled project",
  project,
  theme: getProjectTheme(project),
});

const buildTeamOption = (team) => ({
  value: resolveTeamId(team),
  label: team?.name || "Unnamed team",
  team,
});

const buildAssigneeOption = (assignee) => ({
  value: resolveUserId(assignee),
  label: assignee?.name || "Unnamed teammate",
  email: assignee?.email || "",
  role: assignee?.role || "",
});

const buildDependencyOption = (issue) => ({
  value: String(issue?._id || ""),
  label: formatDependencyOption(issue),
  issue,
});

const buildEpicOption = (epic) => ({
  value: String(epic?._id || ""),
  label: epic?.name || "Untitled epic",
  color: epic?.color || "#7C3AED",
  epic,
});

const resolveSprintTeamId = (sprint) =>
  String(sprint?.teamId?._id || sprint?.teamId || "");

const buildSprintOption = (sprint) => {
  if (!sprint) {
    return {
      value: "",
      label: "Backlog",
      state: "BACKLOG",
      sprint: null,
    };
  }

  return {
    value: String(sprint?._id || ""),
    label: sprint?.name || "Untitled sprint",
    state: sprint?.state || sprint?.status || "PLANNED",
    startDate: sprint?.startDate || null,
    endDate: sprint?.endDate || null,
    sprint,
  };
};

const issueSelectStyles = {
  container: (base) => ({
    ...base,
    position: "relative",
    overflow: "visible",
  }),
  control: (base, state) => ({
    ...base,
    minHeight: 48,
    borderRadius: 18,
    borderColor: state.isFocused ? "rgba(59, 130, 246, 0.48)" : "#dbe2ea",
    backgroundColor: state.isDisabled ? "rgba(248, 250, 252, 0.96)" : "#ffffff",
    boxShadow: state.isFocused
      ? "0 0 0 4px rgba(59, 130, 246, 0.12)"
      : "0 1px 2px rgba(15, 23, 42, 0.04)",
    transition: "all 180ms ease",
    "&:hover": {
      borderColor: state.isFocused ? "rgba(59, 130, 246, 0.48)" : "#cbd5e1",
    },
  }),
  valueContainer: (base) => ({
    ...base,
    padding: "4px 14px",
  }),
  input: (base) => ({
    ...base,
    color: "#0f172a",
  }),
  placeholder: (base) => ({
    ...base,
    color: "#94a3b8",
  }),
  indicatorSeparator: () => ({
    display: "none",
  }),
  dropdownIndicator: (base, state) => ({
    ...base,
    color: state.isFocused ? "#2563eb" : "#64748b",
    "&:hover": {
      color: "#2563eb",
    },
  }),
  clearIndicator: (base) => ({
    ...base,
    color: "#94a3b8",
    "&:hover": {
      color: "#475569",
    },
  }),
  menuPortal: (base) => ({
    ...base,
    zIndex: 9999,
    pointerEvents: "auto",
  }),
  menu: (base) => ({
    ...base,
    overflow: "auto",
    borderRadius: 18,
    border: "1px solid #e2e8f0",
    boxShadow: "0 20px 40px -24px rgba(15, 23, 42, 0.28)",
    zIndex: 9999,
    marginTop: 8,
    scrollBehavior: "smooth",
  }),
  menuList: (base) => ({
    ...base,
    padding: 8,
    maxHeight: SELECT_MENU_MAX_HEIGHT,
    overflowY: "auto",
    overflowX: "hidden",
    scrollBehavior: "smooth",
    WebkitOverflowScrolling: "touch",
  }),
  option: (base, state) => ({
    ...base,
    borderRadius: 14,
    padding: "10px 12px",
    backgroundColor: state.isSelected
      ? "rgba(219, 234, 254, 0.92)"
      : state.isFocused
        ? "rgba(248, 250, 252, 0.96)"
        : "transparent",
    color: "#0f172a",
    cursor: "pointer",
  }),
  singleValue: (base) => ({
    ...base,
    color: "#0f172a",
  }),
  noOptionsMessage: (base) => ({
    ...base,
    color: "#64748b",
    padding: "12px 16px",
  }),
};

const formatProjectOptionLabel = (option) => (
  <div className="flex min-w-0 items-center gap-3">
    <span
      className="h-4 w-4 shrink-0 rounded-[5px] border"
      style={{
        backgroundColor: option.theme.soft,
        borderColor: option.theme.border,
        boxShadow: `inset 0 0 0 6px ${option.theme.accent}`,
      }}
    />
    <span className="truncate text-sm font-medium text-slate-900">{option.label}</span>
  </div>
);

const formatTeamOptionLabel = (option) => (
  <div className="min-w-0">
    <p className="truncate text-sm font-medium text-slate-900">{option.label}</p>
  </div>
);

const formatAssigneeOptionLabel = (option) => (
  <div className="flex min-w-0 items-center gap-3">
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-700">
      {getInitials(option.label)}
    </div>
    <div className="min-w-0">
      <p className="truncate text-sm font-medium text-slate-900">{option.label}</p>
      <p className="truncate text-xs text-slate-500">
        {[option.role, option.email].filter(Boolean).join(" • ")}
      </p>
    </div>
  </div>
);

const formatDependencyLabel = (option) => (
  <div className="min-w-0">
    <p className="truncate text-sm font-medium text-slate-900">{option.label}</p>
  </div>
);

const formatEpicOptionLabel = (option) => (
  <div className="flex min-w-0 items-center gap-3">
    <span
      className="h-3.5 w-3.5 shrink-0 rounded-full"
      style={{ backgroundColor: option.color }}
    />
    <span className="truncate text-sm font-medium text-slate-900">{option.label}</span>
  </div>
);

const formatSprintOptionLabel = (option) => {
  const dateRange =
    option.startDate && option.endDate
      ? `${formatDate(option.startDate)} - ${formatDate(option.endDate)}`
      : "Dates not set";
  const statusLabel =
    option.state === "ACTIVE"
      ? "Active Sprint"
      : option.state === "PLANNED"
        ? "Upcoming Sprint"
        : "Backlog";

  return (
    <div className="min-w-0">
      <p className="truncate text-sm font-medium text-slate-900">{option.label}</p>
      <p className="truncate text-xs text-slate-500">
        {option.state === "BACKLOG" ? "Backlog" : `${statusLabel} / ${dateRange}`}
      </p>
    </div>
  );
};

const SectionLabel = ({ title, description }) => (
  <div className="space-y-0.5">
    <p className="text-sm font-semibold text-slate-900">{title}</p>
    {description ? <p className="text-sm text-slate-500">{description}</p> : null}
  </div>
);

const baseSelectProps = {
  menuPlacement: "bottom",
  menuPosition: "absolute",
  menuShouldScrollIntoView: false,
  maxMenuHeight: SELECT_MENU_MAX_HEIGHT,
};

const IssueCreateDialog = ({
  open,
  onOpenChange,
  projects = [],
  availableIssues = [],
  allowedTypes = ISSUE_TYPES,
  defaultProjectId = "",
  defaultTeamId = "",
  defaultType = "Task",
  defaultParentStoryId = "",
  lockType = false,
  isPending = false,
  onSubmit,
  onUploadAttachment,
}) => {
  const typeOptions = allowedTypes.length ? allowedTypes : ISSUE_TYPES;
  const resolvedDefaultType = typeOptions.includes(defaultType)
    ? defaultType
    : typeOptions[0];
  const [formData, setFormData] = useState(() =>
    buildInitialState({
      projects,
      defaultProjectId,
      defaultTeamId,
      defaultType: resolvedDefaultType,
      defaultParentStoryId,
    })
  );
  const [assignEntireTeam, setAssignEntireTeam] = useState(false);
  const [assignToQueue, setAssignToQueue] = useState(false);
  const [isSequenceSubmitting, setIsSequenceSubmitting] = useState(false);
  const [error, setError] = useState("");
  const { role } = useAuth();
  const canManagePlanningFields = hasAdminPanelAccess(role);

  const menuPortalTarget =
    typeof document !== "undefined" ? document.body : undefined;

  const projectOptions = useMemo(
    () => projects.map(buildProjectOption),
    [projects]
  );

  const selectedProject = useMemo(
    () => findProjectById(projects, formData.projectId),
    [formData.projectId, projects]
  );
  const selectedProjectOption = useMemo(
    () =>
      projectOptions.find((project) => project.value === String(formData.projectId)) || null,
    [formData.projectId, projectOptions]
  );
  const selectedProjectId = String(formData.projectId || "");
  const { data: projectTeamsData } = useQuery({
    queryKey: ["project-teams", selectedProjectId],
    queryFn: () => fetchProjectTeams(selectedProjectId),
    enabled: open && Boolean(selectedProjectId),
    refetchOnMount: "always",
  });
  const { data: projectEpicsData = [] } = useQuery({
    queryKey: ["project-epics", selectedProjectId],
    queryFn: () => fetchEpics({ projectId: selectedProjectId }),
    enabled: open && canManagePlanningFields && Boolean(selectedProjectId),
    refetchOnMount: "always",
  });
  const { data: projectSprintsData = [] } = useQuery({
    queryKey: ["project-sprints", selectedProjectId],
    queryFn: () => fetchSprints({ projectId: selectedProjectId }),
    enabled: open && canManagePlanningFields && Boolean(selectedProjectId),
    refetchOnMount: "always",
  });
  const { data: projectStoriesData = [] } = useQuery({
    queryKey: ["project-stories", selectedProjectId],
    queryFn: () => fetchIssues({ projectId: selectedProjectId, type: "Story" }),
    enabled: open && Boolean(selectedProjectId),
    refetchOnMount: "always",
  });
  const selectedProjectTeams = useMemo(
    () => getProjectTeams(selectedProject),
    [selectedProject]
  );
  const useProjectTeamsApi =
    Array.isArray(projectTeamsData) && projectTeamsData.length > 0;
  const projectTeamsSource = useProjectTeamsApi
    ? "project-teams-api"
    : Array.isArray(projectTeamsData)
      ? "projects-api-fallback-empty-project-teams"
      : "projects-api";

  const availableTeams = useMemo(
    () =>
      useProjectTeamsApi
        ? getProjectTeams({ teams: projectTeamsData })
        : selectedProjectTeams,
    [projectTeamsData, selectedProjectTeams, useProjectTeamsApi]
  );
  const selectedProjectWithTeams = useMemo(
    () =>
      selectedProject
        ? {
            ...selectedProject,
            teams: availableTeams,
          }
        : {
            teams: availableTeams,
          },
    [availableTeams, selectedProject]
  );
  const projectMembers = useMemo(
    () => getProjectMembers(selectedProjectWithTeams),
    [selectedProjectWithTeams]
  );
  const teamOptions = useMemo(
    () => availableTeams.map(buildTeamOption),
    [availableTeams]
  );
  const projectMemberOptions = useMemo(
    () => projectMembers.map(buildAssigneeOption),
    [projectMembers]
  );
  const selectedTeamOption = useMemo(
    () => teamOptions.find((team) => team.value === String(formData.teamId)) || null,
    [formData.teamId, teamOptions]
  );

  const availableAssignees = useMemo(
    () => getProjectTeamMembers(selectedProjectWithTeams, formData.teamId),
    [formData.teamId, selectedProjectWithTeams]
  );
  const assigneeOptions = useMemo(
    () => availableAssignees.map(buildAssigneeOption),
    [availableAssignees]
  );
  const selectedAssigneeOption = useMemo(
    () =>
      assigneeOptions.find(
        (assignee) => assignee.value === String(formData.assigneeId)
      ) || null,
    [assigneeOptions, formData.assigneeId]
  );

  const dependencyOptions = useMemo(
    () =>
      availableIssues
        .filter(
          (issue) => resolveIssueProjectId(issue) === String(formData.projectId)
        )
        .sort(
          (left, right) =>
            new Date(right.createdAt || 0) - new Date(left.createdAt || 0)
        )
        .map(buildDependencyOption),
    [availableIssues, formData.projectId]
  );
  const selectedDependencyOption = useMemo(
    () =>
      dependencyOptions.find(
        (issue) => issue.value === String(formData.dependsOnIssueId)
      ) || null,
    [dependencyOptions, formData.dependsOnIssueId]
  );
  const storyOptions = useMemo(
    () =>
      [...projectStoriesData, ...availableIssues]
        .filter(
          (issue, index, issues) =>
            issues.findIndex(
              (candidate) => String(candidate._id) === String(issue._id)
            ) === index
        )
        .filter(
          (issue) =>
            issue.type === "Story" &&
            resolveIssueProjectId(issue) === String(formData.projectId)
        )
        .map(buildDependencyOption),
    [availableIssues, formData.projectId, projectStoriesData]
  );
  const selectedStoryOption = useMemo(
    () =>
      storyOptions.find(
        (story) => story.value === String(formData.parentStoryId)
      ) || null,
    [formData.parentStoryId, storyOptions]
  );
  const supportsParentStory = ["Task", "Sub-task", "Bug"].includes(formData.type);
  const activeEpicOptions = useMemo(
    () =>
      (Array.isArray(projectEpicsData) ? projectEpicsData : [])
        .filter((epic) => String(epic?.status || "ACTIVE") !== "ARCHIVED")
        .map(buildEpicOption),
    [projectEpicsData]
  );
  const selectedEpicOption = useMemo(
    () =>
      activeEpicOptions.find((epic) => epic.value === String(formData.epicId)) ||
      null,
    [activeEpicOptions, formData.epicId]
  );
  const sprintOptions = useMemo(() => {
    const assignableSprints = (Array.isArray(projectSprintsData) ? projectSprintsData : [])
      .filter((sprint) => ["ACTIVE", "PLANNED"].includes(String(sprint?.state || "")))
      .filter((sprint) => {
        const sprintTeamId = resolveSprintTeamId(sprint);

        return !sprintTeamId || !formData.teamId || sprintTeamId === String(formData.teamId);
      })
      .sort((left, right) => {
        const stateDelta =
          (left.state === "ACTIVE" ? 0 : 1) - (right.state === "ACTIVE" ? 0 : 1);

        if (stateDelta !== 0) {
          return stateDelta;
        }

        return new Date(left.startDate || left.createdAt || 0) -
          new Date(right.startDate || right.createdAt || 0);
      });

    return [buildSprintOption(null), ...assignableSprints.map(buildSprintOption)];
  }, [formData.teamId, projectSprintsData]);
  const selectedSprintOption = useMemo(
    () =>
      sprintOptions.find((sprint) => sprint.value === String(formData.sprintId)) ||
      sprintOptions[0],
    [formData.sprintId, sprintOptions]
  );
  const isBugType = formData.type === "Bug";
  const isStoryType = formData.type === "Story";
  const qaOwnerOptions = useMemo(
    () =>
      projectMemberOptions.filter((option) => option.role === "Tester").length
        ? projectMemberOptions.filter((option) => option.role === "Tester")
        : projectMemberOptions,
    [projectMemberOptions]
  );
  const developerLeadOptions = useMemo(
    () =>
      assigneeOptions.filter((option) => option.role === "Developer").length
        ? assigneeOptions.filter((option) => option.role === "Developer")
        : assigneeOptions,
    [assigneeOptions]
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    logTeamSelectionDebug("Selected project", {
      component: "IssueCreateDialog",
      projectId: selectedProjectId,
      projectName: selectedProject?.name || "",
    });
  }, [open, selectedProject?.name, selectedProjectId]);

  useEffect(() => {
    if (!open) {
      return;
    }

    logTeamSelectionDebug("Filtered teams", {
      component: "IssueCreateDialog",
      projectId: selectedProjectId,
      source: projectTeamsSource,
      teams: availableTeams.map((team) => ({
        id: resolveTeamId(team),
        name: team?.name || "",
        memberCount: team?.memberCount || team?.members?.length || 0,
      })),
    });
  }, [availableTeams, open, projectTeamsSource, selectedProjectId]);

  useEffect(() => {
    if (!open) {
      return;
    }

    setFormData(
      buildInitialState({
        projects,
        defaultProjectId,
        defaultTeamId,
        defaultType: resolvedDefaultType,
        defaultParentStoryId,
      })
    );
    setAssignEntireTeam(false);
    setAssignToQueue(false);
    setIsSequenceSubmitting(false);
    setError("");
  }, [
    defaultParentStoryId,
    defaultProjectId,
    defaultTeamId,
    open,
    projects,
    resolvedDefaultType,
  ]);

  useEffect(() => {
    const nextTeamId = availableTeams.some(
      (team) => resolveTeamId(team) === String(formData.teamId)
    )
      ? String(formData.teamId)
      : resolveTeamSelection(availableTeams, defaultTeamId);

    if (nextTeamId === String(formData.teamId || "")) {
      return;
    }

    setFormData((current) => ({
      ...current,
      teamId: nextTeamId,
      assigneeId: "",
      sprintId: "",
      bugDetails: {
        ...current.bugDetails,
        testerOwnerId: "",
        developerLeadId: "",
      },
    }));
  }, [availableTeams, defaultTeamId, formData.teamId]);

  useEffect(() => {
    const assigneeIds = new Set(
      availableAssignees.map((assignee) => resolveUserId(assignee))
    );

    if (!formData.assigneeId || assigneeIds.has(String(formData.assigneeId))) {
      return;
    }

    setFormData((current) => ({
      ...current,
      assigneeId: "",
    }));
  }, [availableAssignees, formData.assigneeId]);

  useEffect(() => {
    const assigneeIds = new Set(assigneeOptions.map((assignee) => assignee.value));
    const projectMemberIds = new Set(
      projectMemberOptions.map((member) => member.value)
    );
    const testerOwnerValid =
      !formData.bugDetails.testerOwnerId ||
      projectMemberIds.has(String(formData.bugDetails.testerOwnerId));
    const developerLeadValid =
      !formData.bugDetails.developerLeadId ||
      assigneeIds.has(String(formData.bugDetails.developerLeadId));

    if (testerOwnerValid && developerLeadValid) {
      return;
    }

    setFormData((current) => ({
      ...current,
      bugDetails: {
        ...current.bugDetails,
        testerOwnerId: testerOwnerValid ? current.bugDetails.testerOwnerId : "",
        developerLeadId: developerLeadValid ? current.bugDetails.developerLeadId : "",
      },
    }));
  }, [
    assigneeOptions,
    formData.bugDetails.developerLeadId,
    formData.bugDetails.testerOwnerId,
    projectMemberOptions,
  ]);

  useEffect(() => {
    if (
      !formData.dependsOnIssueId ||
      dependencyOptions.some(
        (issue) => issue.value === String(formData.dependsOnIssueId)
      )
    ) {
      return;
    }

    setFormData((current) => ({
      ...current,
      dependsOnIssueId: "",
      parentStoryId: "",
    }));
  }, [dependencyOptions, formData.dependsOnIssueId]);

  useEffect(() => {
    if (
      !formData.parentStoryId ||
      storyOptions.some(
        (story) => story.value === String(formData.parentStoryId)
      )
    ) {
      return;
    }

    setFormData((current) => ({
      ...current,
      parentStoryId: "",
    }));
  }, [formData.parentStoryId, storyOptions]);

  useEffect(() => {
    if (
      !formData.epicId ||
      activeEpicOptions.some((epic) => epic.value === String(formData.epicId))
    ) {
      return;
    }

    setFormData((current) => ({
      ...current,
      epicId: "",
    }));
  }, [activeEpicOptions, formData.epicId]);

  useEffect(() => {
    if (
      !formData.sprintId ||
      sprintOptions.some((sprint) => sprint.value === String(formData.sprintId))
    ) {
      return;
    }

    setFormData((current) => ({
      ...current,
      sprintId: "",
    }));
  }, [formData.sprintId, sprintOptions]);

  useEffect(() => {
    if (!assignEntireTeam && !assignToQueue) {
      return;
    }

    setFormData((current) => ({
      ...current,
      assigneeId: "",
    }));
  }, [assignEntireTeam, assignToQueue]);

  const blockedMessage = useMemo(() => {
    if (!projects.length) {
      return "Create a project before adding work items.";
    }

    if (!selectedProject) {
      return "Select a project to continue.";
    }

    if (!availableTeams.length) {
      return "No teams were returned for this project. Attach a team or ask an admin to verify the project-team links.";
    }

    return "";
  }, [availableTeams.length, projects.length, selectedProject]);

  const isSubmitPending = isPending || isSequenceSubmitting;

  const handleProjectChange = (option) => {
    setFormData((current) => ({
      ...current,
      projectId: option?.value || "",
      teamId: "",
      assigneeId: "",
      dependsOnIssueId: "",
      epicId: "",
      sprintId: "",
      bugDetails: {
        ...current.bugDetails,
        testerOwnerId: "",
        developerLeadId: "",
      },
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!formData.title.trim() || !formData.projectId || !formData.teamId) {
      setError("Title, project, and team are required.");
      return;
    }

    if (blockedMessage) {
      setError(blockedMessage);
      return;
    }

    if (
      !assignEntireTeam &&
      formData.assigneeId &&
      !availableAssignees.some(
        (assignee) => resolveUserId(assignee) === String(formData.assigneeId)
      )
    ) {
      setError("Choose an assignee from the selected team.");
      return;
    }

    if (canManagePlanningFields) {
      if (activeEpicOptions.length && !formData.epicId) {
        setError("Epic is required for this project.");
        return;
      }

      if (
        formData.epicId &&
        !activeEpicOptions.some((epic) => epic.value === String(formData.epicId))
      ) {
        setError("Choose an epic from the selected project.");
        return;
      }

      if (
        formData.sprintId &&
        !sprintOptions.some((sprint) => sprint.value === String(formData.sprintId))
      ) {
        setError("Choose a sprint from the selected project.");
        return;
      }
    }

    if (assignEntireTeam && !availableAssignees.length) {
      setError("The selected team does not have any members to assign.");
      return;
    }

    if (isBugType) {
      if (!formData.priority) {
        setError("Priority is required for bugs.");
        return;
      }
    }

    const basePayload = {
      title: formData.title.trim(),
      description: isStoryType ? formData.description.trim() : "",
      projectId: formData.projectId,
      teamId: formData.teamId,
      priority: formData.priority,
      type: formData.type,
      dueAt: null,
      dependsOnIssueId: null,
      parentStoryId: formData.parentStoryId || null,
      status:
        isBugType
          ? ISSUE_STATUS.NEW
          : formData.type === "Story"
            ? ISSUE_STATUS.DRAFT
            : ISSUE_STATUS.TODO,
      storyPoints: null,
      acceptanceCriteria: [],
      definitionOfDone: "",
      labels: [],
      timeEstimateMinutes: 0,
      addToBucket: assignToQueue,
      ...(canManagePlanningFields
        ? {
            epicId: formData.epicId || null,
            sprintId: formData.sprintId || null,
          }
        : {}),
      ...(isBugType
        ? {
            bugDetails: {
              severity: formData.bugDetails.severity || "Major",
              testerOwnerId: formData.bugDetails.testerOwnerId || null,
              developerLeadId: assignToQueue ? null : formData.bugDetails.developerLeadId || null,
              addToBucket: assignToQueue,
              stepsToReproduce: "",
              expectedResult: "",
              actualResult: "",
            },
          }
        : {
            bugDetails: {
              addToBucket: assignToQueue,
            },
          }),
    };

    const payloads = assignEntireTeam
      ? availableAssignees.map((assignee) => ({
          ...basePayload,
          assigneeId: resolveUserId(assignee),
        }))
      : [
          {
            ...basePayload,
            assigneeId: assignToQueue ? null : formData.assigneeId || null,
          },
        ];

    let createdCount = 0;

    try {
      setError("");
      setIsSequenceSubmitting(payloads.length > 1);

      for (const payload of payloads) {
        await onSubmit(payload);
        createdCount += 1;
      }

      onOpenChange(false);
    } catch (submitError) {
      const message =
        submitError.response?.data?.message || "Unable to create the work item.";

      setError(
        createdCount > 0
          ? `Created ${createdCount} work item${createdCount === 1 ? "" : "s"} before the next assignment failed. ${message}`
          : message
      );
    } finally {
      setIsSequenceSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl gap-0 overflow-visible border border-slate-200/80 bg-white p-0 shadow-[0_36px_90px_-50px_rgba(15,23,42,0.35)]">
        <div className="max-h-[90vh] overflow-y-auto overflow-x-visible">
          <DialogHeader className="sticky top-0 z-20 border-b border-slate-200/80 bg-white px-5 py-3.5 sm:px-6">
            <DialogTitle className="text-2xl tracking-tight text-slate-950">
              Create work item
            </DialogTitle>
          </DialogHeader>

          <form className="space-y-3.5 px-5 py-4 sm:px-6" onSubmit={handleSubmit}>
            {blockedMessage ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-700">
                {blockedMessage}
              </div>
            ) : null}

            <div className="grid gap-3 lg:grid-cols-[minmax(220px,0.3fr)_minmax(0,0.7fr)]">
              <div className="space-y-1.5">
                <SectionLabel title="Project" />
                <Select
                  options={projectOptions}
                  value={selectedProjectOption}
                  onChange={handleProjectChange}
                  styles={issueSelectStyles}
                  formatOptionLabel={formatProjectOptionLabel}
                  isSearchable={false}
                  isDisabled={!projectOptions.length || isSubmitPending}
                  menuPortalTarget={menuPortalTarget}
                  {...baseSelectProps}
                  placeholder="Select a project"
                />
              </div>

              <label className="space-y-1.5">
                <span className="text-sm font-semibold text-slate-900">Work Item Title</span>
                <Input
                  className="h-12 rounded-2xl border-slate-200 text-base shadow-none focus-visible:border-blue-500 focus-visible:ring-4 focus-visible:ring-blue-500/10"
                  name="title"
                  value={formData.title}
                  onChange={(event) =>
                    setFormData((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                  placeholder="Add a concise summary"
                  disabled={isSubmitPending}
                />
              </label>
            </div>

            {isStoryType ? (
              <label className="block space-y-1.5">
                <span className="text-sm font-semibold text-slate-900">Description</span>
                <Textarea
                  className="min-h-[96px] rounded-2xl border-slate-200 text-sm shadow-none focus-visible:border-blue-500 focus-visible:ring-4 focus-visible:ring-blue-500/10"
                  value={formData.description}
                  onChange={(event) =>
                    setFormData((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                  placeholder="Add context, user value, acceptance notes, or scope details"
                  disabled={isSubmitPending}
                />
              </label>
            ) : null}

            <div className="rounded-[24px] border border-slate-200/80 bg-slate-50/80 p-3 sm:p-3.5 shadow-[0_16px_40px_-32px_rgba(15,23,42,0.35)]">
              <div className="space-y-3">
                <SectionLabel
                  title="Assign"
                  description="Quickly assign this work item"
                />

                <div className="grid items-start gap-3 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                      Team
                    </span>
                    <Select
                      options={teamOptions}
                      value={selectedTeamOption}
                      onChange={(option) =>
                        setFormData((current) => ({
                          ...current,
                          teamId: option?.value || "",
                          assigneeId: "",
                          sprintId: "",
                          bugDetails: {
                            ...current.bugDetails,
                            testerOwnerId: "",
                            developerLeadId: "",
                          },
                        }))
                      }
                      styles={issueSelectStyles}
                      formatOptionLabel={formatTeamOptionLabel}
                      isSearchable={false}
                      isDisabled={!teamOptions.length || isSubmitPending}
                      menuPortalTarget={menuPortalTarget}
                      {...baseSelectProps}
                      placeholder="Select team"
                    />

                    <label className="mt-2.5 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 px-3 py-2.5 text-sm text-amber-900">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500/30"
                        checked={assignToQueue}
                        disabled={!formData.teamId || assignEntireTeam || isSubmitPending}
                        onChange={(event) => {
                          const checked = event.target.checked;
                          setAssignToQueue(checked);
                          if (checked) {
                            setFormData((current) => ({
                              ...current,
                              assigneeId: "",
                            }));
                          }
                        }}
                      />
                      <span className="space-y-1">
                        <span className="block font-medium text-amber-950">
                          Add to Work Queue
                        </span>
                        <span className="block text-amber-800/80">
                          Developers can pick this up later from the shared queue.
                        </span>
                      </span>
                    </label>
                  </div>

                  <div className="space-y-2.5">
                    <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                      Assignee
                    </span>
                    <div className="space-y-2.5">
                      <div
                        className={
                          assignEntireTeam
                            ? "cursor-not-allowed rounded-[20px] opacity-65 transition-opacity"
                            : "rounded-[20px] transition-opacity"
                        }
                      >
                        <Select
                          options={assigneeOptions}
                          value={selectedAssigneeOption}
                          onChange={(option) =>
                            setFormData((current) => ({
                              ...current,
                              assigneeId: option?.value || "",
                            }))
                          }
                          styles={issueSelectStyles}
                          formatOptionLabel={formatAssigneeOptionLabel}
                          isClearable
                          isDisabled={
                            !formData.teamId || assignEntireTeam || assignToQueue || isSubmitPending
                          }
                          menuPortalTarget={menuPortalTarget}
                          {...baseSelectProps}
                          placeholder={
                            assignEntireTeam
                              ? "Disabled while team-wide assignment is enabled"
                              : assignToQueue
                                ? "Disabled while work queue is enabled"
                              : "Select assignee"
                          }
                          noOptionsMessage={() =>
                            formData.teamId
                              ? "No teammates available in this team."
                              : "Select a team first."
                          }
                        />
                      </div>

                      <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white/80 px-3 py-2.5 text-sm text-slate-600">
                        <input
                          type="checkbox"
                          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/30"
                          checked={assignEntireTeam}
                          disabled={!formData.teamId || assignToQueue || isSubmitPending}
                          onChange={(event) => setAssignEntireTeam(event.target.checked)}
                        />
                        <span className="space-y-1">
                          <span className="block font-medium text-slate-800">
                            Assign to entire team
                          </span>
                          <span className="block text-slate-500">
                            When enabled, this creates one work item for each teammate.
                          </span>
                        </span>
                      </label>

                      {assignEntireTeam ? (
                        <div className="rounded-2xl border border-blue-100 bg-blue-50/80 px-3 py-2.5 text-sm text-blue-900">
                          {availableAssignees.length
                            ? `This work item will be created for ${availableAssignees.length} team member${availableAssignees.length === 1 ? "" : "s"}.`
                            : "This team does not have any members available yet."}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {canManagePlanningFields ? (
              <div className="rounded-[24px] border border-slate-200/80 bg-white p-3 sm:p-3.5 shadow-[0_16px_40px_-32px_rgba(15,23,42,0.28)]">
                <div className="space-y-3">
                  <SectionLabel
                    title="Planning"
                    description="Map the work item into an epic and sprint."
                  />

                  <div className="grid items-start gap-3 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                        Epic
                      </span>
                      <Select
                        options={activeEpicOptions}
                        value={selectedEpicOption}
                        onChange={(option) =>
                          setFormData((current) => ({
                            ...current,
                            epicId: option?.value || "",
                          }))
                        }
                        styles={issueSelectStyles}
                        formatOptionLabel={formatEpicOptionLabel}
                        isClearable={!activeEpicOptions.length}
                        isSearchable
                        isDisabled={!formData.projectId || !activeEpicOptions.length || isSubmitPending}
                        menuPortalTarget={menuPortalTarget}
                        {...baseSelectProps}
                        placeholder={
                          activeEpicOptions.length
                            ? "Search epics"
                            : "No epics in this project"
                        }
                        noOptionsMessage={() =>
                          formData.projectId
                            ? "No epics available."
                            : "Select a project first."
                        }
                      />
                    </div>

                    <div className="space-y-1.5">
                      <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                        Sprint
                      </span>
                      <Select
                        options={sprintOptions}
                        value={selectedSprintOption}
                        onChange={(option) =>
                          setFormData((current) => ({
                            ...current,
                            sprintId: option?.value || "",
                          }))
                        }
                        styles={issueSelectStyles}
                        formatOptionLabel={formatSprintOptionLabel}
                        isSearchable
                        isDisabled={!formData.projectId || isSubmitPending}
                        menuPortalTarget={menuPortalTarget}
                        {...baseSelectProps}
                        placeholder="Backlog"
                        noOptionsMessage={() =>
                          formData.projectId
                            ? "No active or upcoming sprints."
                            : "Select a project first."
                        }
                      />
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="border-t border-slate-200/80 pt-3">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                    Priority
                  </span>
                  <select
                    className="field-select rounded-2xl"
                    value={formData.priority}
                    onChange={(event) =>
                      setFormData((current) => ({
                        ...current,
                        priority: event.target.value,
                      }))
                    }
                    disabled={isSubmitPending}
                  >
                    {(isBugType ? BUG_PRIORITY_OPTIONS : ISSUE_PRIORITIES).map((priority) => (
                      <option key={priority} value={priority}>
                        {priority}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                    Type
                  </span>
                  <select
                    className="field-select rounded-2xl"
                    value={formData.type}
                    onChange={(event) =>
                      setFormData((current) => ({
                        ...current,
                        type: event.target.value,
                        status:
                          event.target.value === "Bug"
                            ? ISSUE_STATUS.NEW
                            : event.target.value === "Story"
                              ? ISSUE_STATUS.DRAFT
                              : ISSUE_STATUS.TODO,
                        priority:
                          event.target.value === "Bug" && current.priority === "Low"
                            ? "High"
                            : current.priority,
                      }))
                    }
                    disabled={lockType || isSubmitPending}
                  >
                    {typeOptions.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            {supportsParentStory ? (
              <div className="space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                  Parent Story (Optional)
                </span>
                <Select
                  options={storyOptions}
                  value={selectedStoryOption}
                  onChange={(option) => {
                    const story = option?.issue;

                    setFormData((current) => ({
                      ...current,
                      parentStoryId: option?.value || "",
                      teamId: story?.teamId?._id || story?.teamId || current.teamId,
                      epicId: story?.epicId?._id || story?.epicId || current.epicId,
                      sprintId:
                        story?.sprintId?._id || story?.sprintId || current.sprintId,
                    }));
                  }}
                  styles={issueSelectStyles}
                  formatOptionLabel={formatDependencyLabel}
                  isSearchable
                  isClearable
                  isDisabled={!formData.projectId || isSubmitPending}
                  menuPortalTarget={menuPortalTarget}
                  {...baseSelectProps}
                  placeholder="No parent Story"
                  noOptionsMessage={() => "No Stories found in this project."}
                />
              </div>
            ) : null}

            {error ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-700">
                {error}
              </div>
            ) : null}

            <div className="sticky bottom-0 -mx-5 flex justify-end gap-3 border-t border-slate-200/80 bg-white/95 px-5 py-3 backdrop-blur sm:-mx-6 sm:px-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitPending || Boolean(blockedMessage)}
              >
                {isSubmitPending ? "Creating..." : "Create"}
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default IssueCreateDialog;
