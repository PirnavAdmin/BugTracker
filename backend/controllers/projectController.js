const mongoose = require("mongoose");
const Comment = require("../models/Comment");
const Epic = require("../models/Epic");
const Issue = require("../models/Issue");
const Project = require("../models/Project");
const ProjectMeeting = require("../models/ProjectMeeting");
const ProjectMember = require("../models/ProjectMember");
const ProjectTeam = require("../models/ProjectTeam");
const Team = require("../models/Team");
const TeamMember = require("../models/TeamMember");
const User = require("../models/User");
const { sendProjectMeetingInviteEmail } = require("../services/emailService");
const { resolveMeetingWindow } = require("../utils/meetingWindow");
const asyncHandler = require("../utils/asyncHandler");
const { ROLE_ADMIN, ROLE_MANAGER, ROLE_TEAM_LEAD, hasAdminAccess } = require("../utils/roles");
const {
  buildProjectAccessQuery,
  loadSerializedProjectById,
  mergeProjectTeamIds,
  serializeProjectsWithRelations,
} = require("../utils/projectRelations");
const {
  logProjectTeamsDebug,
  logProjectTeamsWarning,
  summarizeTeams,
} = require("../utils/projectTeamDiagnostics");
const { ISSUE_STATUS } = require("../utils/issueStatus");
const { attachMembersToTeams } = require("../utils/teamRelations");
const { normalizeWorkspaceId } = require("../utils/workspace");
const { PLANNING_ORDER_INCREMENT } = require("../utils/planningOrder");

const canUseMeetingSchedulerSender = (role = "") =>
  [ROLE_ADMIN, ROLE_MANAGER, ROLE_TEAM_LEAD].includes(role);
const { createUniqueProjectShortCode } = require("../utils/displayIds");
const TEAMS_MEETING_URL_PREFIX = "https://teams.microsoft.com/l/meetup-join/";

const projectPopulation = [
  { path: "createdBy", select: "name email role workspaceId" },
  { path: "manager", select: "name email role workspaceId" },
  { path: "projectManager", select: "name email role workspaceId" },
  { path: "teamLead", select: "name email role workspaceId" },
  { path: "qaLead", select: "name email role workspaceId" },
];

const PROJECT_STATUS_VALUES = ["Active", "On Hold", "Completed"];
const PROJECT_PRIORITY_VALUES = ["Low", "Medium", "High", "Critical"];
const CLOSED_DETACH_STATUS_VALUES = [
  ISSUE_STATUS.DONE,
  ISSUE_STATUS.CLOSED,
  ISSUE_STATUS.REJECTED,
  ISSUE_STATUS.DEFERRED,
];

const populateProject = (target) => target.populate(projectPopulation);

const getProjectIssueCount = async (projectId) => Issue.countDocuments({ projectId });

const parseProjectCompletedValue = (value) => {
  if (typeof value === "boolean") {
    return {
      value,
    };
  }

  if (value === "true" || value === "false") {
    return {
      value: value === "true",
    };
  }

  return {
    error: {
      status: 400,
      message: "Project status must include isCompleted as a boolean",
    },
  };
};

const normalizeProjectStatus = (value, fallback = "Active") => {
  if (value === null || typeof value === "undefined" || value === "") {
    return {
      value: fallback,
    };
  }

  const normalizedValue = String(value).trim().toLowerCase();
  const status = PROJECT_STATUS_VALUES.find(
    (item) => item.toLowerCase() === normalizedValue
  );

  if (!status) {
    return {
      error: {
        status: 400,
        message: `Project status must be ${PROJECT_STATUS_VALUES.join(", ")}`,
      },
    };
  }

  return {
    value: status,
  };
};

const normalizeProjectPriority = (value, fallback = "Medium") => {
  if (value === null || typeof value === "undefined" || value === "") {
    return {
      value: fallback,
    };
  }

  const normalizedValue = String(value).trim().toLowerCase();
  const priority = PROJECT_PRIORITY_VALUES.find(
    (item) => item.toLowerCase() === normalizedValue
  );

  if (!priority) {
    return {
      error: {
        status: 400,
        message: `Project priority must be ${PROJECT_PRIORITY_VALUES.join(", ")}`,
      },
    };
  }

  return {
    value: priority,
  };
};

const normalizeThemeColor = (value, fallback = "#2563EB") => {
  if (value === null || typeof value === "undefined" || value === "") {
    return fallback;
  }

  const color = String(value).trim();

  if (/^#[0-9A-Fa-f]{6}$/.test(color)) {
    return color.toUpperCase();
  }

  return fallback;
};

const normalizeProjectEpics = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }

  const uniqueEpics = new Map();

  value.forEach((epic) => {
    const epicName = typeof epic === "string" ? epic : epic?.name;

    if (typeof epicName !== "string") {
      return;
    }

    const normalizedEpic = epicName.trim();

    if (!normalizedEpic) {
      return;
    }

    const dedupeKey = normalizedEpic.toLowerCase();

    if (!uniqueEpics.has(dedupeKey)) {
      uniqueEpics.set(dedupeKey, normalizedEpic);
    }
  });

  return Array.from(uniqueEpics.values());
};

