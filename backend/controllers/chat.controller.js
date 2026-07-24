const fs = require("fs");
const path = require("path");
const multer = require("multer");
const mongoose = require("mongoose");
const ChatMeeting = require("../models/ChatMeeting");
const Conversation = require("../models/Conversation.model");
const CallLog = require("../models/CallLog.model");
const Message = require("../models/Message.model");
const Project = require("../models/Project");
const ProjectTeam = require("../models/ProjectTeam");
const Team = require("../models/Team");
const TeamMember = require("../models/TeamMember");
const User = require("../models/User");
const asyncHandler = require("../utils/asyncHandler");
const { uploadToS3 } = require("../utils/s3");
const {
  buildProjectAccessQuery,
  mergeProjectTeamIds,
} = require("../utils/projectRelations");
const { resolveMeetingWindow } = require("../utils/meetingWindow");
const { normalizeWorkspaceId } = require("../utils/workspace");
const { ROLE_ADMIN, ROLE_MANAGER } = require("../utils/roles");

const CHAT_ACCESS_ROLES = ["Admin", "Manager", "Team Lead", "Q/A Lead", "Developer", "Tester"];
const MAX_MESSAGE_LENGTH = 4000;
const DEFAULT_MESSAGE_LIMIT = 30;
const MAX_MESSAGE_LIMIT = 80;
const MAX_CHAT_ATTACHMENT_SIZE_MB = 25;
const MAX_CHAT_ATTACHMENT_SIZE = MAX_CHAT_ATTACHMENT_SIZE_MB * 1024 * 1024;
const chatAttachmentsRoot = path.resolve(__dirname, "..", "uploads", "chat-attachments");
const allowedAttachmentExtensions = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".pdf",
  ".doc",
  ".docx",
  ".xlsx",
  ".zip",
  ".txt",
]);
const allowedAttachmentMimeTypesByExtension = new Map([
  [".jpg", new Set(["image/jpeg"])],
  [".jpeg", new Set(["image/jpeg"])],
  [".png", new Set(["image/png"])],
  [".gif", new Set(["image/gif"])],
  [".webp", new Set(["image/webp"])],
  [".pdf", new Set(["application/pdf"])],
  [".doc", new Set(["application/msword"])],
  [
    ".docx",
    new Set([
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ]),
  ],
  [
    ".xlsx",
    new Set([
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ]),
  ],
  [".zip", new Set(["application/zip", "application/x-zip-compressed"])],
  [".txt", new Set(["text/plain"])],
]);
const fallbackAttachmentMimeTypes = new Set(["", "application/octet-stream"]);

fs.mkdirSync(chatAttachmentsRoot, {
  recursive: true,
});

const userSelect = "_id name email role designation avatarUrl workspaceId";
const conversationPopulation = [
  { path: "participants", select: userSelect },
  { path: "createdBy", select: userSelect },
  { path: "projectId", select: "_id name shortCode themeColor workspaceId" },
  { path: "teamId", select: "_id name workspaceId" },
];

const objectIdString = (value) => String(value?._id || value || "");

const ensureChatAccess = (req, res) => {
  if (!req.user) {
    res.status(401);
    throw new Error("Unauthorized");
  }

  if (!CHAT_ACCESS_ROLES.includes(req.user.role)) {
    res.status(403);
    throw new Error("You do not have access to chat");
  }
};

const isValidObjectId = (value) => mongoose.isValidObjectId(value);

const uniqueObjectIds = (values = []) => {
  const byId = new Map();

  values.filter(Boolean).forEach((value) => {
    const id = objectIdString(value);

    if (id && isValidObjectId(id)) {
      byId.set(id, new mongoose.Types.ObjectId(id));
    }
  });

  return Array.from(byId.values());
};

const sanitizeText = (value = "", limit = MAX_MESSAGE_LENGTH) =>
  String(value)
    .replace(/<[^>]*>/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, limit);

const escapeRegex = (value = "") =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const sanitizeFileName = (value = "attachment") => {
  const parsedName = path.basename(String(value || "attachment"));
  const safeFileName = parsedName
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .slice(0, 180);

  return safeFileName || "attachment";
};

const isAllowedAttachment = (file = {}) => {
  const extension = path.extname(file.originalname || "").toLowerCase();
  const mimeType = String(file.mimetype || "").toLowerCase();
  const allowedMimeTypes = allowedAttachmentMimeTypesByExtension.get(extension);

  return (
    allowedAttachmentExtensions.has(extension) &&
    (allowedMimeTypes?.has(mimeType) || fallbackAttachmentMimeTypes.has(mimeType))
  );
};

const chatAttachmentStorage = multer.memoryStorage();
const uploadChatAttachmentMiddleware = multer({
  storage: chatAttachmentStorage,
  limits: {
    fileSize: MAX_CHAT_ATTACHMENT_SIZE,
  },
  fileFilter: (_req, file, callback) => {
    if (!isAllowedAttachment(file)) {
      const error = new Error("Unsupported file type");
      error.statusCode = 400;
      callback(error);
      return;
    }

    callback(null, true);
  },
}).single("file");

