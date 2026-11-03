// Backlog cards and the inline details drawer consume description and story
// acceptance criteria, so only fields unused by that view are excluded.
module.exports = [
  "-activityLogs",
  "-comments",
  "-checklist",
  "-linkedBranches",
  "-linkedPullRequests",
  "-bugDetails.stepsToReproduce",
  "-bugDetails.expectedResult",
  "-bugDetails.actualResult",
  "-bugDetails.reopenReason",
  "-bugDetails.rejectionReason",
].join(" ");