const normalizeOptionalDate = (value) => {
  if (!value) {
    return null;
  }

  const parsedDate = new Date(value);

  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
};

const normalizeProjectEpicInputs = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }

  const uniqueEpics = new Map();

  value.forEach((epic) => {
    const epicName = typeof epic === "string" ? epic : epic?.name;

    if (typeof epicName !== "string") {
      return;
    }

    const name = epicName.trim();

    if (!name) {
      return;
    }

    const dedupeKey = name.toLowerCase();

    if (!uniqueEpics.has(dedupeKey)) {
      uniqueEpics.set(dedupeKey, {
        name,
        startDate: typeof epic === "object" ? normalizeOptionalDate(epic.startDate) : null,
        targetDate: typeof epic === "object" ? normalizeOptionalDate(epic.targetDate) : null,
      });
    }
  });

  return Array.from(uniqueEpics.values());
};

const loadWorkspaceUserAssignment = async ({
  userId,
  workspaceId,
  label,
  allowedRoles = [],
}) => {
  if (userId === null || userId === "" || typeof userId === "undefined") {
    return {
      value: null,
    };
  }

  if (!mongoose.isValidObjectId(userId)) {
    return {
      error: {
        status: 400,
        message: `Invalid ${label} user`,
      },
    };
  }

  const user = await User.findOne({
    _id: userId,
    workspaceId: normalizeWorkspaceId(workspaceId),
  })
    .select("_id name email role workspaceId")
    .lean();

  if (!user) {
    return {
      error: {
        status: 404,
        message: `${label} could not be found in this workspace`,
      },
    };
  }

  if (allowedRoles.length && !allowedRoles.includes(user.role)) {
    return {
      error: {
        status: 400,
        message: `${label} must have one of these roles: ${allowedRoles.join(", ")}`,
      },
    };
  }

  return {
    value: user._id,
  };
};

const buildProjectQuery = async (user) => {
  const accessQuery = await buildProjectAccessQuery(user);

  if (hasAdminAccess(user.role)) {
    return accessQuery;
  }

  const workspaceId = normalizeWorkspaceId(user.workspaceId);
  const userId = user.id || user._id;
  const directlyAssignedProjectIds = await Issue.find({
    assignee: userId,
  }).distinct("projectId");
  const assignedProjectIds = directlyAssignedProjectIds.length
    ? await Project.find({
        _id: {
          $in: directlyAssignedProjectIds,
        },
        workspaceId,
      }).distinct("_id")
    : [];

  if (!assignedProjectIds.length) {
    return accessQuery;
  }

  return {
    ...accessQuery,
    $or: [
      ...(accessQuery.$or || []),
      {
        _id: {
          $in: assignedProjectIds,
        },
      },
    ],
  };
};

const buildProjectResponse = async (projectId) => {
  const serializedProject = await loadSerializedProjectById(
    Project,
    projectId,
    populateProject
  );

  if (!serializedProject) {
    return null;
  }

  return {
    ...serializedProject,
    issueCount: await getProjectIssueCount(serializedProject._id),
  };
};

const serializeProjectMeeting = (meeting) => {
  const serializedMeeting =
    typeof meeting?.toObject === "function" ? meeting.toObject() : meeting;

  if (!serializedMeeting) {
    return null;
  }

  return {
    _id: serializedMeeting._id,
    projectId: serializedMeeting.projectId,
    workspaceId: normalizeWorkspaceId(serializedMeeting.workspaceId),
    scheduledBy: serializedMeeting.scheduledBy,
    provider: serializedMeeting.provider,
    subject: serializedMeeting.subject,
    meetingId: serializedMeeting.meetingId,
    joinUrl: serializedMeeting.joinUrl,
    startDateTime: serializedMeeting.startDateTime,
    endDateTime: serializedMeeting.endDateTime,
    durationMinutes: serializedMeeting.durationMinutes,
    participants: serializedMeeting.participants || [],
    createdAt: serializedMeeting.createdAt,
  };
};

const loadAccessibleProject = async (user, projectId) =>
  Project.findOne({
    _id: projectId,
    ...(await buildProjectAccessQuery(user)),
  })
    .select("_id name workspaceId")
    .lean();

