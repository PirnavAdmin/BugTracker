process.env.NODE_ENV = "test";

const { test } = require("node:test");
const assert = require("node:assert");
const {
  requireExactConfirmation,
} = require("../services/platformCompanyDeletionService");

const createResponse = () => ({
  statusCode: 200,
  status(code) {
    this.statusCode = code;
    return this;
  },
});

test("company deletion requires the exact case-sensitive company name", () => {
  const res = createResponse();

  assert.throws(
    () => requireExactConfirmation({ name: "Acme Cloud" }, "acme cloud", res),
    /exact company name/
  );
  assert.equal(res.statusCode, 400);
});

test("company deletion accepts the exact company name", () => {
  const res = createResponse();

  assert.doesNotThrow(() =>
    requireExactConfirmation({ name: "Acme Cloud" }, "Acme Cloud", res)
  );
  assert.equal(res.statusCode, 200);
});
