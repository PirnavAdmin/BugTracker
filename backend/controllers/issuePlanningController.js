const fs = require("fs");
const path = require("path");
const multer = require("multer");
const { getS3ObjectStream, uploadToS3 } = require("../utils/s3");
const mongoose = require("mongoose");
const Comment = require("../models/Comment");
const Epic = require("../models/Epic");
const Issue = require("../models/Issue");
const IssueAttachment = require("../models/IssueAttachment");
const IssueHistory = require("../models/IssueHistory");
const IssueWorklog = require("../models/IssueWorklog");
const Sprint = require("../models/Sprint");
const TeamMember = require("../models/TeamMember");
const User = require("../models/User");
const { scheduleIssueStateNotifications } = require("../services/sprintNotificationService");
const asyncHandler = require("../utils/asyncHandler");
const {
  canManageProjectPlanning,
  loadReadableIssue,
  loadReadableProject,
} = require("../utils/backlogAccess");
const { recordIssueHistory } = require("../utils/issueHistory");
const {
  buildRenumberOperations,
  getNextPlanningOrder,
  getPlanningOrderByIndex,
} = require("../utils/planningOrder");
const {
  buildPlanningIssueTypeQuery,
  isPlanningIssueType,
} = require("../utils/planningIssueTypes");
const { normalizeWorkspaceId } = require("../utils/workspace");
const { ISSUE_TYPES } = require("../utils/issueTypes");

const attachmentsRoot = path.resolve(__dirname, "..", "uploads", "issue-attachments");
fs.mkdirSync(attachmentsRoot, {
  recursive: true,
});

const attachmentStorage = multer.memoryStorage();

const uploadIssueAttachmentMiddleware = multer({
  storage: attachmentStorage,
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
}).single("file");

const getActorId = (user) => user?.id || user?._id;

const formatAttachment = (attachment) => ({
  ...(typeof attachment?.toObject === "function" ? attachment.toObject() : attachment),
  downloadUrl:
    typeof attachment?.storagePath === "string" && attachment.storagePath.trim()
      ? attachment.storagePath
      : "",
});

const ensurePlanningAccessForIssue = async (user, issueId) => {
  const issue = await Issue.findById(issueId);

  if (!issue) {
    return {
      error: {
        status: 404,
        message: "Issue not found",
      },
    };
  }

  const project = await loadReadableProject(user, issue.projectId);

  if (!project) {
    return {
      error: {
        status: 404,
        message: "Project not found or inaccessible",
      },
    };
  }

  if (!canManageProjectPlanning(user, project)) {
    return {
      error: {
        status: 403,
        message: "You do not have permission to update planning for this issue",
      },
    };
  }

  if (!isPlanningIssueType(issue.type)) {
    return {
      error: {
        status: 400,
        message: "Only planning work items can be moved through backlog planning",
      },
    };
  }

  return {
    issue,
    project,
  };
};

const ensureAssigneeBelongsToTeam = async ({ assigneeId, teamId, workspaceId }) => {
  if (!assigneeId) {
    return {
      assignee: null,
    };
  }

  if (!teamId) {
    return {
      error: {
        status: 400,
        message: "Select a team before assigning this issue",
      },
    };
  }

  if (!mongoose.isValidObjectId(assigneeId)) {
    return {
      error: {
        status: 400,
        message: "Invalid assignee id",
      },
    };
  }

  const assignee = await User.findOne({
    _id: assigneeId,
    workspaceId: normalizeWorkspaceId(workspaceId),
  })
    .select("_id name role workspaceId")
    .lean();

  if (!assignee) {
    return {
      error: {
        status: 404,
        message: "Selected assignee could not be found",
      },
    };
  }

  const teamMembership = await TeamMember.findOne({
    teamId,
    userId: assigneeId,
  })
    .select("_id")
    .lean();

  if (!teamMembership) {
    return {
      error: {
        status: 400,
        message: "Selected assignee is not a member of the selected team",
      },
    };
  }

  return {
    assignee,
  };
};

const ensureEpicForProject = async ({ epicId, projectId }) => {
  if (!epicId) {
    return {
      epic: null,
    };
  }

  if (!mongoose.isValidObjectId(epicId)) {
    return {
      error: {
        status: 400,
        message: "Invalid epic id",
      },
    };
  }

  const epic = await Epic.findOne({
    _id: epicId,
    projectId,
  })
    .select("_id name")
    .lean();

  if (!epic) {
    return {
      error: {
        status: 404,
        message: "Selected epic could not be found in this project",
      },
    };
  }

  return {
    epic,
  };
};

