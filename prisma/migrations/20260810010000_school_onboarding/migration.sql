-- Onboarding intake: the popup owners see on first sign-in.
ALTER TABLE "School" ADD COLUMN "contactPhone" TEXT NOT NULL DEFAULT '';
ALTER TABLE "School" ADD COLUMN "studentEstimate" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "School" ADD COLUMN "gradesServed" TEXT NOT NULL DEFAULT '';
ALTER TABLE "School" ADD COLUMN "heardFrom" TEXT NOT NULL DEFAULT '';
ALTER TABLE "School" ADD COLUMN "priorTooling" TEXT NOT NULL DEFAULT '';
ALTER TABLE "School" ADD COLUMN "onboardedAt" TIMESTAMP(3);
