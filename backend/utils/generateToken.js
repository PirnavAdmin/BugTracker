const jwt = require("jsonwebtoken");
const { ACCESS_TOKEN_MAX_AGE_SECONDS } = require("./authSessions");

const generateToken = (userId, workspaceId, options = {}) => {
  const payload = {
    id: userId,
    workspaceId,
  };

  if (options.tenantId) {
    payload.tenantId = options.tenantId;
  }

  if (options.sessionId) {
    payload.sid = String(options.sessionId);
  }

  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: options.expiresInSeconds || ACCESS_TOKEN_MAX_AGE_SECONDS,
  });
};

generateToken.getTokenMaxAgeSeconds = () => ACCESS_TOKEN_MAX_AGE_SECONDS;

module.exports = generateToken;
