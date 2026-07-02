import axios from "axios";
import {
  AUTH_SESSION_CLEARED_EVENT,
  clearStoredSession,
  readStoredSession,
} from "@/lib/session";
import { normalizeWorkspaceSenderResponse } from "@/lib/workspaceSender";
import { CURRENT_WORKSPACE_SCOPE } from "@/lib/workspace";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "/api",
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use((config) => {
  const session = readStoredSession();

  if (typeof FormData !== "undefined" && config.data instanceof FormData) {
    delete config.headers["Content-Type"];
    delete config.headers["content-type"];
  }

  if (session?.token) {
    config.headers.Authorization = `Bearer ${session.token}`;
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("app:user-activity", {
        detail: {
          source: "api",
          method: config.method,
          url: config.url,
        },
      })
    );
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      clearStoredSession();

      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event(AUTH_SESSION_CLEARED_EVENT));
      }
    }

    return Promise.reject(error);
  }
);

const buildParams = (filters = {}) =>
  Object.fromEntries(
    Object.entries(filters).filter(
      ([, value]) => value !== undefined && value !== null && value !== "" && value !== "all"
    )
  );

const hasOwnField = (payload, field) =>
  Object.prototype.hasOwnProperty.call(payload || {}, field);

const normalizeIssueFilters = (filters = {}) => {
  const normalizedFilters = {
    ...filters,
  };

  if (
    !hasOwnField(normalizedFilters, "assigneeId") &&
    hasOwnField(normalizedFilters, "assignee")
  ) {
    normalizedFilters.assigneeId = normalizedFilters.assignee;
    delete normalizedFilters.assignee;
  }

  return normalizedFilters;
};

const normalizeIssuePayload = (payload = {}) => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return payload;
  }

  const normalizedPayload =
    hasOwnField(payload, "assigneeId") || !hasOwnField(payload, "assignee")
      ? { ...payload }
      : {
          ...payload,
          assigneeId: payload.assignee,
        };

  Object.keys(normalizedPayload).forEach((key) => {
    if (normalizedPayload[key] === null || typeof normalizedPayload[key] === "undefined") {
      delete normalizedPayload[key];
    }
  });

  return normalizedPayload;
};

const normalizeStatusOnlyPayload = (payload = {}) => {
  const normalizedPayload = normalizeIssuePayload(payload);

  if (!normalizedPayload || typeof normalizedPayload !== "object" || Array.isArray(normalizedPayload)) {
    return normalizedPayload;
  }

  if (
    hasOwnField(normalizedPayload, "status") &&
    Object.keys(normalizedPayload).every((key) =>
      ["status", "statusChangeComment", "comment", "reopenReason", "rejectionReason", "targetRelease", "futureRelease"].includes(key)
    )
  ) {
    return Object.fromEntries(
      Object.entries(normalizedPayload).filter(([, value]) => value !== "")
    );
  }

  return normalizedPayload;
};

const logIssuePayload = (label, payload) => {
  if (!import.meta.env.DEV) {
    return;
  }

  console.log(`[api] ${label} payload:`, payload);
};

const isTeamSelectionDebugEnabled = () =>
  import.meta.env.DEV || import.meta.env.VITE_DEBUG_TEAM_SELECTION === "true";

export const logTeamSelectionDebug = (label, payload) => {
  if (!isTeamSelectionDebugEnabled()) {
    return;
  }

  console.log(`[team-selection] ${label}:`, payload);
};

const summarizeTeamsForDebug = (teams = []) =>
  teams.map((team) => ({
    id: String(team?._id || team?.id || ""),
    name: team?.name || "",
    workspaceId: team?.workspaceId || "",
    memberCount: team?.memberCount || team?.members?.length || 0,
  }));

