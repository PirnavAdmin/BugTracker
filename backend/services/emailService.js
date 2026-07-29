const nodemailer = require("nodemailer");
const { generateIssueRedirectUrl, generateBugRedirectUrl } = require("../config/env");
const User = require("../models/User");
const UserEmailConfig = require("../models/UserEmailConfig");
const WorkspaceSetting = require("../models/WorkspaceSetting");
const { decryptSecret } = require("../utils/emailCrypto");
const {
  hasTesterAccess,
  isEligibleWorkspaceSenderRole,
} = require("../utils/roles");
const { getWorkspaceSenderState } = require("../utils/workspaceSender");
const { normalizeWorkspaceId } = require("../utils/workspace");
const { INDIAN_TIME_ZONE, formatDateTime } = require("../utils/dateTime");
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TESTER_SMTP_REQUIRED_MESSAGE =
  "Please configure your SMTP settings before assigning bugs by email.";
const ipv4Regex =
  /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;
const hostnameRegex =
  /^(?=.{1,253}$)(?:localhost|(?:(?!-)[a-z0-9-]{1,63}(?<!-)\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59}))$/i;
const normalizeSmtpText = (value = "") =>
  String(value || "").replace(/\r?\n/g, "").trim();

const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const getStatusLabel = (status = "") => {
  if (!status) {
    return "N/A";
  }

  return String(status)
    .split("_")
    .filter(Boolean)
    .map((segment) => segment.charAt(0) + segment.slice(1).toLowerCase())
    .join(" ");
};

const createBadge = (value, color = "blue") => {
  const palette = {
    blue: {
      background: "#EFF6FF",
      border: "#BFDBFE",
      color: "#1D4ED8",
    },
    green: {
      background: "#ECFDF5",
      border: "#A7F3D0",
      color: "#047857",
    },
    amber: {
      background: "#FFFBEB",
      border: "#FDE68A",
      color: "#B45309",
    },
    red: {
      background: "#FEF2F2",
      border: "#FECACA",
      color: "#B91C1C",
    },
    slate: {
      background: "#F8FAFC",
      border: "#E2E8F0",
      color: "#334155",
    },
  };
  const style = palette[color] || palette.slate;

  return `
    <span style="display: inline-block; padding: 6px 10px; border-radius: 999px; border: 1px solid ${style.border}; background: ${style.background}; color: ${style.color}; font-size: 12px; font-weight: 700; line-height: 1;">
      ${escapeHtml(value || "N/A")}
    </span>
  `;
};

const getPriorityBadgeColor = (priority = "") => {
  const normalizedPriority = String(priority || "").toLowerCase();

  if (normalizedPriority === "high") {
    return "red";
  }

  if (normalizedPriority === "medium") {
    return "amber";
  }

  if (normalizedPriority === "low") {
    return "green";
  }

  return "slate";
};

const getSeverityBadgeColor = (severity = "") => {
  const normalizedSeverity = String(severity || "").toLowerCase();

  if (["blocker", "critical"].includes(normalizedSeverity)) {
    return "red";
  }

  if (["major", "high"].includes(normalizedSeverity)) {
    return "amber";
  }

  if (["minor", "low"].includes(normalizedSeverity)) {
    return "green";
  }

  return "blue";
};

const projectAccentPalette = ["#2563EB", "#0F766E", "#7C3AED", "#DB2777", "#0891B2", "#4D7C0F"];

const getProjectAccentColor = (projectName = "") => {
  const source = String(projectName || "Project");
  const hash = source.split("").reduce((total, char) => total + char.charCodeAt(0), 0);

  return projectAccentPalette[hash % projectAccentPalette.length];
};

const createDetailRow = (label, value) => `
  <tr>
    <td style="padding: 12px 0; color: #64748B; font-size: 13px; width: 140px; vertical-align: top;">${escapeHtml(
      label
    )}</td>
    <td style="padding: 12px 0; color: #0F172A; font-size: 14px; font-weight: 700; vertical-align: top;">${escapeHtml(
      value || "N/A"
    )}</td>
  </tr>
`;

const buildEmailList = (items = []) => {
  const normalizedItems = [...new Set(
    (Array.isArray(items) ? items : [])
      .map((item) => String(item || "").trim())
      .filter(Boolean)
  )];

  if (!normalizedItems.length) {
    return "<p style=\"margin: 0; color: #64748B; font-size: 14px;\">No participants listed.</p>";
  }

  return `
    <ul style="margin: 0; padding: 0 0 0 18px; color: #334155; font-size: 14px; line-height: 1.8;">
      ${normalizedItems.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
    </ul>
  `;
};

const createEmailShell = ({
  preheader = "",
  title = "",
  subtitle = "",
  body = "",
  accentColor = "#2563EB",
}) => `
  <div style="margin: 0; padding: 0; background: #F1F5F9;">
    <span style="display: none; visibility: hidden; opacity: 0; color: transparent; height: 0; width: 0; overflow: hidden;">
      ${escapeHtml(preheader)}
    </span>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse; background: #F1F5F9;">
      <tr>
        <td align="center" style="padding: 34px 14px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width: 100%; max-width: 660px; border-collapse: collapse; background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 48px rgba(15, 23, 42, 0.12);">
            <tr>
              <td style="height: 6px; background: ${escapeHtml(accentColor)}; line-height: 6px; font-size: 0;">&nbsp;</td>
            </tr>
            <tr>
              <td style="padding: 30px 30px 22px; border-bottom: 1px solid #E2E8F0;">
                <p style="margin: 0 0 9px; color: ${escapeHtml(accentColor)}; font-size: 12px; font-weight: 800; letter-spacing: 0; text-transform: uppercase;">Pirnav Bug Tracker</p>
                <h1 style="margin: 0; color: #0F172A; font-size: 24px; line-height: 1.3; font-weight: 800;">${escapeHtml(
                  title
                )}</h1>
                ${
                  subtitle
                    ? `<p style="margin: 10px 0 0; color: #475569; font-size: 14px; line-height: 1.6;">${escapeHtml(
                        subtitle
                      )}</p>`
                    : ""
                }
              </td>
            </tr>
            <tr>
              <td style="padding: 28px 30px 34px;">
                ${body}
              </td>
            </tr>
          </table>
          <p style="margin: 16px 0 0; color: #64748B; font-size: 12px; line-height: 1.5;">
            Automated notification from Pirnav Workspace
          </p>
        </td>
      </tr>
    </table>
  </div>
`;

const normalizeTransportPort = (value, fallback = 465) => {
  const parsedValue = Number.parseInt(String(value || fallback), 10);
  return Number.isFinite(parsedValue) ? parsedValue : fallback;
};

const normalizeTransportSecure = (value, port) => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalizedValue = value.trim().toLowerCase();

    if (normalizedValue === "true") {
      return true;
    }

    if (normalizedValue === "false") {
      return false;
    }
  }

  return port === 465;
};

const parseFromHeader = (value = "", fallbackEmail = "") => {
  const normalizedValue = String(value || "").trim();
  const fallback = String(fallbackEmail || "").trim();
  const matchedValue = normalizedValue.match(/^(.*)<([^>]+)>$/);

  if (!matchedValue) {
    return {
      fromName: "",
      fromEmail: normalizedValue || fallback,
    };
  }

  const [, rawName, rawEmail] = matchedValue;

  return {
    fromName: rawName.replace(/^"+|"+$/g, "").trim(),
    fromEmail: String(rawEmail || "").trim() || fallback,
  };
};