const getAttachedTeamParticipants = async ({ projectId, workspaceId }) => {
  const [project, projectTeams] = await Promise.all([
    Project.findById(projectId)
      .select("_id attachedTeams teamIds")
      .lean(),
    ProjectTeam.find({
      projectId,
    })
      .select("teamId")
      .lean(),
  ]);
  const attachedTeamIds = mergeProjectTeamIds(project || { _id: projectId }, projectTeams);

  if (!attachedTeamIds.length) {
    return [];
  }

  const teamMemberships = await TeamMember.find({
    teamId: {
      $in: attachedTeamIds,
    },
  })
    .select("userId")
    .lean();
  const userIds = Array.from(
    new Set(teamMemberships.map((item) => String(item.userId)).filter(Boolean))
  );

  if (!userIds.length) {
    return [];
  }

  const users = await User.find({
    _id: {
      $in: userIds,
    },
    workspaceId: normalizeWorkspaceId(workspaceId),
  })
    .select("_id name email role workspaceId")
    .lean();
  const participantsByEmail = new Map();

  users.forEach((user) => {
    const email = String(user?.email || "").trim().toLowerCase();

    if (!email || participantsByEmail.has(email)) {
      return;
    }

    participantsByEmail.set(email, {
      userId: user._id,
      name: user.name || email,
      email,
      role: user.role || "",
    });
  });

  return Array.from(participantsByEmail.values()).sort((left, right) =>
    left.name.localeCompare(right.name)
  );
};

const getProjects = asyncHandler(async (req, res) => {
  if (!req.user) {
    res.status(401);
    throw new Error("Unauthorized");
  }

  const userId = req.user.id || req.user._id;

  if (!userId) {
    res.status(401);
    throw new Error("Unauthorized");
  }

  const projectQuery = await buildProjectQuery(req.user);
  const projects = await populateProject(Project.find(projectQuery))
    .sort({ createdAt: -1 })
    .lean();
  const serializedProjects = await serializeProjectsWithRelations(projects);
  const issueCounts = await Issue.aggregate([
    {
      $match: {
        projectId: {
          $in: serializedProjects.map((project) => project._id),
        },
      },
    },
    {
      $group: {
        _id: "$projectId",
        count: { $sum: 1 },
      },
    },
  ]);
  const issueCountMap = new Map(
    issueCounts.map((item) => [String(item._id), item.count])
  );

  res.status(200).json(
    serializedProjects.map((project) => ({
      ...project,
      issueCount: issueCountMap.get(String(project._id)) || 0,
    }))
  );
});

const createProject = asyncHandler(async (req, res) => {
  if (!req.user) {
    res.status(401);
    throw new Error("Unauthorized");
  }

  const userId = req.user.id || req.user._id;
  const workspaceId = normalizeWorkspaceId(req.user.workspaceId);
  const {
    name,
    description = "",
    epics = [],
    manager = null,
    projectManager = null,
    teamLead = null,
    qaLead = null,
    status = "Active",
    priority = "Medium",
    themeColor = "#2563EB",
    startDate = null,
    targetDate = null,
    teamIds = [],
    attachedTeams = [],
  } = req.body;

  if (!userId) {
    res.status(401);
    throw new Error("Unauthorized");
  }

  if (!hasAdminAccess(req.user.role)) {
    res.status(403);
    throw new Error("Only admins and managers can create projects");
  }

  if (!name || !name.trim()) {
    res.status(400);
    throw new Error("Project name is required");
  }

  const statusResult = normalizeProjectStatus(status, "Active");
  const priorityResult = normalizeProjectPriority(priority, "Medium");

  if (statusResult.error) {
    res.status(statusResult.error.status);
    throw new Error(statusResult.error.message);
  }

  if (priorityResult.error) {
    res.status(priorityResult.error.status);
    throw new Error(priorityResult.error.message);
  }

  const requestedManager = projectManager || manager;
  const [managerResult, teamLeadResult, qaLeadResult] = await Promise.all([
    loadWorkspaceUserAssignment({
      userId: requestedManager,
      workspaceId,
      label: "Project manager",
      allowedRoles: ["Admin", "Manager"],
    }),
    loadWorkspaceUserAssignment({
      userId: teamLead,
      workspaceId,
      label: "Team lead",
      allowedRoles: ["Admin", "Manager", "Team Lead", "Developer"],
    }),
    loadWorkspaceUserAssignment({
      userId: qaLead,
      workspaceId,
      label: "QA lead",
      allowedRoles: ["Admin", "Manager", "Tester", "Q/A Lead"],
    }),
  ]);

  if (managerResult.error) {
    res.status(managerResult.error.status);
    throw new Error(managerResult.error.message);
  }

  if (teamLeadResult.error) {
    res.status(teamLeadResult.error.status);
    throw new Error(teamLeadResult.error.message);
  }

  if (qaLeadResult.error) {
    res.status(qaLeadResult.error.status);
    throw new Error(qaLeadResult.error.message);
  }

  const shortCode = await createUniqueProjectShortCode({
    Project,
    name,
    workspaceId,
  });
  const requestedTeamIds = Array.from(
    new Set(
      [...(Array.isArray(teamIds) ? teamIds : []), ...(Array.isArray(attachedTeams) ? attachedTeams : [])]
        .map((teamId) => String(teamId || "").trim())
        .filter(Boolean)
    )
  );

  if (requestedTeamIds.some((teamId) => !mongoose.isValidObjectId(teamId))) {
    res.status(400);
    throw new Error("Invalid team id");
  }

  const selectedTeams = requestedTeamIds.length
    ? await Team.find({
        _id: { $in: requestedTeamIds },
        workspaceId,
      })
        .select("_id name")
        .lean()
    : [];
  const selectedTeamIds = selectedTeams.map((team) => team._id);

  if (selectedTeams.length !== requestedTeamIds.length) {
    res.status(404);
    throw new Error("One or more selected teams could not be found in this workspace");
  }

  const normalizedEpicInputs = normalizeProjectEpicInputs(epics);

  const project = await Project.create({
    name: name.trim(),
    description: typeof description === "string" ? description.trim() : "",
    shortCode,
    status: statusResult.value,
    priority: priorityResult.value,
    themeColor: normalizeThemeColor(themeColor),
    startDate: normalizeOptionalDate(startDate),
    targetDate: normalizeOptionalDate(targetDate),
    epics: normalizedEpicInputs.map((epic) => epic.name),
    manager: managerResult.value,
    projectManager: managerResult.value,
    teamLead: teamLeadResult.value,
    qaLead: qaLeadResult.value,
    attachedTeams: selectedTeamIds,
    teamIds: selectedTeamIds,
    workspaceId,
    createdBy: userId,
    isCompleted: statusResult.value === "Completed",
  });

  if (normalizedEpicInputs.length) {
    await Epic.insertMany(
      normalizedEpicInputs.map((epic, index) => ({
        projectId: project._id,
        workspaceId,
        name: epic.name,
        description: "",
        color: "#3B82F6",
        startDate: epic.startDate,
        targetDate: epic.targetDate,
        planningOrder: (index + 1) * PLANNING_ORDER_INCREMENT,
        status: "ACTIVE",
        createdBy: userId,
      }))
    );
  }

  if (selectedTeamIds.length) {
    await ProjectTeam.insertMany(
      selectedTeamIds.map((teamId) => ({
        projectId: project._id,
        teamId,
      })),
      { ordered: false }
    );
  }

  res.status(201).json(await buildProjectResponse(project._id));
});

