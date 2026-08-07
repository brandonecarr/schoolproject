-- Per-user email opt-out. Families default on; staff are switched off below
-- because they live in the app and would only be emailing themselves.
ALTER TABLE "User" ADD COLUMN "emailAlerts" BOOLEAN NOT NULL DEFAULT true;
UPDATE "User" SET "emailAlerts" = false WHERE role IN ('owner', 'teacher');
