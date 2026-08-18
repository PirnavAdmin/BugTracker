const jwt = require("jsonwebtoken");

const PLATFORM_TOKEN_TYPE = "platform-admin";
const PLATFORM_TOKEN_MAX_AGE_SECONDS = 8 * 60 * 60;

const generatePlatformToken = (platformAdmin) =>
  jwt.sign(
    {
      id: platformAdmin._id,
      platformAdminId: platformAdmin._id,
      role: platformAdmin.role,
      tokenType: PLATFORM_TOKEN_TYPE,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: PLATFORM_TOKEN_MAX_AGE_SECONDS,
    }
  );

generatePlatformToken.PLATFORM_TOKEN_TYPE = PLATFORM_TOKEN_TYPE;
generatePlatformToken.getTokenMaxAgeSeconds = () => PLATFORM_TOKEN_MAX_AGE_SECONDS;

module.exports = generatePlatformToken;