const updateProject = asyncHandler(async (req, res) => {
  if (!req.user) {
    res.status(401);
    throw new Error("Unauthorized");
  }

  if (!hasAdminAccess(req.user.role)) {
    res.status(403);
    throw new Error("Only admins and managers can update projects");
  }

  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400);
    throw new Error("Invalid project id");
  }

  const workspaceId = normalizeWorkspaceId(req.user.workspaceId);
  const project = await Project.findOne({
    _id: req.params.id,
    workspaceId,
  });

  if (!project) {
    res.status(404);
    throw new Error("Project not found");
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "name")) {
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";

    if (!name) {
      res.status(400);
      throw new Error("Project name is required");
    }

    project.name = name;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "description")) {
    project.description =
      typeof req.body.description === "string" ? req.body.description.trim() : "";
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "status")) {
    const statusResult = normalizeProjectStatus(req.body.status, project.status || "Active");

    if (statusResult.error) {
      res.status(statusResult.error.status);
      throw new Error(statusResult.error.message);
    }

    project.status = statusResult.value;
    project.isCompleted = statusResult.value === "Completed";
  } else if (Object.prototype.hasOwnProperty.call(req.body, "isCompleted")) {
    const completedValueResult = parseProjectCompletedValue(req.body.isCompleted);

    if (completedValueResult.error) {
      res.status(completedValueResult.error.status);
      throw new Error(completedValueResult.error.message);
    }

    project.isCompleted = completedValueResult.value;
    project.status = completedValueResult.value ? "Completed" : "Active";
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "priority")) {
    const priorityResult = normalizeProjectPriority(
      req.body.priority,
      project.priority || "Medium"
    );

    if (priorityResult.error) {
      res.status(priorityResult.error.status);
      throw new Error(priorityResult.error.message);
    }

    project.priority = priorityResult.value;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "themeColor")) {
    project.themeColor = normalizeThemeColor(req.body.themeColor, project.themeColor);
  }

  const hasProjectManagerInput =
    Object.prototype.hasOwnProperty.call(req.body, "projectManager") ||
    Object.prototype.hasOwnProperty.call(req.body, "manager");
  const hasTeamLeadInput = Object.prototype.hasOwnProperty.call(req.body, "teamLead");
  const hasQaLeadInput = Object.prototype.hasOwnProperty.call(req.body, "qaLead");

  if (hasProjectManagerInput || hasTeamLeadInput || hasQaLeadInput) {
    const [managerResult, teamLeadResult, qaLeadResult] = await Promise.all([
      hasProjectManagerInput
        ? loadWorkspaceUserAssignment({
            userId: Object.prototype.hasOwnProperty.call(req.body, "projectManager")
              ? req.body.projectManager
              : req.body.manager,
            workspaceId,
            label: "Project manager",
            allowedRoles: ["Admin", "Manager"],
          })
        : Promise.resolve({ value: project.projectManager || project.manager || null }),
      hasTeamLeadInput
        ? loadWorkspaceUserAssignment({
            userId: req.body.teamLead,
            workspaceId,
            label: "Team lead",
            allowedRoles: ["Admin", "Manager", "Team Lead", "Developer"],
          })
        : Promise.resolve({ value: project.teamLead || null }),
      hasQaLeadInput
        ? loadWorkspaceUserAssignment({
            userId: req.body.qaLead,
            workspaceId,
            label: "QA lead",
            allowedRoles: ["Admin", "Manager", "Tester", "Q/A Lead"],
          })
        : Promise.resolve({ value: project.qaLead || null }),
    ]);

    if (managerResult.error) {
      res.status(managerResult.error.status);
      throw new Error(managerResult.error.message);
    }

    if (teamLeadResult.error) {
      res.status(teamLeadResult.error.status);
      throw new Error(teamLeadResult.error.message);
    }

    if (qaLeadResult.error) {
      res.status(qaLeadResult.error.status);
      throw new Error(qaLeadResult.error.message);
    }

    if (hasProjectManagerInput) {
      project.manager = managerResult.value;
      project.projectManager = managerResult.value;
    }

    if (hasTeamLeadInput) {
      project.teamLead = teamLeadResult.value;
    }

    if (hasQaLeadInput) {
      project.qaLead = qaLeadResult.value;
    }
  }

  await project.save();

  res.status(200).json({
    message: "Project updated successfully",
    ...(await buildProjectResponse(project._id)),
  });
});

