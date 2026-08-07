-- Read-only "view as" for staff support. See the Session model comment.
ALTER TABLE "Session" ADD COLUMN "viewingAsUserId" TEXT;
