const Notification = require("../models/Notification");
const User = require("../models/User");
const TeamMember = require("../models/TeamMember");
const ProjectMember = require("../models/ProjectMember");
const ProjectTeam = require("../models/ProjectTeam");
const {
  ROLE_ADMIN,
  ROLE_DEVELOPER,
  ROLE_MANAGER,
  ROLE_QA_LEAD,
  ROLE_TEAM_LEAD,
  ROLE_TESTER,
} = require("../utils/roles");
const { BUG_STATUS } = require("../utils/bugLifecycle");

const TESTER_NOTIFICATION_ROLES = [ROLE_TESTER, ROLE_QA_LEAD];
const DEVELOPER_QUEUE_NOTIFICATION_ROLES = [ROLE_DEVELOPER, ROLE_TEAM_LEAD];
const GIT_PUSH_NOTIFICATION_ROLES = [
  ROLE_DEVELOPER,
  ROLE_TEAM_LEAD,
  ROLE_TESTER,
  ROLE_QA_LEAD,
  ROLE_MANAGER,
];
const GIT_PUSH_PROJECT_MEMBER_ROLES = [
  "Developer",
  "Tester",
  "Q/A Lead",
  "Team Lead",
  "Manager",
];

const getUserRoleMap = async (userIds = []) => {
  const uniqueUserIds = Array.from(
    new Set(userIds.map((userId) => String(userId || "")).filter(Boolean))
  );

  if (!uniqueUserIds.length) {
    return new Map();
  }

  const users = await User.find({ _id: { $in: uniqueUserIds } })
    .select("_id role")
    .lean();

  return new Map(users.map((user) => [String(user._id), user.role || ""]));
};

const isTesterNotificationRole = (role = "") => TESTER_NOTIFICATION_ROLES.includes(role);
const isDeveloperQueueNotificationRole = (role = "") =>
  DEVELOPER_QUEUE_NOTIFICATION_ROLES.includes(role);

const emitNotificationToUser = (recipientId, notification) => {
  try {
    const { emitToUser } = require("../socket");

    if (typeof emitToUser === "function") {
      emitToUser(recipientId, "notification_received", notification);
    }
  } catch (error) {
    console.error("[notificationService] Error emitting notification:", error);
  }
};

/**
 * Finds all testers attached to a project through its teams
 */
const getTestersForProject = async (projectId) => {
  if (!projectId) return [];

  // Find all teams attached to the project
  const projectTeams = await ProjectTeam.find({ projectId }).select("teamId").lean();
  const teamIds = projectTeams.map((pt) => pt.teamId);

  if (!teamIds.length) return [];

  // Find all members of those teams
  const teamMembers = await TeamMember.find({ teamId: { $in: teamIds } }).select("userId").lean();
  const userIds = [...new Set(teamMembers.map((tm) => String(tm.userId)))];

  if (!userIds.length) return [];

  // Find users among team members who have tester-like roles
  const testers = await User.find({
    _id: { $in: userIds },
    role: { $in: [ROLE_TESTER, ROLE_QA_LEAD] },
  }).select("_id").lean();

  return testers.map((t) => t._id);
};

const addIdToSet = (set, value) => {
  const id = String(value?._id || value || "").trim();

  if (id) {
    set.add(id);
  }
};