const ensureSprintForIssue = async ({ sprintId, projectId, teamId }) => {
  if (!sprintId) {
    return {
      sprint: null,
    };
  }

  if (!mongoose.isValidObjectId(sprintId)) {
    return {
      error: {
        status: 400,
        message: "Invalid sprint id",
      },
    };
  }

  const sprint = await Sprint.findOne({
    _id: sprintId,
    projectId,
  })
    .select("_id name teamId state")
    .lean();

  if (!sprint) {
    return {
      error: {
        status: 404,
        message: "Selected sprint could not be found in this project",
      },
    };
  }

  if (sprint.state === "COMPLETED") {
    return {
      error: {
        status: 400,
        message: "Completed sprints cannot receive new issues",
      },
    };
  }

  if (sprint.teamId && String(sprint.teamId) !== String(teamId || "")) {
    return {
      error: {
        status: 400,
        message: "This issue team does not match the selected sprint scope",
      },
    };
  }

  return {
    sprint,
  };
};

const appendToContainer = (items = [], movingIssue, beforeIssueId, afterIssueId) => {
  const remainingItems = items.filter(
    (item) => String(item._id) !== String(movingIssue._id)
  );
  let insertIndex = remainingItems.length;

  if (afterIssueId) {
    const afterIndex = remainingItems.findIndex(
      (item) => String(item._id) === String(afterIssueId)
    );

    if (afterIndex >= 0) {
      insertIndex = afterIndex;
    }
  } else if (beforeIssueId) {
    const beforeIndex = remainingItems.findIndex(
      (item) => String(item._id) === String(beforeIssueId)
    );

    if (beforeIndex >= 0) {
      insertIndex = beforeIndex + 1;
    }
  }

  return [
    ...remainingItems.slice(0, insertIndex),
    movingIssue,
    ...remainingItems.slice(insertIndex),
  ];
};

const buildContainerQuery = (projectId, sprintId) => ({
  projectId,
  sprintId: sprintId || null,
  type: ISSUE_TYPES.STORY,
});

const updateIssuePlanning = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400);
    throw new Error("Invalid issue id");
  }

  const accessResult = await ensurePlanningAccessForIssue(req.user, req.params.id);

  if (accessResult.error) {
    res.status(accessResult.error.status);
    throw new Error(accessResult.error.message);
  }

  const { issue, project } = accessResult;

  if (
    (Object.prototype.hasOwnProperty.call(req.body, "sprintId") ||
      Object.prototype.hasOwnProperty.call(req.body, "planningOrder")) &&
    issue.type !== ISSUE_TYPES.STORY
  ) {
    res.status(400);
    throw new Error("Sprint planning is performed at Story level");
  }
  const workspaceId = normalizeWorkspaceId(req.user.workspaceId);
  const previousSprintId = issue.sprintId ? String(issue.sprintId) : "";
  const previousAssigneeId = issue.assignee ? String(issue.assignee) : "";
  const nextValues = {};

  if (Object.prototype.hasOwnProperty.call(req.body, "epicId")) {
    const epicResult = await ensureEpicForProject({
      epicId: req.body.epicId || null,
      projectId: issue.projectId,
    });

    if (epicResult.error) {
      res.status(epicResult.error.status);
      throw new Error(epicResult.error.message);
    }

    nextValues.epicId = epicResult.epic?._id || null;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "sprintId")) {
    const sprintResult = await ensureSprintForIssue({
      sprintId: req.body.sprintId || null,
      projectId: issue.projectId,
      teamId: issue.teamId,
    });

    if (sprintResult.error) {
      res.status(sprintResult.error.status);
      throw new Error(sprintResult.error.message);
    }

    nextValues.sprintId = sprintResult.sprint?._id || null;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "assigneeId")) {
    const assigneeResult = await ensureAssigneeBelongsToTeam({
      assigneeId: req.body.assigneeId || null,
      teamId: issue.teamId,
      workspaceId,
    });

    if (assigneeResult.error) {
      res.status(assigneeResult.error.status);
      throw new Error(assigneeResult.error.message);
    }

    nextValues.assignee = assigneeResult.assignee?._id || null;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "priority")) {
    nextValues.priority = req.body.priority;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "storyPoints")) {
    const storyPoints =
      req.body.storyPoints === null || req.body.storyPoints === ""
        ? null
        : Number(req.body.storyPoints);

    if (storyPoints !== null && (!Number.isFinite(storyPoints) || storyPoints < 0)) {
      res.status(400);
      throw new Error("Story points must be a positive number or empty");
    }

    nextValues.storyPoints = storyPoints;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "planningOrder")) {
    const planningOrder = Number(req.body.planningOrder);

    if (!Number.isFinite(planningOrder) || planningOrder < 0) {
      res.status(400);
      throw new Error("Planning order must be a positive number");
    }

    nextValues.planningOrder = planningOrder;
  }

  const historyPromises = Object.entries(nextValues).map(([field, nextValue]) =>
    recordIssueHistory({
      issueId: issue._id,
      projectId: issue.projectId,
      actorId: getActorId(req.user),
      eventType: "PLANNING_UPDATED",
      field,
      fromValue: issue[field] ?? null,
      toValue: nextValue,
      meta: {
        issueTitle: issue.title,
        projectName: project.name,
      },
    })
  );

  Object.entries(nextValues).forEach(([field, value]) => {
    issue[field] = value;
  });

  await issue.save();
  await Promise.all(historyPromises);

  try {
    const notificationResult = await scheduleIssueStateNotifications({
      issueId: issue._id,
      previousSprintId,
      previousAssigneeId,
      actorUserId: getActorId(req.user),
    });

    console.info("[sprint-notifications] planning update evaluated", {
      issueId: String(issue._id),
      queued: Number(notificationResult?.queued || 0),
      skipped: notificationResult?.skipped || "",
    });
  } catch (error) {
    console.error("[sprint-notifications] planning update notification evaluation failed", {
      issueId: String(issue._id),
      message: error.message,
    });
  }

  res.status(200).json(issue);
});