const sanitizeAttachments = (attachments = []) => {
  if (!Array.isArray(attachments)) {
    return [];
  }

  return attachments
    .slice(0, 10)
    .map((attachment) => {
      const fileName = sanitizeFileName(
        attachment?.fileName || attachment?.name || "attachment"
      );
      const fileUrl = sanitizeText(attachment?.fileUrl || attachment?.url || "", 1200);
      const fileType = sanitizeText(attachment?.fileType || attachment?.type || "", 120);
      const size = Number.isFinite(Number(attachment?.size))
        ? Math.max(0, Number(attachment.size))
        : 0;

      return {
        name: fileName,
        fileName,
        url: fileUrl,
        fileUrl,
        type: fileType,
        fileType,
        size,
      };
    })
    .filter((attachment) => attachment.fileName || attachment.fileUrl);
};

const sortDirectParticipants = (participantIds = []) =>
  uniqueObjectIds(participantIds).sort((left, right) =>
    String(left).localeCompare(String(right))
  );

const serializeUser = (user) => {
  if (!user) {
    return null;
  }

  return {
    _id: user._id,
    name: user.name || "",
    email: user.email || "",
    role: user.role || "",
    designation: user.designation || "",
    avatarUrl: user.avatarUrl || "",
    workspaceId: normalizeWorkspaceId(user.workspaceId),
  };
};

const sanitizeMeetingSubject = (value = "") => sanitizeText(value, 160);
const buildMeetingUrl = ({ conversationId, meetingId }) =>
  `/chat?conversation=${encodeURIComponent(objectIdString(conversationId))}&meeting=${encodeURIComponent(objectIdString(meetingId))}`;
const canCreateMeetings = (role = "") => CHAT_ACCESS_ROLES.includes(role);
const canManageMeeting = (meeting, user) =>
  user?.role === ROLE_ADMIN ||
  user?.role === ROLE_MANAGER ||
  objectIdString(meeting?.scheduledBy) === objectIdString(user?._id);

const serializeConversation = (conversation, { unreadCount = 0 } = {}) => {
  const item =
    typeof conversation?.toObject === "function"
      ? conversation.toObject()
      : conversation;

  if (!item) {
    return null;
  }

  return {
    ...item,
    workspaceId: normalizeWorkspaceId(item.workspaceId),
    participants: (item.participants || []).map(serializeUser).filter(Boolean),
    createdBy: serializeUser(item.createdBy) || item.createdBy,
    unreadCount,
  };
};

const populateConversation = (target) => target.populate(conversationPopulation);

const loadConversationForUser = async (conversationId, user, options = {}) => {
  if (!isValidObjectId(conversationId)) {
    return null;
  }

  const query = Conversation.findOne({
    _id: conversationId,
    workspaceId: normalizeWorkspaceId(user.workspaceId),
    participants: user._id,
  });

  return options.lean
    ? populateConversation(query).lean()
    : populateConversation(query);
};

const countUnreadByConversation = async (conversationIds = [], userId) => {
  if (!conversationIds.length) {
    return new Map();
  }

  const counts = await Message.aggregate([
    {
      $match: {
        conversationId: {
          $in: conversationIds,
        },
        senderId: {
          $ne: new mongoose.Types.ObjectId(objectIdString(userId)),
        },
        deleted: false,
        seenBy: {
          $not: {
            $elemMatch: {
              userId: new mongoose.Types.ObjectId(objectIdString(userId)),
            },
          },
        },
      },
    },
    {
      $group: {
        _id: "$conversationId",
        count: {
          $sum: 1,
        },
      },
    },
  ]);

  return new Map(counts.map((item) => [String(item._id), item.count]));
};

const getTeamParticipantIds = async (teamId, workspaceId) => {
  const teamIds = Array.isArray(teamId) ? teamId : [teamId];
  const memberships = await TeamMember.find({
    teamId: {
      $in: teamIds,
    },
  })
    .select("userId")
    .lean();

  const memberIds = memberships.map((membership) => membership.userId);

  if (!memberIds.length) {
    return [];
  }

  return User.find({
    _id: {
      $in: memberIds,
    },
    workspaceId: normalizeWorkspaceId(workspaceId),
  }).distinct("_id");
};

const getProjectParticipantIds = async (project, workspaceId) => {
  const projectTeams = await ProjectTeam.find({
    projectId: project._id,
  })
    .select("teamId")
    .lean();
  const teamIds = mergeProjectTeamIds(project, projectTeams);
  const teamMemberIds = teamIds.length
    ? await getTeamParticipantIds(teamIds, workspaceId)
    : [];

  return uniqueObjectIds([
    project.createdBy,
    project.manager,
    project.projectManager,
    project.teamLead,
    project.qaLead,
    ...teamMemberIds,
  ]);
};

const ensureTeamConversation = async ({ team, currentUserId }) => {
  const workspaceId = normalizeWorkspaceId(team.workspaceId);
  const participantIds = uniqueObjectIds([
    currentUserId,
    ...(await getTeamParticipantIds(team._id, workspaceId)),
    team.createdBy,
  ]);

  return Conversation.findOneAndUpdate(
    {
      workspaceId,
      channelType: "team",
      teamId: team._id,
    },
    {
      $setOnInsert: {
        type: "group",
        channelType: "team",
        teamId: team._id,
        workspaceId,
        createdBy: currentUserId,
      },
      $set: {
        participants: participantIds,
        name: team.name,
      },
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    }
  );
};

