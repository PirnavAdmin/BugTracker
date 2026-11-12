const normalizeAddress = (value) => String(typeof value === "object" ? value?.address || "" : value || "").trim().toLowerCase();

const publicSmtpFailure = (error = {}) => {
  const response = String(error.response || error.message || "").toLowerCase();
  const command = String(error.command || "").toUpperCase();
  let code = "SMTP_SEND_FAILED";
  let message = "The SMTP provider did not accept the message. Check the provider configuration and sending limits.";
  if (error.code === "SMTP_NOT_ACCEPTED") {
    code = error.code;
    message = "The SMTP provider did not confirm acceptance of the intended recipient. No inbox delivery is confirmed.";
  } else if (error.code === "SMTP_RECIPIENT_REQUIRED") {
    code = error.code;
    message = "The signed-in account needs a valid email address to receive a test email.";
  } else if (error.code === "SMTP_CREDENTIALS_UNREADABLE") {
    code = error.code;
    message = "The saved SMTP password could not be decrypted. Restore the server encryption key or re-enter the mailbox password.";
  } else if (error.code !== "EAUTH" && error.responseCode !== 535 &&
    (/send.?as|sender|relay|5\.7\.60/.test(response) || (command === "MAIL FROM" && error.responseCode >= 500))) {
    code = "SMTP_SENDER_REJECTED";
    message = "The SMTP provider rejected the sender. Use the authenticated mailbox or an authorized From alias and check relay permissions.";
  } else if (error.code === "EAUTH" || error.responseCode === 535) {
    code = "SMTP_AUTH_FAILED";
    message = "SMTP authentication failed. Check the mailbox login, password or app password, and provider SMTP access policy.";
  } else if (/TLS|CERT|SSL/.test(error.code || "") || /certificate|tls|ssl/.test(response)) {
    code = "SMTP_TLS_FAILED";
    message = "The secure SMTP connection failed. Check the port, TLS mode, and provider certificate.";
  } else if (["ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "ETIMEDOUT", "ECONNRESET", "ESOCKET", "ECONNECTION"].includes(error.code)) {
    code = "SMTP_CONNECTION_FAILED";
    message = "Could not connect to the SMTP provider. Check the host, port, DNS, and outbound network access.";
  }
  return {
    code, message,
    ...(Number.isInteger(error.responseCode) && error.responseCode >= 100 && error.responseCode <= 599
      ? { responseCode: error.responseCode } : {}),
  };
};

const deliveryError = (code) => Object.assign(new Error(publicSmtpFailure({ code }).message), { code });

const getDeliveryReceipt = (info, { recipients = [], secrets = [] } = {}) => {
  const expected = new Set(recipients.map(normalizeAddress).filter(Boolean));
  const addresses = (values) => [...new Set((Array.isArray(values) ? values : []).map(normalizeAddress))].filter((email) => expected.has(email));
  const accepted = addresses(info?.accepted);
  const rejected = addresses(info?.rejected);
  // A resolved Promise, queue/mock result, or missing envelope is not evidence
  // that an SMTP server accepted the requested recipient.
  if (!accepted.length) throw deliveryError("SMTP_NOT_ACCEPTED");
  const responseMatch = String(info?.response || "").match(/^(\d{3})(?:[ -](\d\.\d\.\d))?/);
  if (!responseMatch || Number(responseMatch[1]) < 200 || Number(responseMatch[1]) >= 300) {
    throw deliveryError("SMTP_NOT_ACCEPTED");
  }
  const candidateId = String(info?.messageId || "");
  // Nodemailer's generated Message-ID format. Arbitrary provider text is never
  // copied into an API response or log, especially on authentication mail.
  const messageId = /^<[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}@[a-z0-9.-]+>$/i.test(candidateId) &&
    !secrets.some((secret) => secret && candidateId.includes(secret)) ? candidateId : null;
  return {
    status: rejected.length ? "partially_accepted" : "smtp_accepted",
    accepted, rejected, messageId,
    // Keep SMTP/enhanced status codes only; omit opaque text which can echo secrets.
    response: responseMatch.slice(1).filter(Boolean).join(" "),
    inboxDeliveryConfirmed: false,
  };
};

const logSmtpFailure = (_event, error = {}) => console.error("[email] SMTP attempt failed", publicSmtpFailure(error));

module.exports = { getDeliveryReceipt, publicSmtpFailure, deliveryError, logSmtpFailure };
