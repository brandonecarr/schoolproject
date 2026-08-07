-- Tier-1 source watcher: cheap daily change detection over the pages that
-- define ESA program rules. See src/lib/watch.ts and src/lib/sources.ts.

CREATE TABLE "WatchState" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "lastCheckedAt" TEXT,
    "lastAttemptAt" TEXT,
    "lastChangedAt" TEXT,
    "lastHash" TEXT,
    "lastStatus" TEXT NOT NULL DEFAULT 'new',
    "lastError" TEXT NOT NULL DEFAULT '',
    "failureStreak" INTEGER NOT NULL DEFAULT 0,
    "pendingReview" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WatchState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WatchState_sourceId_key" ON "WatchState"("sourceId");

CREATE TABLE "SourceSnapshot" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "fetchedAt" TEXT NOT NULL,
    "httpStatus" INTEGER NOT NULL DEFAULT 0,
    "delta" INTEGER NOT NULL DEFAULT 0,
    "magnitude" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "escalated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SourceSnapshot_sourceId_fetchedAt_idx" ON "SourceSnapshot"("sourceId", "fetchedAt");

-- Same posture as every other table: RLS on, no policies, so the anon
-- PostgREST API is closed. Prisma connects as owner and bypasses it.
ALTER TABLE "WatchState" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SourceSnapshot" ENABLE ROW LEVEL SECURITY;
