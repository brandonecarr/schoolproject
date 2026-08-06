-- AlterTable
ALTER TABLE "School" ADD COLUMN "masteryThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0.8;

-- CreateTable
CREATE TABLE "Outcome" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "subject" TEXT NOT NULL DEFAULT '',
    "gradeBand" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT 'custom',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Outcome_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutcomeAlignment" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "outcomeId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "criterionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutcomeAlignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutcomeResult" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "outcomeId" TEXT NOT NULL,
    "assignmentId" TEXT,
    "submissionId" TEXT,
    "score" DOUBLE PRECISION NOT NULL,
    "possible" DOUBLE PRECISION NOT NULL,
    "mastered" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL DEFAULT 'graded',
    "recordedAt" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutcomeResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Outcome_schoolId_idx" ON "Outcome"("schoolId");

-- CreateIndex
CREATE INDEX "OutcomeAlignment_assignmentId_idx" ON "OutcomeAlignment"("assignmentId");

-- CreateIndex
CREATE INDEX "OutcomeAlignment_outcomeId_idx" ON "OutcomeAlignment"("outcomeId");

-- CreateIndex
CREATE UNIQUE INDEX "OutcomeAlignment_outcomeId_assignmentId_criterionId_key" ON "OutcomeAlignment"("outcomeId", "assignmentId", "criterionId");

-- CreateIndex
CREATE INDEX "OutcomeResult_studentId_outcomeId_idx" ON "OutcomeResult"("studentId", "outcomeId");

-- CreateIndex
CREATE INDEX "OutcomeResult_schoolId_idx" ON "OutcomeResult"("schoolId");

-- Row Level Security: same posture as every other table — enabled with no
-- policies, so Supabase's anon/REST API is closed while Prisma (table owner)
-- retains full access.
ALTER TABLE "Outcome" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OutcomeAlignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OutcomeResult" ENABLE ROW LEVEL SECURITY;