const ensureProjectConversation = async ({ project, currentUserId }) => {
  const workspaceId = normalizeWorkspaceId(project.workspaceId);
  const participantIds = uniqueObjectIds([
    currentUserId,
    ...(await getProjectParticipantIds(project, workspaceId)),
  ]);

  return Conversation.findOneAndUpdate(
    {
      workspaceId,
      channelType: "project",
      projectId: project._id,
    },
    {
      $setOnInsert: {
        type: "group",
        channelType: "project",
        projectId: project._id,
        workspaceId,
        createdBy: currentUserId,
      },
      $set: {
        participants: participantIds,
        name: project.name,
      },
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    }
  );
};

const ensureWorkspaceChannelsForUser = async (user) => {
  const workspaceId = normalizeWorkspaceId(user.workspaceId);
  const userId = user._id;
  const teamIds = await TeamMember.find({
    userId,
  }).distinct("teamId");
  const [teams, projects] = await Promise.all([
    Team.find({
      _id: {
        $in: teamIds,
      },
      workspaceId,
    }).lean(),
    Project.find(await buildProjectAccessQuery(user))
      .select(
        "_id name workspaceId createdBy manager projectManager teamLead qaLead attachedTeams teamIds"
      )
      .lean(),
  ]);

  await Promise.all([
    ...teams.map((team) => ensureTeamConversation({ team, currentUserId: userId })),
    ...projects.map((project) =>
      ensureProjectConversation({ project, currentUserId: userId })
    ),
  ]);
};

const createDirectConversation = async ({ currentUser, targetUserId }) => {
  const workspaceId = normalizeWorkspaceId(currentUser.workspaceId);
  const targetUser = await User.findOne({
    _id: targetUserId,
    workspaceId,
  })
    .select(userSelect)
    .lean();

  if (!targetUser) {
    const error = new Error("Selected user could not be found in this workspace");
    error.statusCode = 404;
    throw error;
  }

  const participants = sortDirectParticipants([currentUser._id, targetUser._id]);
  let conversation = await Conversation.findOne({
    workspaceId,
    type: "direct",
    participants: {
      $all: participants,
      $size: 2,
    },
  });

  if (!conversation) {
    try {
      conversation = await Conversation.create({
        type: "direct",
        channelType: "direct",
        participants,
        workspaceId,
        createdBy: currentUser._id,
      });
    } catch (error) {
      if (error.code !== 11000) {
        throw error;
      }

      conversation = await Conversation.findOne({
        workspaceId,
        type: "direct",
        participants: {
          $all: participants,
          $size: 2,
        },
      });
    }
  }

  return populateConversation(Conversation.findById(conversation._id)).lean();
};

const createMessageDocument = async ({
  conversationId,
  sender,
  message,
  attachments = [],
  metadata = null,
}) => {
  const sanitizedMessage = sanitizeText(message);
  const sanitizedAttachments = sanitizeAttachments(attachments);
  const sanitizedMetadata =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? metadata
      : null;

  if (!sanitizedMessage && !sanitizedAttachments.length && !sanitizedMetadata) {
    const error = new Error("Message text or attachment is required");
    error.statusCode = 400;
    throw error;
  }

  const conversation = await Conversation.findOne({
    _id: conversationId,
    workspaceId: normalizeWorkspaceId(sender.workspaceId),
    participants: sender._id,
  }).select("_id participants workspaceId");

  if (!conversation) {
    const error = new Error("Conversation not found or inaccessible");
    error.statusCode = 404;
    throw error;
  }

  const createdMessage = await Message.create({
    conversationId: conversation._id,
    senderId: sender._id,
    message: sanitizedMessage,
    attachments: sanitizedAttachments,
    metadata: sanitizedMetadata,
    seenBy: [
      {
        userId: sender._id,
        seenAt: new Date(),
      },
    ],
  });

  await Conversation.updateOne(
    {
      _id: conversation._id,
    },
    {
      lastMessage: sanitizedMessage || "Attachment",
      lastMessageAt: createdMessage.createdAt,
    }
  );

  return Message.findById(createdMessage._id)
    .populate("senderId", userSelect)
    .lean();
};

const createSystemMessageDocument = async ({ conversationId, sender, message }) =>
  createMessageDocument({
    conversationId,
    sender,
    message,
    attachments: [],
  });

const serializeChatMeeting = (meeting) => {
  const serializedMeeting =
    typeof meeting?.toObject === "function" ? meeting.toObject() : meeting;

  if (!serializedMeeting) {
    return null;
  }

  return {
    _id: serializedMeeting._id,
    conversationId: serializedMeeting.conversationId,
    workspaceId: normalizeWorkspaceId(serializedMeeting.workspaceId),
    scheduledBy: serializedMeeting.scheduledBy,
    title: serializedMeeting.title,
    description: serializedMeeting.description || "",
    meetingUrl: serializedMeeting.meetingUrl,
    startTime: serializedMeeting.startTime,
    durationMinutes: serializedMeeting.durationMinutes,
    participants: serializedMeeting.participants || [],
    isPinned: Boolean(serializedMeeting.isPinned),
    createdAt: serializedMeeting.createdAt,
    updatedAt: serializedMeeting.updatedAt,
  };
};

