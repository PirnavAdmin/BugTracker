const test = require("node:test");
const assert = require("node:assert/strict");
const { getDeliveryReceipt, publicSmtpFailure } = require("../utils/smtpDelivery");
const recipient = "recipient@example.test";
const receipt = { accepted: [recipient], rejected: [], response: "250 2.0.0 queued as provider-tracking-id", messageId: "<abcdefab-abcd-abcd-abcd-abcdefabcdef@example.test>" };

test("receipt reports acceptance, safe server status and Message-ID, not delivery", () => {
  const result = getDeliveryReceipt(receipt, { recipients: [recipient] });
  assert.deepEqual(result.accepted, [recipient]);
  assert.equal(result.response, "250 2.0.0");
  assert.equal(result.messageId, receipt.messageId);
  assert.equal(result.inboxDeliveryConfirmed, false);
});
test("no-op, queue-only, wrong recipient, rejected recipients and non-success replies fail", () => {
  for (const info of [undefined, {}, { messageId: "mock-id" }, { ...receipt, accepted: [] }, { ...receipt, accepted: ["other@example.test"] }, { ...receipt, response: "450 retry later" }]) {
    assert.throws(() => getDeliveryReceipt(info, { recipients: [recipient] }), { code: "SMTP_NOT_ACCEPTED" });
  }
});
test("partial acceptance preserves rejected expected recipients without server text or secrets", () => {
  const result = getDeliveryReceipt({ ...receipt, rejected: ["failed@example.test", "unrequested@example.test"], response: "250 2.0.0 OTP 123456 password-secret token-secret", messageId: "<OTP123456-token-secret@example.test>" }, { recipients: [recipient, "failed@example.test"] });
  assert.equal(result.status, "partially_accepted");
  assert.deepEqual(result.rejected, ["failed@example.test"]);
  assert.doesNotMatch(JSON.stringify(result), /123456|password-secret|token-secret|unrequested/);
});
test("SMTP errors are safe and distinguish sender rejection from authentication", () => {
  assert.equal(publicSmtpFailure({ code: "EAUTH", responseCode: 535 }).code, "SMTP_AUTH_FAILED");
  assert.equal(publicSmtpFailure({ code: "EAUTH", responseCode: 535, response: "535 5.7.1 Authentication failed" }).code, "SMTP_AUTH_FAILED");
  const failure = publicSmtpFailure({ response: "553 5.7.1 sender rejected private@example.test OTP 123456", responseCode: 553 });
  assert.equal(failure.code, "SMTP_SENDER_REJECTED");
  assert.equal(failure.responseCode, 553);
  assert.doesNotMatch(JSON.stringify(failure), /private@example|123456/);
});
