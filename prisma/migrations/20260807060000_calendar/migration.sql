-- School calendar. The instructional-day count it derives becomes the
-- denominator of "present N of M" on every ESA invoice, so this is billing
-- infrastructure, not decoration. See src/lib/calendar.ts.

ALTER TABLE "School" ADD COLUMN "schoolDays" TEXT NOT NULL DEFAULT '1,2,3,4,5';
ALTER TABLE "User" ADD COLUMN "calendarToken" TEXT;
CREATE UNIQUE INDEX "User_calendarToken_key" ON "User"("calendarToken");

CREATE TABLE "CalendarEvent" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "staffOnly" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CalendarEvent_schoolId_startDate_idx" ON "CalendarEvent"("schoolId", "startDate");

ALTER TABLE "CalendarEvent" ENABLE ROW LEVEL SECURITY;
