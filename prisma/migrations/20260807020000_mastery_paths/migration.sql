-- CreateTable
CREATE TABLE "PathRule" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "minPct" INTEGER NOT NULL DEFAULT 0,
    "maxPct" INTEGER NOT NULL DEFAULT 100,
    "thenAssignmentId" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PathRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PathRule_schoolId_idx" ON "PathRule"("schoolId");

-- CreateIndex
CREATE INDEX "PathRule_assignmentId_idx" ON "PathRule"("assignmentId");

-- AlterTable: why a piece of work was auto-assigned, in the teacher's words.
ALTER TABLE "Submission" ADD COLUMN "assignedReason" TEXT NOT NULL DEFAULT '';

-- Row Level Security: enabled with no policies, matching every other table.
ALTER TABLE "PathRule" ENABLE ROW LEVEL SECURITY;