const summarizeProjectsForTeamDebug = (projects = []) =>
  projects.map((project) => ({
    id: String(project?._id || project?.id || ""),
    name: project?.name || "",
    workspaceId: project?.workspaceId || "",
    teamCount:
      project?.teamCount ??
      project?.teams?.length ??
      project?.attachedTeams?.length ??
      project?.teamIds?.length ??
      0,
    teams: summarizeTeamsForDebug(project?.teams || []),
    attachedTeams: summarizeTeamsForDebug(project?.attachedTeams || []),
    teamIdsCount: Array.isArray(project?.teamIds) ? project.teamIds.length : 0,
  }));

const getTeamSelectionDebugContext = () => {
  const session = readStoredSession();

  return {
    currentUserRole: session?.user?.role || session?.role || "",
    productionEnv: import.meta.env.PROD,
    apiBaseUrl: api.defaults.baseURL || "",
  };
};

export const loginRequest = async (payload) => {
  const response = await api.post("/auth/login", payload);
  return response.data;
};

export const adminLoginRequest = async (payload = {}) => {
  const response = await api.post("/auth/admin-login", payload);
  return response.data;
};

export const fetchCurrentUser = async () => {
  const response = await api.get("/auth/me");
  return response.data?.user || response.data;
};

export const registerRequest = async (payload) => {
  const response = await api.post("/auth/register", payload);
  return response.data;
};

export const changePasswordRequest = async (payload) => {
  const response = await api.post("/auth/change-password", payload);
  return response.data;
};

export const requestPasswordReset = async (payload) => {
  const response = await api.post("/auth/forgot-password", payload);
  return response.data;
};

export const resetPassword = async (payload) => {
  const response = await api.post("/auth/reset-password", payload);
  return response.data;
};

export const fetchUsers = async () => {
  const response = await api.get("/auth/users");
  const data = response.data;

  if (import.meta.env.DEV) {
    console.log("[api] Users response:", data);
  }

  if (Array.isArray(data)) {
    return data;
  }

  if (Array.isArray(data?.users)) {
    return data.users;
  }

  console.warn("[api] Unexpected users response shape:", data);
  return [];
};

export const fetchWorkspaceUsers = async (
  workspaceId = CURRENT_WORKSPACE_SCOPE
) => {
  const response = await api.get(`/workspaces/${workspaceId}/users`);
  const data = response.data;

  if (Array.isArray(data)) {
    return data;
  }

  if (Array.isArray(data?.users)) {
    return data.users;
  }

  console.warn("[api] Unexpected workspace users response shape:", data);
  return [];
};

export const fetchManagedUsers = async () => {
  const response = await api.get("/users");
  const data = response.data;

  if (Array.isArray(data)) {
    return data;
  }

  if (Array.isArray(data?.users)) {
    return data.users;
  }

  console.warn("[api] Unexpected managed users response shape:", data);
  return [];
};

export const fetchProjects = async () => {
  const response = await api.get("/projects");
  const data = response.data;
  const projects = Array.isArray(data)
    ? data
    : Array.isArray(data?.projects)
      ? data.projects
      : [];

  logTeamSelectionDebug("Projects API response", {
    ...getTeamSelectionDebugContext(),
    responseShape: Array.isArray(data)
      ? "array"
      : Array.isArray(data?.projects)
        ? "object.projects"
        : typeof data,
    projectCount: projects.length,
    projects: summarizeProjectsForTeamDebug(projects),
  });

  if (Array.isArray(data)) {
    return data;
  }

  if (Array.isArray(data?.projects)) {
    return data.projects;
  }

  console.warn("[api] Unexpected projects response shape:", data);
  return [];
};

export const fetchProjectTeams = async (projectId) => {
  if (!projectId) {
    return [];
  }

  const response = await api.get(`/projects/${projectId}/teams`);
  const data = response.data;
  const teams = Array.isArray(data)
    ? data
    : Array.isArray(data?.teams)
      ? data.teams
      : [];

  logTeamSelectionDebug("Project teams API response", {
    ...getTeamSelectionDebugContext(),
    projectId,
    responseShape: Array.isArray(data)
      ? "array"
      : Array.isArray(data?.teams)
        ? "object.teams"
        : typeof data,
    returnedTeamsCount: teams.length,
    teamNames: teams.map((team) => team?.name || ""),
    teams: summarizeTeamsForDebug(teams),
  });

  if (Array.isArray(data)) {
    return data;
  }

  if (Array.isArray(data?.teams)) {
    return data.teams;
  }

  console.warn("[api] Unexpected project teams response shape:", data);
  return [];
};

