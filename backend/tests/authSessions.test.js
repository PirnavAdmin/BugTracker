const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const AuthSession = require("../models/AuthSession");
const {
  getCookieValue,
  rotateAuthSession,
} = require("../utils/authSessions");

const originalFindOne = AuthSession.findOne;
const originalFindOneAndUpdate = AuthSession.findOneAndUpdate;
const sessionId = "507f1f77bcf86cd799439099";
const hashToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");

afterEach(() => {
  AuthSession.findOne = originalFindOne;
  AuthSession.findOneAndUpdate = originalFindOneAndUpdate;
});

test("refresh tokens rotate atomically and retain the session expiry", async () => {
  const secret = "current-refresh-secret";
  const expiresAt = new Date(Date.now() + 60_000);
  const session = {
    _id: sessionId,
    principalId: sessionId,
    principalType: "user",
    refreshTokenHash: hashToken(secret),
    rememberMe: true,
    expiresAt,
  };
  let savedHash;

  AuthSession.findOne = () => ({
    select: async () => session,
  });
  AuthSession.findOneAndUpdate = async (filter, update) => {
    assert.strictEqual(filter.refreshTokenHash, hashToken(secret));
    savedHash = update.$set.refreshTokenHash;
    session.refreshTokenHash = savedHash;
    return session;
  };

  const rotated = await rotateAuthSession({
    refreshToken: `${sessionId}.${secret}`,
    principalType: "user",
  });

  assert.ok(rotated);
  assert.strictEqual(rotated.sessionId, sessionId);
  assert.strictEqual(rotated.expiresAt, expiresAt);
  assert.strictEqual(rotated.rememberMe, true);
  assert.notStrictEqual(rotated.refreshToken, `${sessionId}.${secret}`);
  assert.strictEqual(
    savedHash,
    hashToken(rotated.refreshToken.slice(sessionId.length + 1))
  );
});

test("refresh rotation rejects a token when its compare-and-swap loses", async () => {
  const secret = "current-refresh-secret";
  AuthSession.findOne = () => ({
    select: async () => ({
      _id: sessionId,
      principalId: sessionId,
      refreshTokenHash: hashToken(secret),
      expiresAt: new Date(Date.now() + 60_000),
    }),
  });
  AuthSession.findOneAndUpdate = async () => null;

  assert.strictEqual(
    await rotateAuthSession({
      refreshToken: `${sessionId}.${secret}`,
      principalType: "user",
    }),
    null
  );
});

test("malformed cookie encoding is treated as a missing cookie", () => {
  assert.strictEqual(
    getCookieValue({ headers: { cookie: "cc_user_refresh=%E0%A4%A" } }, "cc_user_refresh"),
    ""
  );
});
