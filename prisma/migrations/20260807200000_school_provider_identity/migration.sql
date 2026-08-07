-- The school's identity with whoever administers its ESA money.
--
-- Additive and non-breaking: every column has a default or is nullable, so
-- existing schools keep working with no provider ID recorded. Status is derived
-- in application code (src/lib/provider.ts), not stored, so there is no state
-- column here to fall out of sync with the two facts that matter — whether an
-- ID exists, and when someone last stood behind it.

ALTER TABLE "School" ADD COLUMN "providerId"           TEXT NOT NULL DEFAULT '';
ALTER TABLE "School" ADD COLUMN "providerRail"         TEXT NOT NULL DEFAULT '';
ALTER TABLE "School" ADD COLUMN "providerAttestedAt"   TEXT;
ALTER TABLE "School" ADD COLUMN "providerAttestedById" TEXT;