const buildFromHeader = ({ fromName, fromEmail, username }) => {
  const normalizedFromEmail = String(fromEmail || username || "").trim();
  const normalizedFromName = String(fromName || "").trim();

  if (!normalizedFromEmail) {
    return "";
  }

  return normalizedFromName
    ? `${normalizedFromName} <${normalizedFromEmail}>`
    : normalizedFromEmail;
};

const buildReplyToHeader = ({ fromEmail, username }) =>
  String(fromEmail || username || "").trim();

const normalizeEmailAddress = (value = "") =>
  normalizeSmtpText(value).toLowerCase();

const isValidEmailAddress = (value = "") =>
  emailRegex.test(normalizeEmailAddress(value));

const normalizeSmtpHost = (value = "") =>
  normalizeSmtpText(value).toLowerCase();

const isValidSmtpHost = (value = "") => {
  const normalizedHost = normalizeSmtpHost(value);

  return Boolean(
    normalizedHost &&
      !/[,\s]/.test(normalizedHost) &&
      (hostnameRegex.test(normalizedHost) || ipv4Regex.test(normalizedHost))
  );
};

const resolveSmtpUsername = (
  username,
  fromEmail,
  { allowFromEmailFallback = true } = {}
) => {
  const normalizedUsername = normalizeEmailAddress(username);
  const normalizedFromEmail = normalizeEmailAddress(fromEmail);

  if (isValidEmailAddress(normalizedUsername)) {
    return normalizedUsername;
  }

  if (allowFromEmailFallback && isValidEmailAddress(normalizedFromEmail)) {
    return normalizedFromEmail;
  }

  return normalizedUsername;
};

const normalizeEmailConfig = (
  config = {},
  { allowUsernameFallback = true } = {}
) => {
  const port = normalizeTransportPort(config.port);
  const requestedFromEmail = normalizeEmailAddress(config.fromEmail);
  const username = resolveSmtpUsername(config.username, requestedFromEmail, {
    allowFromEmailFallback: allowUsernameFallback,
  });
  const fromEmail = requestedFromEmail || username;
  const fromName = String(config.fromName || "").trim();

  return {
    host: normalizeSmtpHost(config.host),
    port,
    secure: normalizeTransportSecure(config.secure, port),
    username,
    password: typeof config.password === "string" ? config.password : "",
    fromName,
    fromEmail,
  };
};

const hasCompleteEmailConfig = (config = {}, { requirePassword = true } = {}) => {
  const normalizedConfig = normalizeEmailConfig(config);

  return Boolean(
    isValidSmtpHost(normalizedConfig.host) &&
      Number.isFinite(normalizedConfig.port) &&
      normalizedConfig.port > 0 &&
      isValidEmailAddress(normalizedConfig.username) &&
      isValidEmailAddress(normalizedConfig.fromEmail) &&
      normalizedConfig.fromName &&
      (!requirePassword || normalizedConfig.password)
  );
};

const getDefaultEmailConfig = () => {
  const username = String(process.env.EMAIL_USER || "").trim();
  const parsedFromHeader = parseFromHeader(process.env.EMAIL_FROM, username);
  const port = normalizeTransportPort(process.env.EMAIL_PORT, 465);

  return normalizeEmailConfig({
    host: process.env.EMAIL_HOST,
    port,
    secure: normalizeTransportSecure(process.env.EMAIL_SECURE, port),
    username,
    password: process.env.EMAIL_PASS,
    fromName: parsedFromHeader.fromName || "Pirnav Workspace",
    fromEmail: parsedFromHeader.fromEmail || username,
  });
};

const createTransporterFromConfig = (config = {}) => {
  const rawHost = String(config?.host || "");
  const normalizedConfig = normalizeEmailConfig(config);

  console.log("smtpHost raw:", `[${rawHost}]`);
  console.log("smtpHost trimmed:", `[${normalizedConfig.host}]`);

  if (!normalizedConfig.host) {
    throw new Error("SMTP host is required");
  }

  if (!isValidSmtpHost(normalizedConfig.host)) {
    throw new Error("SMTP host must be a valid hostname or IPv4 address");
  }

  if (!hasCompleteEmailConfig(normalizedConfig)) {
    throw new Error(
      "SMTP host, port, username, password, from name, and from email must be configured"
    );
  }

  return {
    transporter: nodemailer.createTransport({
      host: normalizedConfig.host.trim(),
      port: normalizedConfig.port,
      secure: normalizedConfig.secure,
      auth: {
        user: normalizedConfig.username,
        pass: normalizedConfig.password,
      },
    }),
    config: normalizedConfig,
    from: buildFromHeader(normalizedConfig),
    replyTo: buildReplyToHeader(normalizedConfig),
  };
};

const buildTransportDebugPayload = ({
  config,
  senderSource,
  workspaceId = "",
}) => {
  const normalizedConfig = normalizeEmailConfig(config);
  const normalizedWorkspaceId = workspaceId ? normalizeWorkspaceId(workspaceId) : "";

  return {
    workspaceId: normalizedWorkspaceId || "default",
    senderSource,
    smtpHostRaw: `[${String(config?.host || "")}]`,
    smtpHost: normalizedConfig.host,
    smtpPort: normalizedConfig.port,
    smtpSecure: normalizedConfig.secure,
    smtpUser: normalizedConfig.username,
    fromEmail: normalizedConfig.fromEmail,
    hasPassword: Boolean(normalizedConfig.password),
    passwordLength: String(normalizedConfig.password || "").length,
  };
};

const createMailerTransportKey = (mailer) =>
  [
    mailer?.config?.host || "",
    String(mailer?.config?.port || ""),
    mailer?.config?.secure ? "true" : "false",
    mailer?.config?.username || "",
    mailer?.from || "",
  ].join("|");

const appendUniqueMailer = (mailers, seenKeys, mailer) => {
  if (!mailer) {
    return;
  }

  const transportKey = createMailerTransportKey(mailer);

  if (seenKeys.has(transportKey)) {
    return;
  }

  seenKeys.add(transportKey);
  mailers.push(mailer);
};

const shouldFallbackToNextMailer = (error) =>
  Boolean(
    error &&
      (error.code === "EAUTH" ||
        error.code === "ENOTFOUND" ||
        error.code === "EAI_AGAIN" ||
        String(error.response || "").includes("535"))
  );

const buildMailerResult = ({
  config,
  fallbackReason = "",
  senderSource,
  senderUser = null,
  workspaceId = "",
}) => {
  const normalizedWorkspaceId = workspaceId ? normalizeWorkspaceId(workspaceId) : "";
  console.log(
    "[email] Transporter config preview",
    buildTransportDebugPayload({
      config,
      senderSource,
      workspaceId: normalizedWorkspaceId,
    })
  );
  const { transporter, from, replyTo, config: resolvedConfig } =
    createTransporterFromConfig(config);

  console.log("Email sender source:", senderSource);
  console.log("From address:", from);
  console.log("Workspace ID:", normalizedWorkspaceId || "default");
  console.log("SMTP host:", resolvedConfig.host);
  console.log("SMTP user:", resolvedConfig.username);
  console.log("Transporter auth user:", resolvedConfig.username);

  if (replyTo) {
    console.log("Reply-To address:", replyTo);
  }

  if (senderUser?.email) {
    console.log("Resolved sender email:", senderUser.email);
  }

  if (senderUser?.role) {
    console.log("Resolved sender role:", senderUser.role);
  }

  if (fallbackReason) {
    console.log("Mailer fallback reason:", fallbackReason);
  }

  return {
    transporter,
    config: resolvedConfig,
    from,
    replyTo,
    senderSource,
    senderUser,
    fallbackReason,
    workspaceId: normalizedWorkspaceId,
  };
};

