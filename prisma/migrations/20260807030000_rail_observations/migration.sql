-- Ground-truth ledger of how each rail actually behaved on a real invoice.
-- See the model comment in schema.prisma: this is what retires the verify flags.
CREATE TABLE "RailObservation" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "railId" TEXT NOT NULL,
    "programCode" TEXT,
    "outcome" TEXT NOT NULL,
    "reasonRaw" TEXT NOT NULL DEFAULT '',
    "reasonKey" TEXT NOT NULL DEFAULT '',
    "observedAt" TEXT NOT NULL,
    "recordedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RailObservation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RailObservation_railId_idx" ON "RailObservation"("railId");
CREATE INDEX "RailObservation_schoolId_idx" ON "RailObservation"("schoolId");
CREATE INDEX "RailObservation_invoiceId_idx" ON "RailObservation"("invoiceId");

-- Same posture as every other table: RLS on with no policies, so the anon
-- PostgREST API is closed. Prisma connects as table owner and bypasses it.
ALTER TABLE "RailObservation" ENABLE ROW LEVEL SECURITY;
