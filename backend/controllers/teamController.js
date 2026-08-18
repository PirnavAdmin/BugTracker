const mongoose = require("mongoose");
const Project = require("../models/Project");
const ProjectTeam = require("../models/ProjectTeam");
const Team = require("../models/Team");
const User = require("../models/User");
const asyncHandler = require("../utils/asyncHandler");
const { hasAdminAccess } = require("../utils/roles");
const { withTenantFilter } = require("../utils/tenant");
const { attachMembersToTeams, populateTeam } = require("../utils/teamRelations");
const {
  hasWorkspaceAccess,
  normalizeWorkspaceId,
  resolveRequestedWorkspaceId,
} = require("../utils/workspace");
const TeamMember = require("../models/TeamMember");

const ACTIVE_PROJECT_STATUSES = ["Active", "On Hold"];

const requireAdmin = (req, res) => {
  if (!hasAdminAccess(req.user.role)) {
    res.status(403);
    throw new Error("Only admins and managers can manage teams");
  }
};

const ensureWorkspaceAccess = (req, res, requestedWorkspaceId) => {
  const currentWorkspaceId = normalizeWorkspaceId(req.user.workspaceId);
  const resolvedWorkspaceId = resolveRequestedWorkspaceId(
    requestedWorkspaceId,
    currentWorkspaceId
  );

  if (!hasWorkspaceAccess(resolvedWorkspaceId, currentWorkspaceId)) {
    res.status(403);
    throw new Error("You do not have access to that workspace");
  }

  return currentWorkspaceId;
};

const validateWorkspaceMembers = async (memberIds, workspaceId, reqOrUser, res) => {
  const uniqueMemberIds = Array.from(
    new Set(
      (Array.isArray(memberIds) ? memberIds : [])
        .filter(Boolean)
        .map((memberId) => String(memberId))
    )
  );

  if (!uniqueMemberIds.every((memberId) => mongoose.isValidObjectId(memberId))) {
    res.status(400);
    throw new Error("One or more selected team members are invalid");
  }

  if (!uniqueMemberIds.length) {
    return [];
  }

  const users = await User.find(withTenantFilter({
    _id: {
      $in: uniqueMemberIds,
    },
    workspaceId,
  }, reqOrUser))
    .select("_id name email role avatarUrl workspaceId tenantId")
    .lean();

  if (users.length !== uniqueMemberIds.length) {
    res.status(400);
    throw new Error("One or more selected users do not belong to this workspace");
  }

  return users;
};

const loadSerializedTeam = async (teamId) => {
  const team = await populateTeam(Team.findById(teamId)).lean();

  if (!team) {
    return null;
  }

  const [serializedTeam] = await attachMembersToTeams([team]);
  return serializedTeam || null;
};

const getTeams = asyncHandler(async (req, res) => {
  const workspaceId = ensureWorkspaceAccess(req, res, req.query.workspaceId);

  const teams = await populateTeam(
    Team.find({
      workspaceId,
    })
  )
    .sort({ createdAt: -1 })
    .lean();

  res.status(200).json(await attachMembersToTeams(teams));
});

const getTeamById = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400);
    throw new Error("Invalid team id");
  }

  const team = await populateTeam(
    Team.findOne({
      _id: req.params.id,
      workspaceId: normalizeWorkspaceId(req.user.workspaceId),
    })
  ).lean();

  if (!team) {
    res.status(404);
    throw new Error("Team not found");
  }

  const [serializedTeam] = await attachMembersToTeams([team]);
  res.status(200).json(serializedTeam);
});

const createTeam = asyncHandler(async (req, res) => {
  requireAdmin(req, res);

  const workspaceId = ensureWorkspaceAccess(req, res, req.body.workspaceId);
  const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
  const description =
    typeof req.body.description === "string" ? req.body.description.trim() : "";
  const members = Array.isArray(req.body.members) ? req.body.members : [];

  if (!name) {
    res.status(400);
    throw new Error("Team name is required");
  }

  const existingTeam = await Team.findOne({
    name,
    workspaceId,
  })
    .select("_id")
    .lean();

  if (existingTeam) {
    res.status(409);
    throw new Error("A team with this name already exists in the workspace");
  }

  const workspaceMembers = await validateWorkspaceMembers(members, workspaceId, req.user, res);
  const team = await Team.create({
    name,
    description,
    workspaceId,
    createdBy: req.user._id,
  });

  if (workspaceMembers.length) {
    await TeamMember.insertMany(
      workspaceMembers.map((member) => ({
        teamId: team._id,
        userId: member._id,
      }))
    );
  }

  res.status(201).json(await loadSerializedTeam(team._id));
});

