const jwt = require("jsonwebtoken");
const { ACCESS_TOKEN_MAX_AGE_SECONDS } = require("./authSessions");

const PLATFORM_TOKEN_TYPE = "platform-admin";
const PLATFORM_TOKEN_MAX_AGE_SECONDS = ACCESS_TOKEN_MAX_AGE_SECONDS;

const generatePlatformToken = (platformAdmin, { sessionId } = {}) => {
  const payload = {
    id: platformAdmin._id,
    platformAdminId: platformAdmin._id,
    role: platformAdmin.role,
    tokenType: PLATFORM_TOKEN_TYPE,
  };

  if (sessionId) {
    payload.sid = String(sessionId);
  }

  return jwt.sign(
    payload,
    process.env.JWT_SECRET,
    {
      expiresIn: ACCESS_TOKEN_MAX_AGE_SECONDS,
    }
  );
};

generatePlatformToken.PLATFORM_TOKEN_TYPE = PLATFORM_TOKEN_TYPE;
generatePlatformToken.getTokenMaxAgeSeconds = () => PLATFORM_TOKEN_MAX_AGE_SECONDS;

module.exports = generatePlatformToken;
