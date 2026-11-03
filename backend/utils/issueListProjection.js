// Large narrative and history fields are loaded by issue detail views instead.
module.exports = [
  "-description",
  "-activityLogs",
  "-comments",
  "-acceptanceCriteria",
  "-definitionOfDone",
  "-checklist",
  "-linkedBranches",
  "-linkedPullRequests",
  "-bugDetails.stepsToReproduce",
  "-bugDetails.expectedResult",
  "-bugDetails.actualResult",
  "-bugDetails.reopenReason",
  "-bugDetails.rejectionReason",
].join(" ");
