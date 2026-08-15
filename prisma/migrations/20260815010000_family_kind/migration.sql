-- Account kind: "school" (invoices as a provider) or "family" (a homeschooling
-- household filing expense claims). Every existing row is a school — the
-- default IS the backfill.

ALTER TABLE "School"       ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'school';
ALTER TABLE "SignupIntent" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'school';
