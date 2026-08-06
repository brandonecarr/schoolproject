-- CreateTable
CREATE TABLE "ProgressReport" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "periodStart" TEXT NOT NULL,
    "periodEnd" TEXT NOT NULL,
    "narrative" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT 'template',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdById" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "approvedAt" TEXT,
    "approvedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgressReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProgressReport_schoolId_idx" ON "ProgressReport"("schoolId");

-- CreateIndex
CREATE INDEX "ProgressReport_studentId_idx" ON "ProgressReport"("studentId");

-- Row Level Security: enabled with no policies, matching every other table.
ALTER TABLE "ProgressReport" ENABLE ROW LEVEL SECURITY;
