const Issue = require("../models/Issue");
const {
  STORY_COMPLETION_STATUSES,
  calculateStoryProgress,
  deriveStoryStatus,
  getStoryCompletionBlocker,
  isStoryType,
} = require("../utils/storyWorkflow");

const loadStoryChildren = (storyId) =>
  Issue.find({
    parentStoryId: storyId,
    isDeleted: { $ne: true },
  })
    .select("type status priority bugDetails.severity")
    .lean();

const validateStoryCompletion = async (story) => {
  if (
    !isStoryType(story?.type) ||
    !STORY_COMPLETION_STATUSES.includes(String(story?.status || "").toUpperCase())
  ) {
    return "";
  }

  return getStoryCompletionBlocker(story, await loadStoryChildren(story._id));
};

const syncStoryProgress = async (storyId) => {
  if (!storyId) {
    return null;
  }

  const story = await Issue.findOne({
    _id: storyId,
    type: "Story",
    isDeleted: { $ne: true },
  });

  if (!story) {
    return null;
  }

  const progress = calculateStoryProgress(await loadStoryChildren(story._id));
  const nextStatus = deriveStoryStatus(story, progress);
  const update = {
    storyProgress: progress,
    updatedAt: new Date(),
  };

  if (nextStatus !== story.status) {
    update.status = nextStatus;
  }

  await Issue.updateOne({ _id: story._id }, { $set: update });

  return {
    ...progress,
    status: nextStatus,
  };
};

module.exports = {
  loadStoryChildren,
  syncStoryProgress,
  validateStoryCompletion,
};
