-- Row-level security: the database half of tenant isolation.
--
-- Until now isolation was 100%% application code — every query writes its own
-- `where: { schoolId }`. These policies make the database enforce the same
-- boundary, so the query that FORGETS its where-clause returns nothing instead
-- of another school's records.
--
-- HOW A QUERY IS JUDGED. The Prisma extension in src/lib/db.ts opens each
-- operation in a transaction that first calls set_config():
--   app.tenant_id   — the school this work is for (set by getSession et al.)
--   app.bypass_rls  — 'on' for the few sanctioned system paths (auth before a
--                     user exists, crons, the one aggregate rollup)
-- A query carrying neither matches no policy and returns nothing: fail closed.
--
-- WHO IS BOUND. Policies bind roles without BYPASSRLS. Supabase's `postgres`
-- role HAS BYPASSRLS, so while DATABASE_URL points at it these policies are
-- dormant — which is what makes this migration safe to apply to a live
-- database. Enforcement starts when the app connects as `cohort_app`
-- (scripts/create-app-role.mjs), a role with no such attribute. There is no
-- FORCE ROW LEVEL SECURITY here because it would change nothing: FORCE binds
-- owners, and the owner bypasses by attribute, not by ownership.
--
-- WHAT THIS DEFENDS AGAINST: our own future bugs. Not a stolen connection
-- string — anyone who can run SQL can set the GUC. The adversary is the
-- feature written in a hurry next year.
--
-- ENABLE is repeated idempotently; every table already had RLS enabled with
-- zero policies (deny-all for Supabase's Data API roles, which stays true).

ALTER TABLE "School" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Student" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Course" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Assignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Submission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Worksheet" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PathRule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ItemBank" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Page" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Module" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ModuleItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ModuleProgress" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProgressReport" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GradeChange" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Outcome" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OutcomeAlignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OutcomeResult" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Attendance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Observation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FileRec" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Payment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Invoice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Session" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Audit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Message" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Token" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RailObservation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WatchState" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SourceSnapshot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RuleProposal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CalendarEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Announcement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AnnouncementAck" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Annotation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PortfolioEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ConferenceSlot" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_tenant ON "School";
CREATE POLICY rls_tenant ON "School"
  FOR ALL
  USING ((id = current_setting('app.tenant_id', true)) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ((id = current_setting('app.tenant_id', true)) OR current_setting('app.bypass_rls', true) = 'on');

DROP POLICY IF EXISTS rls_tenant ON "User";
CREATE POLICY rls_tenant ON "User"
  FOR ALL
  USING (("schoolId" = current_setting('app.tenant_id', true)) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK (("schoolId" = current_setting('app.tenant_id', true)) OR current_setting('app.bypass_rls', true) = 'on');

DROP POLICY IF EXISTS rls_tenant ON "Student";
CREATE POLICY rls_tenant ON "Student"
  FOR ALL
  USING (("schoolId" = current_setting('app.tenant_id', true)) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK (("schoolId" = current_setting('app.tenant_id', true)) OR current_setting('app.bypass_rls', true) = 'on');

DROP POLICY IF EXISTS rls_tenant ON "Course";
CREATE POLICY rls_tenant ON "Course"
  FOR ALL
  USING (("schoolId" = current_setting('app.tenant_id', true)) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK (("schoolId" = current_setting('app.tenant_id', true)) OR current_setting('app.bypass_rls', true) = 'on');

DROP POLICY IF EXISTS rls_tenant ON "Assignment";
CREATE POLICY rls_tenant ON "Assignment"
  FOR ALL
  USING (("schoolId" = current_setting('app.tenant_id', true)) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK (("schoolId" = current_setting('app.tenant_id', true)) OR current_setting('app.bypass_rls', true) = 'on');

DROP POLICY IF EXISTS rls_tenant ON "Submission";
CREATE POLICY rls_tenant ON "Submission"
  FOR ALL
  USING (("schoolId" = current_setting('app.tenant_id', true)) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK (("schoolId" = current_setting('app.tenant_id', true)) OR current_setting('app.bypass_rls', true) = 'on');

DROP POLICY IF EXISTS rls_tenant ON "Worksheet";
CREATE POLICY rls_tenant ON "Worksheet"
  FOR ALL
  USING (("schoolId" = current_setting('app.tenant_id', true)) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK (("schoolId" = current_setting('app.tenant_id', true)) OR current_setting('app.bypass_rls', true) = 'on');

DROP POLICY IF EXISTS rls_tenant ON "PathRule";
CREATE POLICY rls_tenant ON "PathRule"
  FOR ALL
  USING (("schoolId" = current_setting('app.tenant_id', true)) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK (("schoolId" = current_setting('app.tenant_id', true)) OR current_setting('app.bypass_rls', true) = 'on');

DROP POLICY IF EXISTS rls_tenant ON "ItemBank";
CREATE POLICY rls_tenant ON "ItemBank"
  FOR ALL
  USING (("schoolId" = current_setting('app.tenant_id', true)) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK (("schoolId" = current_setting('app.tenant_id', true)) OR current_setting('app.bypass_rls', true) = 'on');

DROP POLICY IF EXISTS rls_tenant ON "Page";
CREATE POLICY rls_tenant ON "Page"
  FOR ALL
  USING (("schoolId" = current_setting('app.tenant_id', true)) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK (("schoolId" = current_setting('app.tenant_id', true)) OR current_setting('app.bypass_rls', true) = 'on');

DROP POLICY IF EXISTS rls_tenant ON "Module";
CREATE POLICY rls_tenant ON "Module"
  FOR ALL
  USING (("schoolId" = current_setting('app.tenant_id', true)) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK (("schoolId" = current_setting('app.tenant_id', true)) OR current_setting('app.bypass_rls', true) = 'on');

DROP POLICY IF EXISTS rls_tenant ON "ModuleItem";
CREATE POLICY rls_tenant ON "ModuleItem"
  FOR ALL
  USING (("schoolId" = current_setting('app.tenant_id', true)) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK (("schoolId" = current_setting('app.tenant_id', true)) OR current_setting('app.bypass_rls', true) = 'on');

DROP POLICY IF EXISTS rls_tenant ON "ModuleProgress";
CREATE POLICY rls_tenant ON "ModuleProgress"
  FOR ALL
  USING (("schoolId" = current_setting('app.tenant_id', true)) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK (("schoolId" = current_setting('app.tenant_id', true)) OR current_setting('app.bypass_rls', true) = 'on');

DROP POLICY IF EXISTS rls_tenant ON "Notification";
CREATE POLICY rls_tenant ON "Notification"
  FOR ALL
  USING (("schoolId" = current_setting('app.tenant_id', true)) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK (("schoolId" = current_setting('app.tenant_id', true)) OR current_setting('app.bypass_rls', true) = 'on');

DROP POLICY IF EXISTS rls_tenant ON "ProgressReport";
CREATE POLICY rls_tenant ON "ProgressReport"
  FOR ALL
  USING (("schoolId" = current_setting('app.tenant_id', true)) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK (("schoolId" = current_setting('app.tenant_id', true)) OR current_setting('app.bypass_rls', true) = 'on');

DROP POLICY IF EXISTS rls_tenant ON "GradeChange";
CREATE POLICY rls_tenant ON "GradeChange"
  FOR ALL
  USING (("schoolId" = current_setting('app.tenant_id', true)) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK (("schoolId" = current_setting('app.tenant_id', true)) OR current_setting('app.bypass_rls', true) = 'on');

DROP POLICY IF EXISTS rls_tenant ON "Outcome";
CREATE POLICY rls_tenant ON "Outcome"
  FOR ALL
  USING (("schoolId" = current_setting('app.tenant_id', true)) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK (("schoolId" = current_setting('app.tenant_id', true)) OR current_setting('app.bypass_rls', true) = 'on');

DROP POLICY IF EXISTS rls_tenant ON "OutcomeAlignment";
CREATE POLICY rls_tenant ON "OutcomeAlignment"
  FOR ALL
  USING (("schoolId" = current_setting('app.tenant_id', true)) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK (("schoolId" = current_setting('app.tenant_id', true)) OR current_setting('app.bypass_rls', true) = 'on');

DROP POLICY IF EXISTS rls_tenant ON "OutcomeResult";
CREATE POLICY rls_tenant ON "OutcomeResult"
  FOR ALL
  USING (("schoolId" = current_setting('app.tenant_id', true)) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK (("schoolId" = current_setting('app.tenant_id', true)) OR current_setting('app.bypass_rls', true) = 'on');

DROP POLICY IF EXISTS rls_tenant ON "Attendance";
CREATE POLICY rls_tenant ON "Attendance"
  FOR ALL
  USING (("schoolId" = current_setting('app.tenant_id', true)) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK (("schoolId" = current_setting('app.tenant_id', true)) OR current_setting('app.bypass_rls', true) = 'on');

DROP POLICY IF EXISTS rls_tenant ON "Observation";
CREATE POLICY rls_tenant ON "Observation"
  FOR ALL
  USING (("schoolId" = current_setting('app.tenant_id', true)) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK (("schoolId" = current_setting('app.tenant_id', true)) OR current_setting('app.bypass_rls', true) = 'on');

DROP POLICY IF EXISTS rls_tenant ON "FileRec";
CREATE POLICY rls_tenant ON "FileRec"
  FOR ALL
  USING (("schoolId" = current_setting('app.tenant_id', true)) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK (("schoolId" = current_setting('app.tenant_id', true)) OR current_setting('app.bypass_rls', true) = 'on');

DROP POLICY IF EXISTS rls_tenant ON "Payment";
CREATE POLICY rls_tenant ON "Payment"
  FOR ALL
  USING (("schoolId" = current_setting('app.tenant_id', true)) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK (("schoolId" = current_setting('app.tenant_id', true)) OR current_setting('app.bypass_rls', true) = 'on');

DROP POLICY IF EXISTS rls_tenant ON "Invoice";
CREATE POLICY rls_tenant ON "Invoice"
  FOR ALL
  USING (("schoolId" = current_setting('app.tenant_id', true)) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK (("schoolId" = current_setting('app.tenant_id', true)) OR current_setting('app.bypass_rls', true) = 'on');

DROP POLICY IF EXISTS rls_tenant ON "Session";
CREATE POLICY rls_tenant ON "Session"
  FOR ALL
  USING (current_setting('app.bypass_rls', true) = 'on' OR EXISTS (SELECT 1 FROM "User" u WHERE u.id = "Session"."userId" AND u."schoolId" = current_setting('app.tenant_id', true)))
  WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR EXISTS (SELECT 1 FROM "User" u WHERE u.id = "Session"."userId" AND u."schoolId" = current_setting('app.tenant_id', true)));

DROP POLICY IF EXISTS rls_tenant ON "Audit";
CREATE POLICY rls_tenant ON "Audit"
  FOR ALL
  USING (current_setting('app.bypass_rls', true) = 'on' OR EXISTS (SELECT 1 FROM "User" u WHERE u.id = "Audit"."actorId" AND u."schoolId" = current_setting('app.tenant_id', true)))
  WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "actorId" IS NULL OR EXISTS (SELECT 1 FROM "User" u WHERE u.id = "Audit"."actorId" AND u."schoolId" = current_setting('app.tenant_id', true)));

DROP POLICY IF EXISTS rls_tenant ON "Message";
CREATE POLICY rls_tenant ON "Message"
  FOR ALL
  USING (("schoolId" = current_setting('app.tenant_id', true)) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK (("schoolId" = current_setting('app.tenant_id', true)) OR current_setting('app.bypass_rls', true) = 'on');

DROP POLICY IF EXISTS rls_tenant ON "Token";
CREATE POLICY rls_tenant ON "Token"
  FOR ALL
  USING (("schoolId" = current_setting('app.tenant_id', true)) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK (("schoolId" = current_setting('app.tenant_id', true)) OR current_setting('app.bypass_rls', true) = 'on');

DROP POLICY IF EXISTS rls_tenant ON "RailObservation";
CREATE POLICY rls_tenant ON "RailObservation"
  FOR ALL
  USING (("schoolId" = current_setting('app.tenant_id', true)) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK (("schoolId" = current_setting('app.tenant_id', true)) OR current_setting('app.bypass_rls', true) = 'on');

DROP POLICY IF EXISTS rls_tenant ON "WatchState";
CREATE POLICY rls_tenant ON "WatchState"
  FOR ALL
  USING ((current_setting('app.tenant_id', true) IS NOT NULL) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ((current_setting('app.tenant_id', true) IS NOT NULL) OR current_setting('app.bypass_rls', true) = 'on');

DROP POLICY IF EXISTS rls_tenant ON "SourceSnapshot";
CREATE POLICY rls_tenant ON "SourceSnapshot"
  FOR ALL
  USING ((current_setting('app.tenant_id', true) IS NOT NULL) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ((current_setting('app.tenant_id', true) IS NOT NULL) OR current_setting('app.bypass_rls', true) = 'on');

DROP POLICY IF EXISTS rls_tenant ON "RuleProposal";
CREATE POLICY rls_tenant ON "RuleProposal"
  FOR ALL
  USING ((current_setting('app.tenant_id', true) IS NOT NULL) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ((current_setting('app.tenant_id', true) IS NOT NULL) OR current_setting('app.bypass_rls', true) = 'on');

DROP POLICY IF EXISTS rls_tenant ON "CalendarEvent";
CREATE POLICY rls_tenant ON "CalendarEvent"
  FOR ALL
  USING (("schoolId" = current_setting('app.tenant_id', true)) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK (("schoolId" = current_setting('app.tenant_id', true)) OR current_setting('app.bypass_rls', true) = 'on');

DROP POLICY IF EXISTS rls_tenant ON "Announcement";
CREATE POLICY rls_tenant ON "Announcement"
  FOR ALL
  USING (("schoolId" = current_setting('app.tenant_id', true)) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK (("schoolId" = current_setting('app.tenant_id', true)) OR current_setting('app.bypass_rls', true) = 'on');

DROP POLICY IF EXISTS rls_tenant ON "AnnouncementAck";
CREATE POLICY rls_tenant ON "AnnouncementAck"
  FOR ALL
  USING (current_setting('app.bypass_rls', true) = 'on' OR EXISTS (SELECT 1 FROM "Announcement" a WHERE a.id = "AnnouncementAck"."announcementId" AND a."schoolId" = current_setting('app.tenant_id', true)))
  WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR EXISTS (SELECT 1 FROM "Announcement" a WHERE a.id = "AnnouncementAck"."announcementId" AND a."schoolId" = current_setting('app.tenant_id', true)));

DROP POLICY IF EXISTS rls_tenant ON "Annotation";
CREATE POLICY rls_tenant ON "Annotation"
  FOR ALL
  USING (("schoolId" = current_setting('app.tenant_id', true)) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK (("schoolId" = current_setting('app.tenant_id', true)) OR current_setting('app.bypass_rls', true) = 'on');

DROP POLICY IF EXISTS rls_tenant ON "PortfolioEntry";
CREATE POLICY rls_tenant ON "PortfolioEntry"
  FOR ALL
  USING (("schoolId" = current_setting('app.tenant_id', true)) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK (("schoolId" = current_setting('app.tenant_id', true)) OR current_setting('app.bypass_rls', true) = 'on');

DROP POLICY IF EXISTS rls_tenant ON "ConferenceSlot";
CREATE POLICY rls_tenant ON "ConferenceSlot"
  FOR ALL
  USING (("schoolId" = current_setting('app.tenant_id', true)) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK (("schoolId" = current_setting('app.tenant_id', true)) OR current_setting('app.bypass_rls', true) = 'on');
