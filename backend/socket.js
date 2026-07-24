const jwt = require("jsonwebtoken");
const { Server } = require("socket.io");
const CallLog = require("./models/CallLog.model");
const CallParticipant = require("./models/CallParticipant.model");
const Conversation = require("./models/Conversation.model");
const User = require("./models/User");
const {
  CHAT_ACCESS_ROLES,
  createMessageDocument,
  createSystemMessageDocument,
  loadConversationForUser,
  markConversationSeen,
} = require("./controllers/chat.controller");
const { setPresence } = require("./services/presenceService");
const { normalizeWorkspaceId } = require("./utils/workspace");

const onlineUsersByWorkspace = new Map();
const callPresenceByWorkspace = new Map();
const activeCalls = new Map();
const socketUsers = new Map();
const activeCallSockets = new Map();
let socketServer = null;

const getAllowedOrigins = () => {
  const configuredOrigins = [
    process.env.CLIENT_URL,
    process.env.FRONTEND_URL,
    process.env.CORS_ORIGIN,
  ]
    .filter(Boolean)
    .flatMap((value) => String(value).split(","))
    .map((value) => value.trim())
    .filter(Boolean);

  return configuredOrigins.length ? configuredOrigins : true;
};

const roomName = (conversationId) => `conversation:${objectIdString(conversationId)}`;
const userRoomName = (userId) => `user:${objectIdString(userId)}`;
const callRoomName = (callId) => `call:${objectIdString(callId)}`;
const workspaceRoomName = (workspaceId) =>
  `workspace:${normalizeWorkspaceId(workspaceId)}`;

const objectIdString = (value) => String(value?._id || value?.id || value || "");
const callSocketKey = (callId, userId) =>
  `${objectIdString(callId)}:${objectIdString(userId)}`;

const registerCallSocket = (callId, userId, socketId) => {
  if (!callId || !userId || !socketId) {
    return;
  }
  activeCallSockets.set(callSocketKey(callId, userId), socketId);
};

const unregisterSocketFromCalls = (socketId) => {
  for (const [key, registeredSocketId] of activeCallSockets.entries()) {
    if (registeredSocketId === socketId) {
      activeCallSockets.delete(key);
    }
  }
};

const emitToCallParticipant = (io, { callId, targetUserId, eventName, payload }) => {
  const targetSocketId = activeCallSockets.get(callSocketKey(callId, targetUserId));

  if (targetSocketId && io.sockets.sockets.has(targetSocketId)) {
    io.to(targetSocketId).emit(eventName, payload);
    return {
      target: "socket",
      targetSocketId,
    };
  }

  io.to(userRoomName(targetUserId)).emit(eventName, payload);
  return {
    target: "user-room",
    targetSocketId: null,
  };
};

const addOnlineUser = (user, socketId) => {
  const workspaceId = normalizeWorkspaceId(user.workspaceId);
  const userId = String(user._id);
  const workspaceUsers =
    onlineUsersByWorkspace.get(workspaceId) || new Map();
  const userSockets = workspaceUsers.get(userId) || new Set();

  userSockets.add(socketId);
  workspaceUsers.set(userId, userSockets);
  onlineUsersByWorkspace.set(workspaceId, workspaceUsers);
  socketUsers.set(socketId, {
    userId,
    workspaceId,
  });
};

const removeOnlineUser = (socketId) => {
  const socketUser = socketUsers.get(socketId);

  if (!socketUser) {
    return;
  }

  const workspaceUsers = onlineUsersByWorkspace.get(socketUser.workspaceId);
  const userSockets = workspaceUsers?.get(socketUser.userId);

  userSockets?.delete(socketId);

  if (userSockets && userSockets.size === 0) {
    workspaceUsers.delete(socketUser.userId);
  }

  if (workspaceUsers && workspaceUsers.size === 0) {
    onlineUsersByWorkspace.delete(socketUser.workspaceId);
  }

  socketUsers.delete(socketId);
};

const getOnlineUsers = (workspaceId) =>
  Array.from(onlineUsersByWorkspace.get(normalizeWorkspaceId(workspaceId))?.keys() || []);

const isUserOnline = (workspaceId, userId) =>
  onlineUsersByWorkspace
    .get(normalizeWorkspaceId(workspaceId))
    ?.has(objectIdString(userId)) || false;

const getCallPresence = (workspaceId) =>
  Object.fromEntries(callPresenceByWorkspace.get(normalizeWorkspaceId(workspaceId)) || []);

const emitOnlineUsers = (io, workspaceId) => {
  const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
  const onlineUsers = getOnlineUsers(normalizedWorkspaceId);

  console.log(
    `[Socket] Broadcasting online users to workspace ${normalizedWorkspaceId}: ${onlineUsers.length} users`
  );

  io.to(workspaceRoomName(normalizedWorkspaceId)).emit("online_users", onlineUsers);
};

