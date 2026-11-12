const test = require("node:test");
const assert = require("node:assert/strict");
const User = require("../models/User");
const service = require("../services/emailService");
let send;
const original = service.sendWorkspaceEmail;
service.sendWorkspaceEmail = (payload) => send(payload);
const { requestPasswordReset } = require("../controllers/authController");
service.sendWorkspaceEmail = original;

const setup = (t) => {
  const old = { find: User.findOne, log: console.error };
  t.after(() => { User.findOne = old.find; console.error = old.log; });
  const saved = [];
  const user = { email: "account@example.test", name: "Member", workspaceId: "db-workspace", tenantId: "TENANT_001", senderPreference: { userId: "manual-sender" }, async save() { saved.push({ hash: this.passwordResetOtpHash, requested: this.passwordResetRequestedAt }); } };
  User.findOne = (filter) => { assert.deepEqual(filter, { email: user.email }); return { async select() { return user; } }; };
  return { user, saved };
};
const call = async () => {
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  let error;
  await requestPasswordReset({ body: { email: "account@example.test", workspaceId: "attacker-workspace", tenantId: "TENANT_999", userId: "manual-sender" } }, res, (err) => { error = err; });
  if (error) throw error;
  return res;
};
test("reset uses the found account's scope and recipient, awaits email, and never returns OTP", async (t) => {
  const { user, saved } = setup(t);
  let release, entered, payload;
  const started = new Promise((resolve) => { entered = resolve; });
  send = (value) => { payload = value; entered(); return new Promise((resolve) => { release = resolve; }); };
  let done = false;
  const pending = call().then((res) => { done = true; return res; });
  await started;
  assert.equal(done, false);
  assert.equal(payload.to, user.email);
  assert.equal(payload.workspaceId, "db-workspace");
  assert.equal(payload.tenantId, "TENANT_001");
  assert.equal(payload.creatorUserId, undefined);
  assert.equal(payload.overrideConfig, undefined);
  assert.equal(saved.length, 1);
  const otp = payload.text.match(/\b\d{6}\b/)[0];
  assert.notEqual(user.passwordResetOtpHash, otp);
  release({ deliveryReceipt: { status: "smtp_accepted" } });
  const res = await pending;
  assert.doesNotMatch(JSON.stringify(res.body), new RegExp(otp));
  assert.match(res.body.message, /delivery is not guaranteed/);
});
test("553 failure invalidates OTP and cooldown and logs only a safe category", async (t) => {
  const { user } = setup(t);
  let log, otp;
  console.error = (...args) => { log = JSON.stringify(args); };
  send = async (payload) => {
    otp = payload.text.match(/\b\d{6}\b/)[0];
    throw Object.assign(new Error(`private@example.test password-secret ${otp}`), { senderSource: "workspace", responseCode: 553, response: `553 5.7.1 sender private@example.test ${otp}` });
  };
  let failure;
  await assert.rejects(call(), (error) => {
    failure = error;
    return error.code === "PASSWORD_RESET_EMAIL_FAILED" && error.statusCode === 503;
  });
  assert.equal(user.passwordResetOtpHash, "");
  assert.equal(user.passwordResetOtpExpiresAt, null);
  assert.equal(user.passwordResetRequestedAt, null);
  assert.match(log, /SMTP_SENDER_REJECTED/);
  assert.doesNotMatch(log + failure.message, new RegExp(`${otp}|password-secret|private@example`));
});
test("unknown account gets the same generic response without sending", async (t) => {
  setup(t);
  User.findOne = () => ({ async select() { return null; } });
  send = async () => assert.fail("Unknown account must not send");
  const res = await call();
  assert.equal(res.statusCode, 200);
  assert.match(res.body.message, /If an account exists/);
});