const getConversationMeetingParticipants = async (conversation, workspaceId) => {
  const participantIds = uniqueObjectIds(conversation?.participants || []);

  if (!participantIds.length) {
    return [];
  }

  const users = await User.find({
    _id: {
      $in: participantIds,
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

const getConversations = asyncHandler(async (req, res) => {
  ensureChatAccess(req, res);

  await ensureWorkspaceChannelsForUser(req.user);

  const conversations = await populateConversation(
    Conversation.find({
      workspaceId: normalizeWorkspaceId(req.user.workspaceId),
      participants: req.user._id,
    }).sort({ lastMessageAt: -1, updatedAt: -1 })
  ).lean();
  const unreadCounts = await countUnreadByConversation(
    conversations.map((conversation) => conversation._id),
    req.user._id
  );

  res.status(200).json({
    conversations: conversations
      .map((conversation) =>
        serializeConversation(conversation, {
          unreadCount: unreadCounts.get(String(conversation._id)) || 0,
        })
      )
      .filter(Boolean),
  });
});

const createConversation = asyncHandler(async (req, res) => {
  ensureChatAccess(req, res);

  const workspaceId = normalizeWorkspaceId(req.user.workspaceId);
  const type = req.body?.type === "direct" ? "direct" : "group";
  const channelType = ["team", "project", "custom"].includes(req.body?.channelType)
    ? req.body.channelType
    : type === "direct"
      ? "direct"
      : "custom";

  if (type === "direct") {
    const targetUserId = req.body?.userId || req.body?.participantId;

    if (!isValidObjectId(targetUserId)) {
      res.status(400);
      throw new Error("A valid user is required for direct chat");
    }

    const conversation = await createDirectConversation({
      currentUser: req.user,
      targetUserId,
    });

    res.status(201).json({
      conversation: serializeConversation(conversation),
    });
    return;
  }

  if (channelType === "team") {
    if (!isValidObjectId(req.body?.teamId)) {
      res.status(400);
      throw new Error("A valid team is required");
    }

    const team = await Team.findOne({
      _id: req.body.teamId,
      workspaceId,
    }).lean();

    if (!team) {
      res.status(404);
      throw new Error("Team not found");
    }

    const conversation = await ensureTeamConversation({
      team,
      currentUserId: req.user._id,
    });
    const populated = await populateConversation(
      Conversation.findById(conversation._id)
    ).lean();

    res.status(201).json({
      conversation: serializeConversation(populated),
    });
    return;
  }

  if (channelType === "project") {
    if (!isValidObjectId(req.body?.projectId)) {
      res.status(400);
      throw new Error("A valid project is required");
    }

    const project = await Project.findOne({
      _id: req.body.projectId,
      ...(await buildProjectAccessQuery(req.user)),
    }).lean();

    if (!project) {
      res.status(404);
      throw new Error("Project not found or inaccessible");
    }

    const conversation = await ensureProjectConversation({
      project,
      currentUserId: req.user._id,
    });
    const populated = await populateConversation(
      Conversation.findById(conversation._id)
    ).lean();

    res.status(201).json({
      conversation: serializeConversation(populated),
    });
    return;
  }

  const participantIds = uniqueObjectIds([
    req.user._id,
    ...(Array.isArray(req.body?.participants) ? req.body.participants : []),
  ]);

  if (participantIds.length < 2) {
    res.status(400);
    throw new Error("Group chat needs at least two participants");
  }

  const participantCount = await User.countDocuments({
    _id: {
      $in: participantIds,
    },
    workspaceId,
  });

  if (participantCount !== participantIds.length) {
    res.status(400);
    throw new Error("All participants must belong to this workspace");
  }

  const conversation = await Conversation.create({
    type: "group",
    channelType: "custom",
    name: sanitizeText(req.body?.name || "Group chat", 120),
    participants: participantIds,
    workspaceId,
    createdBy: req.user._id,
  });
  const populated = await populateConversation(
    Conversation.findById(conversation._id)
  ).lean();

  res.status(201).json({
    conversation: serializeConversation(populated),
  });
});

const deleteConversation = asyncHandler(async (req, res) => {
  ensureChatAccess(req, res);

  if (!isValidObjectId(req.params.id)) {
    res.status(400);
    throw new Error("Invalid conversation id");
  }

  const conversation = await Conversation.findOne({
    _id: req.params.id,
    workspaceId: normalizeWorkspaceId(req.user.workspaceId),
    participants: req.user._id,
  }).select("_id channelType participants");

  if (!conversation) {
    res.status(404);
    throw new Error("Conversation not found or inaccessible");
  }

  if (["project", "team"].includes(conversation.channelType)) {
    res.status(400);
    throw new Error("Workspace channels are managed from projects and teams");
  }

  conversation.participants = conversation.participants.filter(
    (participantId) => objectIdString(participantId) !== objectIdString(req.user._id)
  );

  if (!conversation.participants.length) {
    await Conversation.deleteOne({ _id: conversation._id });
  } else {
    await conversation.save();
  }

  res.status(200).json({
    message: "Conversation removed",
    conversationId: objectIdString(conversation._id),
  });
});

const addConversationParticipants = asyncHandler(async (req, res) => {
  ensureChatAccess(req, res);

  if (!isValidObjectId(req.params.id)) {
    res.status(400);
    throw new Error("Invalid conversation id");
  }

  const conversation = await Conversation.findOne({
    _id: req.params.id,
    workspaceId: normalizeWorkspaceId(req.user.workspaceId),
    participants: req.user._id,
  });

  if (!conversation) {
    res.status(404);
    throw new Error("Conversation not found or inaccessible");
  }

  if (conversation.type !== "group" || conversation.channelType !== "custom") {
    res.status(400);
    throw new Error("Participants can only be added to custom group chats");
  }

  const requestedParticipantIds = uniqueObjectIds(
    Array.isArray(req.body?.participants) ? req.body.participants : []
  );

  if (!requestedParticipantIds.length) {
    res.status(400);
    throw new Error("Select at least one participant to add");
  }

  const existingParticipantIds = new Set(
    (conversation.participants || []).map((participantId) => objectIdString(participantId))
  );
  const newParticipantIds = requestedParticipantIds.filter(
    (participantId) => !existingParticipantIds.has(objectIdString(participantId))
  );

  if (!newParticipantIds.length) {
    const populatedConversation = await populateConversation(
      Conversation.findById(conversation._id)
    ).lean();

    res.status(200).json({
      conversation: serializeConversation(populatedConversation),
    });
    return;
  }

  const workspaceId = normalizeWorkspaceId(req.user.workspaceId);
  const participantCount = await User.countDocuments({
    _id: { $in: newParticipantIds },
    workspaceId,
  });

  if (participantCount !== newParticipantIds.length) {
    res.status(400);
    throw new Error("All selected participants must belong to this workspace");
  }

  conversation.participants = uniqueObjectIds([
    ...(conversation.participants || []),
    ...newParticipantIds,
  ]);
  await conversation.save();

  const populatedConversation = await populateConversation(
    Conversation.findById(conversation._id)
  ).lean();

  res.status(200).json({
    conversation: serializeConversation(populatedConversation),
  });
});

const removeConversationParticipant = asyncHandler(async (req, res) => {
  ensureChatAccess(req, res);

  if (!isValidObjectId(req.params.id) || !isValidObjectId(req.params.userId)) {
    res.status(400);
    throw new Error("Invalid conversation or participant id");
  }

  const conversation = await Conversation.findOne({
    _id: req.params.id,
    workspaceId: normalizeWorkspaceId(req.user.workspaceId),
    participants: req.user._id,
  });

  if (!conversation) {
    res.status(404);
    throw new Error("Conversation not found or inaccessible");
  }

  if (conversation.type !== "group" || conversation.channelType !== "custom") {
    res.status(400);
    throw new Error("Participants can only be removed from custom group chats");
  }

  const targetUserId = objectIdString(req.params.userId);

  if (targetUserId === objectIdString(req.user._id)) {
    res.status(400);
    throw new Error("Use leave chat to remove yourself from this conversation");
  }

  const remainingParticipants = (conversation.participants || []).filter(
    (participantId) => objectIdString(participantId) !== targetUserId
  );

  if (remainingParticipants.length === (conversation.participants || []).length) {
    res.status(404);
    throw new Error("Participant is not part of this conversation");
  }

  if (!remainingParticipants.length) {
    res.status(400);
    throw new Error("A group chat must have at least one participant");
  }

  conversation.participants = remainingParticipants;
  await conversation.save();

  const populatedConversation = await populateConversation(
    Conversation.findById(conversation._id)
  ).lean();

  res.status(200).json({
    conversation: serializeConversation(populatedConversation),
  });
});

const getConversationById = asyncHandler(async (req, res) => {
  ensureChatAccess(req, res);

  const conversation = await loadConversationForUser(req.params.id, req.user, {
    lean: true,
  });

  if (!conversation) {
    res.status(404);
    throw new Error("Conversation not found or inaccessible");
  }

  const unreadCounts = await countUnreadByConversation(
    [conversation._id],
    req.user._id
  );

  res.status(200).json({
    conversation: serializeConversation(conversation, {
      unreadCount: unreadCounts.get(String(conversation._id)) || 0,
    }),
  });
});

const getMessages = asyncHandler(async (req, res) => {
  ensureChatAccess(req, res);

  if (!isValidObjectId(req.params.conversationId)) {
    res.status(400);
    throw new Error("Invalid conversation id");
  }

  const conversation = await Conversation.findOne({
    _id: req.params.conversationId,
    workspaceId: normalizeWorkspaceId(req.user.workspaceId),
    participants: req.user._id,
  })
    .select("_id")
    .lean();

  if (!conversation) {
    res.status(404);
    throw new Error("Conversation not found or inaccessible");
  }

  const limit = Math.min(
    Math.max(Number(req.query.limit) || DEFAULT_MESSAGE_LIMIT, 1),
    MAX_MESSAGE_LIMIT
  );
  const before = req.query.before;
  const query = {
    conversationId: conversation._id,
    deleted: false,
  };

  if (before) {
    const beforeDate = new Date(before);

    if (!Number.isNaN(beforeDate.getTime())) {
      query.createdAt = {
        $lt: beforeDate,
      };
    }
  }

  const descendingMessages = await Message.find(query)
    .populate("senderId", userSelect)
    .sort({ createdAt: -1 })
    .limit(limit + 1)
    .lean();
  const hasMore = descendingMessages.length > limit;
  const messages = descendingMessages.slice(0, limit).reverse();

  res.status(200).json({
    messages,
    pagination: {
      hasMore,
      nextCursor: hasMore ? messages[0]?.createdAt || null : null,
    },
  });
});

const createMessage = asyncHandler(async (req, res) => {
  ensureChatAccess(req, res);

  if (!isValidObjectId(req.body?.conversationId)) {
    res.status(400);
    throw new Error("Invalid conversation id");
  }

  const message = await createMessageDocument({
    conversationId: req.body.conversationId,
    sender: req.user,
    message: req.body.message,
    attachments: req.body.attachments,
  });

  res.status(201).json({
    message,
  });
});

const uploadChatAttachment = asyncHandler(async (req, res) => {
  ensureChatAccess(req, res);

  if (!req.file) {
    res.status(400);
    throw new Error("Select a file to upload");
  }

  const fileName = sanitizeFileName(req.file.originalname);

  const fileUrl = await uploadToS3(
  req.file,
  "chat-attachments"
);
  res.status(201).json({
    attachment: {
      name: fileName,
      fileName,
      url: fileUrl,
      fileUrl,
      type: req.file.mimetype,
      fileType: req.file.mimetype,
      size: req.file.size,
    },
  });
});

const searchUsers = asyncHandler(async (req, res) => {
  ensureChatAccess(req, res);

  const query = sanitizeText(req.query.q || "", 80);
  const safeQuery = escapeRegex(query);

  if (query.length < 2) {
    res.status(200).json({
      users: [],
    });
    return;
  }

  const users = await User.find({
    workspaceId: normalizeWorkspaceId(req.user.workspaceId),
    _id: {
      $ne: req.user._id,
    },
    $or: [
      {
        name: {
          $regex: safeQuery,
          $options: "i",
        },
      },
      {
        email: {
          $regex: safeQuery,
          $options: "i",
        },
      },
      {
        employeeId: {
          $regex: safeQuery,
          $options: "i",
        },
      },
    ],
  })
    .select(userSelect)
    .sort({ name: 1 })
    .limit(12)
    .lean();

  res.status(200).json({
    users: users.map(serializeUser).filter(Boolean),
  });
});

const getCallLogs = asyncHandler(async (req, res) => {
  ensureChatAccess(req, res);

  const query = {
    workspaceId: normalizeWorkspaceId(req.user.workspaceId),
    participants: req.user._id,
  };

  if (req.query.conversationId && isValidObjectId(req.query.conversationId)) {
    query.conversationId = req.query.conversationId;
  }

  const calls = await CallLog.find(query)
    .populate("callerId", userSelect)
    .populate("receiverId", userSelect)
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  res.status(200).json({ calls });
});

const getMeetings = asyncHandler(async (req, res) => {
  ensureChatAccess(req, res);

  if (!isValidObjectId(req.params.conversationId)) {
    res.status(400);
    throw new Error("Invalid conversation id");
  }

  const conversation = await Conversation.findOne({
    _id: req.params.conversationId,
    workspaceId: normalizeWorkspaceId(req.user.workspaceId),
    participants: req.user._id,
  })
    .select("_id")
    .lean();

  if (!conversation) {
    res.status(404);
    throw new Error("Conversation not found or inaccessible");
  }

  const meetings = await ChatMeeting.find({
    conversationId: conversation._id,
    workspaceId: normalizeWorkspaceId(req.user.workspaceId),
  })
    .sort({ startTime: 1, createdAt: -1 })
    .lean();

  res.status(200).json({
    meetings: meetings.map(serializeChatMeeting).filter(Boolean),
  });
});

const getAllMeetings = asyncHandler(async (req, res) => {
  ensureChatAccess(req, res);

  const workspaceId = normalizeWorkspaceId(req.user.workspaceId);
  const accessibleConversationIds = await Conversation.find({
    workspaceId,
    participants: req.user._id,
  }).distinct("_id");
  const query = {
    workspaceId,
    conversationId: {
      $in: accessibleConversationIds,
    },
  };
  const search = sanitizeText(req.query.q || "", 120);

  if (search) {
    query.title = {
      $regex: escapeRegex(search),
      $options: "i",
    };
  }

  const meetings = await ChatMeeting.find(query)
    .sort({ startTime: 1, createdAt: -1 })
    .lean();

  res.status(200).json({
    meetings: meetings.map(serializeChatMeeting).filter(Boolean),
  });
});

const scheduleMeeting = asyncHandler(async (req, res) => {
  ensureChatAccess(req, res);

  if (!isValidObjectId(req.params.conversationId)) {
    res.status(400);
    throw new Error("Invalid conversation id");
  }

  if (!canCreateMeetings(req.user.role)) {
    res.status(403);
    throw new Error("You do not have permission to create meetings");
  }

  const title = sanitizeMeetingSubject(req.body?.title || req.body?.subject || "");
  const description = sanitizeText(req.body?.description || "", 1000);
  const meetingWindow = resolveMeetingWindow({
    startDateTime: req.body?.startDateTime,
    endDateTime: req.body?.endDateTime,
    durationMinutes: req.body?.durationMinutes,
  });

  if (!title) {
    res.status(400);
    throw new Error("Meeting title is required");
  }

  if (req.body?.startDateTime && meetingWindow.error) {
    res.status(400);
    throw new Error(meetingWindow.error);
  }

  const startDate = meetingWindow?.startDate || null;
  const durationMinutes = meetingWindow?.durationMinutes || null;

  const conversation = await Conversation.findOne({
    _id: req.params.conversationId,
    workspaceId: normalizeWorkspaceId(req.user.workspaceId),
    participants: req.user._id,
  })
    .select("_id participants name projectId teamId workspaceId")
    .lean();

  if (!conversation) {
    res.status(404);
    throw new Error("Conversation not found or inaccessible");
  }

  const workspaceId = normalizeWorkspaceId(req.user.workspaceId);
  const mailWorkspaceId = normalizeWorkspaceId(conversation.workspaceId || workspaceId);
  const participants = await getConversationMeetingParticipants(conversation, workspaceId);

  if (!participants.length) {
    res.status(400);
    throw new Error("This chat has no eligible participants with email addresses");
  }

  const meeting = await ChatMeeting.create({
    conversationId: conversation._id,
    workspaceId,
    scheduledBy: req.user._id,
    title,
    description,
    meetingUrl: buildMeetingUrl({
      conversationId: conversation._id,
      meetingId: new mongoose.Types.ObjectId(),
    }),
    startTime: startDate,
    durationMinutes,
    participants: participants.map((participant) => ({
      userId: participant.userId,
      name: participant.name,
      email: participant.email,
      role: participant.role,
    })),
  });
  meeting.meetingUrl = buildMeetingUrl({
    conversationId: conversation._id,
    meetingId: meeting._id,
  });
  await meeting.save();

  const meetingTitle =
    conversation.name || conversation.projectId?.name || conversation.teamId?.name || "Chat";
  const message = await createMessageDocument({
    conversationId: conversation._id,
    sender: req.user,
    message: `${req.user.name || "A teammate"} scheduled a chat meeting`,
    metadata: {
      type: "meeting",
      meetingId: String(meeting._id || ""),
      title: meeting.title,
      description: meeting.description || "",
      meetingUrl: meeting.meetingUrl,
      startTime: meeting.startTime,
      durationMinutes: meeting.durationMinutes,
      scheduledBy: {
        _id: req.user._id,
        name: req.user.name || "",
        email: req.user.email || "",
      },
      participantCount: participants.length,
      conversationName: meetingTitle,
    },
  });
  const fullConversation = await loadConversationForUser(conversation._id, req.user, {
    lean: true,
  });
  require("../socket").emitConversationMessage({
    conversationId: conversation._id,
    conversation: fullConversation,
    message,
  });

  res.status(201).json({
    message: "Meeting scheduled successfully",
    meeting: serializeChatMeeting(meeting),
    chatMessage: message,
  });
});

const updateMeeting = asyncHandler(async (req, res) => {
  ensureChatAccess(req, res);

  if (!isValidObjectId(req.params.meetingId)) {
    res.status(400);
    throw new Error("Invalid meeting id");
  }

  const meeting = await ChatMeeting.findOne({
    _id: req.params.meetingId,
    workspaceId: normalizeWorkspaceId(req.user.workspaceId),
  });

  if (!meeting) {
    res.status(404);
    throw new Error("Meeting not found");
  }

  const conversation = await Conversation.findOne({
    _id: meeting.conversationId,
    workspaceId: normalizeWorkspaceId(req.user.workspaceId),
    participants: req.user._id,
  })
    .select("_id")
    .lean();

  if (!conversation) {
    res.status(404);
    throw new Error("Conversation not found or inaccessible");
  }

  if (!canManageMeeting(meeting, req.user)) {
    res.status(403);
    throw new Error("You do not have permission to edit this meeting");
  }

  const title = sanitizeMeetingSubject(req.body?.title || req.body?.subject || meeting.title);
  const description = sanitizeText(
    Object.prototype.hasOwnProperty.call(req.body || {}, "description")
      ? req.body.description
      : meeting.description || "",
    1000
  );
  const meetingWindow = resolveMeetingWindow({
    startDateTime: Object.prototype.hasOwnProperty.call(req.body || {}, "startDateTime")
      ? req.body.startDateTime
      : meeting.startTime,
    durationMinutes: Object.prototype.hasOwnProperty.call(req.body || {}, "durationMinutes")
      ? req.body.durationMinutes
      : meeting.durationMinutes,
  });

  if (!title) {
    res.status(400);
    throw new Error("Meeting title is required");
  }

  if (
    Object.prototype.hasOwnProperty.call(req.body || {}, "startDateTime") &&
    req.body.startDateTime &&
    meetingWindow.error
  ) {
    res.status(400);
    throw new Error(meetingWindow.error);
  }

  meeting.title = title;
  meeting.description = description;
  meeting.meetingUrl = buildMeetingUrl({
    conversationId: meeting.conversationId,
    meetingId: meeting._id,
  });
  meeting.startTime = meetingWindow?.startDate || null;
  meeting.durationMinutes = meetingWindow?.durationMinutes || null;
  await meeting.save();

  const chatMessage = await createMessageDocument({
    conversationId: meeting.conversationId,
    sender: req.user,
    message: `${req.user.name || "A teammate"} updated a chat meeting`,
    metadata: {
      type: "meeting",
      action: "updated",
      meetingId: String(meeting._id || ""),
      title: meeting.title,
      description: meeting.description || "",
      meetingUrl: meeting.meetingUrl,
      startTime: meeting.startTime,
      durationMinutes: meeting.durationMinutes,
      scheduledBy: {
        _id: req.user._id,
        name: req.user.name || "",
        email: req.user.email || "",
      },
      participantCount: (meeting.participants || []).length,
    },
  });
  const fullConversation = await loadConversationForUser(meeting.conversationId, req.user, {
    lean: true,
  });
  require("../socket").emitConversationMessage({
    conversationId: meeting.conversationId,
    conversation: fullConversation,
    message: chatMessage,
  });

  res.status(200).json({
    message: "Meeting updated successfully",
    meeting: serializeChatMeeting(meeting),
    chatMessage,
  });
});

const deleteMeeting = asyncHandler(async (req, res) => {
  ensureChatAccess(req, res);

  if (!isValidObjectId(req.params.meetingId)) {
    res.status(400);
    throw new Error("Invalid meeting id");
  }

  const meeting = await ChatMeeting.findOne({
    _id: req.params.meetingId,
    workspaceId: normalizeWorkspaceId(req.user.workspaceId),
  });

  if (!meeting) {
    res.status(404);
    throw new Error("Meeting not found");
  }

  const conversation = await Conversation.findOne({
    _id: meeting.conversationId,
    workspaceId: normalizeWorkspaceId(req.user.workspaceId),
    participants: req.user._id,
  })
    .select("_id")
    .lean();

  if (!conversation) {
    res.status(404);
    throw new Error("Conversation not found or inaccessible");
  }

  if (!canManageMeeting(meeting, req.user)) {
    res.status(403);
    throw new Error("You do not have permission to delete this meeting");
  }

  await ChatMeeting.deleteOne({ _id: meeting._id });

  const chatMessage = await createMessageDocument({
    conversationId: meeting.conversationId,
    sender: req.user,
    message: `${req.user.name || "A teammate"} cancelled a chat meeting`,
    metadata: {
      type: "meeting",
      action: "cancelled",
      meetingId: String(meeting._id || ""),
      title: meeting.title,
      description: meeting.description || "",
      meetingUrl: meeting.meetingUrl,
      startTime: meeting.startTime,
      durationMinutes: meeting.durationMinutes,
      scheduledBy: {
        _id: req.user._id,
        name: req.user.name || "",
        email: req.user.email || "",
      },
      participantCount: (meeting.participants || []).length,
    },
  });
  const fullConversation = await loadConversationForUser(meeting.conversationId, req.user, {
    lean: true,
  });
  require("../socket").emitConversationMessage({
    conversationId: meeting.conversationId,
    conversation: fullConversation,
    message: chatMessage,
  });

  res.status(200).json({
    message: "Meeting deleted successfully",
    meetingId: objectIdString(meeting._id),
    chatMessage,
  });
});

const markConversationSeen = async ({ conversationId, user }) => {
  const conversation = await Conversation.findOne({
    _id: conversationId,
    workspaceId: normalizeWorkspaceId(user.workspaceId),
    participants: user._id,
  })
    .select("_id")
    .lean();

  if (!conversation) {
    return {
      matched: false,
      modifiedCount: 0,
    };
  }

  const result = await Message.updateMany(
    {
      conversationId: conversation._id,
      senderId: {
        $ne: user._id,
      },
      seenBy: {
        $not: {
          $elemMatch: {
            userId: user._id,
          },
        },
      },
    },
    {
      $push: {
        seenBy: {
          userId: user._id,
          seenAt: new Date(),
        },
      },
    }
  );

  return {
    matched: true,
    modifiedCount: result.modifiedCount || 0,
  };
};

module.exports = {
  CHAT_ACCESS_ROLES,
  addConversationParticipants,
  removeConversationParticipant,
  createConversation,
  deleteConversation,
  createMessage,
  createMessageDocument,
  createSystemMessageDocument,
  getConversationById,
  getConversations,
  getCallLogs,
  getAllMeetings,
  getMeetings,
  getMessages,
  loadConversationForUser,
  markConversationSeen,
  deleteMeeting,
  scheduleMeeting,
  searchUsers,
  serializeConversation,
  updateMeeting,
  uploadChatAttachment,
  uploadChatAttachmentMiddleware,
};
