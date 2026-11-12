# Test email and password reset mail investigation

## Findings

The Settings test recipient is the signed-in account's stored email
(`req.user.email`, loaded by authentication middleware). `userId` identifies the
SMTP profile, not the recipient. No `to` field is needed, and a client-supplied
`to` field is ignored. A sender may test their profile while signed in as another
account, so the mailbox being checked must match the returned `recipient`.

The submitted empty password resolves to the decrypted password from
`UserEmailConfig`, queried by workspace and sender user ID. The test does not
write that record. Saving a profile with an empty password also preserves its
existing encrypted password. Tests verify both paths. AES-256-GCM decryption
uses `EMAIL_CONFIG_SECRET` or, if absent, `JWT_SECRET`. Those keys must remain
stable. A decryption failure now returns a safe actionable error.

The original endpoint already awaited `sendTestEmail`, `sendWorkspaceEmail`, and
Nodemailer's `sendMail`. Thrown SMTP failures propagated to the controller.
However, the endpoint discarded `info` and returned a generic success string.
It did not confirm the intended recipient was in `info.accepted`; no-op or
missing-recipient results could also reach the success response. Its wording did
not distinguish provider acceptance from Inbox delivery.

The configured transport is Nodemailer SMTP with host, port, secure flag, and
separate authentication username/password. The observed port 465 and
`secure: true` use TLS from connection start. Certificate verification is not
disabled. There is no built-in mock transport, disabled-send switch, or local
email queue in this path. Test overrides bypass workspace/global fallback and
do not retry through another sender. No real SMTP connection or email was used
for this investigation; transports in regression tests are mocked.

## Updated result and UI

HTTP 200 is now returned only after the intended recipient is accepted and a
successful SMTP status is present. The response includes:

```json
{
  "recipient": "signed-in-account@example.test",
  "delivery": {
    "status": "smtp_accepted",
    "accepted": ["signed-in-account@example.test"],
    "rejected": [],
    "messageId": "<abcdefab-abcd-abcd-abcd-abcdefabcdef@example.test>",
    "response": "250 2.0.0",
    "inboxDeliveryConfirmed": false
  }
}
```

The server records the sender source and a safe acceptance receipt. Only
expected recipient addresses are reported. The provider response is reduced to
SMTP/enhanced status codes because arbitrary response text can echo secrets.
Message-ID is exposed only when it matches Nodemailer's generated UUID-style
format and does not contain known message secrets; otherwise it is `null`.
This is the outgoing message identifier, not a guarantee of Inbox placement.
Use provider logs to find its delivery status or queue identifier.

The UI says **SMTP accepted**, names the recipient, and explicitly says Inbox
delivery is not confirmed. A legacy server's generic 200 response is shown as
**Delivery not confirmed**. The existing SMTP Configured badge is clarified as
saved configuration, not verified delivery. Partial acceptance is a warning.

No-op/queue-only/missing-result responses, an unaccepted intended recipient, or
a non-success SMTP response fail with `SMTP_NOT_ACCEPTED`. Missing signed-in
recipient, decryption, authentication, connection, TLS, and sender/relay errors
have safe diagnostic categories. Raw SMTP errors, passwords, tokens, OTPs, and
mail contents are not included in the new receipts/error logs. Existing SMTP
password-length logging was removed.

## Password reset OTP routing

`POST /api/auth/forgot-password` finds the account by its unique email address.
It stores an OTP hash and expiry and calls `sendPasswordResetEmail`, which awaits
`sendWorkspaceEmail`. The recipient is that found account. Workspace and tenant
scope come from the account record, not request-body workspace/tenant/sender IDs.

The existing authentication-mail policy is intentionally distinct from an
authenticated user's personal notification preference:

1. Read `WorkspaceSetting.workspaceSender` for the account's workspace.
2. Load the referenced default sender and its saved SMTP configuration.
3. If no usable workspace default exists, use the server-wide `EMAIL_*` fallback.

The Settings “Manual sender” selection is stored in the signed-in user's
`User.senderPreference`; it does not change `WorkspaceSetting.workspaceSender`.
OTP mail must not inherit an arbitrary visitor's or another user's personal
sender selection. The public reset endpoint has no authenticated sender to use.
The patch preserves that policy and adds a tenant filter to default-sender user
lookup. A default sender in another tenant cannot supply credentials, including
when tenants share a legacy workspace. Only the existing global service fallback
can be used if a scoped default is unavailable. A configured default's actual
SMTP rejection is not silently retried as another identity.

