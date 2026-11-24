const crypto = require("crypto");
const mongoose = require("mongoose");
const AuthSession = require("../models/AuthSession");

const ACCESS_TOKEN_MAX_AGE_SECONDS = 15 * 60;
const USER_REFRESH_COOKIE_NAME = "cc_user_refresh";
const PLATFORM_REFRESH_COOKIE_NAME = "cc_platform_refresh";
const USER_REFRESH_COOKIE_PATH = "/api/auth";
const PLATFORM_REFRESH_COOKIE_PATH = "/api/platform/auth";
const USER_SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;
const REMEMBER_ME_SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const PLATFORM_SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

const getSessionMaxAgeSeconds = (principalType, rememberMe = false) => {
  if (principalType === "platformAdmin") {
    return PLATFORM_SESSION_MAX_AGE_SECONDS;
  }

  return rememberMe
    ? REMEMBER_ME_SESSION_MAX_AGE_SECONDS
    : USER_SESSION_MAX_AGE_SECONDS;
};

const hashRefreshToken = (token) =>
  crypto.createHash("sha256").update(String(token)).digest("hex");

const splitRefreshToken = (value = "") => {
  const separator = String(value).indexOf(".");
  if (separator <= 0) {
    return null;
  }

  const sessionId = value.slice(0, separator);
  const secret = value.slice(separator + 1);
  return mongoose.isValidObjectId(sessionId) && secret
    ? { sessionId, secret }
    : null;
};

const isSameHash = (left = "", right = "") => {
  const leftBuffer = Buffer.from(String(left), "hex");
  const rightBuffer = Buffer.from(String(right), "hex");
  return (
    leftBuffer.length === rightBuffer.length &&
    leftBuffer.length > 0 &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer)
  );
};

const createAuthSession = async ({
  principalId,
  principalType,
  rememberMe = false,
}) => {
  const maxAgeSeconds = getSessionMaxAgeSeconds(principalType, rememberMe);
  const expiresAt = new Date(Date.now() + maxAgeSeconds * 1000);
  const secret = crypto.randomBytes(48).toString("base64url");
  const session = await AuthSession.create({
    principalId,
    principalType,
    refreshTokenHash: hashRefreshToken(secret),
    rememberMe: Boolean(rememberMe),
    expiresAt,
  });

  return {
    sessionId: String(session._id),
    principalId: String(session.principalId),
    principalType,
    rememberMe: Boolean(rememberMe),
    expiresAt,
    refreshToken: `${session._id}.${secret}`,
  };
};

const rotateAuthSession = async ({ refreshToken, principalType }) => {
  const parsedToken = splitRefreshToken(refreshToken);
  if (!parsedToken) {
    return null;
  }

  const now = new Date();
  const session = await AuthSession.findOne({
    _id: parsedToken.sessionId,
    principalType,
    revokedAt: null,
    expiresAt: { $gt: now },
  }).select("+refreshTokenHash");

  if (!session) {
    return null;
  }

  const currentHash = hashRefreshToken(parsedToken.secret);
  if (!isSameHash(session.refreshTokenHash, currentHash)) {
    return null;
  }

  const nextSecret = crypto.randomBytes(48).toString("base64url");
  const rotatedSession = await AuthSession.findOneAndUpdate(
    {
      _id: session._id,
      refreshTokenHash: currentHash,
      revokedAt: null,
      expiresAt: { $gt: now },
    },
    {
      $set: {
        refreshTokenHash: hashRefreshToken(nextSecret),
        lastUsedAt: now,
      },
    },
    { new: true }
  );

  if (!rotatedSession) {
    return null;
  }

  return {
    sessionId: String(rotatedSession._id),
    principalId: String(rotatedSession.principalId),
    principalType,
    rememberMe: Boolean(rotatedSession.rememberMe),
    expiresAt: rotatedSession.expiresAt,
    refreshToken: `${rotatedSession._id}.${nextSecret}`,
  };
};

const revokeAuthSession = async ({ refreshToken, principalType }) => {
  const parsedToken = splitRefreshToken(refreshToken);
  if (!parsedToken) {
    return false;
  }

  const tokenHash = hashRefreshToken(parsedToken.secret);
  const result = await AuthSession.updateOne(
    {
      _id: parsedToken.sessionId,
      principalType,
      refreshTokenHash: tokenHash,
      revokedAt: null,
    },
    { $set: { revokedAt: new Date() } }
  );
  return result.modifiedCount > 0;
};

const revokeAuthSessionsForPrincipal = async ({ principalId, principalType }) =>
  AuthSession.updateMany(
    { principalId, principalType, revokedAt: null },
    { $set: { revokedAt: new Date() } }
  );

const getCookieValue = (req, name) => {
  const cookies = String(req.headers?.cookie || "").split(";");
  const pair = cookies.find((item) => item.trim().startsWith(`${name}=`));
  if (!pair) {
    return "";
  }

  try {
    return decodeURIComponent(pair.trim().slice(name.length + 1));
  } catch {
    return "";
  }
};

const getRefreshCookieOptions = ({ path, rememberMe = false, expiresAt = null }) => ({
  httpOnly: true,
  secure:
    process.env.REFRESH_COOKIE_SECURE === "true" ||
    (process.env.REFRESH_COOKIE_SECURE !== "false" &&
      process.env.NODE_ENV === "production"),
  sameSite: "lax",
  path,
  ...(rememberMe && expiresAt
    ? { expires: new Date(expiresAt) }
    : {}),
});

const setRefreshCookie = (res, {
  name,
  path,
  refreshToken,
  rememberMe = false,
  expiresAt = null,
}) => {
  if (typeof res.cookie === "function") {
    res.cookie(
      name,
      refreshToken,
      getRefreshCookieOptions({ path, rememberMe, expiresAt })
    );
  }
};

const clearRefreshCookie = (res, { name, path }) => {
  if (typeof res.clearCookie === "function") {
    res.clearCookie(name, getRefreshCookieOptions({ path }));
  }
};

module.exports = {
  ACCESS_TOKEN_MAX_AGE_SECONDS,
  PLATFORM_REFRESH_COOKIE_NAME,
  PLATFORM_REFRESH_COOKIE_PATH,
  USER_REFRESH_COOKIE_NAME,
  USER_REFRESH_COOKIE_PATH,
  clearRefreshCookie,
  createAuthSession,
  getCookieValue,
  getRefreshCookieOptions,
  getSessionMaxAgeSeconds,
  revokeAuthSession,
  revokeAuthSessionsForPrincipal,
  rotateAuthSession,
  setRefreshCookie,
};
