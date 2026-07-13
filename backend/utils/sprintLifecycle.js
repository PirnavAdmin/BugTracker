const ACTIVE_SPRINT_STATE = "ACTIVE";
const COMPLETED_SPRINT_STATE = "COMPLETED";
const EXPIRED_SPRINT_STATE = "EXPIRED";

const getSprintState = (sprint) =>
  String(sprint?.state || sprint?.status || "").trim().toUpperCase();

const isOverrideEnabled = (sprint) => Boolean(sprint?.lockOverride?.enabled);

const getSprintEndTime = (sprint) => {
  if (!sprint?.endDate) {
    return Number.NaN;
  }

  return new Date(sprint.endDate).getTime();
};

const hasSprintPastEndDate = (sprint, now = new Date()) => {
  const sprintEndTime = getSprintEndTime(sprint);

  return Number.isFinite(sprintEndTime) && now.getTime() > sprintEndTime;
};

const isSprintExpired = (sprint, now = new Date()) =>
  getSprintState(sprint) === ACTIVE_SPRINT_STATE &&
  !isOverrideEnabled(sprint) &&
  hasSprintPastEndDate(sprint, now);

const isSprintLocked = (sprint, now = new Date()) => {
  const sprintState = getSprintState(sprint);

  return sprintState === COMPLETED_SPRINT_STATE || isSprintExpired(sprint, now);
};

const getSprintLifecycleState = (sprint, now = new Date()) => {
  const sprintState = getSprintState(sprint);

  if (sprintState === COMPLETED_SPRINT_STATE) {
    return COMPLETED_SPRINT_STATE;
  }

  if (isSprintExpired(sprint, now)) {
    return EXPIRED_SPRINT_STATE;
  }

  return sprintState || "PLANNED";
};

const getSprintLockReason = (sprint, now = new Date()) => {
  if (getSprintState(sprint) === COMPLETED_SPRINT_STATE) {
    return "Sprint has already been completed.";
  }

  if (isSprintExpired(sprint, now)) {
    return "Sprint has ended. Create a new sprint to continue working.";
  }

  return "";
};

const buildSprintLifecycleMeta = (sprint, now = new Date()) => ({
  lifecycleState: getSprintLifecycleState(sprint, now),
  isExpired: isSprintExpired(sprint, now),
  isLocked: isSprintLocked(sprint, now),
  lockReason: getSprintLockReason(sprint, now),
});

module.exports = {
  ACTIVE_SPRINT_STATE,
  COMPLETED_SPRINT_STATE,
  EXPIRED_SPRINT_STATE,
  buildSprintLifecycleMeta,
  getSprintLifecycleState,
  getSprintLockReason,
  getSprintState,
  hasSprintPastEndDate,
  isSprintExpired,
  isSprintLocked,
};
