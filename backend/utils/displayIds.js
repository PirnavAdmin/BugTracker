const escapeRegExp = (value = "") =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const normalizeShortCode = (value = "") =>
  String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6);

const deriveProjectShortCode = (projectName = "") => {
  const words = String(projectName || "")
    .trim()
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);

  const initials = words
    .map((word) => word[0])
    .join("");
  const compactName = words.join("");

  return normalizeShortCode(initials.length >= 2 ? initials : compactName) || "PRJ";
};

const buildDisplayId = (shortCode, sequence) =>
  `${normalizeShortCode(shortCode) || "PRJ"}-${String(Math.max(Number(sequence) || 1, 1)).padStart(
    3,
    "0"
  )}`;

const createUniqueProjectShortCode = async ({
  Project,
  name,
  workspaceId,
  excludeProjectId = null,
}) => {
  const baseCode = deriveProjectShortCode(name);

  for (let index = 0; index < 100; index += 1) {
    const suffix = index ? String(index + 1) : "";
    const candidate = normalizeShortCode(`${baseCode}${suffix}`);
    const existingProject = await Project.findOne({
      shortCode: candidate,
      workspaceId,
      ...(excludeProjectId
        ? {
            _id: {
              $ne: excludeProjectId,
            },
          }
        : {}),
    })
      .select("_id")
      .lean();

    if (!existingProject) {
      return candidate;
    }
  }

  return normalizeShortCode(`${baseCode}${Date.now().toString(36)}`);
};

const ensureProjectShortCode = async ({ Project, project }) => {
  const existingShortCode = normalizeShortCode(project?.shortCode);

  if (existingShortCode) {
    return existingShortCode;
  }

  const shortCode = await createUniqueProjectShortCode({
    Project,
    name: project?.name || "",
    workspaceId: project?.workspaceId,
    excludeProjectId: project?._id,
  });

  await Project.updateOne(
    {
      _id: project._id,
    },
    {
      $set: {
        shortCode,
      },
    }
  );

  project.shortCode = shortCode;
  return shortCode;
};

const getMaxDisplaySequenceForProject = async ({ Issue, projectId, shortCode }) => {
  const prefix = normalizeShortCode(shortCode) || "PRJ";
  const displayIdPattern = new RegExp(`^${escapeRegExp(prefix)}-(\\d+)$`, "i");
  const existingIssues = await Issue.find({
    projectId,
    displayBugId: displayIdPattern,
  })
    .select("displayBugId")
    .lean();

  return existingIssues.reduce((maxSequence, issue) => {
    const match = String(issue.displayBugId || "").match(displayIdPattern);
    const sequence = match ? Number.parseInt(match[1], 10) : 0;

    return Number.isFinite(sequence) ? Math.max(maxSequence, sequence) : maxSequence;
  }, 0);
};

const initializeProjectSequence = async ({ Project, Issue, project, shortCode }) => {
  const currentSequence = Number(project?.issueSequence || 0);

  const [maxDisplaySequence, issueCount] = await Promise.all([
    getMaxDisplaySequenceForProject({
      Issue,
      projectId: project._id,
      shortCode,
    }),
    Issue.countDocuments({
      projectId: project._id,
      isDeleted: { $ne: true },
    }),
  ]);
  const baselineSequence = Math.max(currentSequence, maxDisplaySequence, issueCount);

  if (baselineSequence > currentSequence) {
    await Project.updateOne(
      {
        _id: project._id,
      },
      {
        $max: {
          issueSequence: baselineSequence,
        },
      }
    );

    if (project) {
      project.issueSequence = baselineSequence;
    }
  }

  return baselineSequence;
};

const getNextIssueDisplayId = async ({ Project, Issue, project }) => {
  const shortCode = await ensureProjectShortCode({
    Project,
    project,
  });

  await initializeProjectSequence({
    Project,
    Issue,
    project,
    shortCode,
  });

  const updatedProject = await Project.findOneAndUpdate(
    {
      _id: project._id,
    },
    {
      $inc: {
        issueSequence: 1,
      },
      $set: {
        shortCode,
      },
    },
    {
      new: true,
      projection: {
        shortCode: 1,
        issueSequence: 1,
      },
    }
  ).lean();

  return buildDisplayId(
    updatedProject?.shortCode || shortCode,
    updatedProject?.issueSequence || 1
  );
};

module.exports = {
  buildDisplayId,
  createUniqueProjectShortCode,
  deriveProjectShortCode,
  ensureProjectShortCode,
  getNextIssueDisplayId,
  normalizeShortCode,
};
