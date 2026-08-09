-- Calendly-style recurring availability. WalkthroughSlot becomes the
-- BOOKINGS table: rows exist only when someone books, and the unique index
-- on startsAt is what makes the booking race have exactly one winner.

CREATE TABLE "AvailabilityRule" (
    "id" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startMin" INTEGER NOT NULL,
    "endMin" INTEGER NOT NULL,
    "slotMinutes" INTEGER NOT NULL DEFAULT 20,
    "timezone" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AvailabilityRule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AvailabilityRule_weekday_idx" ON "AvailabilityRule"("weekday");

CREATE UNIQUE INDEX "WalkthroughSlot_startsAt_key" ON "WalkthroughSlot"("startsAt");

ALTER TABLE "AvailabilityRule" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_tenant ON "AvailabilityRule";
CREATE POLICY rls_tenant ON "AvailabilityRule"
  FOR ALL
  USING ((current_setting('app.tenant_id', true) IS NOT NULL) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ((current_setting('app.tenant_id', true) IS NOT NULL) OR current_setting('app.bypass_rls', true) = 'on');
