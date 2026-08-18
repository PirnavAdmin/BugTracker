const PlatformAuditLog = require("../models/PlatformAuditLog");

const getRequestAuditContext = (req = {}) => ({
  ipAddress: req.ip || req.headers?.["x-forwarded-for"] || "",
  userAgent: req.headers?.["user-agent"] || "",
});

const recordPlatformAudit = async ({
  action,
  actor = null,
  actorEmail = "",
  metadata = {},
  req,
  status = "SUCCESS",
} = {}) => {
  if (!action) {
    return null;
  }

  try {
    const requestContext = getRequestAuditContext(req);

    return await PlatformAuditLog.create({
      actorId: actor?._id || null,
      actorEmail: String(actor?.email || actorEmail || "").toLowerCase().trim(),
      action,
      status,
      ...requestContext,
      metadata,
    });
  } catch (error) {
    console.warn("[platform-audit] failed to record audit event", {
      action,
      message: error.message,
    });
    return null;
  }
};

module.exports = {
  recordPlatformAudit,
};
