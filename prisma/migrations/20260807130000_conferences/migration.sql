-- Parent-teacher conference slots. Local-time by construction: a date string
-- plus minutes from midnight. See the model comment in schema.prisma.

CREATE TABLE "ConferenceSlot" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "startMin" INTEGER NOT NULL,
    "endMin" INTEGER NOT NULL,
    "location" TEXT NOT NULL DEFAULT '',
    "studentId" TEXT,
    "bookedByUserId" TEXT,
    "bookedByName" TEXT NOT NULL DEFAULT '',
    "bookedAt" TEXT,
    "note" TEXT NOT NULL DEFAULT '',
    "noteFormat" TEXT NOT NULL DEFAULT 'markdown',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConferenceSlot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ConferenceSlot_schoolId_date_idx" ON "ConferenceSlot"("schoolId", "date");
CREATE INDEX "ConferenceSlot_studentId_idx" ON "ConferenceSlot"("studentId");

ALTER TABLE "ConferenceSlot" ENABLE ROW LEVEL SECURITY;