const moveIssueToSprint = asyncHandler(async (req, res) => {
  req.body = {
    ...req.body,
    sprintId: req.body?.sprintId || null,
  };

  return updateIssuePlanning(req, res);
});

const removeIssueFromSprint = asyncHandler(async (req, res) => {
  req.body = {
    sprintId: null,
  };

  return updateIssuePlanning(req, res);
});

const reorderIssuePlanning = asyncHandler(async (req, res) => {
  const { issueId, destinationSprintId = null, beforeIssueId = "", afterIssueId = "" } =
    req.body || {};

  if (!issueId || !mongoose.isValidObjectId(issueId)) {
    res.status(400);
    throw new Error("A valid issue id is required");
  }

  const accessResult = await ensurePlanningAccessForIssue(req.user, issueId);

  if (accessResult.error) {
    res.status(accessResult.error.status);
    throw new Error(accessResult.error.message);
  }

  const { issue, project } = accessResult;

  if (issue.type !== ISSUE_TYPES.STORY) {
    res.status(400);
    throw new Error("Only Stories can be moved in Sprint Planning");
  }
  const sprintResult = await ensureSprintForIssue({
    sprintId: destinationSprintId || null,
    projectId: issue.projectId,
    teamId: issue.teamId,
  });

  if (sprintResult.error) {
    res.status(sprintResult.error.status);
    throw new Error(sprintResult.error.message);
  }

  const sourceSprintId = issue.sprintId ? String(issue.sprintId) : "";
  const previousAssigneeId = issue.assignee ? String(issue.assignee) : "";
  const nextSprintId = sprintResult.sprint ? String(sprintResult.sprint._id) : "";
  const [sourceIssues, destinationIssues] = await Promise.all([
    Issue.find(buildContainerQuery(issue.projectId, sourceSprintId || null)).sort({
      planningOrder: 1,
      createdAt: 1,
    }),
    String(sourceSprintId) === String(nextSprintId)
      ? Promise.resolve([])
      : Issue.find(buildContainerQuery(issue.projectId, nextSprintId || null)).sort({
          planningOrder: 1,
          createdAt: 1,
        }),
  ]);
  const movingIssue =
    sourceIssues.find((candidate) => String(candidate._id) === String(issueId)) || issue;
  const nextDestinationBase =
    String(sourceSprintId) === String(nextSprintId) ? sourceIssues : destinationIssues;
  const insertedDestinationIssues = appendToContainer(
    nextDestinationBase,
    movingIssue,
    beforeIssueId,
    afterIssueId
  );
  const sourceContainerWithoutMoving = sourceIssues.filter(
    (candidate) => String(candidate._id) !== String(issueId)
  );
  const bulkOperations = [];

  if (String(sourceSprintId) !== String(nextSprintId)) {
    bulkOperations.push(...buildRenumberOperations(sourceContainerWithoutMoving));
  }

  insertedDestinationIssues.forEach((candidate, index) => {
    bulkOperations.push({
      updateOne: {
        filter: {
          _id: candidate._id,
        },
        update: {
          $set: {
            planningOrder: getPlanningOrderByIndex(index),
            ...(String(candidate._id) === String(issueId)
              ? { sprintId: sprintResult.sprint?._id || null }
              : {}),
          },
        },
      },
    });
  });

  if (bulkOperations.length) {
    await Issue.bulkWrite(bulkOperations);
  }

  await recordIssueHistory({
    issueId: issue._id,
    projectId: issue.projectId,
    actorId: getActorId(req.user),
    eventType: "PLANNING_REORDERED",
    field: "planningOrder",
    fromValue: issue.planningOrder,
    toValue: insertedDestinationIssues.findIndex(
      (candidate) => String(candidate._id) === String(issueId)
    ),
    meta: {
      sprintChanged: String(sourceSprintId) !== String(nextSprintId),
      fromSprintId: sourceSprintId || null,
      toSprintId: nextSprintId || null,
      projectName: project.name,
    },
  });

  const updatedIssue = await Issue.findById(issueId);

  try {
    const notificationResult = await scheduleIssueStateNotifications({
      issueId,
      previousSprintId: sourceSprintId,
      previousAssigneeId,
      actorUserId: getActorId(req.user),
    });

    console.info("[sprint-notifications] planning reorder evaluated", {
      issueId: String(issueId),
      queued: Number(notificationResult?.queued || 0),
      skipped: notificationResult?.skipped || "",
    });
  } catch (error) {
    console.error("[sprint-notifications] planning reorder notification evaluation failed", {
      issueId: String(issueId),
      message: error.message,
    });
  }

  res.status(200).json({
    message: "Issue planning updated successfully",
    issue: updatedIssue,
  });
});