const updateProjectLeadership = updateProject;

const normalizeProjectMemberRole = (value, fallback = "Developer") => {
  const allowedRoles = ["Developer", "Tester", "Q/A Lead", "Team Lead", "Manager"];
  const role = allowedRoles.find(
    (item) => item.toLowerCase() === String(value || "").trim().toLowerCase()
  );
  const fallbackRole = allowedRoles.includes(fallback) ? fallback : "Developer";

  return role || fallbackRole;
};

const addProjectMember = asyncHandler(async (req, res) => {
  if (!req.user) {
    res.status(401);
    throw new Error("Unauthorized");
  }

  if (!hasAdminAccess(req.user.role)) {
    res.status(403);
    throw new Error("Only admins and managers can manage project members");
  }

  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400);
    throw new Error("Invalid project id");
  }

  if (!mongoose.isValidObjectId(req.body.userId)) {
    res.status(400);
    throw new Error("Invalid user id");
  }

  const workspaceId = normalizeWorkspaceId(req.user.workspaceId);
  const [project, user] = await Promise.all([
    Project.findOne({
      _id: req.params.id,
      workspaceId,
    })
      .select("_id workspaceId")
      .lean(),
    User.findOne({
      _id: req.body.userId,
      workspaceId,
    })
      .select("_id name email role workspaceId")
      .lean(),
  ]);

  if (!project) {
    res.status(404);
    throw new Error("Project not found");
  }

  if (!user) {
    res.status(400);
    throw new Error("Selected user does not belong to this workspace");
  }

  const projectRole = normalizeProjectMemberRole(req.body.role, user.role);

  await ProjectMember.findOneAndUpdate(
    {
      projectId: project._id,
      userId: user._id,
    },
    {
      $set: {
        role: projectRole,
        updatedAt: new Date(),
      },
      $setOnInsert: {
        projectId: project._id,
        userId: user._id,
        createdAt: new Date(),
      },
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    }
  );

  res.status(200).json({
    message: `${user.name || user.email || "Member"} added to the project`,
    ...(await buildProjectResponse(project._id)),
  });
});

const removeProjectMember = asyncHandler(async (req, res) => {
  if (!req.user) {
    res.status(401);
    throw new Error("Unauthorized");
  }

  if (!hasAdminAccess(req.user.role)) {
    res.status(403);
    throw new Error("Only admins and managers can manage project members");
  }

  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400);
    throw new Error("Invalid project id");
  }

  if (!mongoose.isValidObjectId(req.params.userId)) {
    res.status(400);
    throw new Error("Invalid user id");
  }

  const workspaceId = normalizeWorkspaceId(req.user.workspaceId);
  const project = await Project.findOne({
    _id: req.params.id,
    workspaceId,
  })
    .select("_id")
    .lean();

  if (!project) {
    res.status(404);
    throw new Error("Project not found");
  }

  const membership = await ProjectMember.findOneAndDelete({
    projectId: project._id,
    userId: req.params.userId,
  }).lean();

  if (!membership) {
    res.status(404);
    throw new Error("Member is not directly assigned to this project");
  }

  const removedUserId = new mongoose.Types.ObjectId(req.params.userId);
  await Issue.updateMany(
    {
      projectId: project._id,
      $or: [
        { assignee: removedUserId },
        { assignedDeveloperId: removedUserId },
        { "bugDetails.developerLead": removedUserId },
      ],
    },
    {
      $set: {
        assignee: null,
        assignedDeveloperId: null,
        assignedDeveloperName: "",
        "bugDetails.developerLead": null,
        updatedAt: new Date(),
        updatedBy: req.user._id,
      },
    }
  );

  res.status(200).json({
    message: "Member removed from the project",
    ...(await buildProjectResponse(project._id)),
  });
});