const getDefaultMailer = ({ workspaceId = "", fallbackReason = "" } = {}) =>
  buildMailerResult({
    config: getDefaultEmailConfig(),
    fallbackReason,
    senderSource: "default",
    senderUser: null,
    workspaceId,
  });

const serializeMailerUser = (user) =>
  user
    ? {
        _id: String(user._id),
        name: user.name,
        email: user.email,
        role: user.role,
        workspaceId: user.workspaceId,
      }
    : null;

const clearOwnerManualSenderPreference = async ({
  workspaceId,
  ownerUserId,
  matchSenderUserId = null,
}) => {
  const normalizedWorkspaceId = workspaceId ? normalizeWorkspaceId(workspaceId) : "";

  if (!normalizedWorkspaceId || !ownerUserId) {
    return null;
  }

  const query = {
    _id: ownerUserId,
    workspaceId: normalizedWorkspaceId,
  };

  if (matchSenderUserId) {
    query["senderPreference.userId"] = matchSenderUserId;
  }

  return User.updateOne(query, {
    $set: {
      senderPreference: {
        userId: null,
        updatedBy: ownerUserId,
        updatedAt: new Date(),
      },
    },
  });
};

const loadUserMailerConfig = async ({
  userId,
  workspaceId,
  allowSelfSenderUserId = null,
  sourceLabel = "Sender",
}) => {
  const normalizedWorkspaceId = workspaceId ? normalizeWorkspaceId(workspaceId) : "";

  if (!normalizedWorkspaceId) {
    return {
      config: null,
      fallbackReason: `No workspace ID was provided for ${sourceLabel.toLowerCase()} lookup.`,
      senderUser: null,
      workspaceId: "",
    };
  }

  if (!userId) {
    return {
      config: null,
      fallbackReason: `No ${sourceLabel.toLowerCase()} user is configured.`,
      senderUser: null,
      workspaceId: normalizedWorkspaceId,
    };
  }

  const senderUser = await User.findOne({
    _id: userId,
    workspaceId: normalizedWorkspaceId,
  })
    .select("_id name email role workspaceId")
    .lean();

  console.log(`[email] ${sourceLabel} lookup`, {
    workspaceId: normalizedWorkspaceId,
    requestedUserId: String(userId),
    user: serializeMailerUser(senderUser),
  });

  if (!senderUser) {
    return {
      config: null,
      fallbackReason: `The ${sourceLabel.toLowerCase()} user was not found in workspace ${normalizedWorkspaceId}.`,
      senderUser: null,
      workspaceId: normalizedWorkspaceId,
    };
  }

  const canUseSelfSender =
    allowSelfSenderUserId &&
    String(senderUser._id) === String(allowSelfSenderUserId);

  if (!canUseSelfSender && !isEligibleWorkspaceSenderRole(senderUser.role)) {
    return {
      config: null,
      fallbackReason: `${sourceLabel} ${senderUser.email} has ineligible role ${senderUser.role}.`,
      senderUser,
      workspaceId: normalizedWorkspaceId,
    };
  }

  const emailConfig = await UserEmailConfig.findOne({
    workspaceId: normalizedWorkspaceId,
    userId: senderUser._id,
  })
    .select("+passwordEncrypted host port secure username fromName fromEmail userId workspaceId")
    .lean();

  console.log(`[email] ${sourceLabel} SMTP config lookup`, {
    workspaceId: normalizedWorkspaceId,
    senderUserId: String(senderUser._id),
    senderEmail: senderUser.email,
    senderRole: senderUser.role,
    smtpHost: emailConfig?.host || "",
    smtpPort: emailConfig?.port || "",
    smtpSecure:
      typeof emailConfig?.secure === "boolean" ? emailConfig.secure : null,
    smtpUser: emailConfig?.username || "",
    smtpFromEmail: emailConfig?.fromEmail || "",
    hasPasswordEncrypted: Boolean(emailConfig?.passwordEncrypted),
  });

  if (!emailConfig?.passwordEncrypted) {
    return {
      config: null,
      fallbackReason: `${sourceLabel} ${senderUser.email} does not have SMTP credentials.`,
      senderUser,
      workspaceId: normalizedWorkspaceId,
    };
  }

  let password = "";

  try {
    password = decryptSecret(emailConfig.passwordEncrypted);
  } catch (error) {
    return {
      config: null,
      fallbackReason: `The SMTP password for ${sourceLabel.toLowerCase()} ${senderUser.email} could not be decrypted.`,
      senderUser,
      workspaceId: normalizedWorkspaceId,
    };
  }

  const storedUsername = normalizeEmailAddress(emailConfig.username);
  const fallbackUsername = resolveSmtpUsername(
    emailConfig.username,
    emailConfig.fromEmail,
    {
      allowFromEmailFallback: true,
    }
  );

  if (fallbackUsername && fallbackUsername !== storedUsername) {
    console.warn("[email] Invalid stored SMTP username detected. Using fromEmail as auth user.", {
      workspaceId: normalizedWorkspaceId,
      senderEmail: senderUser.email,
      storedSmtpUser: emailConfig.username || "",
      fallbackSmtpUser: fallbackUsername,
      fromEmail: emailConfig.fromEmail || "",
    });
  }

  const resolvedConfig = normalizeEmailConfig(
    {
    host: emailConfig.host,
    port: emailConfig.port,
    secure: emailConfig.secure,
    username: emailConfig.username,
    password,
    fromName: emailConfig.fromName,
    fromEmail: emailConfig.fromEmail,
    },
    {
      allowUsernameFallback: true,
    }
  );

  if (!hasCompleteEmailConfig(resolvedConfig)) {
    return {
      config: null,
      fallbackReason: `${sourceLabel} ${senderUser.email} has incomplete SMTP configuration.`,
      senderUser,
      workspaceId: normalizedWorkspaceId,
    };
  }

  return {
    config: resolvedConfig,
    fallbackReason: "",
    senderUser,
    workspaceId: normalizedWorkspaceId,
  };
};

const createSmtpConfigurationRequiredError = (message, fallbackReason = "") => {
  const error = new Error(message || TESTER_SMTP_REQUIRED_MESSAGE);
  error.code = "SMTP_CONFIG_REQUIRED";
  error.fallbackReason = fallbackReason;
  return error;
};

const ensureUserSmtpConfigured = async ({
  userId,
  workspaceId,
  sourceLabel = "User personal sender",
  message = TESTER_SMTP_REQUIRED_MESSAGE,
} = {}) => {
  const userMailerConfig = await loadUserMailerConfig({
    allowSelfSenderUserId: userId,
    userId,
    workspaceId,
    sourceLabel,
  });

  if (!userMailerConfig.config) {
    throw createSmtpConfigurationRequiredError(
      message,
      userMailerConfig.fallbackReason
    );
  }

  return userMailerConfig;
};

