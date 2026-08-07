-- Per-user nav shortcuts. A JSON array of hrefs, deliberately NOT a category
-- structure — see the note at the top of src/lib/nav.ts.
ALTER TABLE "User" ADD COLUMN "pinnedNav" TEXT;
