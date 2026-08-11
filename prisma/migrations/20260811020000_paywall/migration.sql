-- The paywall: schools are created only after Stripe checkout completes.
-- SignupIntent holds a validated signup until payment lands; School gains
-- the subscription identifiers the webhook maintains.

CREATE TABLE "SignupIntent" (
    "id" TEXT NOT NULL,
    "schoolName" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "esaAmount" DOUBLE PRECISION NOT NULL,
    "ownerName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "stripeSessionId" TEXT NOT NULL DEFAULT '',
    "consumedAt" TIMESTAMP(3),
    "schoolId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SignupIntent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SignupIntent_stripeSessionId_idx" ON "SignupIntent"("stripeSessionId");

ALTER TABLE "School" ADD COLUMN "stripeCustomerId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "School" ADD COLUMN "stripeSubscriptionId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "School" ADD COLUMN "subscriptionStatus" TEXT NOT NULL DEFAULT '';

ALTER TABLE "SignupIntent" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_tenant ON "SignupIntent";
CREATE POLICY rls_tenant ON "SignupIntent"
  FOR ALL
  USING ((current_setting('app.tenant_id', true) IS NOT NULL) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ((current_setting('app.tenant_id', true) IS NOT NULL) OR current_setting('app.bypass_rls', true) = 'on');