const getRequiredUserMailer = async ({
  userId,
  workspaceId,
  sourceLabel = "User personal sender",
  senderSource = "user",
  enforceUserFromIdentity = false,
  message = TESTER_SMTP_REQUIRED_MESSAGE,
} = {}) => {
  const userMailerConfig = await ensureUserSmtpConfigured({
    userId,
    workspaceId,
    sourceLabel,
    message,
  });
  const senderIdentityConfig =
    enforceUserFromIdentity && userMailerConfig.senderUser
      ? {
          ...userMailerConfig.config,
          fromName:
            String(userMailerConfig.senderUser.name || "").trim() ||
            userMailerConfig.config.fromName,
          fromEmail:
            normalizeEmailAddress(userMailerConfig.senderUser.email) ||
            userMailerConfig.config.fromEmail,
        }
      : userMailerConfig.config;

  return buildMailerResult({
    config: senderIdentityConfig,
    fallbackReason: "",
    senderSource,
    senderUser: userMailerConfig.senderUser,
    workspaceId: userMailerConfig.workspaceId,
  });
};

const loadWorkspaceMailerConfig = async (workspaceId) => {
  const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);

  const settings = await WorkspaceSetting.findOne({
    workspaceId: normalizedWorkspaceId,
  })
    .select("workspaceSender")
    .lean();
  const { workspaceSender, workspaceSenderUserId, hasWorkspaceSender } =
    getWorkspaceSenderState(settings);

  console.log("[email] Workspace sender settings lookup", {
    workspaceId: normalizedWorkspaceId,
    settingsDocument: settings
      ? {
          workspaceId: settings.workspaceId || normalizedWorkspaceId,
          workspaceSender: workspaceSender || null,
        }
      : null,
  });

  if (!hasWorkspaceSender) {
    console.log("[email] Workspace sender fallback engaged", {
      workspaceId: normalizedWorkspaceId,
      reason: workspaceSender
        ? "workspaceSender disabled or missing userId"
        : "settings or workspaceSender missing",
    });

    return {
      config: null,
      fallbackReason: "No workspace default sender is configured.",
      senderUser: null,
      workspaceId: normalizedWorkspaceId,
    };
  }

  return loadUserMailerConfig({
    userId: workspaceSenderUserId,
    workspaceId: normalizedWorkspaceId,
    sourceLabel: "Workspace default sender",
  });
};

const loadManualSenderPreferenceConfig = async ({
  ownerUserId,
  workspaceId,
}) => {
  const normalizedWorkspaceId = workspaceId ? normalizeWorkspaceId(workspaceId) : "";

  if (!normalizedWorkspaceId) {
    return {
      config: null,
      fallbackReason:
        "No workspace ID was provided for user-specific sender preference lookup.",
      senderUser: null,
      workspaceId: "",
      ownerUser: null,
    };
  }

  if (!ownerUserId) {
    return {
      config: null,
      fallbackReason: "No owner user ID was provided for sender preference lookup.",
      senderUser: null,
      workspaceId: normalizedWorkspaceId,
      ownerUser: null,
    };
  }

  const ownerUser = await User.findOne({
    _id: ownerUserId,
    workspaceId: normalizedWorkspaceId,
  })
    .select("_id name email role workspaceId senderPreference")
    .lean();

  console.log("[email] Manual sender preference owner lookup", {
    workspaceId: normalizedWorkspaceId,
    ownerUserId: String(ownerUserId),
    ownerUser: serializeMailerUser(ownerUser),
    savedSenderUserId: ownerUser?.senderPreference?.userId
      ? String(ownerUser.senderPreference.userId)
      : "",
  });

  if (!ownerUser) {
    return {
      config: null,
      fallbackReason: `The owner user ${String(ownerUserId)} was not found in workspace ${normalizedWorkspaceId}.`,
      senderUser: null,
      workspaceId: normalizedWorkspaceId,
      ownerUser: null,
    };
  }

  if (!ownerUser.senderPreference?.userId) {
    if (hasTesterAccess(ownerUser.role)) {
      const testerPersonalSenderConfig = await loadUserMailerConfig({
        allowSelfSenderUserId: ownerUser._id,
        userId: ownerUser._id,
        workspaceId: normalizedWorkspaceId,
        sourceLabel: "Tester personal sender",
      });

      return {
        ...testerPersonalSenderConfig,
        ownerUser,
      };
    }

    return {
      config: null,
      fallbackReason: `No user-specific sender is saved for ${ownerUser.email}.`,
      senderUser: null,
      workspaceId: normalizedWorkspaceId,
      ownerUser,
    };
  }

  if (
    hasTesterAccess(ownerUser.role) &&
    String(ownerUser.senderPreference.userId) !== String(ownerUser._id)
  ) {
    await clearOwnerManualSenderPreference({
      workspaceId: normalizedWorkspaceId,
      ownerUserId: ownerUser._id,
      matchSenderUserId: ownerUser.senderPreference.userId,
    });

    const testerPersonalSenderConfig = await loadUserMailerConfig({
      allowSelfSenderUserId: ownerUser._id,
      userId: ownerUser._id,
      workspaceId: normalizedWorkspaceId,
      sourceLabel: "Tester personal sender",
    });

    return {
      ...testerPersonalSenderConfig,
      fallbackReason: testerPersonalSenderConfig.config
        ? ""
        : `The saved sender for ${ownerUser.email} was reset because testers can only use their own mail account.`,
      ownerUser,
    };
  }

  const manualSenderConfig = await loadUserMailerConfig({
    allowSelfSenderUserId:
      hasTesterAccess(ownerUser.role) ? ownerUser._id : null,
    userId: ownerUser.senderPreference.userId,
    workspaceId: normalizedWorkspaceId,
    sourceLabel: "User-selected sender",
  });

  if (!manualSenderConfig.config) {
    await clearOwnerManualSenderPreference({
      workspaceId: normalizedWorkspaceId,
      ownerUserId: ownerUser._id,
      matchSenderUserId: ownerUser.senderPreference.userId,
    });
  }

  return {
    ...manualSenderConfig,
    ownerUser,
  };
};

const getWorkspaceMailer = async (workspaceId, { overrideConfig = null } = {}) => {
  const normalizedWorkspaceId = workspaceId ? normalizeWorkspaceId(workspaceId) : "";

  if (overrideConfig) {
    const normalizedOverrideConfig = normalizeEmailConfig(overrideConfig, {
      allowUsernameFallback: false,
    });

    if (!hasCompleteEmailConfig(normalizedOverrideConfig)) {
      throw new Error(
        "SMTP host, port, username, password, from name, and from email must be configured"
      );
    }

    return buildMailerResult({
      config: normalizedOverrideConfig,
      fallbackReason: "",
      senderSource: "override",
      senderUser: null,
      workspaceId: normalizedWorkspaceId,
    });
  }

  if (normalizedWorkspaceId) {
    const workspaceMailerConfig = await loadWorkspaceMailerConfig(normalizedWorkspaceId);

    if (workspaceMailerConfig.config) {
      return buildMailerResult({
        config: workspaceMailerConfig.config,
        fallbackReason: "",
        senderSource: "workspace",
        senderUser: workspaceMailerConfig.senderUser,
        workspaceId: normalizedWorkspaceId,
      });
    }

    return getDefaultMailer({
      workspaceId: normalizedWorkspaceId,
      fallbackReason: workspaceMailerConfig.fallbackReason,
    });
  }

  return getDefaultMailer({
    workspaceId: "",
    fallbackReason: "No workspace ID was provided. Using default SMTP sender.",
  });
};