const emitPresenceUpdate = (io, presence) => {
  if (!presence?.workspaceId || !presence?.userId) {
    return;
  }

  io.to(workspaceRoomName(presence.workspaceId)).emit("presence:update", presence);
};

const updateSocketPresence = async (io, socket, status, source = "socket") => {
  const presence = await setPresence({
    user: socket.user,
    status,
    socketId: socket.id,
    source,
  });

  emitPresenceUpdate(io, presence);
  return presence;
};

const setCallPresence = (io, workspaceId, userIds = [], status = "online") => {
  const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
  const workspacePresence =
    callPresenceByWorkspace.get(normalizedWorkspaceId) || new Map();

  userIds.filter(Boolean).forEach((userId) => {
    const normalizedUserId = objectIdString(userId);

    if (status === "online") {
      workspacePresence.delete(normalizedUserId);
    } else {
      workspacePresence.set(normalizedUserId, status);
    }
  });

  if (workspacePresence.size) {
    callPresenceByWorkspace.set(normalizedWorkspaceId, workspacePresence);
  } else {
    callPresenceByWorkspace.delete(normalizedWorkspaceId);
  }

  io.to(workspaceRoomName(normalizedWorkspaceId)).emit("call:presence", {
    presence: getCallPresence(normalizedWorkspaceId),
  });
};

const emitCallMessage = async ({ io, call, actor, message }) => {
  const createdMessage = await createSystemMessageDocument({
    conversationId: call.conversationId,
    sender: actor,
    message,
  });
  const conversation = await loadConversationForUser(call.conversationId, actor, {
    lean: true,
  });
  const participantRooms = (conversation?.participants || [])
    .map((participant) => userRoomName(objectIdString(participant)))
    .filter(Boolean);

  io.to([roomName(call.conversationId), ...participantRooms]).emit(
    "receive_message",
    {
      message: createdMessage,
      conversationId: objectIdString(call.conversationId),
      conversation,
    }
  );
};

const formatCallDuration = (seconds = 0) => {
  const safeSeconds = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;

  if (minutes <= 0) {
    return `${remainingSeconds}s`;
  }

  return `${minutes}m ${remainingSeconds}s`;
};

const serializeCall = (call, extras = {}) => ({
  callId: objectIdString(call._id),
  conversationId: objectIdString(call.conversationId),
  callerId: objectIdString(call.callerId),
  receiverId: objectIdString(call.receiverId),
  createdBy: objectIdString(call.createdBy || call.callerId),
  scope: call.scope || "direct",
  callType: call.callType,
  status: call.status,
  startTime: call.startTime,
  activeParticipantIds: (call.activeParticipantIds || []).map(objectIdString),
  invitedParticipantIds: (call.invitedParticipantIds || call.participants || []).map(
    objectIdString
  ),
  ...extras,
});

const serializeSocketUser = (user) => ({
  _id: user?._id,
  id: objectIdString(user),
  name: user?.name || "",
  email: user?.email || "",
  role: user?.role || "",
  avatarUrl: user?.avatarUrl || "",
});

const emitCallParticipants = async (io, callId) => {
  const call = await CallLog.findById(callId).lean();

  if (!call) {
    return;
  }

  const participantRecords = await CallParticipant.find({ callId })
    .populate("userId", "_id name email role designation avatarUrl")
    .lean();
  const payload = {
    call: serializeCall(call),
    participants: participantRecords.map((record) => ({
      user: serializeSocketUser(record.userId),
      role: record.role,
      status: record.status,
      joinedAt: record.joinedAt,
      leftAt: record.leftAt,
    })),
  };

  io.to(callRoomName(callId)).emit("call:participants", payload);
  io.to(roomName(call.conversationId)).emit("call:participants", payload);
};

const authenticateSocket = async (socket, next) => {
  try {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.split(" ")[1]?.trim();

    if (!token) {
      console.warn(`[Socket Auth] Missing token for socket: ${socket.id}`);
      throw new Error("Authentication token is required");
    }

    if (!process.env.JWT_SECRET) {
      console.error("[Socket Auth] JWT secret is not configured");
      throw new Error("JWT secret is not configured");
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded?.id) {
      console.warn(`[Socket Auth] Invalid token for socket: ${socket.id}`);
      throw new Error("Invalid token");
    }

    const user = await User.findById(decoded.id).select("-password").lean();

    if (!user || !CHAT_ACCESS_ROLES.includes(user.role)) {
      console.warn(
        `[Socket Auth] Unauthorized role or user not found for socket: ${socket.id}`
      );
      throw new Error("Unauthorized");
    }

    socket.user = {
      ...decoded,
      ...user,
      id: String(user._id),
      _id: user._id,
      workspaceId: normalizeWorkspaceId(user.workspaceId || decoded.workspaceId),
    };

    console.log(
      `[Socket Auth] Authenticated user ${user.name} (${user.email}) for socket: ${socket.id}`
    );
    next();
  } catch (error) {
    console.error(`[Socket Auth] Error for socket ${socket.id}: ${error.message}`);
    next(new Error(error?.message || "Socket authentication failed"));
  }
};