The reported `pradeep.a@pirnav.com` address is not hardcoded in the inspected
backend/frontend source. Its observed use must be checked against the deployed
workspace-default profile's `fromEmail` and global `EMAIL_FROM`/`EMAIL_USER`.
The source alone cannot determine which live database/environment value was
used for that historical failure. Existing routing logs and the new safe failure
log's `senderSource` distinguish `workspace` from `default`. Selecting a different
manual sender in Settings does not rewrite those authentication-mail defaults.

SMTP 553 with 5.7.1 and a sender/relay rejection is a provider sender-permission
failure, distinct from a 535 authentication failure. Confirm the actual From
address is the authenticated mailbox or an alias it is permitted to send as.
Do not substitute a personal mailbox globally to bypass that restriction.

On OTP send failure the code now clears the unusable OTP hash, expiry, and resend
cooldown. It logs a safe category, SMTP response code, routing source, and scope,
then propagates a sanitized HTTP 503 `PASSWORD_RESET_EMAIL_FAILED` without OTP or
sender details. Unknown accounts retain a generic response. The successful
request response does not promise Inbox delivery.

## Configuration precedence and deployment work

The global fallback uses `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_SECURE`, `EMAIL_USER`,
`EMAIL_PASS`, and `EMAIL_FROM`. Existing process/container values win over
`backend/.env`, which wins over the root `.env` (dotenv loads without override).
Docker Compose passes those variables explicitly. A Settings SMTP profile does
not update environment variables or the separate workspace-default selection.

After deploying the backend and frontend changes:

1. Confirm the Settings response's `recipient` is the mailbox being checked.
2. Inspect the deployed workspace-default sender record and its authorized From
   identity for the affected account's workspace and tenant. Updating a manual
   selection alone does not change OTP policy.
3. Verify the global fallback is an approved service mailbox and its
   `EMAIL_USER`/`EMAIL_FROM` combination is provider-authorized. Do not hardcode a
   user's personal address. Restart/redeploy the backend after environment changes.
4. Keep the encryption key stable across instances; re-enter credentials only if
   a key change made the stored ciphertext unreadable.
5. When a user authorizes a real test, inspect accepted/rejected recipients,
   Message-ID, SMTP status, routing source, and time. If accepted but absent from
   Inbox/Spam, investigate provider delivery logs, bounces, filtering, suppression,
   and domain sender authentication with the mail administrator. SMTP acceptance
   alone cannot establish the cause of missing Inbox delivery.

No live credentials, database settings, DNS records, environment configuration,
or deployed services were modified. No real emails were sent. The historical
HTTP 200 lacks SMTP metadata, so its original Message-ID and delivery outcome
cannot be reconstructed from the provided response.

## Changed implementation and validation

- `backend/controllers/settingsController.js`: recipient validation, safe receipt
  and errors, decryption handling, tenant-scoped sender access.
- `backend/services/emailService.js`: SMTP acceptance checks, safe receipts and
  failure logs, tenant-scoped OTP sender resolution; existing routing preserved.
- `backend/controllers/authController.js`: account-derived tenant scope, safe
  propagated failure, OTP/cooldown cleanup, delivery-neutral response wording.
- `backend/utils/smtpDelivery.js`: receipt validation and safe error metadata.
- `frontend/src/pages/UserSettingsPage.jsx`,
  `frontend/src/lib/testEmailResult.js`, and
  `frontend/src/components/settings/WorkspaceMailSenderCard.jsx`: acceptance-aware
  notices and saved-configuration clarification.
- New regression suites: `smtpDelivery.test.js`, `settingsTestDelivery.test.js`,
  `smtpRouting.test.js`, `passwordResetMail.test.js`, and frontend
  `testEmailResult.test.mjs`.

Checks cover the actual recipient, empty-password fallback and preservation,
awaited sends, no-op/rejected SMTP results, independent login/From values,
explicit-test fallback bypass, default/global OTP routing, tenant isolation,
OTP failure cleanup, secret-safe receipts/logs, and UI acceptance wording.

Validation completed: 45 relevant backend tests passed (mail, sender selection,
account authentication, and tenant isolation), all 33 frontend tests passed,
the frontend production build passed, and `git diff --check` passed.

SMTP transport reference: [Nodemailer SMTP documentation](https://nodemailer.com/smtp).
