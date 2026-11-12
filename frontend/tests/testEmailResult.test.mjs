import test from "node:test";
import assert from "node:assert/strict";
import { getTestEmailNotice } from "../src/lib/testEmailResult.js";

test("SMTP acceptance is distinguished from inbox delivery and names actual recipient", () => {
  const notice = getTestEmailNotice({ recipient: "signed-in@example.test", delivery: { status: "smtp_accepted", accepted: ["signed-in@example.test"] } });
  assert.equal(notice.title, "SMTP accepted");
  assert.match(notice.message, /signed-in@example.test/);
  assert.match(notice.message, /Inbox delivery is not confirmed/);
});
test("legacy success responses do not imply SMTP acceptance", () => {
  const notice = getTestEmailNotice({ message: "Test email sent successfully" });
  assert.equal(notice.type, "warning");
  assert.equal(notice.title, "Delivery not confirmed");
});
test("partial acceptance is a warning", () => {
  assert.equal(getTestEmailNotice({ delivery: { status: "partially_accepted", accepted: ["one@example.test"] } }).type, "warning");
});
