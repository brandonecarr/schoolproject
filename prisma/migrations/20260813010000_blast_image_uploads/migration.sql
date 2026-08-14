-- Blast image uploads: a FileRec carrying a publicToken may be served with no
-- auth via /blast-img/[token] — mail clients cannot sign in, so the long
-- random token is the credential. All other files keep the authed path.

ALTER TABLE "FileRec" ADD COLUMN "publicToken" TEXT;
CREATE UNIQUE INDEX "FileRec_publicToken_key" ON "FileRec"("publicToken");