const getIssueAttachments = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400);
    throw new Error("Invalid issue id");
  }

  const issue = await loadReadableIssue(req.user, req.params.id);

  if (!issue) {
    res.status(404);
    throw new Error("Issue not found or inaccessible");
  }

  const attachments = await IssueAttachment.find({
    issueId: issue._id,
  })
    .populate("uploadedBy", "name email role")
    .sort({
      createdAt: -1,
    });

  res.status(200).json(attachments.map(formatAttachment));
});

const uploadIssueAttachment = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400);
    throw new Error("Invalid issue id");
  }

  const issue = await loadReadableIssue(req.user, req.params.id);

  if (!issue) {
    res.status(404);
    throw new Error("Issue not found or inaccessible");
  }

  if (!req.file) {
    res.status(400);
    throw new Error("Select a file to upload");
  }

  const attachment = await IssueAttachment.create({
  issueId: issue._id,
  uploadedBy: req.user._id,
  fileName: req.file.originalname,
  mimeType: req.file.mimetype,
  sizeBytes: req.file.size,
  storagePath: await uploadToS3(
    req.file,
    "issue-attachments"
  ),
});

  await attachment.populate("uploadedBy", "name email role");
  await recordIssueHistory({
    issueId: issue._id,
    projectId: issue.projectId,
    actorId: req.user._id,
    eventType: "ATTACHMENT_UPLOADED",
    field: "attachment",
    fromValue: null,
    toValue: attachment.fileName,
    meta: {
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
    },
  });

  res.status(201).json(formatAttachment(attachment));
});

const getIssueWorklogs = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400);
    throw new Error("Invalid issue id");
  }

  const issue = await loadReadableIssue(req.user, req.params.id);

  if (!issue) {
    res.status(404);
    throw new Error("Issue not found or inaccessible");
  }

  const worklogs = await IssueWorklog.find({
    issueId: issue._id,
  })
    .populate("userId", "name email role")
    .populate("sprintId", "name state")
    .sort({
      loggedAt: -1,
      createdAt: -1,
    });

  res.status(200).json(worklogs);
});

const createIssueWorklog = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400);
    throw new Error("Invalid issue id");
  }

  const issue = await loadReadableIssue(req.user, req.params.id);

  if (!issue) {
    res.status(404);
    throw new Error("Issue not found or inaccessible");
  }

  const minutes = Number(req.body?.minutes);
  const loggedAt = req.body?.loggedAt ? new Date(req.body.loggedAt) : new Date();

  if (!Number.isFinite(minutes) || minutes <= 0) {
    res.status(400);
    throw new Error("Logged minutes must be greater than zero");
  }

  if (Number.isNaN(loggedAt.getTime())) {
    res.status(400);
    throw new Error("Invalid logged date");
  }

  const worklog = await IssueWorklog.create({
    issueId: issue._id,
    userId: req.user._id,
    minutes,
    note: typeof req.body?.note === "string" ? req.body.note.trim() : "",
    loggedAt,
    sprintId: issue.sprintId || null,
  });

  await worklog.populate("userId", "name email role");
  await worklog.populate("sprintId", "name state");
  await recordIssueHistory({
    issueId: issue._id,
    projectId: issue.projectId,
    actorId: req.user._id,
    eventType: "WORKLOG_ADDED",
    field: "worklog",
    fromValue: null,
    toValue: minutes,
    meta: {
      note: worklog.note,
      loggedAt: worklog.loggedAt,
      sprintId: worklog.sprintId?._id || null,
    },
  });

  res.status(201).json(worklog);
});

