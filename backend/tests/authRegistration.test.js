const test = require("node:test");
const assert = require("node:assert/strict");
const User = require("../models/User");
const { register } = require("../controllers/authController");

const callRegister = async (email) => {
  const res = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
  };
  let error;

  await register(
    {
      body: {
        name: "Registration Test",
        email,
        password: "Password123",
        role: "Developer",
      },
    },
    res,
    (caughtError) => {
      error = caughtError;
    }
  );

  return { error, res };
};

test("registration rejects invalid emails before checking or saving a user", async () => {
  const originalFindOne = User.findOne;
  const originalCreate = User.create;
  let databaseCalls = 0;
  User.findOne = async () => {
    databaseCalls += 1;
    return null;
  };
  User.create = async () => {
    databaseCalls += 1;
  };

  try {
    for (const [email, message] of [
      ["person name@example.com", "Email cannot contain spaces"],
      ["person@@example.com", "Email must contain only one @ symbol"],
      ["invalid-address", "Please enter a valid email address"],
    ]) {
      const { error, res } = await callRegister(email);
      assert.equal(res.statusCode, 400);
      assert.equal(error.message, message);
    }

    assert.equal(databaseCalls, 0);
  } finally {
    User.findOne = originalFindOne;
    User.create = originalCreate;
  }
});

test("registration rejects duplicate email addresses with a clear conflict", async () => {
  const originalFindOne = User.findOne;
  User.findOne = async ({ email }) => ({ email });

  try {
    const { error, res } = await callRegister("existing@example.com");
    assert.equal(res.statusCode, 409);
    assert.equal(error.message, "An account with that email already exists");
  } finally {
    User.findOne = originalFindOne;
  }
});
