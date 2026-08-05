-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Invoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "periodStart" TEXT NOT NULL,
    "periodEnd" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "status" TEXT NOT NULL,
    "narrative" TEXT NOT NULL DEFAULT '',
    "narrativeSource" TEXT NOT NULL DEFAULT 'template',
    "evidenceScore" INTEGER NOT NULL DEFAULT 0,
    "railId" TEXT,
    "submittedAt" TEXT,
    "approvedAt" TEXT,
    "paidAt" TEXT,
    "rejectedAt" TEXT,
    "rejectionReason" TEXT NOT NULL DEFAULT '',
    "rejectionCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Invoice" ("amount", "createdAt", "evidenceScore", "id", "narrative", "narrativeSource", "paidAt", "periodEnd", "periodStart", "railId", "schoolId", "status", "studentId", "submittedAt") SELECT "amount", "createdAt", "evidenceScore", "id", "narrative", "narrativeSource", "paidAt", "periodEnd", "periodStart", "railId", "schoolId", "status", "studentId", "submittedAt" FROM "Invoice";
DROP TABLE "Invoice";
ALTER TABLE "new_Invoice" RENAME TO "Invoice";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