const truncateText = (value = "", maxLength = 90) => {
  const text = String(value || "").replace(/\s+/g, " ").trim();

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 3)}...`;
};

/**
 * Finds project stakeholders who should know when the linked Git repo receives a push.
 */
const getGitPushRecipientsForProject = async (project) => {
  const projectId = project?._id || project;

  if (!projectId) {
    return [];
  }

  const explicitRecipientIds = new Set();
  addIdToSet(explicitRecipientIds, project.manager);
  addIdToSet(explicitRecipientIds, project.projectManager);
  addIdToSet(explicitRecipientIds, project.qaLead);
  addIdToSet(explicitRecipientIds, project.teamLead);

  const projectMembers = await ProjectMember.find({
    projectId,
    role: { $in: GIT_PUSH_PROJECT_MEMBER_ROLES },
  })
    .select("userId")
    .lean();

  for (const member of projectMembers) {
    addIdToSet(explicitRecipientIds, member.userId);
  }

  const projectTeams = await ProjectTeam.find({ projectId }).select("teamId").lean();
  const teamIds = new Set();

  for (const projectTeam of projectTeams) {
    addIdToSet(teamIds, projectTeam.teamId);
  }

  for (const teamId of project.attachedTeams || []) {
    addIdToSet(teamIds, teamId);
  }

  for (const teamId of project.teamIds || []) {
    addIdToSet(teamIds, teamId);
  }

  const teamMembers = teamIds.size
    ? await TeamMember.find({ teamId: { $in: Array.from(teamIds) } }).select("userId").lean()
    : [];
  const teamUserIds = Array.from(
    new Set(teamMembers.map((member) => String(member.userId || "")).filter(Boolean))
  );

  const teamStakeholders = teamUserIds.length
    ? await User.find({
        _id: { $in: teamUserIds },
        role: { $in: GIT_PUSH_NOTIFICATION_ROLES },
      })
        .select("_id")
        .lean()
    : [];

  const recipientIds = new Set(explicitRecipientIds);

  for (const user of teamStakeholders) {
    addIdToSet(recipientIds, user._id);
  }

  return Array.from(recipientIds);
};

/**
 * Creates a notification for a specific user, saves to DB, and emits via Socket.IO
 */
const createNotification = async ({
  recipientId,
  text,
  type,
  relatedId = null,
  onModel = "Issue",
  link = "",
}) => {
  if (!recipientId || !text) return null;

  try {
    const notification = await Notification.create({
      recipientId,
      text,
      type,
      relatedId,
      onModel,
      link,
    });

    emitNotificationToUser(recipientId, notification);

    return notification;
  } catch (error) {
    console.error("[notificationService] Error creating notification:", error);
    return null;
  }
};

/**
 * Logic for notifying about issue-related events
 */
const notifyIssueEvent = async ({
  issue,
  eventType, // 'assignment', 'status_change', 'team_queue'
  actorId,
  oldAssigneeId = null,
}) => {
  const issueKey = issue.displayBugId || issue.issueKey || "Item";
  const issueTitle = issue.title;
  const link = `/issues?search=${issueKey}`;
  const isBug = issue.type === "Bug";

  const currentAssigneeId = issue.assignee?._id || issue.assignee;
  const testerOwnerId = issue.bugDetails?.testerOwner?._id || issue.bugDetails?.testerOwner;
  const readyStatuses = [
    BUG_STATUS.READY_FOR_TESTING,
    BUG_STATUS.READY_FOR_QA,
    BUG_STATUS.READY_FOR_VERIFICATION,
  ];
  const isReadyForQaHandoff = isBug && readyStatuses.includes(issue.status);
  const roleMap = await getUserRoleMap([currentAssigneeId, testerOwnerId, oldAssigneeId]);
  const currentAssigneeRole = roleMap.get(String(currentAssigneeId || "")) || "";
  const oldAssigneeRole = roleMap.get(String(oldAssigneeId || "")) || "";

  if (eventType === "assignment") {
    // Notify new assignee (Rule 1 & 5)
    if (
      currentAssigneeId &&
      String(currentAssigneeId) !== String(actorId) &&
      !(isBug && isTesterNotificationRole(currentAssigneeRole) && !isReadyForQaHandoff)
    ) {
      await createNotification({
        recipientId: currentAssigneeId,
        text: `${issue.type} ${issueKey} assigned to you.`,
        type: "assignment",
        relatedId: issue._id,
        link,
      });
    }

    // Testers/QA should only be notified on developer handoff into Ready for Q/A.
    if (
      isBug &&
      testerOwnerId &&
      isReadyForQaHandoff &&
      String(testerOwnerId) !== String(actorId) &&
      String(testerOwnerId) !== String(currentAssigneeId)
    ) {
      await createNotification({
        recipientId: testerOwnerId,
        text: `Bug ${issueKey} is ready for Q/A verification.`,
        type: "status_change",
        relatedId: issue._id,
        link,
      });
    }

    // Notify old assignee if reassigned
    if (
      oldAssigneeId &&
      String(oldAssigneeId) !== String(currentAssigneeId) &&
      String(oldAssigneeId) !== String(actorId) &&
      !(isBug && isTesterNotificationRole(oldAssigneeRole) && !isReadyForQaHandoff)
    ) {
      await createNotification({
        recipientId: oldAssigneeId,
        text: `${issue.type} ${issueKey} has been reassigned.`,
        type: "assignment",
        relatedId: issue._id,
        link,
      });
    }
  }

  if (eventType === "needs_triage") {
    // Notify all Admins about bugs needing triage
    const admins = await User.find({ role: ROLE_ADMIN }).select("_id").lean();
    for (const admin of admins) {
      if (String(admin._id) === String(actorId)) continue;
      await createNotification({
        recipientId: admin._id,
        text: `New bug ${issueKey} requires triage.`,
        type: "triage_required",
        relatedId: issue._id,
        link: `/admin/bugs?bug=${issue._id}`,
      });
    }
  }

  if (eventType === "status_change") {
    const statusLabel = isBug
      ? (require("../utils/bugLifecycle").BUG_STATUS_LABELS[issue.status] || issue.status)
      : issue.status;

    // Notify assignee about status change. Tester/QA assignees only get Ready for Q/A handoff notifications.
    if (
      currentAssigneeId &&
      String(currentAssigneeId) !== String(actorId) &&
      !(isBug && isTesterNotificationRole(currentAssigneeRole) && !isReadyForQaHandoff)
    ) {
      await createNotification({
        recipientId: currentAssigneeId,
        text: `${issue.type} "${issueTitle}" moved to ${statusLabel}.`,
        type: "status_change",
        relatedId: issue._id,
        link,
      });
    }

    // Notify tester owner only when a developer handoff reaches Ready for Q/A.
    if (
      isBug &&
      testerOwnerId &&
      isReadyForQaHandoff &&
      String(testerOwnerId) !== String(actorId) &&
      String(testerOwnerId) !== String(currentAssigneeId)
    ) {
      await createNotification({
        recipientId: testerOwnerId,
        text: `Bug "${issueTitle}" is ready for Q/A verification.`,
        type: "status_change",
        relatedId: issue._id,
        link,
      });
    }

    // Notify all project testers only when the bug is handed off for QA verification.
    if (isBug && readyStatuses.includes(issue.status)) {
      const projectTesters = await getTestersForProject(issue.projectId);
      for (const tId of projectTesters) {
        if (String(tId) === String(actorId)) continue;
        if (String(tId) === String(currentAssigneeId)) continue;
        if (String(tId) === String(testerOwnerId)) continue;

        await createNotification({
          recipientId: tId,
          text: `Bug ${issueKey} is ${statusLabel.toLowerCase().replace(/_/g, ' ')}.`,
          type: "status_change",
          relatedId: issue._id,
          link,
        });
      }
    }
  }

  if (eventType === "team_queue") {
    if (issue.teamId && isBug) {
      const teamMembers = await TeamMember.find({ teamId: issue.teamId }).lean();
      const teamUserIds = teamMembers.map((m) => String(m.userId));
      const teamRoleMap = await getUserRoleMap(teamUserIds);
      const recipients = teamUserIds.filter((userId) =>
        isDeveloperQueueNotificationRole(teamRoleMap.get(String(userId)) || "")
      );

      for (const recipientId of recipients) {
        if (String(recipientId) === String(actorId)) continue;

        await createNotification({
          recipientId,
          text: `New bug ${issueKey} added to your team's queue.`,
          type: "team_queue",
          relatedId: issue._id,
          link,
        });
      }
    }
  }
};

