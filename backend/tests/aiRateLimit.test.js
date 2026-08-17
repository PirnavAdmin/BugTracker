const { test } = require("node:test");
const assert = require("node:assert");
const redisClient = require("../utils/redis");
const {
  AI_GENERATION_RATE_LIMIT,
  aiDescriptionRateLimit,
} = require("../middleware/aiRateLimit");

const originalIsOpen = Object.getOwnPropertyDescriptor(redisClient, "isOpen");
const originalIncr = redisClient.incr;
const originalExpire = redisClient.expire;

const setRedisOpen = (value) => {
  Object.defineProperty(redisClient, "isOpen", {
    configurable: true,
    get: () => value,
  });
};

const createResponse = () => {
  let body;

  return {
    get body() {
      return body;
    },
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      body = payload;
      return this;
    },
  };
};

test.afterEach(() => {
  if (originalIsOpen) {
    Object.defineProperty(redisClient, "isOpen", originalIsOpen);
  }
  redisClient.incr = originalIncr;
  redisClient.expire = originalExpire;
});

test("AI rate limiter allows requests below the per-user limit", async () => {
  setRedisOpen(true);
  redisClient.incr = async () => AI_GENERATION_RATE_LIMIT;
  redisClient.expire = async () => true;

  const req = { user: { _id: "user-1" } };
  const res = createResponse();
  let nextCalled = false;

  await aiDescriptionRateLimit(req, res, () => {
    nextCalled = true;
  });

  assert.strictEqual(nextCalled, true);
  assert.strictEqual(res.statusCode, 200);
});

test("AI rate limiter returns 429 after the per-user limit", async () => {
  setRedisOpen(true);
  redisClient.incr = async () => AI_GENERATION_RATE_LIMIT + 1;
  redisClient.expire = async () => true;

  const req = { user: { _id: "user-1" } };
  const res = createResponse();
  let nextCalled = false;

  await aiDescriptionRateLimit(req, res, () => {
    nextCalled = true;
  });

  assert.strictEqual(nextCalled, false);
  assert.strictEqual(res.statusCode, 429);
  assert.deepStrictEqual(res.body, {
    success: false,
    message: "Too many AI generation requests. Please try again shortly.",
  });
});

test("AI rate limiter fails open when Redis is unavailable", async () => {
  setRedisOpen(false);

  const req = { user: { _id: "user-1" } };
  const res = createResponse();
  let nextCalled = false;

  await aiDescriptionRateLimit(req, res, () => {
    nextCalled = true;
  });

  assert.strictEqual(nextCalled, true);
  assert.strictEqual(res.statusCode, 200);
});
