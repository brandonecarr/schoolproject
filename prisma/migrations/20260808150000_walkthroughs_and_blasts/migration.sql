-- Walkthrough booking slots + email blast log, both platform tables.

CREATE TABLE "WalkthroughSlot" (
    "id" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "durationMin" INTEGER NOT NULL DEFAULT 20,
    "leadId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalkthroughSlot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WalkthroughSlot_startsAt_idx" ON "WalkthroughSlot"("startsAt");

CREATE TABLE "EmailBlast" (
    "id" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sentCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailBlast_pkey" PRIMARY KEY ("id")
);

-- Platform-table policies, same shape as Lead/WatchState.
ALTER TABLE "WalkthroughSlot" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_tenant ON "WalkthroughSlot";
CREATE POLICY rls_tenant ON "WalkthroughSlot"
  FOR ALL
  USING ((current_setting('app.tenant_id', true) IS NOT NULL) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ((current_setting('app.tenant_id', true) IS NOT NULL) OR current_setting('app.bypass_rls', true) = 'on');

ALTER TABLE "EmailBlast" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_tenant ON "EmailBlast";
CREATE POLICY rls_tenant ON "EmailBlast"
  FOR ALL
  USING ((current_setting('app.tenant_id', true) IS NOT NULL) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ((current_setting('app.tenant_id', true) IS NOT NULL) OR current_setting('app.bypass_rls', true) = 'on');
