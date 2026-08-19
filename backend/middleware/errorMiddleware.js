const notFound = (req, res, next) => {
  res.status(404);
  next(new Error(`Route not found: ${req.originalUrl}`));
};

const errorHandler = (err, req, res, next) => {
  let statusCode =
    err.statusCode ||
    err.status ||
    (res.statusCode && res.statusCode !== 200 ? res.statusCode : 500);
  let message = err.message || "Internal server error";

  if (err.name === "CastError") {
    message = "Invalid resource id";
  }

  if (err.name === "ValidationError") {
    message = Object.values(err.errors)
      .map((item) => item.message)
      .join(", ");
  }

  if (err.code === 11000) {
    message = "A record with that value already exists";
  }

  if (err.type === "entity.too.large") {
    statusCode = 413;
    message = "Maximum upload size is 25 MB";
  }

  if (err.name === "MulterError" && err.code === "LIMIT_FILE_SIZE") {
    statusCode = 413;
    message = req.originalUrl?.includes("/chat/")
      ? "Maximum upload size is 25 MB"
      : "CSV file is too large";
  }

  if (statusCode >= 500) {
    console.error("[api-error]", {
      method: req.method,
      path: req.originalUrl,
      message,
      name: err.name || "Error",
      stack: err.stack ? String(err.stack).split("\n").slice(0, 4).join("\n") : "",
    });
  }

  res.status(statusCode).json({
    message,
    code:
      typeof err.code === "string" && err.code !== "MulterError" && err.code !== "ValidationError"
        ? err.code
        : undefined,
    ...(err.resource ? { resource: err.resource } : {}),
    ...(Number.isFinite(err.current) ? { current: err.current } : {}),
    ...(Number.isFinite(err.limit) || err.limit === null ? { limit: err.limit } : {}),
    ...(Number.isFinite(err.requested) ? { requested: err.requested } : {}),
    ...(Number.isFinite(err.available) ? { available: err.available } : {}),
    ...(Number.isFinite(err.created) ? { created: err.created } : {}),
    ...(Number.isFinite(err.rejected) ? { rejected: err.rejected } : {}),
    ...(typeof err.plan === "string" ? { plan: err.plan } : {}),
    ...(typeof err.upgradeRequired === "boolean" ? { upgradeRequired: err.upgradeRequired } : {}),
    details: err.details || undefined,
    stack: process.env.NODE_ENV === "production" ? undefined : err.stack,
  });
};

module.exports = {
  notFound,
  errorHandler,
};
