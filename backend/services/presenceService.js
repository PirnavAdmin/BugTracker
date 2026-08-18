const UserActivity = require("../models/UserActivity");
const User = require("../models/User");
const redisClient = require("../utils/redis");
const { withTenantFilter } = require("../utils/tenant");
const { normalizeWorkspaceId } = require("../utils/workspace");

const PRESENCE_TTL_SECONDS = 10 * 60;
const ACTIVE_WINDOW_MS = 5 * 60 * 1000;
const DB_WRITE_INTERVAL_MS = 60 * 1000;
const VALID_STATUSES = new Set(["active", "idle", "offline"]);

const getDayStart = (value = new Date()) => {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
};

const diffMinutes = (left, right) =>
  Math.max(0, Math.round((new Date(right).getTime() - new Date(left).getTime()) / 60000));

const inferStatus = (lastSeen = new Date(), fallback = "active") => {
  const age = Date.now() - new Date(lastSeen).getTime();

  if (age > ACTIVE_WINDOW_MS) return "idle";
  return VALID_STATUSES.has(fallback) ? fallback : "active";
};

const presenceKey = (userId) => `presence:${userId}`;

const safeRedisSet = async (key, payload) => {
  try {
    if (!redisClient?.isOpen) return false;
    await redisClient.set(key, JSON.stringify(payload), {
      EX: PRESENCE_TTL_SECONDS,
    });
    return true;
  } catch (error) {
    console.error("[presence] redis set failed", error.message);
    return false;
  }
};

const safeRedisGet = async (key) => {
  try {
    if (!redisClient?.isOpen) return null;
    const rawValue = await redisClient.get(key);
    return rawValue ? JSON.parse(rawValue) : null;
  } catch (error) {
    console.error("[presence] redis get failed", error.message);
    return null;
  }
};

const safeRedisDelete = async (key) => {
  try {
    if (redisClient?.isOpen) {
      await redisClient.del(key);
    }
  } catch (error) {
    console.error("[presence] redis delete failed", error.message);
  }
};

const getActivityRecord = async ({ userId, workspaceId, at = new Date() }) =>
  UserActivity.findOneAndUpdate(
    {
      userId,
      date: getDayStart(at),
    },
    {
      $setOnInsert: {
        userId,
        workspaceId: normalizeWorkspaceId(workspaceId),
        date: getDayStart(at),
        loginTime: at,
        totalActiveMinutes: 0,
        totalIdleMinutes: 0,
        totalLoginMinutes: 0,
        status: "offline",
        currentStatus: "offline",
      },
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    }
  );

const updateActivityDurations = async ({ record, previousStatus, at }) => {
  if (!record) return null;

  const lastActiveTime = record.lastActiveTime || record.loginTime || at;
  const minutes = diffMinutes(lastActiveTime, at);
  const update = {
    $set: {
      lastActiveTime: at,
      logoutTime: previousStatus === "offline" ? at : record.logoutTime,
    },
    $inc: {
      totalLoginMinutes: minutes,
    },
  };

  if (["active"].includes(previousStatus)) {
    update.$inc.totalActiveMinutes = minutes;
  } else if (previousStatus === "idle") {
    update.$inc.totalIdleMinutes = minutes;
  }

  return UserActivity.findByIdAndUpdate(record._id, update, { new: true });
};

const setPresence = async ({
  user,
  status = "active",
  socketId = "",
  source = "socket",
  at = new Date(),
}) => {
  if (!user?._id && !user?.id) return null;

  const userId = String(user._id || user.id);
  const workspaceId = normalizeWorkspaceId(user.workspaceId);
  const nextStatus = VALID_STATUSES.has(status) ? status : "active";
  const previousPresence = await safeRedisGet(presenceKey(userId));
  const previousStatus = previousPresence?.status || "offline";
  const record = await getActivityRecord({ userId, workspaceId, at });
  const lastSeenTime = previousPresence?.lastSeen
    ? new Date(previousPresence.lastSeen).getTime()
    : 0;
  const shouldWriteActivity =
    nextStatus === "offline" ||
    nextStatus !== previousStatus ||
    !previousPresence ||
    at.getTime() - lastSeenTime >= DB_WRITE_INTERVAL_MS;

  if (shouldWriteActivity) {
    await updateActivityDurations({ record, previousStatus, at });
    await UserActivity.updateOne(
      {
        userId,
        date: getDayStart(at),
      },
      {
        $set: {
          status: nextStatus,
          currentStatus: nextStatus,
          lastActiveTime: at,
          ...(nextStatus === "offline" ? { logoutTime: at } : {}),
          ...(nextStatus === "active" && !record.loginTime ? { loginTime: at } : {}),
        },
      }
    );
  }

  const payload = {
    userId,
    workspaceId,
    status: nextStatus,
    lastSeen: at.toISOString(),
    socketId,
    source,
  };

  if (nextStatus === "offline") {
    await safeRedisDelete(presenceKey(userId));
  } else {
    await safeRedisSet(presenceKey(userId), payload);
  }

  return payload;
};

const getPresenceForUsers = async (users = []) => {
  const entries = await Promise.all(
    users.map(async (user) => {
      const userId = String(user._id || user.id || user);
      const presence = await safeRedisGet(presenceKey(userId));

      if (!presence) {
        return [userId, { userId, status: "offline", lastSeen: null }];
      }

      return [
        userId,
        {
          ...presence,
          status: inferStatus(presence.lastSeen, presence.status),
        },
      ];
    })
  );

  return Object.fromEntries(entries);
};

const getWorkspacePresence = async (workspaceId, reqOrUser = {}) => {
  const users = await User.find(withTenantFilter({ workspaceId: normalizeWorkspaceId(workspaceId) }, reqOrUser))
    .select("_id name email role workspaceId tenantId")
    .lean();
  const presenceByUserId = await getPresenceForUsers(users);

  return users.map((user) => ({
    user,
    presence: presenceByUserId[String(user._id)] || {
      userId: String(user._id),
      status: "offline",
      lastSeen: null,
    },
  }));
};

module.exports = {
  ACTIVE_WINDOW_MS,
  DB_WRITE_INTERVAL_MS,
  getDayStart,
  getPresenceForUsers,
  getWorkspacePresence,
  inferStatus,
  setPresence,
};
