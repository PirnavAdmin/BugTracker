const redisClient = require("../utils/redis");

const AI_GENERATION_RATE_LIMIT = 10;
const AI_GENERATION_RATE_WINDOW_SECONDS = 60;

const getUserRateLimitKey = (req) => {
  const userId = String(req.user?._id || req.user?.id || "").trim();

  return userId ? `rate-limit:ai:generate-description:${userId}` : "";
};

const aiDescriptionRateLimit = async (req, res, next) => {
  const key = getUserRateLimitKey(req);

  if (!key || !redisClient?.isOpen) {
    return next();
  }

  try {
    const count = await redisClient.incr(key);

    if (count === 1) {
      await redisClient.expire(key, AI_GENERATION_RATE_WINDOW_SECONDS);
    }

    if (count > AI_GENERATION_RATE_LIMIT) {
      return res.status(429).json({
        success: false,
        message: "Too many AI generation requests. Please try again shortly.",
      });
    }
  } catch (error) {
    console.error("[ai] rate limit check failed", {
      userId: String(req.user?._id || req.user?.id || ""),
      message: error.message,
    });
  }

  return next();
};

module.exports = {
  AI_GENERATION_RATE_LIMIT,
  AI_GENERATION_RATE_WINDOW_SECONDS,
  aiDescriptionRateLimit,
};
