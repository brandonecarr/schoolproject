-- Rich text: bodies gain a format flag.
--
-- The column defaults to 'markdown' so anything created from now on is
-- formatted, but every EXISTING row is set back to 'plain'. Content written
-- before rich text existed must keep rendering exactly as it always did — a
-- teacher's "3 * 4 * 5" or "# 1 priority" should not silently become italics
-- and a heading because the storage format changed underneath them.

-- AlterTable
ALTER TABLE "Assignment" ADD COLUMN "instructionsFormat" TEXT NOT NULL DEFAULT 'markdown';

-- AlterTable
ALTER TABLE "Worksheet" ADD COLUMN "instructionsFormat" TEXT NOT NULL DEFAULT 'markdown';

-- Existing content stays plain.
UPDATE "Assignment" SET "instructionsFormat" = 'plain';
UPDATE "Worksheet" SET "instructionsFormat" = 'plain';
