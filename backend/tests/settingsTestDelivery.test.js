const test = require("node:test");
const assert = require("node:assert/strict");
const service = require("../services/emailService");
const User = require("../models/User");
const Config = require("../models/UserEmailConfig");
const { encryptSecret } = require("../utils/emailCrypto");
let send;
const originalSend = service.sendTestEmail;
service.sendTestEmail = (args) => send(args);
const { testEmailConfig, saveEmailConfig } = require("../controllers/settingsController");
service.sendTestEmail = originalSend;
const id = "0123456789abcdef01234567";
const fields = { host: "smtp.example.test", port: 465, secure: true, username: "smtp-login@example.test", fromEmail: "authorized-from@example.test", fromName: "Workspace" };
const info = { accepted: ["signed-in@example.test"], rejected: [], response: "250 2.0.0 Accepted", messageId: "<abcdefab-abcd-abcd-abcd-abcdefabcdef@example.test>" };
const query = (value) => ({ select() { return this; }, async lean() { return value; } });
const setup = (t) => {
  const old = { user: User.findOne, config: Config.findOne, update: Config.findOneAndUpdate, secret: process.env.EMAIL_CONFIG_SECRET, log: console.info };
  t.after(() => { User.findOne = old.user; Config.findOne = old.config; Config.findOneAndUpdate = old.update; console.info = old.log; if (old.secret === undefined) delete process.env.EMAIL_CONFIG_SECRET; else process.env.EMAIL_CONFIG_SECRET = old.secret; });
  process.env.EMAIL_CONFIG_SECRET = "test-encryption-key";
  console.info = () => {};
  const saved = { ...fields, passwordEncrypted: encryptSecret("stored-secret") };
  User.findOne = (filter) => { assert.equal(filter.workspaceId, "workspace-test"); assert.equal(filter.tenantId, "TENANT_001"); return query({ _id: id, email: "sender-profile@example.test", role: "Admin" }); };
  Config.findOne = (filter) => { assert.deepEqual(filter, { workspaceId: "workspace-test", userId: id }); return query(saved); };
  Config.findOneAndUpdate = () => assert.fail("A test must never overwrite configuration");
  return saved;
};
const call = async (handler, body = {}, overrides = {}) => {
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  let error;
  await handler({ body: { ...fields, password: "", userId: id, ...body }, user: { _id: id, role: "Admin", workspaceId: "workspace-test", tenantId: "TENANT_001", email: "signed-in@example.test", ...overrides } }, res, (err) => { error = err; });
  if (error) throw error;
  return res;
};
test("empty request password reuses saved secret; recipient is signed-in account, ignoring supplied to", async (t) => {
  const saved = setup(t);
  const ciphertext = saved.passwordEncrypted;
  send = async (args) => {
    assert.equal(args.to, "signed-in@example.test");
    assert.equal(args.overrideConfig.password, "stored-secret");
    assert.equal(args.overrideConfig.username, fields.username);
    return { info };
  };
  const res = await call(testEmailConfig, { to: "untrusted@example.test" });
  assert.equal(res.body.recipient, "signed-in@example.test");
  assert.equal(res.body.delivery.inboxDeliveryConfirmed, false);
  assert.equal(saved.passwordEncrypted, ciphertext);
  assert.doesNotMatch(JSON.stringify(res.body), /stored-secret/);
});
test("controller awaits SMTP and does not treat a no-op as a successful send", async (t) => {
  setup(t);
  let release;
  let entered;
  const started = new Promise((resolve) => { entered = resolve; });
  send = () => { entered(); return new Promise((resolve) => { release = resolve; }); };
  let finished = false;
  const pending = call(testEmailConfig).then((res) => { finished = true; return res; });
  await started;
  assert.equal(finished, false);
  release({ info });
  assert.equal((await pending).statusCode, 200);
  send = async () => null;
  assert.equal((await call(testEmailConfig)).body.code, "SMTP_NOT_ACCEPTED");
});
test("rejected intended recipient and provider failure return safe errors", async (t) => {
  setup(t);
  send = async () => ({ info: { ...info, accepted: [], rejected: ["signed-in@example.test"] } });
  assert.equal((await call(testEmailConfig)).statusCode, 400);
  send = async () => { throw Object.assign(new Error("secret OTP 123456"), { responseCode: 553, command: "MAIL FROM", response: "553 5.7.1 sender private@example.test 123456" }); };
  const res = await call(testEmailConfig);
  assert.equal(res.body.code, "SMTP_SENDER_REJECTED");
  assert.doesNotMatch(JSON.stringify(res.body), /123456|private@example|secret OTP/);
});
test("missing signed-in recipient cannot report success", async (t) => {
  setup(t);
  send = async () => assert.fail("No recipient must never send");
  assert.equal((await call(testEmailConfig, {}, { email: "" })).body.code, "SMTP_RECIPIENT_REQUIRED");
});
test("saved credentials are preserved when saving with empty password", async (t) => {
  const saved = setup(t);
  let updated;
  Config.findOneAndUpdate = (_filter, update) => { updated = update.$set; return query(updated); };
  await call(saveEmailConfig);
  assert.equal(updated.passwordEncrypted, saved.passwordEncrypted);
});
test("another tenant's sender cannot be selected even inside a shared legacy workspace", async (t) => {
  setup(t);
  User.findOne = (filter) => { assert.equal(filter.tenantId, "TENANT_001"); return query(null); };
  send = async () => assert.fail("Cross-tenant sender must not send");
  await assert.rejects(call(testEmailConfig), /not found in this workspace/);
});
