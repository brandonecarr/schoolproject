-- Subdomain tenancy.
--
-- Two changes, both with a backfill, because the tables are not empty and a
-- required unique column cannot simply be added.

-- 1. School.slug ------------------------------------------------------------
-- Added nullable, backfilled from the name, then constrained. Doing it in one
-- step would fail on any existing row.
ALTER TABLE "School" ADD COLUMN "slug" TEXT;

-- The same transformation lib/tenant.ts does in TypeScript: lowercase,
-- non-alphanumerics to hyphens, trimmed, capped at a 63-character DNS label.
-- Trimming happens again AFTER the truncation, or a name cut mid-word leaves a
-- trailing hyphen and the label becomes invalid.
UPDATE "School"
SET "slug" = trim(both '-' from
      left(trim(both '-' from regexp_replace(lower("name"), '[^a-z0-9]+', '-', 'g')), 63))
WHERE "slug" IS NULL;

-- Any school whose name yields nothing usable (punctuation only, or a script
-- this cannot transliterate) falls back to its id, which is already unique and
-- a valid label. Ugly but reachable; the school can be given a better one.
UPDATE "School" SET "slug" = lower("id") WHERE "slug" IS NULL OR length("slug") < 3;

ALTER TABLE "School" ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX "School_slug_key" ON "School"("slug");

-- 2. User.email becomes unique per school, not globally --------------------
-- The same person legitimately holds accounts at two schools in this market:
-- a parent with children in two programmes, or a teacher at a co-op as well as
-- their own microschool. Login is tenant-scoped, so the narrower constraint is
-- the correct one.
DROP INDEX "User_email_key";
CREATE UNIQUE INDEX "User_schoolId_email_key" ON "User"("schoolId", "email");
-- Still indexed on its own: the apex sign-in looks an address up across
-- schools to work out where to send someone.
CREATE INDEX "User_email_idx" ON "User"("email");