const getIssueHistory = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400);
    throw new Error("Invalid issue id");
  }

  const issue = await loadReadableIssue(req.user, req.params.id);

  if (!issue) {
    res.status(404);
    throw new Error("Issue not found or inaccessible");
  }

  const history = await IssueHistory.find({
    issueId: issue._id,
  })
    .populate("actorId", "name email role")
    .sort({
      createdAt: -1,
    });

  res.status(200).json(history);
});

const suggestIssuePriority = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400);
    throw new Error("Invalid issue id");
  }

  const issue = await loadReadableIssue(req.user, req.params.id);

  if (!issue) {
    res.status(404);
    throw new Error("Issue not found or inaccessible");
  }

  const suggestedPriority = String(req.body?.priority || "")
    .trim()
    .replace(/^./, (value) => value.toUpperCase())
    .replace(/\s+/g, "");

  if (!["Low", "Medium", "High", "Critical"].includes(suggestedPriority)) {
    res.status(400);
    throw new Error("Suggested priority must be Low, Medium, High, or Critical");
  }

  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  const comment = await Comment.create({
    issueId: issue._id,
    userId: req.user._id,
    comment: reason
      ? `Suggested priority: ${suggestedPriority}. Reason: ${reason}`
      : `Suggested priority: ${suggestedPriority}.`,
  });

  await comment.populate("userId", "name email role");
  await recordIssueHistory({
    issueId: issue._id,
    projectId: issue.projectId,
    actorId: req.user._id,
    eventType: "PRIORITY_SUGGESTED",
    field: "priority",
    fromValue: issue.priority,
    toValue: suggestedPriority,
    meta: {
      reason,
    },
  });

  res.status(201).json({
    message: "Priority suggestion added",
    comment,
  });
});

const downloadIssueAttachment = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.issueId)) {
    res.status(400);
    throw new Error("Invalid issue id");
  }

  if (!mongoose.isValidObjectId(req.params.attachmentId)) {
    res.status(400);
    throw new Error("Invalid attachment id");
  }

  // Verify user has access to the issue
  const issue = await loadReadableIssue(req.user, req.params.issueId);

  if (!issue) {
    res.status(404);
    throw new Error("Issue not found or inaccessible");
  }

  // Find the attachment
  const attachment = await IssueAttachment.findById(req.params.attachmentId);

  if (!attachment) {
    res.status(404);
    throw new Error("Attachment not found");
  }

  // Verify attachment belongs to this issue
  if (attachment.issueId.toString() !== issue._id.toString()) {
    res.status(403);
    throw new Error("Attachment does not belong to this issue");
  }

  // Set response headers
  res.setHeader("Content-Type", attachment.mimeType || "application/octet-stream");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${encodeURIComponent(attachment.fileName)}"`
  );
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  const isRemoteStorage = /^https?:\/\//i.test(String(attachment.storagePath || ""));
  let fileStream;

  if (isRemoteStorage) {
    fileStream = await getS3ObjectStream(attachment.storagePath);
  } else {
    const filePath = path.resolve(
      __dirname,
      "..",
      "uploads",
      "issue-attachments",
      path.basename(attachment.storagePath)
    );

    if (!fs.existsSync(filePath)) {
      res.status(404);
      throw new Error("File not found on disk");
    }

    fileStream = fs.createReadStream(filePath);
  }

  fileStream.pipe(res);

  fileStream.on("error", (error) => {
    console.error("File stream error:", error);
    if (!res.headersSent) {
      res.status(500).json({ message: "Error downloading file" });
    }
  });
});

module.exports = {
  uploadIssueAttachmentMiddleware,
  updateIssuePlanning,
  moveIssueToSprint,
  removeIssueFromSprint,
  reorderIssuePlanning,
  getIssueAttachments,
  uploadIssueAttachment,
  downloadIssueAttachment,
  getIssueWorklogs,
  createIssueWorklog,
  getIssueHistory,
  suggestIssuePriority,
};