export const createProject = async (payload) => {
  const response = await api.post("/projects", payload);
  return response.data;
};

export const updateProject = async ({ projectId, payload }) => {
  const response = await api.patch(`/projects/${projectId}`, payload);
  return response.data;
};

export const deleteProject = async (projectId) => {
  const response = await api.delete(`/projects/${projectId}`);
  return response.data;
};

export const addProjectMember = async ({ projectId, userId, role }) => {
  const response = await api.post(`/projects/${projectId}/members`, {
    userId,
    role,
  });
  return response.data;
};

export const removeProjectMember = async ({ projectId, userId }) => {
  const response = await api.delete(`/projects/${projectId}/members/${userId}`);
  return response.data;
};

export const attachProjectTeam = async ({ projectId, teamId }) => {
  const response = await api.post(`/projects/${projectId}/teams`, {
    teamId,
  });
  return response.data;
};

export const detachProjectTeam = async ({ projectId, teamId }) => {
  const response = await api.delete(`/projects/${projectId}/teams/${teamId}`);
  return response.data;
};

export const updateProjectStatus = async ({ projectId, isCompleted }) => {
  const response = await api.patch(`/projects/${projectId}/status`, {
    isCompleted,
  });
  return response.data;
};

export const fetchProjectMeetings = async ({ projectId }) => {
  const response = await api.get(`/projects/${projectId}/meetings`);
  const data = response.data;

  if (Array.isArray(data)) {
    return data;
  }

  if (Array.isArray(data?.meetings)) {
    return data.meetings;
  }

  console.warn("[api] Unexpected project meetings response shape:", data);
  return [];
};

export const fetchTeams = async (workspaceId = CURRENT_WORKSPACE_SCOPE) => {
  const response = await api.get("/teams", {
    params: buildParams({
      workspaceId,
    }),
  });
  const data = response.data;

  if (Array.isArray(data)) {
    return data;
  }

  if (Array.isArray(data?.teams)) {
    return data.teams;
  }

  console.warn("[api] Unexpected teams response shape:", data);
  return [];
};

export const fetchTeam = async (id) => {
  const response = await api.get(`/teams/${id}`);
  return response.data;
};

export const createTeam = async (payload) => {
  const response = await api.post("/teams", payload);
  return response.data;
};

export const deleteTeam = async (teamId) => {
  const response = await api.delete(`/teams/${teamId}`);
  return response.data;
};

export const addTeamMember = async ({ teamId, userId }) => {
  const response = await api.post(`/teams/${teamId}/members`, {
    userId,
  });
  return response.data;
};

export const removeTeamMember = async ({ teamId, userId }) => {
  const response = await api.delete(`/teams/${teamId}/members/${userId}`);
  return response.data;
};

export const fetchIssues = async (filters = {}) => {
  const params = buildParams(normalizeIssueFilters(filters));
  const response = await api.get("/issues", {
    params,
  });
  return response.data;
};

export const fetchStories = async (filters = {}) => {
  const params = buildParams(normalizeIssueFilters(filters));
  const response = await api.get("/issues/stories", { params });
  return response.data;
};

export const fetchIssueStats = async (filters = {}) => {
  const params = buildParams(normalizeIssueFilters(filters));
  const response = await api.get("/issues/stats", {
    params,
  });
  return response.data;
};

export const fetchBugs = async (filters = {}) => {
  const params = buildParams(normalizeIssueFilters(filters));
  const response = await api.get("/bugs", {
    params,
  });
  return response.data;
};

