const test = require("node:test");
const assert = require("node:assert/strict");
const { buildReport } = require("../scripts/reconcileStorage");
const object = (Key, Size) => ({ Key, Size });

test("legacy issue ownership resolves through issue and project while explicit ownership wins", () => {
  const report = buildReport({ objects: [object("issue-attachments/a", 12), object("issue-attachments/b", 4)], issueAttachments: [{ issueId: "i", storagePath: "issue-attachments/a", sizeBytes: 12 }, { tenantId: "TENANT_002", storagePath: "issue-attachments/b", sizeBytes: 4 }], issues: [{ _id: "i", projectId: "p" }], projects: [{ _id: "p", tenantId: "TENANT_001" }] });
  assert.equal(report.tenantBreakdown.TENANT_001.issueObjects, 1); assert.equal(report.tenantBreakdown.TENANT_002.issueObjects, 1);
});
test("legacy chat ownership resolves only from sender and unknown ownership remains unmapped", () => {
  const report = buildReport({ objects: [object("chat-attachments/a", 7), object("chat-attachments/b", 8)], messages: [{ senderId: "u", attachments: [{ fileUrl: "chat-attachments/a", size: 7 }] }, { senderId: "none", attachments: [{ url: "chat-attachments/b", size: 8 }] }], users: [{ _id: "u", tenantId: "TENANT_001" }] });
  assert.equal(report.tenantBreakdown.TENANT_001.chatObjects, 1); assert.equal(report.unmappedDatabaseRecords.objects, 1);
});
test("missing, orphan, folder marker, unknown object, and size mismatch are separated", () => {
  const report = buildReport({ objects: [object("issue-attachments/orphan", 3), object("avatars/", 0), object("issue-attachments/mismatch", 9), object("backups/db.gz", 4), object("unknown.dat", 2)], issueAttachments: [{ tenantId: "TENANT_001", storagePath: "issue-attachments/missing", sizeBytes: 6 }, { tenantId: "TENANT_002", storagePath: "issue-attachments/mismatch", sizeBytes: 5 }] });
  assert.deepEqual(report.missingS3Objects, { objects: 1, bytes: 6 }); assert.deepEqual(report.orphanS3Objects, { objects: 1, bytes: 3 }); assert.equal(report.s3.avatars.objects, 0); assert.deepEqual(report.databaseS3SizeMismatches, { count: 1, bytes: 4 }); assert.equal(report.backupObjects.objects, 1); assert.equal(report.otherPlatformObjects.objects, 1);
});
