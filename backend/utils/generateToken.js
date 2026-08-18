const jwt = require("jsonwebtoken");

const STANDARD_TOKEN_MAX_AGE_SECONDS = 8 * 60 * 60;
const REMEMBER_ME_TOKEN_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

const getTokenMaxAgeSeconds = ({ rememberMe = false } = {}) =>
  rememberMe ? REMEMBER_ME_TOKEN_MAX_AGE_SECONDS : STANDARD_TOKEN_MAX_AGE_SECONDS;

const generateToken = (userId, workspaceId, options = {}) => {
  const payload = {
    id: userId,
    workspaceId,
  };

  if (options.tenantId) {
    payload.tenantId = options.tenantId;
  }

  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: getTokenMaxAgeSeconds(options),
  });
};

generateToken.getTokenMaxAgeSeconds = getTokenMaxAgeSeconds;

module.exports = generateToken;
