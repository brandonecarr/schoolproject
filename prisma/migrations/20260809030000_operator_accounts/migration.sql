-- Platform operators are not tenants: schoolId becomes nullable, held only
-- by accounts with role 'admin'. Operator emails are globally unique among
-- themselves (the per-school unique index treats NULLs as distinct rows, so
-- it cannot do this job).

ALTER TABLE "User" ALTER COLUMN "schoolId" DROP NOT NULL;

CREATE UNIQUE INDEX "User_operator_email_key" ON "User"(email) WHERE "schoolId" IS NULL;
