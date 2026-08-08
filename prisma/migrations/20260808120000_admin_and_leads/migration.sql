-- Platform admin flag + the Lead table for the admin console.

ALTER TABLE "User" ADD COLUMN "platformAdmin" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "note" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'new',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Lead_status_idx" ON "Lead"("status");

-- Platform-table policy, same shape as WatchState/RuleProposal: readable in
-- any authenticated context or under the bypass, never bare.
ALTER TABLE "Lead" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_tenant ON "Lead";
CREATE POLICY rls_tenant ON "Lead"
  FOR ALL
  USING ((current_setting('app.tenant_id', true) IS NOT NULL) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ((current_setting('app.tenant_id', true) IS NOT NULL) OR current_setting('app.bypass_rls', true) = 'on');
