-- Program compliance deadlines: dated obligations the school tracks — SLP
-- renewals, quarterly expense reports, annual contracts. The school enters the
-- date; rules.ts only suggests which obligations exist.
--
-- Row-level security follows the standard tenant pattern from
-- 20260807230000_rls_policies. Every new table needs this block or
-- tests/rls.test.ts fails the build — that is the tripwire working.

CREATE TABLE "ComplianceDeadline" (
  "id"          TEXT NOT NULL,
  "schoolId"    TEXT NOT NULL,
  "programCode" TEXT NOT NULL DEFAULT '',
  "label"       TEXT NOT NULL,
  "dueDate"     TEXT NOT NULL,
  "note"        TEXT NOT NULL DEFAULT '',
  "completedAt" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ComplianceDeadline_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ComplianceDeadline_schoolId_idx" ON "ComplianceDeadline"("schoolId");

ALTER TABLE "ComplianceDeadline" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_tenant ON "ComplianceDeadline";
CREATE POLICY rls_tenant ON "ComplianceDeadline"
  FOR ALL
  USING (("schoolId" = current_setting('app.tenant_id', true)) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK (("schoolId" = current_setting('app.tenant_id', true)) OR current_setting('app.bypass_rls', true) = 'on');
