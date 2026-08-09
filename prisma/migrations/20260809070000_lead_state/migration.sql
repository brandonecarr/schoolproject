-- The booking form now asks which state the prospect operates in.
ALTER TABLE "Lead" ADD COLUMN "state" TEXT NOT NULL DEFAULT '';