/**
 * Logic for notifying about sprint-related events
 */
const notifySprintEvent = async ({
  sprint,
  eventType, // 'started', 'ended', 'goal_updated'
  actorId,
}) => {
  const sprintName = sprint.name;
  const link = `/backlog?projectId=${sprint.projectId}`;

  let text = "";
  if (eventType === "started") text = `Sprint "${sprintName}" has started.`;
  else if (eventType === "ended") text = `Sprint "${sprintName}" has ended.`;
  else if (eventType === "goal_updated") text = `Goal for Sprint "${sprintName}" was updated.`;

  if (!text) return;

  const teamMembers = sprint.teamId
    ? await TeamMember.find({ teamId: sprint.teamId }).lean()
    : [];
  const teamUserIds = teamMembers.map(m => String(m.userId));

  // Rule 6: Notify all testers attached to the project
  const projectTesters = await getTestersForProject(sprint.projectId);
  const projectTesterIds = projectTesters.map(id => String(id));

  const recipients = [...new Set([...teamUserIds, ...projectTesterIds])];

  for (const recipientId of recipients) {
    if (String(recipientId) === String(actorId)) continue;

    await createNotification({
      recipientId,
      text,
      type: "sprint",
      relatedId: sprint._id,
      onModel: "Sprint",
      link,
    });
  }
};

const notifyGitPushEvent = async ({
  project,
  branch,
  commitSha,
  commitMessage,
  pushedByName,
}) => {
  if (!project?._id) {
    return [];
  }

  const recipients = await getGitPushRecipientsForProject(project);

  if (!recipients.length) {
    return [];
  }

  const projectName = project.name || "Project";
  const shortSha = String(commitSha || "").slice(0, 7);
  const pushSource = pushedByName ? ` by ${pushedByName}` : "";
  const commitSummary = truncateText(commitMessage || "Git push received");
  const commitSuffix = shortSha ? ` (${shortSha})` : "";
  const branchSuffix = branch ? ` on ${branch}` : "";
  const text = `${projectName}: Git push${branchSuffix}${pushSource}. ${commitSummary}${commitSuffix}`;
  const notifications = [];

  for (const recipientId of recipients) {
    const notification = await createNotification({
      recipientId,
      text,
      type: "git_push",
      relatedId: project._id,
      onModel: "Project",
      link: "/dashboard",
    });

    if (notification) {
      notifications.push(notification);
    }
  }

  return notifications;
};

module.exports = {
  createNotification,
  notifyGitPushEvent,
  notifyIssueEvent,
  notifySprintEvent,
};
