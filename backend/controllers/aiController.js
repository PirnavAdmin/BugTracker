const asyncHandler = require("../utils/asyncHandler");
const aiService = require("../services/aiService");

const MAX_TITLE_LENGTH = 180;
const MAX_OPTIONAL_FIELD_LENGTH = 120;
const SUPPORTED_WORK_ITEM_TYPES = new Set(["Task", "Bug"]);

const normalizeWorkItemType = (value = "Task") => {
  const normalized = String(value || "Task").trim().toLowerCase();

  if (normalized === "bug") {
    return "Bug";
  }

  if (normalized === "task") {
    return "Task";
  }

  return "";
};

const sendValidationError = (res, message) =>
  res.status(400).json({
    success: false,
    message,
  });

const normalizeOptionalField = (value) => {
  if (value === undefined || value === null) {
    return "";
  }

  return String(value).trim().slice(0, MAX_OPTIONAL_FIELD_LENGTH);
};

const generateWorkItemDescription = asyncHandler(async (req, res) => {
  const { title, workItemType = "Task" } = req.body || {};

  if (typeof title !== "string") {
    return sendValidationError(res, "Title is required");
  }

  const normalizedTitle = title.trim();

  if (!normalizedTitle) {
    return sendValidationError(res, "Title is required");
  }

  if (normalizedTitle.length > MAX_TITLE_LENGTH) {
    return sendValidationError(
      res,
      `Title must be ${MAX_TITLE_LENGTH} characters or fewer`
    );
  }

  const normalizedWorkItemType = normalizeWorkItemType(workItemType);

  if (!SUPPORTED_WORK_ITEM_TYPES.has(normalizedWorkItemType)) {
    return sendValidationError(res, "Unsupported workItemType");
  }

  try {
    const description = await aiService.generateWorkItemDescription({
      title: normalizedTitle,
      workItemType: normalizedWorkItemType,
      projectName: normalizeOptionalField(req.body.projectName),
      priority: normalizeOptionalField(req.body.priority),
    });

    if (typeof description !== "string" || !description.trim()) {
      throw new Error("AI service returned an empty description");
    }

    return res.status(200).json({
      success: true,
      description: description.trim(),
    });
  } catch (error) {
    console.error("[ai] description generation failed", {
      userId: String(req.user?._id || req.user?.id || ""),
      workItemType: normalizedWorkItemType,
      message: error.cause?.message || error.message,
    });

    return res.status(502).json({
      success: false,
      message: "Unable to generate description at the moment.",
    });
  }
});

module.exports = {
  generateWorkItemDescription,
};
