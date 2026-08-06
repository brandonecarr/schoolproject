-- CreateTable
CREATE TABLE "ItemBank" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL DEFAULT '',
    "itemsJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ItemBank_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ItemBank_schoolId_idx" ON "ItemBank"("schoolId");

-- Row Level Security: enabled with no policies, matching every other table.
ALTER TABLE "ItemBank" ENABLE ROW LEVEL SECURITY;