const deleteProject = asyncHandler(async (req, res) => {
  if (!req.user) {
    res.status(401);
    throw new Error("Unauthorized");
  }

  if (!hasAdminAccess(req.user.role)) {
    res.status(403);
    throw new Error("Only admins and managers can delete projects");
  }

  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400);
    throw new Error("Invalid project id");
  }

  const workspaceId = normalizeWorkspaceId(req.user.workspaceId);
  const project = await Project.findOne({
    _id: req.params.id,
    workspaceId,
  })
    .select("_id")
    .lean();

  if (!project) {
    res.status(404);
    throw new Error("Project not found");
  }

  const issueIds = await Issue.find({
    projectId: project._id,
  }).distinct("_id");

  await Promise.all([
    issueIds.length
      ? Comment.deleteMany({
          issueId: {
            $in: issueIds,
          },
        })
      : Promise.resolve(),
    Issue.deleteMany({
      projectId: project._id,
    }),
    Epic.deleteMany({
      projectId: project._id,
    }),
    ProjectTeam.deleteMany({
      projectId: project._id,
    }),
    ProjectMember.deleteMany({
      projectId: project._id,
    }),
    ProjectMeeting.deleteMany({
      projectId: project._id,
    }),
    Project.deleteOne({
      _id: project._id,
      workspaceId,
    }),
  ]);

  res.status(200).json({
    message: "Project deleted successfully",
  });
});

const attachProjectTeam = asyncHandler(async (req, res) => {
  if (!req.user) {
    res.status(401);
    throw new Error("Unauthorized");
  }

  if (!hasAdminAccess(req.user.role)) {
    res.status(403);
    throw new Error("Only admins and managers can attach teams to projects");
  }

  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400);
    throw new Error("Invalid project id");
  }

  if (!mongoose.isValidObjectId(req.body.teamId)) {
    res.status(400);
    throw new Error("Invalid team id");
  }

  const workspaceId = normalizeWorkspaceId(req.user.workspaceId);
  const [project, team, existingProjectTeam] = await Promise.all([
    Project.findOne({
      _id: req.params.id,
      workspaceId,
    })
      .select("_id workspaceId attachedTeams teamIds")
      .lean(),
    Team.findOne({
      _id: req.body.teamId,
      workspaceId,
    })
      .select("_id name workspaceId")
      .lean(),
    ProjectTeam.findOne({
      projectId: req.params.id,
      teamId: req.body.teamId,
    })
      .select("_id")
      .lean(),
  ]);

  if (!project) {
    res.status(404);
    throw new Error("Project not found");
  }

  if (!team) {
    res.status(404);
    throw new Error("Selected team could not be found in this workspace");
  }

  if (existingProjectTeam) {
    await Project.updateOne(
      {
        _id: project._id,
        workspaceId,
      },
      {
        $addToSet: {
          attachedTeams: team._id,
          teamIds: team._id,
        },
      }
    );

    res.status(200).json({
      message: `${team.name} is already attached to the project`,
      ...(await buildProjectResponse(project._id)),
    });
    return;
  }

  await Promise.all([
    ProjectTeam.create({
      projectId: project._id,
      teamId: team._id,
    }),
    Project.updateOne(
      {
        _id: project._id,
        workspaceId,
      },
      {
        $addToSet: {
          attachedTeams: team._id,
          teamIds: team._id,
        },
      }
    ),
  ]);

  res.status(200).json({
    message: `${team.name} attached to the project`,
    ...(await buildProjectResponse(project._id)),
  });
});

