const { BUG_STATUS } = require("./bugLifecycle");
const { ISSUE_TYPES } = require("./issueTypes");

const AVAILABLE_BUG_QUEUE_STATUSES = Object.freeze([
  BUG_STATUS.NEW,
  BUG_STATUS.TRIAGED,
  BUG_STATUS.AVAILABLE_QUEUE,
  BUG_STATUS.NEEDS_TRIAGE,
  BUG_STATUS.OPEN,
  BUG_STATUS.REOPEN,
]);

const buildUnassignedBugCondition = () => ({
  assignee: null,
  assignedDeveloperId: null,
  "bugDetails.developerLead": null,
});

const buildBugVisibilityFilter = ({
  accessibleProjectIds = [],
  userTeamIds = [],
} = {}) => {
  const orConditions = [];

  if (accessibleProjectIds.length) {
    orConditions.push({
      projectId: {
        $in: accessibleProjectIds,
      },
    });
  }

  if (userTeamIds.length) {
    orConditions.push({
      teamId: {
        $in: userTeamIds,
      },
    });
  }

  if (!orConditions.length) {
    return {
      _id: {
        $in: [],
      },
    };
  }

  return orConditions.length === 1 ? orConditions[0] : { $or: orConditions };
};

const combineQueryConditions = (visibilityFilter, conditions = {}) => {
  if (visibilityFilter?._id?.$in && !visibilityFilter._id.$in.length) {
    return visibilityFilter;
  }

  if (visibilityFilter?.$or) {
    return {
      $and: [visibilityFilter, conditions],
    };
  }

  return {
    ...visibilityFilter,
    ...conditions,
  };
};

const buildDeveloperBugQueueQuery = ({
  accessibleProjectIds = [],
  userTeamIds = [],
  filters = {},
} = {}) => {
  const visibilityFilter = buildBugVisibilityFilter({
    accessibleProjectIds,
    userTeamIds,
  });

  const queueConditions = {
    $or: [
      {
        type: ISSUE_TYPES.BUG,
        ...buildUnassignedBugCondition(),
        status: {
          $in: AVAILABLE_BUG_QUEUE_STATUSES,
        },
      },
      {
        type: ISSUE_TYPES.STORY,
        assignee: null,
        "bugDetails.addToBucket": true,
        status: {
          $nin: ["DONE", "CLOSED"],
        },
      },
    ],
  };

  const query = combineQueryConditions(visibilityFilter, queueConditions);

  if (filters.projectId) {
    delete query.$or;
    delete query.$and;
    query.projectId = filters.projectId;
    Object.assign(query, queueConditions);
  }

  if (filters.teamId) {
    query.teamId = filters.teamId;
  }

  if (filters.priority) {
    query.priority = filters.priority;
  }

  if (filters.category) {
    query.$and = [
      ...(query.$and || []),
      {
        $or: [
          { type: ISSUE_TYPES.STORY },
          { "bugDetails.category": filters.category },
        ],
      },
    ];
  }

  if (filters.moduleName) {
    query.$and = [
      ...(query.$and || []),
      {
        $or: [
          { type: ISSUE_TYPES.STORY },
          { "bugDetails.moduleName": filters.moduleName },
        ],
      },
    ];
  }

  return query;
};

const summarizeBugQueryFilters = (req = {}) => ({
  projectId: req.query?.projectId || "all",
  teamId: req.query?.teamId || "all",
  priority: req.query?.priority || "all",
  category: req.query?.category || "all",
  moduleName: req.query?.moduleName || "all",
  status: req.query?.status || "all",
  sprintId: req.query?.sprintId || "all",
  sprintState: req.query?.sprintState || "all",
  epicId: req.query?.epicId || "all",
  bucket: req.query?.bucket || "all",
  type: req.query?.type || "all",
  excludeType: req.query?.excludeType || "all",
});

const logBugWorkflowQuery = (scope, payload = {}) => {
  console.log(`[bugs] ${scope}`, payload);
};

module.exports = {
  AVAILABLE_BUG_QUEUE_STATUSES,
  buildBugVisibilityFilter,
  buildDeveloperBugQueueQuery,
  buildUnassignedBugCondition,
  combineQueryConditions,
  logBugWorkflowQuery,
  summarizeBugQueryFilters,
};
