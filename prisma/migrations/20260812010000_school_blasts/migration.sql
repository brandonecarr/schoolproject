-- Teacher email blasts: designed announcements sent to parents by email.

CREATE TABLE "SchoolBlast" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "blocksJson" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SchoolBlast_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SchoolBlast_schoolId_createdAt_idx" ON "SchoolBlast"("schoolId", "createdAt");

ALTER TABLE "SchoolBlast" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_tenant ON "SchoolBlast";
CREATE POLICY rls_tenant ON "SchoolBlast"
  FOR ALL
  USING (("schoolId" = current_setting('app.tenant_id', true)) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK (("schoolId" = current_setting('app.tenant_id', true)) OR current_setting('app.bypass_rls', true) = 'on');