const getProjectTeams = asyncHandler(async (req, res) => {
  if (!req.user) {
    res.status(401);
    throw new Error("Unauthorized");
  }

  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400);
    throw new Error("Invalid project id");
  }

  const project = await Project.findOne({
    _id: req.params.id,
    ...(await buildProjectQuery(req.user)),
  })
    .lean();

  if (!project) {
    res.status(404);
    throw new Error("Project not found");
  }

  const workspaceId = normalizeWorkspaceId(project.workspaceId || req.user.workspaceId);
  logProjectTeamsDebug("Selected project teams request", {
    projectId: String(project._id),
    projectName: project.name || "",
    workspaceId,
    currentUserRole: req.user.role || "",
  });

  const projectTeams = await ProjectTeam.find({
    projectId: project._id,
  })
    .sort({ createdAt: 1 })
    .select("teamId")
    .lean();
  const teamIds = mergeProjectTeamIds(project, projectTeams);

  if (!teamIds.length) {
    logProjectTeamsDebug("Project teams API response", {
      projectId: String(project._id),
      responseShape: "array",
      projectTeamLinkCount: projectTeams.length,
      attachedTeamCount: 0,
      returnedTeamsCount: 0,
      currentUserRole: req.user.role || "",
      teams: [],
    });

    res.status(200).json([]);
    return;
  }

  const teams = await Team.find({
    _id: {
      $in: teamIds,
    },
    workspaceId,
  }).lean();
  const serializedTeams = await attachMembersToTeams(teams);
  const teamsById = new Map(serializedTeams.map((team) => [String(team._id), team]));
  const orderedTeams = teamIds
    .map((teamId) => teamsById.get(teamId))
    .filter(Boolean);
  const missingTeamIds = teamIds.filter((teamId) => !teamsById.has(teamId));

  if (missingTeamIds.length) {
    logProjectTeamsWarning("Project team links exist but some teams were not returned", {
      projectId: String(project._id),
      workspaceId,
      currentUserRole: req.user.role || "",
      projectTeamLinkCount: projectTeams.length,
      attachedTeamCount: teamIds.length,
      returnedTeamsCount: orderedTeams.length,
      missingTeamIds,
    });
  }

  logProjectTeamsDebug("Project teams API response", {
    projectId: String(project._id),
    responseShape: "array",
    projectTeamLinkCount: projectTeams.length,
    attachedTeamCount: teamIds.length,
    returnedTeamsCount: orderedTeams.length,
    currentUserRole: req.user.role || "",
    teams: summarizeTeams(orderedTeams),
  });

  res.status(200).json(orderedTeams);
});

const detachProjectTeam = asyncHandler(async (req, res) => {
  if (!req.user) {
    res.status(401);
    throw new Error("Unauthorized");
  }

  if (!hasAdminAccess(req.user.role)) {
    res.status(403);
    throw new Error("Only admins and managers can detach teams from projects");
  }

  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400);
    throw new Error("Invalid project id");
  }

  if (!mongoose.isValidObjectId(req.params.teamId)) {
    res.status(400);
    throw new Error("Invalid team id");
  }

  const workspaceId = normalizeWorkspaceId(req.user.workspaceId);
  const [project, team, projectTeam] = await Promise.all([
    Project.findOne({
      _id: req.params.id,
      workspaceId,
    })
      .select("_id workspaceId attachedTeams teamIds")
      .lean(),
    Team.findOne({
      _id: req.params.teamId,
      workspaceId,
    })
      .select("_id name")
      .lean(),
    ProjectTeam.findOne({
      projectId: req.params.id,
      teamId: req.params.teamId,
    })
      .select("_id")
      .lean(),
  ]);

  if (!project) {
    res.status(404);
    throw new Error("Project not found");
  }

  if (!team) {
    res.status(404);
    throw new Error("Selected team could not be found in this workspace");
  }

  const hasInlineProjectTeam = mergeProjectTeamIds(project, []).some(
    (teamId) => String(teamId) === String(req.params.teamId)
  );

  if (!projectTeam && !hasInlineProjectTeam) {
    res.status(404);
    throw new Error("This team is not attached to the project");
  }

  const activeIssueCount = await Issue.countDocuments({
    projectId: project._id,
    teamId: team._id,
    status: {
      $nin: CLOSED_DETACH_STATUS_VALUES,
    },
  });

  if (activeIssueCount > 0) {
    res.status(409);
    throw new Error(
      `Cannot detach ${team.name} while ${activeIssueCount} active work item${
        activeIssueCount === 1 ? " is" : "s are"
      } assigned to this team. Reassign or close the work first.`
    );
  }

  await Promise.all([
    projectTeam
      ? ProjectTeam.deleteOne({
          _id: projectTeam._id,
        })
      : Promise.resolve(),
    Project.updateOne(
      {
        _id: project._id,
        workspaceId,
      },
      {
        $pull: {
          attachedTeams: team._id,
          teamIds: team._id,
        },
      }
    ),
  ]);

  res.status(200).json({
    message: `${team.name} detached from the project`,
    ...(await buildProjectResponse(project._id)),
  });
});

const updateProjectStatus = asyncHandler(async (req, res) => {
  if (!req.user) {
    res.status(401);
    throw new Error("Unauthorized");
  }

  if (!hasAdminAccess(req.user.role)) {
    res.status(403);
    throw new Error("Only admins and managers can update project status");
  }

  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400);
    throw new Error("Invalid project id");
  }

  const completedValueResult = parseProjectCompletedValue(req.body?.isCompleted);

  if (completedValueResult.error) {
    res.status(completedValueResult.error.status);
    throw new Error(completedValueResult.error.message);
  }

  const workspaceId = normalizeWorkspaceId(req.user.workspaceId);
  const project = await Project.findOne({
    _id: req.params.id,
    workspaceId,
  });

  if (!project) {
    res.status(404);
    throw new Error("Project not found");
  }

  project.isCompleted = completedValueResult.value;
  project.status = completedValueResult.value ? "Completed" : "Active";
  await project.save();

  res.status(200).json({
    message: project.isCompleted ? "Project marked as completed" : "Project reopened",
    ...(await buildProjectResponse(project._id)),
  });
});

