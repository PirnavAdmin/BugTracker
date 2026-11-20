const Issue = require("../models/Issue");
const Project = require("../models/Project");
const {
  buildDisplayId,
  ensureProjectShortCode,
  normalizeShortCode,
} = require("./displayIds");

const parseDisplaySequence = (displayId = "", shortCode = "") => {
  const normalizedShortCode = normalizeShortCode(shortCode);
  const match = String(displayId || "").match(/^([A-Z0-9]+)-(\d+)$/i);

  if (!match || normalizeShortCode(match[1]) !== normalizedShortCode) {
    return 0;
  }

  const sequence = Number.parseInt(match[2], 10);

  return Number.isFinite(sequence) ? sequence : 0;
};

const backfillProjectIssueDisplayIds = async (project) => {
  const shortCode = await ensureProjectShortCode({
    Project,
    project,
  });
  const issues = await Issue.find({
    projectId: project._id,
    isDeleted: { $ne: true },
  })
    .select("_id title displayBugId type status priority assignee createdAt")
    .sort({
      createdAt: 1,
      _id: 1,
    })
    .lean();

  const seenSequences = new Map();
  const usedSequences = new Set();
  const operations = [];
  const issuesNeedingNewId = [];
  let maxSequence = Number(project.issueSequence || 0);

  // 1. Scan existing displayBugIds and identify duplicates
  for (const issue of issues) {
    const sequence = parseDisplaySequence(issue.displayBugId, shortCode);

    if (!sequence) {
      issuesNeedingNewId.push(issue);
      continue;
    }

    if (seenSequences.has(sequence)) {
      const primaryIssue = seenSequences.get(sequence);
      const isClone =
        String(issue.title || "").trim().toLowerCase() ===
          String(primaryIssue.title || "").trim().toLowerCase() &&
        issue.type === primaryIssue.type;

      if (isClone) {
        operations.push({
          updateOne: {
            filter: { _id: issue._id },
            update: {
              $set: {
                isDeleted: true,
                deletedReason: "automatic_duplicate_deduplication",
              },
            },
          },
        });
      } else {
        issuesNeedingNewId.push(issue);
      }
    } else {
      seenSequences.set(sequence, issue);
      usedSequences.add(sequence);
      maxSequence = Math.max(maxSequence, sequence);
    }
  }

  // 2. Assign unique IDs to issues needing a new or backfilled displayBugId
  let nextSequence = 1;
  for (const issue of issuesNeedingNewId) {
    while (usedSequences.has(nextSequence)) {
      nextSequence += 1;
    }

    const displayBugId = buildDisplayId(shortCode, nextSequence);
    operations.push({
      updateOne: {
        filter: { _id: issue._id },
        update: {
          $set: {
            displayBugId,
          },
        },
      },
    });

    usedSequences.add(nextSequence);
    maxSequence = Math.max(maxSequence, nextSequence);
    nextSequence += 1;
  }

  if (operations.length) {
    await Issue.bulkWrite(operations, {
      ordered: true,
    });
  }

  if (maxSequence) {
    await Project.updateOne(
      {
        _id: project._id,
      },
      {
        $max: {
          issueSequence: maxSequence,
        },
      }
    );
  }

  return operations.length;
};

const syncIssueDisplayIds = async () => {
  const projects = await Project.find({})
    .select("_id name workspaceId shortCode issueSequence createdAt")
    .sort({
      createdAt: 1,
      _id: 1,
    });

  // Consolidate duplicate projects with the exact same name in the same workspace
  const projectsByWorkspaceAndName = new Map();
  for (const project of projects) {
    const key = `${project.workspaceId || ""}-${String(project.name || "").trim().toLowerCase()}`;
    if (!projectsByWorkspaceAndName.has(key)) {
      projectsByWorkspaceAndName.set(key, []);
    }
    projectsByWorkspaceAndName.get(key).push(project);
  }

  for (const [, projectGroup] of projectsByWorkspaceAndName) {
    if (projectGroup.length > 1) {
      const canonicalProject = projectGroup[0];
      for (let index = 1; index < projectGroup.length; index += 1) {
        const secondaryProject = projectGroup[index];
        await Issue.updateMany(
          { projectId: secondaryProject._id },
          { $set: { projectId: canonicalProject._id } }
        );
      }
    }
  }

  let updatedIssueCount = 0;

  for (const project of projects) {
    updatedIssueCount += await backfillProjectIssueDisplayIds(project);
  }

  if (updatedIssueCount) {
    console.log(`[startup] Backfilled/deduplicated ${updatedIssueCount} issue display id(s)`);
  }

  try {
    await Issue.collection.createIndex(
      { projectId: 1, displayBugId: 1 },
      {
        unique: true,
        partialFilterExpression: {
          isDeleted: { $ne: true },
          displayBugId: { $type: "string" },
        },
        background: true,
      }
    );
  } catch (indexError) {
    console.warn("displayBugId unique index notice:", indexError.message);
  }
};

module.exports = syncIssueDisplayIds;
