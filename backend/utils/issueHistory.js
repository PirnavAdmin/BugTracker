const IssueHistory = require("../models/IssueHistory");

const recordIssueHistory = async ({
  issueId,
  projectId,
  actorId,
  eventType,
  field = "",
  fromValue = null,
  toValue = null,
  meta = {},
  session,
}) => {
  if (!issueId || !projectId || !actorId || !eventType) {
    return null;
  }

  const [entry] = await IssueHistory.create(
    [
      {
        issueId,
        projectId,
        actorId,
        eventType,
        field,
        fromValue,
        toValue,
        meta,
      },
    ],
    session ? { session } : undefined
  );

  return entry;
};

module.exports = {
  recordIssueHistory,
};
