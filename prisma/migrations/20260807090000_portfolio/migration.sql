-- Curated portfolio entries. Private by construction: no share token, no
-- public route. See the model comment in schema.prisma.

CREATE TABLE "PortfolioEntry" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "submissionId" TEXT,
    "fileId" TEXT,
    "title" TEXT NOT NULL,
    "reflection" TEXT NOT NULL DEFAULT '',
    "reflectionFormat" TEXT NOT NULL DEFAULT 'markdown',
    "position" INTEGER NOT NULL DEFAULT 0,
    "addedByRole" TEXT NOT NULL DEFAULT 'student',
    "addedByName" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortfolioEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PortfolioEntry_studentId_position_idx" ON "PortfolioEntry"("studentId", "position");

ALTER TABLE "PortfolioEntry" ENABLE ROW LEVEL SECURITY;
