-- CreateTable
CREATE TABLE "Worksheet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "schoolId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subject" TEXT NOT NULL DEFAULT '',
    "instructions" TEXT NOT NULL DEFAULT '',
    "itemsJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Assignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "schoolId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "instructions" TEXT NOT NULL DEFAULT '',
    "dueDate" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 20,
    "type" TEXT NOT NULL DEFAULT 'written',
    "configJson" TEXT NOT NULL DEFAULT '',
    "assignedAt" TEXT NOT NULL DEFAULT '',
    "allowResubmit" BOOLEAN NOT NULL DEFAULT false,
    "resourceFileId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Assignment" ("courseId", "createdAt", "dueDate", "id", "instructions", "points", "schoolId", "title") SELECT "courseId", "createdAt", "dueDate", "id", "instructions", "points", "schoolId", "title" FROM "Assignment";
DROP TABLE "Assignment";
ALTER TABLE "new_Assignment" RENAME TO "Assignment";
CREATE TABLE "new_FileRec" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT,
    "label" TEXT NOT NULL,
    "ext" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "data" BLOB NOT NULL,
    "capturedAt" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_FileRec" ("bytes", "capturedAt", "createdAt", "data", "ext", "id", "label", "mime", "schoolId", "studentId") SELECT "bytes", "capturedAt", "createdAt", "data", "ext", "id", "label", "mime", "schoolId", "studentId" FROM "FileRec";
DROP TABLE "FileRec";
ALTER TABLE "new_FileRec" RENAME TO "FileRec";
CREATE TABLE "new_Submission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "schoolId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "submittedAt" TEXT,
    "responseText" TEXT NOT NULL DEFAULT '',
    "score" INTEGER,
    "feedback" TEXT NOT NULL DEFAULT '',
    "gradedAt" TEXT,
    "answersJson" TEXT NOT NULL DEFAULT '',
    "fileId" TEXT,
    "autoScore" INTEGER,
    "returnedAt" TEXT,
    "revisionNote" TEXT NOT NULL DEFAULT '',
    "draftSavedAt" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Submission" ("assignmentId", "createdAt", "feedback", "gradedAt", "id", "responseText", "schoolId", "score", "status", "studentId", "submittedAt") SELECT "assignmentId", "createdAt", "feedback", "gradedAt", "id", "responseText", "schoolId", "score", "status", "studentId", "submittedAt" FROM "Submission";
DROP TABLE "Submission";
ALTER TABLE "new_Submission" RENAME TO "Submission";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