const getNotificationMailer = async ({ creatorUserId, workspaceId }) => {
  const normalizedWorkspaceId = workspaceId ? normalizeWorkspaceId(workspaceId) : "";
  const [manualSenderConfig, workspaceMailerConfig] = await Promise.all([
    creatorUserId
      ? loadManualSenderPreferenceConfig({
          ownerUserId: creatorUserId,
          workspaceId: normalizedWorkspaceId,
        })
      : Promise.resolve({
          config: null,
          fallbackReason: "No owner user ID was provided for sender preference lookup.",
          senderUser: null,
          workspaceId: normalizedWorkspaceId,
          ownerUser: null,
        }),
    normalizedWorkspaceId
      ? loadWorkspaceMailerConfig(normalizedWorkspaceId)
      : Promise.resolve({
          config: null,
          fallbackReason:
            "No workspace ID was provided for workspace default sender lookup.",
          senderUser: null,
          workspaceId: "",
        }),
  ]);
  const isTesterOwner = hasTesterAccess(manualSenderConfig.ownerUser?.role);

  const manualMailer = manualSenderConfig.config
    ? buildMailerResult({
        config: manualSenderConfig.config,
        fallbackReason: "",
        senderSource: "manual",
        senderUser: manualSenderConfig.senderUser,
        workspaceId: normalizedWorkspaceId,
      })
    : null;
  const workspaceMailer = !isTesterOwner && workspaceMailerConfig.config
    ? buildMailerResult({
        config: workspaceMailerConfig.config,
        fallbackReason: manualSenderConfig.fallbackReason,
        senderSource: "workspace",
        senderUser: workspaceMailerConfig.senderUser,
        workspaceId: normalizedWorkspaceId,
      })
    : null;
  const defaultMailer = getDefaultMailer({
    workspaceId: normalizedWorkspaceId,
    fallbackReason: [
      manualSenderConfig.fallbackReason,
      !isTesterOwner ? workspaceMailerConfig.fallbackReason : "",
    ]
      .filter(Boolean)
      .join(" "),
  });
  const mailerResult = manualMailer || workspaceMailer || defaultMailer;
  const attemptMailers = [];
  const seenTransportKeys = new Set();

  appendUniqueMailer(attemptMailers, seenTransportKeys, manualMailer || null);
  appendUniqueMailer(attemptMailers, seenTransportKeys, workspaceMailer || null);
  appendUniqueMailer(attemptMailers, seenTransportKeys, defaultMailer);

  console.log("[email] Issue notification sender resolution", {
    workspaceId: normalizedWorkspaceId,
    ownerUserId: manualSenderConfig.ownerUser?._id
      ? String(manualSenderConfig.ownerUser._id)
      : String(creatorUserId || ""),
    ownerUserEmail: manualSenderConfig.ownerUser?.email || "",
    ownerUserRole: manualSenderConfig.ownerUser?.role || "",
    manualSenderEmail: manualSenderConfig.senderUser?.email || "",
    manualSenderRole: manualSenderConfig.senderUser?.role || "",
    manualSenderSmtpUser: manualSenderConfig.config?.username || "",
    workspaceDefaultSenderEmail: workspaceMailerConfig.senderUser?.email || "",
    finalSenderSource: mailerResult.senderSource,
    finalFrom: mailerResult.from,
    finalAuthUser: mailerResult.config.username,
    fallbackAttemptSources: attemptMailers.map((mailer) => mailer.senderSource),
  });

  console.log("senderPreferenceOwnerUserId:", creatorUserId ? String(creatorUserId) : "");
  console.log("manualSenderEmail:", manualSenderConfig.senderUser?.email || "");
  console.log("manualSenderRole:", manualSenderConfig.senderUser?.role || "");
  console.log(
    "manualSenderHasSmtp:",
    Boolean(
      manualSenderConfig.config?.host &&
        manualSenderConfig.config?.port &&
        manualSenderConfig.config?.username &&
        manualSenderConfig.config?.password
    )
  );
  console.log(
    "workspaceDefaultSenderEmail:",
    workspaceMailerConfig.senderUser?.email || ""
  );
  console.log("finalSenderSource:", mailerResult.senderSource);
  console.log("finalFrom:", mailerResult.from);
  console.log("finalAuthUser:", mailerResult.config.username);

  return {
    ...mailerResult,
    authUser: mailerResult.config.username,
    senderPreferenceOwnerUser: manualSenderConfig.ownerUser || null,
    manualSenderUser: manualSenderConfig.senderUser || null,
    workspaceSenderUser: workspaceMailerConfig.senderUser || null,
    attemptMailers,
  };
};

const getIssueNotificationMailer = getNotificationMailer;

const normalizeRecipientList = (value) =>
  (Array.isArray(value) ? value : [value])
    .flat()
    .map((entry) => String(entry || "").trim())
    .filter(Boolean);

const sendMailWithMailer = async ({
  mailer,
  workspaceId,
  to,
  cc,
  bcc,
  subject,
  html,
  text,
  logLabel = "sendMailWithMailer",
}) => {
  const toRecipients = [...new Set(normalizeRecipientList(to))];
  const ccRecipients = [...new Set(normalizeRecipientList(cc))];
  const bccRecipients = [...new Set(normalizeRecipientList(bcc))];

  if (!toRecipients.length && !ccRecipients.length && !bccRecipients.length) {
    return null;
  }

  console.log(`[email] ${logLabel} resolved mailer`, {
    workspaceId: mailer.workspaceId || normalizeWorkspaceId(workspaceId || ""),
    senderSource: mailer.senderSource,
    from: mailer.from,
    replyTo: mailer.replyTo,
    transporterAuthUser: mailer.config.username,
    smtpHost: mailer.config.host,
    smtpUser: mailer.config.username,
    toRecipients,
    ccRecipients,
    bccRecipients,
  });

  const info = await mailer.transporter.sendMail({
    from: mailer.from,
    to: toRecipients.length ? toRecipients.join(",") : undefined,
    cc: ccRecipients.length ? ccRecipients.join(",") : undefined,
    bcc: bccRecipients.length ? bccRecipients.join(",") : undefined,
    replyTo: mailer.replyTo || undefined,
    subject,
    html,
    text,
  });

  return {
    info,
    from: mailer.from,
    replyTo: mailer.replyTo,
    authUser: mailer.config.username,
    smtpProvider: mailer.config.host,
    senderSource: mailer.senderSource,
    senderUser: mailer.senderUser,
    workspaceId: mailer.workspaceId,
  };
};

const sendWorkspaceEmail = async ({
  workspaceId,
  to,
  cc,
  bcc,
  subject,
  html,
  text,
  overrideConfig = null,
}) => {
  const toRecipients = [...new Set(normalizeRecipientList(to))];
  const ccRecipients = [...new Set(normalizeRecipientList(cc))];
  const bccRecipients = [...new Set(normalizeRecipientList(bcc))];

  if (!toRecipients.length && !ccRecipients.length && !bccRecipients.length) {
    return null;
  }

  const workspaceMailer = await getWorkspaceMailer(workspaceId, {
    overrideConfig,
  });

  return sendMailWithMailer({
    mailer: workspaceMailer,
    workspaceId,
    to: toRecipients,
    cc: ccRecipients,
    bcc: bccRecipients,
    subject,
    html,
    text,
    logLabel: "sendWorkspaceEmail",
  });
};

const sendUserNotificationEmail = async ({
  senderUserId,
  workspaceId,
  to,
  cc,
  bcc,
  subject,
  html,
  text,
  sourceLabel = "User personal sender",
  senderSource = "user",
  enforceUserFromIdentity = false,
  missingConfigMessage = TESTER_SMTP_REQUIRED_MESSAGE,
}) => {
  const userMailer = await getRequiredUserMailer({
    userId: senderUserId,
    workspaceId,
    sourceLabel,
    senderSource,
    enforceUserFromIdentity,
    message: missingConfigMessage,
  });

  try {
    return await sendMailWithMailer({
      mailer: userMailer,
      workspaceId,
      to,
      cc,
      bcc,
      subject,
      html,
      text,
      logLabel: "sendUserNotificationEmail",
    });
  } catch (error) {
    error.smtpProvider = userMailer?.config?.host || "";
    error.senderSource = userMailer?.senderSource || "";
    throw error;
  }
};