const addTeamMember = asyncHandler(async (req, res) => {
  requireAdmin(req, res);

  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400);
    throw new Error("Invalid team id");
  }

  if (!mongoose.isValidObjectId(req.body.userId)) {
    res.status(400);
    throw new Error("Invalid user id");
  }

  const workspaceId = normalizeWorkspaceId(req.user.workspaceId);

  const [team, user, existingMembership] = await Promise.all([
    Team.findOne({
      _id: req.params.id,
      workspaceId,
    })
      .select("_id workspaceId")
      .lean(),
    User.findOne(withTenantFilter({
      _id: req.body.userId,
      workspaceId,
    }, req.user))
      .select("_id name avatarUrl workspaceId tenantId")
      .lean(),
    TeamMember.findOne({
      teamId: req.params.id,
      userId: req.body.userId,
    })
      .select("_id")
      .lean(),
  ]);

  if (!team) {
    res.status(404);
    throw new Error("Team not found");
  }

  if (!user) {
    res.status(400);
    throw new Error("Selected user does not belong to this workspace");
  }

  if (existingMembership) {
    res.status(409);
    throw new Error("User is already a member of this team");
  }

  await TeamMember.create({
    teamId: team._id,
    userId: user._id,
  });

  res.status(200).json({
    message: `${user.name} added to the team`,
    team: await loadSerializedTeam(team._id),
  });
});

const removeTeamMember = asyncHandler(async (req, res) => {
  requireAdmin(req, res);

  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400);
    throw new Error("Invalid team id");
  }

  if (!mongoose.isValidObjectId(req.params.userId)) {
    res.status(400);
    throw new Error("Invalid user id");
  }

  const workspaceId = normalizeWorkspaceId(req.user.workspaceId);
  const team = await Team.findOne({
    _id: req.params.id,
    workspaceId,
  })
    .select("_id workspaceId")
    .lean();

  if (!team) {
    res.status(404);
    throw new Error("Team not found");
  }

  const [membership, user] = await Promise.all([
    TeamMember.findOneAndDelete({
      teamId: req.params.id,
      userId: req.params.userId,
    })
      .select("_id")
      .lean(),
    User.findOne(withTenantFilter({ _id: req.params.userId, workspaceId }, req.user)).select("name").lean(),
  ]);

  if (!membership) {
    res.status(404);
    throw new Error("User is not a member of this team");
  }

  res.status(200).json({
    message: `${user?.name || "Member"} removed from the team`,
    team: await loadSerializedTeam(team._id),
  });
});

const deleteTeam = asyncHandler(async (req, res) => {
  requireAdmin(req, res);

  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400);
    throw new Error("Invalid team id");
  }

  const workspaceId = normalizeWorkspaceId(req.user.workspaceId);
  const team = await Team.findOne({
    _id: req.params.id,
    workspaceId,
  })
    .select("_id name workspaceId")
    .lean();

  if (!team) {
    res.status(404);
    throw new Error("Team not found");
  }

  const [memberCount, linkedProjectIds, inlineProjectCount] = await Promise.all([
    TeamMember.countDocuments({
      teamId: team._id,
    }),
    ProjectTeam.find({
      teamId: team._id,
    }).distinct("projectId"),
    Project.countDocuments({
      workspaceId,
      status: {
        $in: ACTIVE_PROJECT_STATUSES,
      },
      $or: [
        {
          attachedTeams: team._id,
        },
        {
          teamIds: team._id,
        },
      ],
    }),
  ]);

  if (memberCount > 0) {
    res.status(409);
    throw new Error("Cannot delete a team while it has members. Remove members first.");
  }

  const activeLinkedProjectCount = linkedProjectIds.length
    ? await Project.countDocuments({
        _id: {
          $in: linkedProjectIds,
        },
        workspaceId,
        status: {
          $in: ACTIVE_PROJECT_STATUSES,
        },
      })
    : 0;

  if (activeLinkedProjectCount + inlineProjectCount > 0) {
    res.status(409);
    throw new Error("Cannot delete a team while it is associated with active projects.");
  }

  await Promise.all([
    ProjectTeam.deleteMany({
      teamId: team._id,
    }),
    Project.updateMany(
      {
        workspaceId,
      },
      {
        $pull: {
          attachedTeams: team._id,
          teamIds: team._id,
        },
      }
    ),
    Team.deleteOne({
      _id: team._id,
      workspaceId,
    }),
  ]);

  res.status(200).json({
    message: "Team deleted successfully",
    deletedTeamId: team._id,
  });
});

module.exports = {
  getTeams,
  getTeamById,
  createTeam,
  addTeamMember,
  removeTeamMember,
  deleteTeam,
};
