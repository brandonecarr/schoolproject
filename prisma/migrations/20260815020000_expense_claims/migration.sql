-- Homeschool-family expense claims, plus the receipt link on FileRec.

ALTER TABLE "FileRec" ADD COLUMN "claimId" TEXT;

CREATE TABLE "ExpenseClaim" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "vendor" TEXT NOT NULL DEFAULT '',
    "purchaseDate" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "category" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT '',
    "purposeSource" TEXT NOT NULL DEFAULT 'template',
    "windowStart" TEXT NOT NULL,
    "windowEnd" TEXT NOT NULL,
    "evidenceScore" INTEGER NOT NULL DEFAULT 0,
    "railId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "portalRef" TEXT NOT NULL DEFAULT '',
    "submittedAt" TEXT,
    "approvedAt" TEXT,
    "paidAt" TEXT,
    "rejectedAt" TEXT,
    "rejectionReason" TEXT NOT NULL DEFAULT '',
    "rejectionCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpenseClaim_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ExpenseClaim_schoolId_studentId_idx" ON "ExpenseClaim"("schoolId", "studentId");

ALTER TABLE "ExpenseClaim" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_tenant ON "ExpenseClaim";
CREATE POLICY rls_tenant ON "ExpenseClaim"
  FOR ALL
  USING (("schoolId" = current_setting('app.tenant_id', true)) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK (("schoolId" = current_setting('app.tenant_id', true)) OR current_setting('app.bypass_rls', true) = 'on');
