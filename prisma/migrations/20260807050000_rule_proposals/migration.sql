-- Tier-2 output: proposed edits to src/lib/rules.ts awaiting human review.
-- Nothing here is ever applied automatically. See src/lib/interpret.ts.

CREATE TABLE "RuleProposal" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "material" BOOLEAN NOT NULL DEFAULT false,
    "confidence" TEXT NOT NULL DEFAULT 'low',
    "summary" TEXT NOT NULL DEFAULT '',
    "changesJson" TEXT NOT NULL DEFAULT '[]',
    "programCode" TEXT,
    "railId" TEXT,
    "patch" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'open',
    "prUrl" TEXT NOT NULL DEFAULT '',
    "decidedBy" TEXT,
    "decidedAt" TEXT,
    "decisionNote" TEXT NOT NULL DEFAULT '',
    "model" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RuleProposal_pkey" PRIMARY KEY ("id")
);

-- One proposal per snapshot: the idempotency guard that stops a retried cron
-- from re-spending a model call on a diff it already judged.
CREATE UNIQUE INDEX "RuleProposal_snapshotId_key" ON "RuleProposal"("snapshotId");
CREATE INDEX "RuleProposal_status_createdAt_idx" ON "RuleProposal"("status", "createdAt");
CREATE INDEX "RuleProposal_sourceId_idx" ON "RuleProposal"("sourceId");

ALTER TABLE "RuleProposal" ENABLE ROW LEVEL SECURITY;