const scheduleProjectMeeting = asyncHandler(async (req, res) => {
  if (!req.user) {
    res.status(401);
    throw new Error("Unauthorized");
  }

  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400);
    throw new Error("Invalid project id");
  }

  const subject = typeof req.body?.subject === "string" ? req.body.subject.trim() : "";
  const meetingUrl = typeof req.body?.meetingUrl === "string"
    ? req.body.meetingUrl.trim()
    : typeof req.body?.joinUrl === "string"
      ? req.body.joinUrl.trim()
      : "";
  const meetingWindow = resolveMeetingWindow({
    startDateTime: req.body?.startDateTime,
    endDateTime: req.body?.endDateTime,
    durationMinutes: req.body?.durationMinutes,
  });

  if (!subject) {
    res.status(400);
    throw new Error("Meeting title is required");
  }

  if (!meetingUrl.startsWith(TEAMS_MEETING_URL_PREFIX)) {
    res.status(400);
    throw new Error("Please enter a valid Microsoft Teams meeting link.");
  }

  if (meetingWindow.error) {
    res.status(400);
    throw new Error(meetingWindow.error);
  }

  const { startDate, endDate, durationMinutes } = meetingWindow;
  const project = await loadAccessibleProject(req.user, req.params.id);

  if (!project) {
    res.status(404);
    throw new Error("Project not found");
  }

  const workspaceId = normalizeWorkspaceId(req.user.workspaceId);
  const mailWorkspaceId = normalizeWorkspaceId(project.workspaceId || workspaceId);
  const participants = await getAttachedTeamParticipants({
    projectId: project._id,
    workspaceId,
  });

  if (!participants.length) {
    res.status(400);
    throw new Error("No users found in attached teams. Attach a team with members first.");
  }

  const meeting = await ProjectMeeting.create({
    projectId: project._id,
    workspaceId,
    scheduledBy: req.user._id,
    provider: "microsoft_teams",
    subject,
    meetingId: `manual-${Date.now()}`,
    joinUrl: meetingUrl,
    startDateTime: startDate,
    endDateTime: endDate,
    durationMinutes,
    participants: participants.map((participant) => ({
      userId: participant.userId,
      name: participant.name,
      email: participant.email,
      role: participant.role,
    })),
  });

  let inviteWarning = "";

  try {
    await sendProjectMeetingInviteEmail(
      participants.map((participant) => participant.email),
      {
        subject: meeting.subject,
        joinUrl: meeting.joinUrl,
        startDateTime: meeting.startDateTime,
        endDateTime: meeting.endDateTime,
        projectName: project.name,
        durationMinutes: meeting.durationMinutes,
        participants,
      },
      {
        workspaceId: mailWorkspaceId,
        senderUserId: canUseMeetingSchedulerSender(req.user.role) ? req.user._id : null,
      }
    );
  } catch (inviteError) {
    inviteWarning =
      "Meeting created, but invite emails could not be sent right now.";
    console.error("[project-meetings] Failed to send meeting invites", {
      projectId: String(project._id),
      error: inviteError?.message || inviteError,
    });
  }

  res.status(201).json({
    message: "Meeting scheduled successfully",
    meeting: serializeProjectMeeting(meeting),
    warning: inviteWarning || undefined,
  });
});

const getProjectMeetings = asyncHandler(async (req, res) => {
  if (!req.user) {
    res.status(401);
    throw new Error("Unauthorized");
  }

  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400);
    throw new Error("Invalid project id");
  }

  const project = await loadAccessibleProject(req.user, req.params.id);

  if (!project) {
    res.status(404);
    throw new Error("Project not found");
  }

  const workspaceId = normalizeWorkspaceId(req.user.workspaceId);
  const meetings = await ProjectMeeting.find({
    projectId: req.params.id,
    workspaceId,
    endDateTime: {
      $gte: new Date(),
    },
  })
    .sort({ startDateTime: 1 })
    .limit(8)
    .lean();

  res.status(200).json(meetings.map(serializeProjectMeeting).filter(Boolean));
});

module.exports = {
  getProjects,
  getProjectTeams,
  createProject,
  updateProject,
  updateProjectLeadership,
  addProjectMember,
  removeProjectMember,
  deleteProject,
  attachProjectTeam,
  detachProjectTeam,
  updateProjectStatus,
  scheduleProjectMeeting,
  getProjectMeetings,
};