const setupChatSocket = (server) => {
  console.log("[Socket] Initializing Socket.IO server...");
  const io = new Server(server, {
    cors: {
      origin: getAllowedOrigins(),
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
    connectTimeout: 45000,
    allowEIO3: true,
  });
  socketServer = io;

  io.use((socket, next) => {
    console.log(
      `[Socket] Connection attempt: ${socket.id} (Transport: ${socket.conn.transport.name})`
    );
    authenticateSocket(socket, next);
  });

  io.on("connection", async (socket) => {
    console.log(`[Socket] Client connected: ${socket.id} (User: ${socket.user?.name})`);
    addOnlineUser(socket.user, socket.id);
    socket.join(userRoomName(socket.user._id));
    socket.join(workspaceRoomName(socket.user.workspaceId));
    await updateSocketPresence(io, socket, "active", "connect");
    emitOnlineUsers(io, socket.user.workspaceId);

    const joinConversation = async (conversationId, callback) => {
      const conversation = await loadConversationForUser(conversationId, socket.user, {
        lean: true,
      });

      if (!conversation) {
        callback?.({
          ok: false,
          error: "Conversation not found or inaccessible",
        });
        return null;
      }

      socket.join(roomName(conversation._id));
      const activeConversationCall = await CallLog.findOne({
        conversationId: conversation._id,
        scope: "group",
        status: "Active",
      }).lean();

      if (activeConversationCall) {
        socket.emit("call:channel-active", {
          call: serializeCall(activeConversationCall, {
            channelName:
              conversation.name ||
              conversation.projectId?.name ||
              conversation.teamId?.name ||
              "Group channel",
            participants: conversation.participants || [],
          }),
        });
      }

      callback?.({
        ok: true,
        conversationId: String(conversation._id),
      });
      return conversation;
    };

    socket.on("join_conversation", async (payload = {}, callback) => {
      try {
        await joinConversation(payload.conversationId || payload, callback);
      } catch (error) {
        callback?.({
          ok: false,
          error: error?.message || "Unable to join conversation",
        });
      }
    });

    socket.on("send_message", async (payload = {}, callback) => {
      try {
        await updateSocketPresence(io, socket, "active", "chat");
        const conversation = await joinConversation(payload.conversationId);

        if (!conversation) {
          throw new Error("Conversation not found or inaccessible");
        }

        const message = await createMessageDocument({
          conversationId: conversation._id,
          sender: socket.user,
          message: payload.message,
          attachments: payload.attachments,
        });
        const eventPayload = {
          message,
          conversationId: String(conversation._id),
          conversation,
          tempId: payload.tempId || null,
        };
        const participantRooms = (conversation.participants || [])
          .map((participant) => userRoomName(objectIdString(participant)))
          .filter(Boolean);

        io.to([roomName(conversation._id), ...participantRooms]).emit(
          "receive_message",
          eventPayload
        );
        callback?.({
          ok: true,
          ...eventPayload,
        });
      } catch (error) {
        callback?.({
          ok: false,
          tempId: payload.tempId || null,
          error: error?.message || "Unable to send message",
        });
      }
    });

    socket.on("typing", async (payload = {}) => {
      await updateSocketPresence(io, socket, "active", "chat");
      const conversation = await Conversation.findOne({
        _id: payload.conversationId,
        workspaceId: socket.user.workspaceId,
        participants: socket.user._id,
      })
        .select("_id")
        .lean();

      if (!conversation) {
        return;
      }

      socket.to(roomName(conversation._id)).emit("user_typing", {
        conversationId: String(conversation._id),
        userId: String(socket.user._id),
        user: {
          _id: socket.user._id,
          name: socket.user.name,
          email: socket.user.email,
          role: socket.user.role,
        },
      });
    });

    socket.on("stop_typing", async (payload = {}) => {
      const conversation = await Conversation.findOne({
        _id: payload.conversationId,
        workspaceId: socket.user.workspaceId,
        participants: socket.user._id,
      })
        .select("_id")
        .lean();

      if (!conversation) {
        return;
      }

      socket.to(roomName(conversation._id)).emit("user_typing", {
        conversationId: String(conversation._id),
        userId: String(socket.user._id),
        user: {
          _id: socket.user._id,
          name: socket.user.name,
          email: socket.user.email,
          role: socket.user.role,
        },
        stopped: true,
      });
    });

    socket.on("mark_seen", async (payload = {}, callback) => {
      try {
        await updateSocketPresence(io, socket, "active", "chat");
        const conversationId = payload.conversationId || payload;
        const result = await markConversationSeen({
          conversationId,
          user: socket.user,
        });

        if (!result.matched) {
          throw new Error("Conversation not found or inaccessible");
        }

        io.to(roomName(conversationId)).emit("message_seen", {
          conversationId: String(conversationId),
          userId: String(socket.user._id),
          seenAt: new Date().toISOString(),
        });
        callback?.({
          ok: true,
          modifiedCount: result.modifiedCount,
        });
      } catch (error) {
        callback?.({
          ok: false,
          error: error?.message || "Unable to mark messages as seen",
        });
      }
    });

    socket.on("call:start", async (payload = {}, callback) => {
      try {
        const callType = payload.callType === "video" ? "video" : "audio";
        const conversation = await loadConversationForUser(
          payload.conversationId,
          socket.user,
          { lean: true }
        );

        if (!conversation) {
          throw new Error("Conversation not found or inaccessible");
        }

        const isGroupCall = conversation.type !== "direct";
        const receiverId = isGroupCall ? "" : objectIdString(payload.receiverId);
        const participantIds = (conversation.participants || []).map(objectIdString);

        if (!isGroupCall && (
          !receiverId ||
          receiverId === objectIdString(socket.user._id) ||
          !participantIds.includes(receiverId)
        )) {
          throw new Error("Call receiver is not part of this conversation");
        }

        const receiver = (conversation.participants || []).find(
          (participant) => objectIdString(participant) === receiverId
        );
        const invitedParticipantIds = isGroupCall
          ? participantIds
          : [objectIdString(socket.user._id), receiverId];
        const incomingCallParticipantIds = invitedParticipantIds.filter((participantId) => {
          if (
            participantId === objectIdString(socket.user._id) ||
            !isUserOnline(socket.user.workspaceId, participantId)
          ) {
            return false;
          }
          return true;
        });
        const call = await CallLog.create({
          conversationId: conversation._id,
          channelId: conversation._id,
          callerId: socket.user._id,
          createdBy: socket.user._id,
          receiverId: receiverId || null,
          scope: isGroupCall ? "group" : "direct",
          participants: invitedParticipantIds,
          invitedParticipantIds,
          activeParticipantIds: isGroupCall ? [socket.user._id] : [],
          workspaceId: socket.user.workspaceId,
          callType,
          status: isGroupCall ? "Active" : "Ringing",
          startTime: isGroupCall ? new Date() : null,
        });
        await CallParticipant.insertMany(
          invitedParticipantIds.map((participantId) => ({
            callId: call._id,
            userId: participantId,
            role:
              participantId === objectIdString(socket.user._id)
                ? "host"
                : "participant",
            status:
              isGroupCall && participantId === objectIdString(socket.user._id)
                ? "Joined"
                : "Invited",
            joinedAt:
              isGroupCall && participantId === objectIdString(socket.user._id)
                ? call.startTime
                : null,
          })),
          { ordered: false }
        ).catch(() => {});
        const timeoutId = setTimeout(async () => {
          const currentCall = activeCalls.get(objectIdString(call._id));

          if (!currentCall || currentCall.status !== "Ringing") {
            return;
          }

          const endedAt = new Date();
          const missedCall = await CallLog.findByIdAndUpdate(
            call._id,
            {
              status: "Missed",
              endTime: endedAt,
              duration: 0,
            },
            { new: true }
          ).lean();

          activeCalls.delete(objectIdString(call._id));
          [socket.user._id, receiverId].forEach((participantId) => {
            activeCallSockets.delete(callSocketKey(call._id, participantId));
          });
          setCallPresence(io, socket.user.workspaceId, [socket.user._id, receiverId], "online");
          io.to([userRoomName(socket.user._id), userRoomName(receiverId)]).emit(
            "call:missed",
            serializeCall(missedCall)
          );
          await emitCallMessage({
            io,
            call: missedCall,
            actor: socket.user,
            message: `${callType === "video" ? "Video" : "Audio"} missed call`,
          });
        }, 30000);

        activeCalls.set(objectIdString(call._id), {
          callerId: objectIdString(socket.user._id),
          receiverId,
          workspaceId: socket.user.workspaceId,
          conversationId: objectIdString(conversation._id),
          scope: isGroupCall ? "group" : "direct",
          status: isGroupCall ? "Active" : "Ringing",
          participants: new Set(isGroupCall ? [objectIdString(socket.user._id)] : []),
          timeoutId: isGroupCall ? null : timeoutId,
        });
        socket.join(callRoomName(call._id));
        registerCallSocket(call._id, socket.user._id, socket.id);
        setCallPresence(
          io,
          socket.user.workspaceId,
          [socket.user._id],
          isGroupCall ? "in-group-call" : "ringing"
        );
        setCallPresence(io, socket.user.workspaceId, incomingCallParticipantIds, "ringing");

        const caller = {
          _id: socket.user._id,
          name: socket.user.name,
          email: socket.user.email,
          role: socket.user.role,
        };
        const basePayload = serializeCall(call, {
          caller,
          receiver,
          channelName:
            conversation.name ||
            conversation.projectId?.name ||
            conversation.teamId?.name ||
            "Group channel",
          participants: conversation.participants || [],
          createdAt: call.createdAt,
        });

        if (isGroupCall) {
          incomingCallParticipantIds.forEach((participantId) => {
            io.to(userRoomName(participantId)).emit("call:incoming", basePayload);
          });
        } else {
          io.to(userRoomName(receiverId)).emit("call:incoming", basePayload);
        }
        io.to(userRoomName(socket.user._id)).emit("call:outgoing", basePayload);
        await emitCallMessage({
          io,
          call,
          actor: socket.user,
          message: isGroupCall
            ? `${basePayload.channelName} group call started`
            : `${callType === "video" ? "Video" : "Audio"} call started`,
        });
        await emitCallParticipants(io, call._id);
        callback?.({ ok: true, call: basePayload });
      } catch (error) {
        callback?.({
          ok: false,
          error: error?.message || "Unable to start call",
        });
      }
    });

    socket.on("call:accept", async (payload = {}, callback) => {
      try {
        const call = await CallLog.findOne({
          _id: payload.callId,
          receiverId: socket.user._id,
          workspaceId: socket.user.workspaceId,
          status: "Ringing",
        });

        if (!call) {
          throw new Error("Call is no longer available");
        }

        const activeCall = activeCalls.get(objectIdString(call._id));
        clearTimeout(activeCall?.timeoutId);
        const startTime = new Date();
        call.status = "Answered";
        call.startTime = startTime;
        await call.save();
        activeCalls.set(objectIdString(call._id), {
          ...(activeCall || {}),
          callerId: objectIdString(call.callerId),
          receiverId: objectIdString(call.receiverId),
          workspaceId: call.workspaceId,
          status: "Answered",
        });
        socket.join(callRoomName(call._id));
        registerCallSocket(call._id, socket.user._id, socket.id);
        setCallPresence(io, call.workspaceId, [call.callerId, call.receiverId], "in-call");
        io.to([userRoomName(call.callerId), userRoomName(call.receiverId)]).emit(
          "call:accepted",
          serializeCall(call, { startTime })
        );
        callback?.({ ok: true, call: serializeCall(call, { startTime }) });
      } catch (error) {
        callback?.({
          ok: false,
          error: error?.message || "Unable to accept call",
        });
      }
    });

    socket.on("call:join", async (payload = {}, callback) => {
      try {
        const call = await CallLog.findOne({
          _id: payload.callId,
          workspaceId: socket.user.workspaceId,
          participants: socket.user._id,
          scope: "group",
          status: {
            $in: ["Active", "Answered"],
          },
        });

        if (!call) {
          throw new Error("Group call is no longer available");
        }

        const userId = objectIdString(socket.user._id);
        const joinedAt = new Date();
        const activeParticipantIds = new Set(
          (call.activeParticipantIds || []).map(objectIdString)
        );
        const existingParticipantIds = Array.from(activeParticipantIds);
        activeParticipantIds.add(userId);
        call.activeParticipantIds = Array.from(activeParticipantIds);
        call.status = "Active";
        call.startTime = call.startTime || joinedAt;
        await call.save();
        await CallParticipant.findOneAndUpdate(
          {
            callId: call._id,
            userId: socket.user._id,
          },
          {
            $set: {
              status: "Joined",
              joinedAt,
              leftAt: null,
            },
            $setOnInsert: {
              role: objectIdString(call.createdBy || call.callerId) === userId
                ? "host"
                : "participant",
            },
          },
          {
            upsert: true,
            new: true,
          }
        );

        socket.join(callRoomName(call._id));
        registerCallSocket(call._id, socket.user._id, socket.id);
        const activeCall = activeCalls.get(objectIdString(call._id)) || {
          scope: "group",
          workspaceId: call.workspaceId,
          conversationId: objectIdString(call.conversationId),
          participants: new Set(),
          status: "Active",
        };
        activeCall.participants = new Set([
          ...Array.from(activeCall.participants || []),
          userId,
        ]);
        activeCalls.set(objectIdString(call._id), activeCall);
        setCallPresence(io, call.workspaceId, [socket.user._id], "in-group-call");

        socket.to(callRoomName(call._id)).emit("call:participant-joined", {
          call: serializeCall(call),
          user: serializeSocketUser(socket.user),
          existingParticipantIds,
        });
        io.to(userRoomName(socket.user._id)).emit("call:joined", {
          call: serializeCall(call),
          existingParticipantIds,
        });
        await emitCallMessage({
          io,
          call,
          actor: socket.user,
          message: `${socket.user.name || "A participant"} joined the call`,
        });
        await emitCallParticipants(io, call._id);
        callback?.({
          ok: true,
          call: serializeCall(call),
          existingParticipantIds,
        });
      } catch (error) {
        callback?.({
          ok: false,
          error: error?.message || "Unable to join group call",
        });
      }
    });

    socket.on("call:reject", async (payload = {}, callback) => {
      try {
        const groupCall = await CallLog.findOne({
          _id: payload.callId,
          workspaceId: socket.user.workspaceId,
          participants: socket.user._id,
          scope: "group",
          status: "Active",
        });

        if (groupCall) {
          await CallParticipant.findOneAndUpdate(
            {
              callId: groupCall._id,
              userId: socket.user._id,
            },
            {
              $set: {
                status: "Declined",
                leftAt: new Date(),
              },
            }
          );
          setCallPresence(io, groupCall.workspaceId, [socket.user._id], "online");
          await emitCallParticipants(io, groupCall._id);
          callback?.({ ok: true });
          return;
        }

        const call = await CallLog.findOne({
          _id: payload.callId,
          receiverId: socket.user._id,
          workspaceId: socket.user.workspaceId,
          status: "Ringing",
        });

        if (!call) {
          return callback?.({ ok: false, error: "Call is no longer available" });
        }

        const activeCall = activeCalls.get(objectIdString(call._id));
        clearTimeout(activeCall?.timeoutId);
        call.status = "Rejected";
        call.endTime = new Date();
        call.duration = 0;
        await call.save();
        activeCalls.delete(objectIdString(call._id));
        [call.callerId, call.receiverId].forEach((participantId) => {
          activeCallSockets.delete(callSocketKey(call._id, participantId));
        });
        setCallPresence(io, call.workspaceId, [call.callerId, call.receiverId], "online");
        io.to([userRoomName(call.callerId), userRoomName(call.receiverId)]).emit(
          "call:rejected",
          serializeCall(call)
        );
        await emitCallMessage({
          io,
          call,
          actor: socket.user,
          message: `${call.callType === "video" ? "Video" : "Audio"} call rejected`,
        });
        callback?.({ ok: true });
      } catch (error) {
        callback?.({ ok: false, error: error?.message || "Unable to reject call" });
      }
    });

    socket.on("call:leave", async (payload = {}, callback) => {
      try {
        const call = await CallLog.findOne({
          _id: payload.callId,
          workspaceId: socket.user.workspaceId,
          participants: socket.user._id,
          scope: "group",
          status: "Active",
        });

        if (!call) {
          return callback?.({ ok: false, error: "Call not found" });
        }

        const userId = objectIdString(socket.user._id);
        call.activeParticipantIds = (call.activeParticipantIds || []).filter(
          (participantId) => objectIdString(participantId) !== userId
        );
        await call.save();
        await CallParticipant.findOneAndUpdate(
          {
            callId: call._id,
            userId: socket.user._id,
          },
          {
            $set: {
              status: "Left",
              leftAt: new Date(),
            },
          }
        );
        socket.leave(callRoomName(call._id));
        activeCallSockets.delete(callSocketKey(call._id, socket.user._id));
        const activeCall = activeCalls.get(objectIdString(call._id));
        activeCall?.participants?.delete(userId);
        setCallPresence(io, call.workspaceId, [socket.user._id], "online");
        io.to(callRoomName(call._id)).emit("call:participant-left", {
          call: serializeCall(call),
          userId,
        });
        io.to(userRoomName(socket.user._id)).emit("call:left", serializeCall(call));
        await emitCallMessage({
          io,
          call,
          actor: socket.user,
          message: `${socket.user.name || "A participant"} left the call`,
        });
        await emitCallParticipants(io, call._id);
        callback?.({ ok: true });
      } catch (error) {
        callback?.({ ok: false, error: error?.message || "Unable to leave call" });
      }
    });

    socket.on("call:end", async (payload = {}, callback) => {
      try {
        const call = await CallLog.findOne({
          _id: payload.callId,
          workspaceId: socket.user.workspaceId,
          participants: socket.user._id,
        });

        if (!call) {
          return callback?.({ ok: false, error: "Call not found" });
        }

        const activeCall = activeCalls.get(objectIdString(call._id));
        const isGroupCall = call.scope === "group";
        const isHost =
          objectIdString(call.createdBy || call.callerId) === objectIdString(socket.user._id);
        const isAdmin = ["Admin", "Manager"].includes(socket.user.role);

        if (isGroupCall && !isHost && !isAdmin) {
          return callback?.({
            ok: false,
            error: "Only the host or an admin can end the group call for everyone",
          });
        }

        clearTimeout(activeCall?.timeoutId);
        const endTime = new Date();
        const startTime = call.startTime || call.createdAt;
        const duration =
          call.status === "Answered" || call.status === "Active"
            ? Math.max(1, Math.round((endTime - startTime) / 1000))
            : 0;
        call.endTime = endTime;
        call.duration = duration;
        call.status = call.status === "Answered" ? "Ended" : "Missed";
        if (isGroupCall) {
          call.status = "Ended";
          await CallParticipant.updateMany(
            {
              callId: call._id,
              status: "Joined",
            },
            {
              $set: {
                status: "Left",
                leftAt: endTime,
              },
            }
          );
          await CallParticipant.updateMany(
            {
              callId: call._id,
              status: "Invited",
            },
            {
              $set: {
                status: "Missed",
                leftAt: endTime,
              },
            }
          );
        }
        await call.save();
        activeCalls.delete(objectIdString(call._id));
        (call.participants || [call.callerId, call.receiverId]).forEach((participantId) => {
          activeCallSockets.delete(callSocketKey(call._id, participantId));
        });
        setCallPresence(
          io,
          call.workspaceId,
          call.participants || [call.callerId, call.receiverId],
          "online"
        );
        io.to([
          userRoomName(call.callerId),
          userRoomName(call.receiverId),
          callRoomName(call._id),
          roomName(call.conversationId),
        ]).emit(
          "call:ended",
          serializeCall(call, { duration })
        );
        await emitCallMessage({
          io,
          call,
          actor: socket.user,
          message:
            call.status === "Ended"
              ? `${call.callType === "video" ? "Video" : "Audio"} call ended (Duration: ${formatCallDuration(duration)})`
              : `${call.callType === "video" ? "Video" : "Audio"} missed call`,
        });
        callback?.({ ok: true, call: serializeCall(call, { duration }) });
      } catch (error) {
        callback?.({ ok: false, error: error?.message || "Unable to end call" });
      }
    });

    ["offer", "answer", "ice-candidate"].forEach((eventName) => {
      socket.on(`call:${eventName}`, async (payload = {}) => {
        const call = await CallLog.findOne({
          _id: payload.callId,
          workspaceId: socket.user.workspaceId,
          participants: socket.user._id,
        })
          .select("_id participants activeParticipantIds scope workspaceId startTime status")
          .lean();

        if (!call) {
          return;
        }

        console.log(`[Socket][Call] ${eventName} received`, {
          callId: objectIdString(call._id),
          fromUserId: objectIdString(socket.user._id),
          targetUserId: objectIdString(payload.targetUserId),
          descriptionType: payload.description?.type,
          hasCandidate: Boolean(payload.candidate),
          iceRestart: Boolean(payload.iceRestart),
        });

        const targetUserId = objectIdString(payload.targetUserId);
        const participantIds = (call.participants || []).map(objectIdString);
        const activeParticipantIds = (call.activeParticipantIds || []).map(objectIdString);
        const fromUserId = objectIdString(socket.user._id);

        if (!targetUserId || targetUserId === fromUserId) {
          console.warn(`[Socket][Call] ${eventName} ignored invalid target`, {
            callId: objectIdString(call._id),
            fromUserId,
            targetUserId,
          });
          return;
        }

        if (!participantIds.includes(targetUserId)) {
          console.warn(`[Socket][Call] ${eventName} ignored non-participant target`, {
            callId: objectIdString(call._id),
            fromUserId,
            targetUserId,
          });
          return;
        }

        if (
          call.scope === "group" &&
          (!activeParticipantIds.includes(objectIdString(socket.user._id)) ||
            !activeParticipantIds.includes(targetUserId) ||
            call.status !== "Active")
        ) {
          console.warn(`[Socket][Call] ${eventName} ignored inactive group participant`, {
            callId: objectIdString(call._id),
            fromUserId,
            targetUserId,
            activeParticipantIds,
            status: call.status,
          });
          return;
        }

        const route = emitToCallParticipant(io, {
          callId: call._id,
          targetUserId,
          eventName: `call:${eventName}`,
          payload: {
            ...payload,
            fromUserId,
            startTime: call.startTime,
          },
        });

        console.log(`[Socket][Call] ${eventName} routed`, {
          callId: objectIdString(call._id),
          fromUserId,
          targetUserId,
          target: route.target,
          targetSocketId: route.targetSocketId,
        });
      });
    });

    socket.on("user:active", async (_payload = {}, callback) => {
      try {
        addOnlineUser(socket.user, socket.id);
        await updateSocketPresence(io, socket, "active", "activity");
        emitOnlineUsers(io, socket.user.workspaceId);
        callback?.({ ok: true });
      } catch (error) {
        callback?.({ ok: false, error: "Unable to update activity" });
      }
    });

    socket.on("user:idle", async (_payload = {}, callback) => {
      try {
        await updateSocketPresence(io, socket, "idle", "activity");
        callback?.({ ok: true });
      } catch (error) {
        callback?.({ ok: false, error: "Unable to update activity" });
      }
    });

    socket.on("user:offline", async (_payload = {}, callback) => {
      try {
        const offlineUser = socket.user;

        removeOnlineUser(socket.id);
        if (!isUserOnline(offlineUser.workspaceId, offlineUser._id)) {
          await updateSocketPresence(io, socket, "offline", "logout");
        }
        emitOnlineUsers(io, offlineUser.workspaceId);
        callback?.({ ok: true });
      } catch (error) {
        callback?.({ ok: false, error: "Unable to update activity" });
      }
    });

    ["screen-share-started", "screen-share-stopped"].forEach((eventName) => {
      socket.on(`call:${eventName}`, async (payload = {}) => {
        const call = await CallLog.findOne({
          _id: payload.callId,
          workspaceId: socket.user.workspaceId,
          participants: socket.user._id,
          status: {
            $in: ["Active", "Answered"],
          },
        })
          .select("_id conversationId participants activeParticipantIds scope status")
          .lean();

        if (!call) {
          return;
        }

        const userId = objectIdString(socket.user._id);
        const activeParticipantIds = (call.activeParticipantIds || []).map(objectIdString);

        if (call.scope === "group" && !activeParticipantIds.includes(userId)) {
          return;
        }

        console.log(`[Socket][Call] ${eventName}`, {
          callId: objectIdString(call._id),
          userId,
        });

        const eventPayload = {
          callId: objectIdString(call._id),
          userId,
        };

        if (call.scope === "group") {
          socket.to(callRoomName(call._id)).emit(`call:${eventName}`, eventPayload);
          return;
        }

        (call.participants || [])
          .map(objectIdString)
          .filter((participantId) => participantId !== userId)
          .forEach((participantId) => {
            emitToCallParticipant(io, {
              callId: call._id,
              targetUserId: participantId,
              eventName: `call:${eventName}`,
              payload: eventPayload,
            });
          });
      });
    });

    socket.on("call:raise-hand", async (payload = {}) => {
      const call = await CallLog.findOne({
        _id: payload.callId,
        workspaceId: socket.user.workspaceId,
        participants: socket.user._id,
        scope: "group",
        status: "Active",
      })
        .select("_id")
        .lean();

      if (!call) {
        return;
      }

      socket.to(callRoomName(call._id)).emit("call:raise-hand", {
        callId: objectIdString(call._id),
        userId: objectIdString(socket.user._id),
        raised: Boolean(payload.raised),
      });
    });

    socket.on("disconnect", (reason) => {
      console.log(`[Socket] Client disconnected: ${socket.id} (Reason: ${reason})`);
      const disconnectedUser = socket.user;
      unregisterSocketFromCalls(socket.id);
      removeOnlineUser(socket.id);
      if (!isUserOnline(disconnectedUser.workspaceId, disconnectedUser._id)) {
        updateSocketPresence(io, socket, "offline", "disconnect").catch((error) => {
          console.error("[presence] disconnect update failed", error.message);
        });
      }
      emitOnlineUsers(io, disconnectedUser.workspaceId);
    });
  });

  return io;
};

const emitWorkspaceEvent = (workspaceId, eventName, payload = {}) => {
  if (!socketServer || !workspaceId || !eventName) {
    return false;
  }

  socketServer.to(workspaceRoomName(workspaceId)).emit(eventName, payload);
  return true;
};

const emitToUser = (userId, eventName, payload = {}) => {
  if (!socketServer || !userId || !eventName) {
    return false;
  }

  const targetRoom = userRoomName(userId);
  const socketsInRoom = socketServer.sockets.adapter.rooms.get(targetRoom);
  const isOnline = socketsInRoom && socketsInRoom.size > 0;

  console.log(
    `[Socket] Emitting event "${eventName}" to user: ${objectIdString(
      userId
    )} (Online: ${Boolean(isOnline)})`
  );

  socketServer.to(targetRoom).emit(eventName, payload);

  return Boolean(isOnline);
};

const emitConversationMessage = ({
  conversationId,
  conversation = null,
  message = null,
}) => {
  if (!socketServer || !conversationId || !message) {
    return false;
  }

  const participantRooms = (conversation?.participants || [])
    .map((participant) => userRoomName(objectIdString(participant)))
    .filter(Boolean);

  socketServer.to([roomName(conversationId), ...participantRooms]).emit("receive_message", {
    message,
    conversationId: objectIdString(conversationId),
    conversation,
  });

  return true;
};

const emitBugWorkflowEvent = ({
  workspaceId,
  eventName = "BugUpdated",
  bug = null,
  issue = null,
  action = "",
  actor = null,
  meta = {},
}) =>
  emitWorkspaceEvent(workspaceId, eventName, {
    action,
    bug: bug || issue || null,
    issue: issue || bug || null,
    actor: actor
      ? {
          _id: actor._id || actor.id || null,
          name: actor.name || "",
          email: actor.email || "",
          role: actor.role || "",
        }
      : null,
    meta,
    emittedAt: new Date().toISOString(),
  });

module.exports = {
  emitBugWorkflowEvent,
  emitConversationMessage,
  emitWorkspaceEvent,
  emitToUser,
  getOnlineUsers,
  setupChatSocket,
};
