-- Blast drafts: sentAt null = work in progress. Every existing row was a
-- real send, so it is stamped with its creation time.

ALTER TABLE "SchoolBlast" ADD COLUMN "sentAt" TIMESTAMP(3);
ALTER TABLE "SchoolBlast" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "SchoolBlast" SET "sentAt" = "createdAt";