const getPreferredUserOrDefaultMailer = async ({
  senderUserId,
  workspaceId,
  sourceLabel = "Assigned tester sender",
  senderSource = "assigned-tester",
  enforceUserFromIdentity = false,
} = {}) => {
  const normalizedWorkspaceId = workspaceId ? normalizeWorkspaceId(workspaceId) : "";
  const userMailerConfig = senderUserId
    ? await loadUserMailerConfig({
        allowSelfSenderUserId: senderUserId,
        userId: senderUserId,
        workspaceId: normalizedWorkspaceId,
        sourceLabel,
      })
    : {
        config: null,
        fallbackReason: `No ${sourceLabel.toLowerCase()} user was provided.`,
        senderUser: null,
        workspaceId: normalizedWorkspaceId,
      };

  const preferredConfig =
    enforceUserFromIdentity && userMailerConfig.config && userMailerConfig.senderUser
      ? {
          ...userMailerConfig.config,
          fromName:
            String(userMailerConfig.senderUser.name || "").trim() ||
            userMailerConfig.config.fromName,
          fromEmail:
            normalizeEmailAddress(userMailerConfig.senderUser.email) ||
            userMailerConfig.config.fromEmail,
        }
      : userMailerConfig.config;
  const preferredMailer = preferredConfig
    ? buildMailerResult({
        config: preferredConfig,
        fallbackReason: "",
        senderSource,
        senderUser: userMailerConfig.senderUser,
        workspaceId: normalizedWorkspaceId,
      })
    : null;
  const defaultMailer = getDefaultMailer({
    workspaceId: normalizedWorkspaceId,
    fallbackReason: userMailerConfig.fallbackReason,
  });
  const attemptMailers = [];
  const seenTransportKeys = new Set();

  appendUniqueMailer(attemptMailers, seenTransportKeys, preferredMailer);
  appendUniqueMailer(attemptMailers, seenTransportKeys, defaultMailer);

  console.log("[email] Preferred user sender resolution", {
    workspaceId: normalizedWorkspaceId,
    preferredSenderUserId: String(senderUserId || ""),
    preferredSenderEmail: userMailerConfig.senderUser?.email || "",
    preferredSenderRole: userMailerConfig.senderUser?.role || "",
    preferredSenderSmtpUser: userMailerConfig.config?.username || "",
    finalSenderSource: (preferredMailer || defaultMailer).senderSource,
    finalFrom: (preferredMailer || defaultMailer).from,
    fallbackReason: userMailerConfig.fallbackReason || "",
    fallbackAttemptSources: attemptMailers.map((mailer) => mailer.senderSource),
  });

  return {
    ...(preferredMailer || defaultMailer),
    attemptMailers,
  };
};

const sendIssueNotificationEmail = async ({
  creatorUserId,
  workspaceId,
  to,
  cc,
  bcc,
  subject,
  html,
  text,
}) => {
  const issueNotificationMailer = await getNotificationMailer({
    creatorUserId,
    workspaceId,
  });
  const attemptedMailers =
    issueNotificationMailer.attemptMailers?.length
      ? issueNotificationMailer.attemptMailers
      : [issueNotificationMailer];
  let lastError = null;

  for (let index = 0; index < attemptedMailers.length; index += 1) {
    const candidateMailer = attemptedMailers[index];
    const isLastAttempt = index === attemptedMailers.length - 1;

    try {
      return await sendMailWithMailer({
        mailer: candidateMailer,
        workspaceId,
        to,
        cc,
        bcc,
        subject,
        html,
        text,
        logLabel: `sendIssueNotificationEmail attempt ${index + 1}`,
      });
    } catch (error) {
      lastError = error;

      console.error("[email] Issue notification send attempt failed", {
        attempt: index + 1,
        senderSource: candidateMailer?.senderSource || "unknown",
        from: candidateMailer?.from || "",
        authUser: candidateMailer?.config?.username || "",
        smtpHost: candidateMailer?.config?.host || "",
        smtpPort: candidateMailer?.config?.port || "",
        smtpSecure:
          typeof candidateMailer?.config?.secure === "boolean"
            ? candidateMailer.config.secure
            : null,
        code: error.code || "",
        response: error.response || "",
        message: error.message,
        willFallback: !isLastAttempt && shouldFallbackToNextMailer(error),
      });

      if (isLastAttempt || !shouldFallbackToNextMailer(error)) {
        throw error;
      }
    }
  }

  throw lastError;
};

const sendPreferredUserNotificationEmail = async ({
  senderUserId,
  workspaceId,
  to,
  cc,
  bcc,
  subject,
  html,
  text,
  sourceLabel = "Assigned tester sender",
  senderSource = "assigned-tester",
  enforceUserFromIdentity = false,
}) => {
  const preferredMailer = await getPreferredUserOrDefaultMailer({
    senderUserId,
    workspaceId,
    sourceLabel,
    senderSource,
    enforceUserFromIdentity,
  });
  const attemptedMailers = preferredMailer.attemptMailers?.length
    ? preferredMailer.attemptMailers
    : [preferredMailer];
  let lastError = null;

  for (let index = 0; index < attemptedMailers.length; index += 1) {
    const candidateMailer = attemptedMailers[index];
    const isLastAttempt = index === attemptedMailers.length - 1;

    try {
      return await sendMailWithMailer({
        mailer: candidateMailer,
        workspaceId,
        to,
        cc,
        bcc,
        subject,
        html,
        text,
        logLabel: `sendPreferredUserNotificationEmail attempt ${index + 1}`,
      });
    } catch (error) {
      lastError = error;

      console.error("[email] Preferred user send attempt failed", {
        attempt: index + 1,
        senderSource: candidateMailer?.senderSource || "unknown",
        from: candidateMailer?.from || "",
        authUser: candidateMailer?.config?.username || "",
        smtpHost: candidateMailer?.config?.host || "",
        smtpPort: candidateMailer?.config?.port || "",
        smtpSecure:
          typeof candidateMailer?.config?.secure === "boolean"
            ? candidateMailer.config.secure
            : null,
        code: error.code || "",
        response: error.response || "",
        message: error.message,
        willFallback: !isLastAttempt && shouldFallbackToNextMailer(error),
      });

      if (isLastAttempt || !shouldFallbackToNextMailer(error)) {
        error.smtpProvider = candidateMailer?.config?.host || "";
        error.senderSource = candidateMailer?.senderSource || "";
        throw error;
      }
    }
  }

  throw lastError;
};

