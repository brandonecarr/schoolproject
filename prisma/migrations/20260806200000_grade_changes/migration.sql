-- CreateTable
CREATE TABLE "GradeChange" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "oldScore" INTEGER,
    "newScore" INTEGER,
    "changedById" TEXT NOT NULL,
    "changedByName" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "at" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GradeChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GradeChange_schoolId_idx" ON "GradeChange"("schoolId");

-- CreateIndex
CREATE INDEX "GradeChange_studentId_idx" ON "GradeChange"("studentId");

-- CreateIndex
CREATE INDEX "GradeChange_submissionId_idx" ON "GradeChange"("submissionId");

-- Row Level Security: enabled with no policies, matching every other table.
ALTER TABLE "GradeChange" ENABLE ROW LEVEL SECURITY;