export const fetchMyIssues = async (filters = {}) => {
  const params = buildParams(normalizeIssueFilters(filters));
  const response = await api.get("/issues/my", {
    params,
  });
  return response.data;
};

export const fetchMyReportedBugs = async () => {
  const response = await api.get("/issues/reported/me");
  return response.data;
};

export const fetchBugBucket = async (filters = {}) => {
  const params = buildParams(normalizeIssueFilters(filters));
  const response = await api.get("/issues/bucket", {
    params,
  });
  return response.data;
};

export const pickIssue = async (id) => {
  const response = await api.post(`/issues/${id}/pick`);
  return response.data;
};

export const fetchIssueActivity = async (filters = {}) => {
  const params = buildParams(normalizeIssueFilters(filters));
  const response = await api.get("/issues/activity", {
    params,
  });
  const data = response.data;

  if (Array.isArray(data)) {
    return data;
  }

  if (Array.isArray(data?.activity)) {
    return data.activity;
  }

  console.warn("[api] Unexpected issue activity response shape:", data);
  return [];
};

export const fetchNotifications = async () => {
  const response = await api.get("/issues/notifications");
  return response.data || [];
};

export const fetchUnreadNotificationCount = async () => {
  const response = await api.get("/issues/notifications/unread-count");
  return response.data?.count || 0;
};

export const markNotificationAsRead = async (id) => {
  const response = await api.patch(`/issues/notifications/${id}/read`);
  return response.data;
};

export const markAllNotificationsAsRead = async () => {
  const response = await api.post("/issues/notifications/read-all");
  return response.data;
};

export const createIssue = async (payload) => {
  const normalizedPayload = normalizeIssuePayload(payload);
  logIssuePayload("Create issue", normalizedPayload);
  const response = await api.post("/issues", normalizedPayload);
  return response.data;
};

export const updateIssue = async ({ id, payload }) => {
  const normalizedPayload = normalizeStatusOnlyPayload(payload);
  logIssuePayload("Update issue", normalizedPayload);
  const response = await api.put(`/issues/${id}`, normalizedPayload);
  return response.data;
};

export const updateTaskStatus = async ({ id, status }) => {
  const response = await api.patch(`/tasks/${id}/status`, {
    status,
  });
  return response.data;
};

export const fetchRecentTasks = async () => {
  const response = await api.get("/tasks/recent");
  const data = response.data;

  if (Array.isArray(data)) {
    return data;
  }

  if (Array.isArray(data?.tasks)) {
    return data.tasks;
  }

  console.warn("[api] Unexpected recent tasks response shape:", data);
  return [];
};

export const deleteIssue = async (id) => {
  const response = await api.delete(`/issues/${id}`);
  return response.data;
};

export const fetchComments = async (issueId) => {
  const response = await api.get(`/comments/${issueId}`);
  return response.data;
};

export const createComment = async (payload) => {
  const response = await api.post("/comments", payload);
  return response.data;
};

export const fetchAnalyticsOverview = async (filters = {}) => {
  const response = await api.get("/analytics/overview", {
    params: buildParams(normalizeIssueFilters(filters)),
  });
  return response.data;
};

export const fetchTeamActivity = async (filters = {}) => {
  const response = await api.get("/activity/team", {
    params: buildParams(filters),
  });
  return response.data;
};

export const fetchMyActivity = async () => {
  const response = await api.get("/activity/me");
  return response.data;
};

export const fetchProductivityReport = async (filters = {}) => {
  const response = await api.get("/activity/productivity", {
    params: buildParams(filters),
  });
  return response.data;
};

export const fetchBugEffortAnalytics = async (filters = {}) => {
  const response = await api.get("/activity/bug-effort", {
    params: buildParams(filters),
  });
  return response.data;
};

export const fetchAnalyticsTrends = async (filters = {}) => {
  const response = await api.get("/analytics/trends", {
    params: buildParams(normalizeIssueFilters(filters)),
  });
  return response.data;
};