const sendIssueEmail = async (emails, issue, options = {}) => {
  const displayIssueId = issue.displayBugId || issue._id;
  const issueUrl = generateIssueRedirectUrl(displayIssueId);
  const priority = issue.priority || "Medium";
  const status = getStatusLabel(issue.status);
  const title = issue.title || "Untitled issue";
  const accentColor = getProjectAccentColor(issue.projectName);
  const text = [
    `New Issue Created: ${title}`,
    `Issue ID: ${displayIssueId}`,
    `Description: ${issue.description || "N/A"}`,
    `Project: ${issue.projectName || "N/A"}`,
    `Assigned To: ${issue.assigneeName || "Unassigned"}`,
    `Priority: ${priority}`,
    `Status: ${status}`,
    `Created At: ${formatDateTime(issue.createdAt)}`,
    `Due Date: ${formatDateTime(issue.dueDate)}`,
    `Link: ${issueUrl}`,
  ].join("\n");

  return sendIssueNotificationEmail({
    creatorUserId: options.creatorUserId,
    workspaceId: options.workspaceId,
    to: emails,
    subject: `New Issue Created: ${title}`,
    html: createEmailShell({
      preheader: `New issue created: ${title}`,
      title: "New Issue Created",
      subtitle: title,
      accentColor,
      body: `
        <p style="margin: 0 0 18px; color: #475569; font-size: 14px; line-height: 1.7;">${escapeHtml(
          issue.description || "No description provided."
        )}</p>
        <div style="margin: 0 0 22px;">
          ${createBadge(priority, getPriorityBadgeColor(priority))}
          <span style="display: inline-block; width: 8px;"></span>
          ${createBadge(status, "blue")}
        </div>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse; border-top: 1px solid #E2E8F0; border-bottom: 1px solid #E2E8F0;">
          ${createDetailRow("Issue ID", displayIssueId)}
          ${createDetailRow("Project", issue.projectName || "N/A")}
          ${createDetailRow("Assigned To", issue.assigneeName || "Unassigned")}
          ${createDetailRow("Created At", formatDateTime(issue.createdAt))}
          ${createDetailRow("Due Date", formatDateTime(issue.dueDate))}
        </table>
        <p style="margin: 26px 0 0;">
          <a href="${escapeHtml(
            issueUrl
          )}" style="display: inline-block; background: ${escapeHtml(accentColor)}; color: #FFFFFF; padding: 12px 18px; border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: 800;">
            View Issue
          </a>
        </p>
      `,
    }),
    text,
  });
};

const sendBugAssignmentEmail = async (emails, bug, options = {}) => {
  const bugId = String(bug.displayBugId || bug._id || "");
  const bugUrl = generateBugRedirectUrl(bugId);
  const bugTitle = String(bug.title || "Untitled bug");
  const projectName = bug.projectName || "N/A";
  const severity = bug.severity || "N/A";
  const priority = bug.priority || "N/A";
  const description = bug.description || "N/A";
  const accentColor = getProjectAccentColor(projectName);
  const createdDate = formatDateTime(bug.createdAt);
  const assignedByName =
    bug.assignedByName || options.assignedByName || "Tester";
  const assignedByEmail = bug.assignedByEmail || options.assignedByEmail || "";
  const assignedToName = bug.assigneeName || "Assigned developer";
  const assignedByText = assignedByEmail
    ? `${assignedByName} (${assignedByEmail})`
    : assignedByName;
  const subject = `Bug Assigned: ${bugTitle}`;
  const html = createEmailShell({
    preheader: `Bug assigned: ${bugTitle}`,
    title: "Bug Assigned",
    subtitle: bugTitle,
    accentColor,
    body: `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse; margin: 0 0 22px;">
        <tr>
          <td style="padding: 0 8px 8px 0;">
            <div style="border: 1px solid #E2E8F0; border-radius: 12px; padding: 14px; background: #F8FAFC;">
              <p style="margin: 0 0 6px; color: #64748B; font-size: 12px; font-weight: 700;">Bug ID</p>
              <p style="margin: 0; color: #0F172A; font-size: 20px; font-weight: 800;">${escapeHtml(
                bugId
              )}</p>
            </div>
          </td>
          <td style="padding: 0 0 8px 8px;">
            <div style="border: 1px solid #E2E8F0; border-radius: 12px; padding: 14px; background: #F8FAFC;">
              <p style="margin: 0 0 6px; color: #64748B; font-size: 12px; font-weight: 700;">Project</p>
              <p style="margin: 0; color: #0F172A; font-size: 20px; font-weight: 800;">${escapeHtml(
                projectName
              )}</p>
            </div>
          </td>
        </tr>
      </table>
      <div style="margin: 0 0 22px;">
        ${createBadge(`Severity: ${severity}`, getSeverityBadgeColor(severity))}
        <span style="display: inline-block; width: 8px;"></span>
        ${createBadge(`Priority: ${priority}`, getPriorityBadgeColor(priority))}
      </div>
      <p style="margin: 0 0 22px; color: #475569; font-size: 14px; line-height: 1.7;">${escapeHtml(
        description
      )}</p>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse; border-top: 1px solid #E2E8F0; border-bottom: 1px solid #E2E8F0;">
        ${createDetailRow("Bug ID", bugId)}
        ${createDetailRow("Project", projectName)}
        ${createDetailRow("Priority", priority)}
        ${createDetailRow("Severity", severity)}
        ${createDetailRow("Assigned User", assignedToName)}
        ${createDetailRow("Assigned By", assignedByText)}
        ${createDetailRow("Created Date", createdDate)}
      </table>
      <p style="margin: 26px 0 0;">
        <a href="${escapeHtml(
          bugUrl
        )}" style="display: inline-block; background: ${escapeHtml(accentColor)}; color: #FFFFFF; padding: 13px 20px; border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: 800;">
          View Bug Details
        </a>
      </p>
      <p style="margin: 14px 0 0; color: #64748B; font-size: 12px; line-height: 1.6;">
        If the button does not work, open this link:<br />
        <a href="${escapeHtml(bugUrl)}" style="color: ${escapeHtml(accentColor)}; text-decoration: underline; word-break: break-word;">${escapeHtml(
          bugUrl
        )}</a>
      </p>
    `,
  });
  const text = [
    `Bug ID: ${bugId}`,
    `Bug Title: ${bugTitle}`,
    `Project: ${projectName}`,
    `Severity: ${severity}`,
    `Priority: ${priority}`,
    `Description: ${description}`,
    `Assigned To: ${assignedToName}`,
    `Assigned By: ${assignedByText}`,
    `Created Date: ${createdDate}`,
    `Link: ${bugUrl}`,
  ].join("\n");

  if (options.preferredSenderUserId || options.strictSenderUserId) {
    return sendPreferredUserNotificationEmail({
      senderUserId: options.preferredSenderUserId || options.strictSenderUserId,
      workspaceId: options.workspaceId,
      to: emails,
      subject,
      html,
      text,
      sourceLabel: "Assigned tester sender",
      senderSource: "assigned-tester",
      enforceUserFromIdentity: true,
    });
  }

  return sendIssueNotificationEmail({
    creatorUserId: options.creatorUserId || options.senderUserId,
    workspaceId: options.workspaceId,
    to: emails,
    subject,
    html,
    text,
  });
};

const getMeetingEndDateTime = (meeting = {}) => {
  const explicitEnd = meeting.endDateTime || meeting.endTime;

  if (explicitEnd) {
    return explicitEnd;
  }

  const startDate = meeting.startDateTime || meeting.startTime;
  const durationMinutes = Number(meeting.durationMinutes || 0);

  if (!startDate || !Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    return null;
  }

  const parsedStartDate = new Date(startDate);

  if (Number.isNaN(parsedStartDate.getTime())) {
    return null;
  }

  return new Date(parsedStartDate.getTime() + durationMinutes * 60 * 1000);
};

