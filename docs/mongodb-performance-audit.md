# MongoDB list-query performance audit

## Verified query and response behavior

- `/api/issues` supports an explicit `view=list` path. It uses `ISSUE_LIST_PROJECTION`, the reduced issue population, and `.lean()`; detail reads remain separate.
- The backlog query is project scoped and sorts by `sprintId`, `planningOrder`, and `createdAt` descending. Its authorization starts from `loadReadableProject` and a project-bound issue query. Issues are populated with the list population and returned read-only.
- The backlog frontend uses `description` for client-side search and displays `description`, `acceptanceCriteria`, and `definitionOfDone` in its inline details drawer. The backlog now has a separate exclusion projection that preserves those fields and removes activity/comment arrays, checklist, linked Git metadata, and bug narrative fields with no consumer in the backlog UI. It uses `.lean()`.
- Story loading filters by accessible `projectId` values, active issue state (`isDeleted: { $ne: true }`), and `type: Story`, then sorts by `{ updatedAt: -1, createdAt: -1 }`. Accessible project IDs are built from tenant/workspace-scoped project access. The story issue query is not tenant filtered directly, but it remains restricted to those authorized project IDs.
- Existing Issue indexes include project/team/status/priority; project/due date; project/sprint/planning order; project/epic/planning order; parent and assignee combinations; project/displayBugId; and deleted/project/status. There is no existing index with the exact key order `{ projectId: 1, type: 1, updatedAt: -1, createdAt: -1 }`. The proposed story-list index is not an exact duplicate. It can still overlap the leading `projectId` prefix of other indexes, adding storage/write cost.
- `isDeleted: { $ne: true }` is not an equality predicate. The proposed compound index uses project and type equality fields before the story sort fields; the deleted predicate may remain a residual filter. With multiple accessible project IDs, MongoDB may also need a merge or in-memory sort. The index remains a candidate until `explain("executionStats")` confirms its value.
- Notification list behavior already selects display fields, sorts newest first, limits to 20, and uses `.lean()`. Its existing recipient/read/creation-time index remains unchanged.
- The project endpoint is shared with detail views, and frontend consumers use its broader project object. No project response projection was added.

## Changes

- Share the issue-list projection for the existing lightweight issue route.
- Add a backlog-specific projection that preserves fields consumed by search and the details drawer; use list population and `.lean()`.
- Declare the candidate story-list compound index in `Issue.js` and provide guarded local target, index inspection, index creation, and explain scripts.
- Fix the notification model mock to support `.select()` and assert the expected production projection.
- Fix company-admin test setup to mock the separate provider-subscription lookup made while returning the company. Add the missing `setHeader` method to the test response adapter. No production auth, subscription, or notification behavior was changed.

## Regression test results

- Focused regression/security selection: 13 passed, 0 failed (`notificationController`, `companyAdminPassword`, `issueListPerformance`, `issueDetailTenantIsolation`, and `bugQueueQuery`).
- Full backend suite: 276 passed, 0 failed.
- Local safety scripts passed `node --check`. The target-check command returned nonzero as intended because the URI database path is `jira_clone` while the application selects `bugtracker`.

## Database safety status

`npm run db:target:check` was run without connecting to MongoDB. It reported a loopback endpoint, no credential disclosure, and no database connection. The URI path is `jira_clone`, while `backend/config/db.js` explicitly selects `bugtracker` for application connections. Because those names do not match, local database isolation is **not verified**. No index inspection, database query, explain, or index creation has been run. Do not proceed until the local endpoint and effective `bugtracker` database are confirmed to be the intended isolated development instance and localhost is confirmed not to be a tunnel to a shared/production host.

## Safe local verification sequence

All scripts below refuse non-loopback endpoints and require explicit confirmation that localhost is not a tunnel. They do not print the URI or credentials. The non-connecting target check is safe to run first:

```powershell
cd backend
npm run db:target:check
```

If it reports a database mismatch, a remote endpoint, or an unknown target, stop. Verify the local MongoDB service and effective database with the local environment owner; do not edit `.env` as part of this optimization. Once isolation is independently established, inspect current Issue indexes:

```powershell
npm run indexes:issues:inspect:local -- --confirm-isolated-local
```

Review the printed key patterns, options, and partial filters. The creation script also checks for an equivalent key pattern and will not add a duplicate. Only after the inspected list confirms the target is absent, create that one index:

```powershell
npm run indexes:performance:local -- --confirm-isolated-local
```

Use the same isolated dataset and a real project ID to capture execution statistics before index creation and again after it:

```powershell
npm run queries:issues:explain:local -- --confirm-isolated-local --project-id=<LOCAL_PROJECT_OBJECT_ID>
```

The explain script reports only metrics and plan stages, not issue contents. It runs two representative queries: active project stories sorted by `updatedAt`/`createdAt`, and active project issues sorted by `createdAt`, both capped at 50 and using the lightweight response projection. For role-specific or additional `view` filters, adapt the query to match the exact API request. Record `nReturned`, `totalKeysExamined`, `totalDocsExamined`, `executionTimeMillis`, index name/stages, and whether a `SORT` stage appears. Run the same queries with the same project, access scope, filters, sort, limit, and data snapshot before and after. These scripts are local-only helpers; do not run them against production or shared databases.

## Measurements and remaining work

No performance gain is claimed. There are no before/after measurements or query plans because the endpoint database path mismatch has not been resolved and the database was not contacted. Once local isolation is verified, use the sequence above and add the captured results here. Review whether the index reduces examined documents/keys enough to justify its ongoing storage and write costs; remove the candidate from the rollout plan if it does not.

Other report/analytics projections and tenant-scoped relationship indexes remain candidates for separate audits. Their aggregation and authorization behavior needs consumer-level review before further projection or index changes.
