const TeamMember = require("../models/TeamMember");
const { normalizeWorkspaceId } = require("./workspace");

const teamPopulation = [{ path: "createdBy", select: "name email role workspaceId" }];

const populateTeam = (query) => query.populate(teamPopulation);

const sanitizeUser = (user) => {
  if (!user || typeof user !== "object") {
    return null;
  }

  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    avatarUrl: user.avatarUrl || "",
    workspaceId: normalizeWorkspaceId(user.workspaceId),
  };
};

const attachMembersToTeams = async (teams = []) => {
  if (!teams.length) {
    return [];
  }

  const normalizedTeams = teams.map((team) =>
    typeof team?.toObject === "function" ? team.toObject() : team
  );
  const teamIds = normalizedTeams.map((team) => team._id);
  const workspaceByTeamId = new Map(
    normalizedTeams.map((team) => [String(team._id), normalizeWorkspaceId(team.workspaceId)])
  );
  const membersByTeamId = new Map(teamIds.map((teamId) => [String(teamId), []]));

  const memberships = await TeamMember.find({
    teamId: {
      $in: teamIds,
    },
  })
    .populate("userId", "name email role avatarUrl workspaceId")
    .sort({ createdAt: 1 })
    .lean();

  memberships.forEach((membership) => {
    const teamId = String(membership.teamId);
    const member = sanitizeUser(membership.userId);
    const teamWorkspaceId = workspaceByTeamId.get(teamId);

    if (!member || !teamWorkspaceId || member.workspaceId !== teamWorkspaceId) {
      return;
    }

    membersByTeamId.get(teamId)?.push(member);
  });

  return normalizedTeams.map((team) => {
    const members = membersByTeamId.get(String(team._id)) || [];

    return {
      ...team,
      workspaceId: normalizeWorkspaceId(team.workspaceId),
      createdBy: sanitizeUser(team.createdBy),
      members,
      memberCount: members.length,
    };
  });
};

module.exports = {
  teamPopulation,
  populateTeam,
  sanitizeUser,
  attachMembersToTeams,
};