const buildMeetingInviteEmail = ({
  title,
  subtitle,
  meeting,
  joinLabel = "Join Meeting",
  accentColor = "#2563EB",
  participantLabels = [],
}) => {
  const titleText = String(title || "Meeting").trim();
  const descriptionText = String(meeting?.description || "").trim();
  const joinUrl = String(meeting?.joinUrl || meeting?.meetingUrl || "").trim();
  const hasJoinUrl = Boolean(joinUrl);
  const startDateTime = meeting?.startDateTime || meeting?.startTime;
  const endDateTime = getMeetingEndDateTime(meeting);
  const durationMinutes = Number(meeting?.durationMinutes || 0);
  const durationLabel =
    Number.isFinite(durationMinutes) && durationMinutes > 0
      ? `${durationMinutes} minutes`
      : "Not set";
  const timeZoneLabel = "India Standard Time (Asia/Kolkata)";
  const text = [
    `Meeting Scheduled: ${titleText}`,
    subtitle ? `Context: ${subtitle}` : "",
    `Start: ${formatDateTime(startDateTime)} ${timeZoneLabel}`,
    `End: ${formatDateTime(endDateTime)} ${timeZoneLabel}`,
    `Duration: ${durationLabel}`,
    descriptionText ? `Description:\n${descriptionText}` : "",
    hasJoinUrl ? `Join: ${joinUrl}` : "",
    participantLabels.length ? `Participants:\n${participantLabels.map((item) => `- ${item}`).join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const html = createEmailShell({
    preheader: `Meeting scheduled: ${titleText}`,
    title: "Meeting Scheduled",
    subtitle: titleText,
    accentColor,
    body: `
      ${
        subtitle
          ? `<p style="margin: 0 0 18px; color: #475569; font-size: 14px; line-height: 1.7;">${escapeHtml(
              subtitle
            )}</p>`
          : ""
      }
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse; border-top: 1px solid #E2E8F0; border-bottom: 1px solid #E2E8F0;">
        ${createDetailRow("Start", `${formatDateTime(startDateTime)} ${timeZoneLabel}`)}
        ${createDetailRow("End", `${formatDateTime(endDateTime)} ${timeZoneLabel}`)}
        ${createDetailRow("Duration", durationLabel)}
        ${createDetailRow("Time Zone", INDIAN_TIME_ZONE)}
      </table>
      ${
        descriptionText
          ? `<div style="margin: 22px 0 0;">
              <p style="margin: 0 0 8px; color: #0F172A; font-size: 14px; font-weight: 800;">Description</p>
              <div style="margin: 0; padding: 14px 16px; border: 1px solid #E2E8F0; border-radius: 10px; background: #F8FAFC; color: #334155; font-size: 14px; line-height: 1.7; white-space: pre-line;">${escapeHtml(
                descriptionText
              )}</div>
            </div>`
          : ""
      }
      ${
        hasJoinUrl
          ? `<p style="margin: 26px 0 0;">
              <a href="${escapeHtml(
                joinUrl
              )}" style="display: inline-block; background: ${escapeHtml(accentColor)}; color: #FFFFFF; padding: 12px 18px; border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: 800;">
                ${escapeHtml(joinLabel)}
              </a>
            </p>
            <p style="margin: 14px 0 0; color: #64748B; font-size: 12px; line-height: 1.6;">
              If the button does not work, open this link:<br />
              <a href="${escapeHtml(joinUrl)}" style="color: ${escapeHtml(accentColor)}; text-decoration: underline; word-break: break-word;">${escapeHtml(
                joinUrl
              )}</a>
            </p>`
          : ""
      }
      <div style="margin: 26px 0 0;">
        <p style="margin: 0 0 10px; color: #0F172A; font-size: 14px; font-weight: 800;">Participants</p>
        ${buildEmailList(participantLabels)}
      </div>
    `,
  });

  return {
    html,
    text,
  };
};

const getParticipantLabels = (participants = []) =>
  (Array.isArray(participants) ? participants : [])
    .map((participant) => {
      if (!participant) {
        return "";
      }

      if (typeof participant === "string") {
        return participant;
      }

      const email = String(participant.email || "").trim();
      const name = String(participant.name || "").trim();

      return name && email ? `${name} <${email}>` : name || email;
    })
    .filter(Boolean);

const sendChatMeetingInviteEmail = async (emails, meeting, options = {}) => {
  const meetingTitleText = String(meeting?.title || "Chat meeting").trim();
  const conversationName = String(meeting?.conversationName || "Chat").trim();
  const participantLabels = getParticipantLabels(meeting?.participants || []);
  const { html, text } = buildMeetingInviteEmail({
    title: meetingTitleText || "Chat meeting",
    subtitle: `${conversationName} chat meeting scheduled by ${
      meeting?.scheduledByName || "a workspace member"
    }.`,
    meeting,
    joinLabel: "Open Chat Meeting",
    accentColor: "#0F766E",
    participantLabels,
  });

  const mailPayload = {
    workspaceId: options.workspaceId,
    to: emails,
    subject: `Meeting Scheduled: ${meetingTitleText || "Chat meeting"}`,
    html,
    text,
  };

  if (options.senderUserId) {
    return sendPreferredUserNotificationEmail({
      ...mailPayload,
      senderUserId: options.senderUserId,
      sourceLabel: "Meeting scheduler sender",
      senderSource: "meeting-scheduler",
      enforceUserFromIdentity: true,
    });
  }

  return sendWorkspaceEmail(mailPayload);
};

const sendProjectMeetingInviteEmail = async (emails, meeting, options = {}) => {
  const meetingTitleText = String(meeting?.subject || "Project team meeting").trim();
  const projectName = String(meeting?.projectName || "Project").trim();
  const participantLabels = getParticipantLabels(meeting?.participants || []);
  const { html, text } = buildMeetingInviteEmail({
    title: meetingTitleText || "Project team meeting",
    subtitle: `${projectName} project meeting.`,
    meeting,
    joinLabel: "Join Microsoft Teams Meeting",
    accentColor: getProjectAccentColor(projectName),
    participantLabels,
  });

  const mailPayload = {
    workspaceId: options.workspaceId,
    to: emails,
    subject: `Meeting Scheduled: ${meetingTitleText || "Project team meeting"}`,
    html,
    text,
  };

  if (options.senderUserId) {
    return sendPreferredUserNotificationEmail({
      ...mailPayload,
      senderUserId: options.senderUserId,
      sourceLabel: "Meeting scheduler sender",
      senderSource: "meeting-scheduler",
      enforceUserFromIdentity: true,
    });
  }

  return sendWorkspaceEmail(mailPayload);
};

const sendTestEmail = async ({ to, workspaceId, overrideConfig = null }) =>
  sendWorkspaceEmail({
    workspaceId,
    to,
    overrideConfig,
    subject: "Workspace mail sender test",
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <h2 style="color: #2563EB;">SMTP Configuration Test</h2>
        <p>This message confirms that the saved SMTP configuration can send email.</p>
        <p style="margin-top: 16px; color: #64748B; font-size: 13px;">
          Sent from the bug tracker settings panel.
        </p>
      </div>
    `,
    text: "SMTP configuration test successful.",
  });

module.exports = {
  TESTER_SMTP_REQUIRED_MESSAGE,
  getWorkspaceMailer,
  getNotificationMailer,
  getIssueNotificationMailer,
  sendWorkspaceEmail,
  sendUserNotificationEmail,
  sendIssueNotificationEmail,
  sendPreferredUserNotificationEmail,
  ensureUserSmtpConfigured,
  normalizeEmailConfig,
  hasCompleteEmailConfig,
  isValidEmailAddress,
  isValidSmtpHost,
  sendIssueEmail,
  sendBugAssignmentEmail,
  sendChatMeetingInviteEmail,
  sendProjectMeetingInviteEmail,
  sendTestEmail,
};