export const fetchAnalyticsPriorities = async (filters = {}) => {
  const response = await api.get("/analytics/priorities", {
    params: buildParams(normalizeIssueFilters(filters)),
  });
  return response.data;
};

export const fetchAnalyticsProjects = async (filters = {}) => {
  const response = await api.get("/analytics/projects", {
    params: buildParams(normalizeIssueFilters(filters)),
  });
  return response.data;
};

export const fetchAnalyticsTeams = async (filters = {}) => {
  const response = await api.get("/analytics/teams", {
    params: buildParams(normalizeIssueFilters(filters)),
  });
  return response.data;
};

export const fetchAnalyticsRecentActivity = async (filters = {}) => {
  const response = await api.get("/analytics/recent-activity", {
    params: buildParams(normalizeIssueFilters(filters)),
  });
  return response.data;
};

export const fetchAnalyticsIssues = async (filters = {}) => {
  const response = await api.get("/analytics/issues", {
    params: buildParams(normalizeIssueFilters(filters)),
  });
  return response.data;
};

export const fetchReports = async (filters = {}) => {
  const response = await api.get("/reports", {
    params: buildParams(normalizeIssueFilters(filters)),
  });
  return response.data;
};

export const fetchProjectReports = async (filters = {}) => {
  const response = await api.get("/reports/projects", {
    params: buildParams(normalizeIssueFilters(filters)),
  });
  return response.data;
};

export const fetchUserReports = async (filters = {}) => {
  const response = await api.get("/reports/users", {
    params: buildParams(normalizeIssueFilters(filters)),
  });
  return response.data;
};

export const fetchSelectedUserReport = async (filters = {}) => {
  const data = await fetchUserReports(filters);

  if (Array.isArray(data?.users)) {
    return data.users[0] || null;
  }

  return null;
};

export const fetchTeamReports = async (filters = {}) => {
  const response = await api.get("/reports/team", {
    params: buildParams(normalizeIssueFilters(filters)),
  });
  return response.data;
};

export const fetchDeveloperDashboardAnalytics = async (filters = {}) => {
  const response = await api.get("/reports/developer/dashboard", {
    params: buildParams(normalizeIssueFilters(filters)),
  });
  return response.data;
};

export const fetchSprintReports = async (filters = {}) => {
  const response = await api.get("/reports/sprints", {
    params: buildParams(filters),
  });
  return response.data;
};

export const fetchSelectedSprintReport = async (sprintId) => {
  const response = await api.get(`/reports/sprints/${sprintId}`);
  return response.data;
};

export const fetchBacklogBoard = async (filters = {}) => {
  const response = await api.get("/backlog", {
    params: buildParams(normalizeIssueFilters(filters)),
  });
  return response.data;
};

export const reorderIssuePlanning = async (payload) => {
  const response = await api.post("/backlog/reorder", payload);
  return response.data;
};

export const fetchEpics = async ({ projectId }) => {
  const response = await api.get("/epics", {
    params: buildParams({
      projectId,
    }),
  });
  return response.data;
};

export const createEpic = async (payload) => {
  const response = await api.post("/epics", payload);
  return response.data;
};

export const updateEpic = async ({ id, payload }) => {
  const response = await api.patch(`/epics/${id}`, payload);
  return response.data;
};

export const deleteEpic = async ({ id, payload = {} }) => {
  const response = await api.delete(`/epics/${id}`, {
    data: payload,
  });
  return response.data;
};

export const fetchSprints = async (filters = {}) => {
  const response = await api.get("/sprints", {
    params: buildParams(filters),
  });
  return response.data;
};

export const fetchSprintIssues = async (sprintId) => {
  const response = await api.get(`/sprints/${sprintId}/issues`);
  return response.data;
};

export const createSprint = async (payload) => {
  const response = await api.post("/sprints", payload);
  return response.data;
};

export const updateSprint = async ({ id, payload }) => {
  const response = await api.patch(`/sprints/${id}`, payload);
  return response.data;
};

