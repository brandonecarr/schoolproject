-- Marketing data: daily aggregate page views for public pages, and campaign
-- attribution on leads.

CREATE TABLE "PageView" (
    "id" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "referrerHost" TEXT NOT NULL DEFAULT '',
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PageView_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PageView_day_path_referrerHost_key" ON "PageView"("day", "path", "referrerHost");

ALTER TABLE "Lead" ADD COLUMN "ref" TEXT NOT NULL DEFAULT '';

-- Platform-table policy, same shape as the rest.
ALTER TABLE "PageView" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_tenant ON "PageView";
CREATE POLICY rls_tenant ON "PageView"
  FOR ALL
  USING ((current_setting('app.tenant_id', true) IS NOT NULL) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ((current_setting('app.tenant_id', true) IS NOT NULL) OR current_setting('app.bypass_rls', true) = 'on');