export const deleteSprint = async (id) => {
  const response = await api.delete(`/sprints/${id}`);
  return response.data;
};

export const startSprint = async (id) => {
  const response = await api.post(`/sprints/${id}/start`);
  const sprint = response.data;
  const sprintState = String(sprint?.state || sprint?.status || "").trim().toUpperCase();

  if (sprintState !== "ACTIVE") {
    const error = new Error(
      sprint?.message || "Sprint did not transition to Active in the backend."
    );

    error.response = {
      data: {
        message: sprint?.message || "Sprint did not transition to Active in the backend.",
        code: "SPRINT_START_STATE_MISMATCH",
        details: {
          sprintId: String(sprint?._id || id || ""),
          state: sprint?.state || sprint?.status || "",
        },
      },
    };

    throw error;
  }

  return sprint;
};

export const completeSprint = async ({ id, payload }) => {
  const response = await api.post(`/sprints/${id}/complete`, payload);
  return response.data;
};

export const updateIssuePlanning = async ({ id, payload }) => {
  const response = await api.patch(`/issues/${id}/planning`, payload);
  return response.data;
};

export const moveIssueToSprint = async ({ id, sprintId }) => {
  const response = await api.post(`/issues/${id}/sprint`, {
    sprintId,
  });
  return response.data;
};

export const removeIssueFromSprint = async (id) => {
  const response = await api.delete(`/issues/${id}/sprint`);
  return response.data;
};

export const fetchIssueAttachments = async (issueId) => {
  const response = await api.get(`/issues/${issueId}/attachments`);
  return response.data;
};

export const uploadIssueAttachment = async ({ issueId, file }) => {
  const formData = new FormData();
  formData.append("file", file);

  const response = await api.post(`/issues/${issueId}/attachments`, formData);
  return response.data;
};

export const fetchIssueWorklogs = async (issueId) => {
  const response = await api.get(`/issues/${issueId}/worklogs`);
  return response.data;
};

export const createIssueWorklog = async ({ issueId, payload }) => {
  const response = await api.post(`/issues/${issueId}/worklogs`, payload);
  return response.data;
};

export const fetchIssueHistory = async (issueId) => {
  const response = await api.get(`/issues/${issueId}/history`);
  return response.data;
};

export const suggestIssuePriority = async ({ issueId, payload }) => {
  const response = await api.post(`/issues/${issueId}/suggest-priority`, payload);
  return response.data;
};

export const resolveApiAssetUrl = (assetPath = "") => {
  if (!assetPath) {
    return "";
  }

  if (/^https?:\/\//i.test(assetPath)) {
    return assetPath;
  }

  const normalizedAssetPath = assetPath.startsWith("/uploads/")
    ? `/api${assetPath}`
    : assetPath;
  const apiBaseUrl = api.defaults.baseURL || "/api";

  try {
    if (/^https?:\/\//i.test(apiBaseUrl)) {
      return new URL(normalizedAssetPath, apiBaseUrl).toString();
    }

    if (typeof window !== "undefined") {
      return new URL(normalizedAssetPath, window.location.origin).toString();
    }

    return new URL(normalizedAssetPath, apiBaseUrl).toString();
  } catch (error) {
    return normalizedAssetPath;
  }
};

export const fetchAttachmentBlob = async (attachment, issueId) => {
  if (!attachment._id) {
    throw new Error("Attachment ID is required");
  }

  if (!issueId) {
    throw new Error("Issue ID is required");
  }

  const response = await api.get(
    `/issues/${issueId}/attachments/${attachment._id}/download`,
    {
      responseType: "blob",
      withCredentials: true,
    }
  );

  return response.data;
};

export const downloadAttachment = async (attachment, issueId) => {
  try {
    const blob = await fetchAttachmentBlob(attachment, issueId);
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", attachment.fileName || "attachment");
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error("Failed to download attachment:", error);
    throw error;
  }
};

export const inviteUser = async (payload) => {
  const response = await api.post("/users/invite", payload);
  return response.data;
};

export const updateUserRole = async ({ id, role }) => {
  const response = await api.patch(`/users/${id}/role`, {
    role,
  });
  return response.data;
};

export const updateManagedUser = async ({ id, payload }) => {
  const response = await api.patch(`/users/${id}`, payload);
  return response.data;
};

export const deleteManagedUser = async (id) => {
  const response = await api.delete(`/users/${id}`);
  return response.data;
};

export const fetchEmailConfig = async (userId) => {
  const response = await api.get("/settings/email-config", {
    params: buildParams({
      userId,
    }),
  });
  return response.data;
};

export const saveEmailConfig = async (payload) => {
  const response = await api.post("/settings/email-config", payload);
  return response.data;
};

export const testEmailConfig = async (payload) => {
  const response = await api.post("/settings/test-email", payload);
  return response.data;
};

export const fetchWorkspaceSender = async () => {
  const response = await api.get("/settings/workspace-sender");
  return normalizeWorkspaceSenderResponse(response.data);
};

export const saveWorkspaceSender = async (payload) => {
  const response = await api.post("/settings/workspace-sender", payload);
  return normalizeWorkspaceSenderResponse(response.data);
};

export const fetchEligibleSenders = async () => {
  const response = await api.get("/settings/eligible-senders");
  const data = response.data;

  if (Array.isArray(data)) {
    return data;
  }

  if (Array.isArray(data?.users)) {
    return data.users;
  }

  console.warn("[api] Unexpected eligible senders response shape:", data);
  return [];
};

export const fetchModuleOwnerships = async () => {
  const response = await api.get("/settings/module-ownerships");
  return response.data?.ownerships || [];
};

export const saveModuleOwnerships = async (ownerships = []) => {
  const response = await api.post("/settings/module-ownerships", {
    ownerships,
  });
  return response.data;
};

export const importUsers = async (file) => {
  const formData = new FormData();
  formData.append("file", file);

  if (import.meta.env.DEV) {
    console.log("[api] Import users payload:", {
      file,
      name: file?.name || null,
      type: file?.type || null,
      size: file?.size || null,
      hasFileEntry: formData.has("file"),
    });
  }

  const response = await api.post("/users/import", formData);

  return response.data;
};

export const fetchChatConversations = async () => {
  const response = await api.get("/chat/conversations");
  return response.data?.conversations || [];
};

export const createChatConversation = async (payload) => {
  const response = await api.post("/chat/conversations", payload);
  return response.data?.conversation || response.data;
};

export const deleteChatConversation = async (conversationId) => {
  const response = await api.delete(`/chat/conversations/${conversationId}`);
  return response.data;
};

export const fetchChatConversation = async (conversationId) => {
  const response = await api.get(`/chat/conversation/${conversationId}`);
  return response.data?.conversation || response.data;
};

export const fetchChatMessages = async ({ conversationId, before, limit = 30 }) => {
  const response = await api.get(`/chat/messages/${conversationId}`, {
    params: buildParams({
      before,
      limit,
    }),
  });
  return response.data;
};

export const sendChatMessage = async (payload) => {
  const response = await api.post("/chat/messages", payload);
  return response.data?.message || response.data;
};

export const fetchChatCallLogs = async (conversationId) => {
  const response = await api.get("/chat/calls", {
    params: buildParams({
      conversationId,
    }),
  });
  return response.data?.calls || [];
};

export const uploadChatAttachment = async (file, onUploadProgress) => {
  const formData = new FormData();
  formData.append("file", file);

  const response = await api.post("/chat/attachments", formData, {
    onUploadProgress,
  });

  return response.data?.attachment || response.data;
};

export const searchChatUsers = async (query) => {
  const response = await api.get("/chat/users/search", {
    params: buildParams({
      q: query,
    }),
  });
  return response.data?.users || [];
};

export default api;
