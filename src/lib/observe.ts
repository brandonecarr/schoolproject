// Server-side read/write for RailObservation. Pairs with the pure rollups in
// src/lib/observations.ts the same way lib/mastery.ts pairs with lib/outcomes.ts.

import { prisma } from "@/lib/db";
import { asSystem } from "@/lib/tenant-context";
import {
  verificationFromCounts,
  NO_EVIDENCE,
  type Observation,
  type EvidenceCounts,
} from "@/lib/observations";

/**
 * Record that a rail did something to a real invoice.
 *
 * Idempotent per (invoice, outcome) on purpose. The lifecycle buttons can be
 * clicked twice, and an invoice can legitimately move approved → paid →
 * approved during a correction; without this guard each of those would inflate
 * the payment count, and an inflated count would mark a rail "confirmed" that
 * has really only been paid once. The whole value of this table is that the
 * number is honest, so it records "this invoice reached this state", not "this
 * button was pressed".
 *
 * Rejections are the exception — a second rejection of the same invoice is a
 * genuinely new event with its own reason, so those always append.
 */
export async function recordRailObservation(input: {
  schoolId: string;
  invoiceId: string;
  railId: string | null;
  programCode?: string | null;
  outcome: "approved" | "paid" | "rejected";
  reasonRaw?: string;
  reasonKey?: string;
  recordedBy?: string | null;
}): Promise<void> {
  // No rail means private pay or an unmapped state — there is nothing to learn
  // about a rail that wasn't involved.
  if (!input.railId) return;

  if (input.outcome !== "rejected") {
    const seen = await prisma.railObservation.findFirst({
      where: { invoiceId: input.invoiceId, outcome: input.outcome },
      select: { id: true },
    });
    if (seen) return;
  }

  await prisma.railObservation.create({
    data: {
      schoolId: input.schoolId,
      invoiceId: input.invoiceId,
      railId: input.railId,
      programCode: input.programCode ?? null,
      outcome: input.outcome,
      reasonRaw: (input.reasonRaw ?? "").trim(),
      reasonKey: (input.reasonKey ?? "").trim(),
      observedAt: new Date().toISOString(),
      recordedBy: input.recordedBy ?? null,
    },
  });
}

/**
 * Everything THIS school has observed about one rail, oldest first.
 *
 * School-scoped deliberately, and it must stay that way: these rows carry
 * verbatim rejection text, and a portal message can name a child. Counts may
 * cross the school boundary (see verificationCounts); paperwork may not.
 */
export async function observationsForRail(
  schoolId: string,
  railId: string
): Promise<Observation[]> {
  const rows = await prisma.railObservation.findMany({
    where: { schoolId, railId },
    orderBy: { observedAt: "asc" },
    select: { railId: true, outcome: true, reasonRaw: true, reasonKey: true, observedAt: true },
  });
  return rows;
}

/**
 * Outcome counts for every rail and every program, for one school and for the
 * whole platform, in two grouped queries.
 *
 * Two queries rather than per-row lookups because these feed list pages: the
 * invoice list and the cash-flow forecast would otherwise issue one query per
 * invoice, and this is decoration on those pages, not their subject.
 *
 * Only counts leave the school here — no reason text, no invoice ids, nothing
 * that could identify a student or another school's paperwork.
 */
export type VerificationIndex = {
  railSchool: Map<string, EvidenceCounts>;
  railPlatform: Map<string, EvidenceCounts>;
  programSchool: Map<string, EvidenceCounts>;
  programPlatform: Map<string, EvidenceCounts>;
};

function bump(m: Map<string, EvidenceCounts>, key: string | null, outcome: string, n: number) {
  if (!key) return;
  const cur = m.get(key) ?? { ...NO_EVIDENCE };
  if (outcome === "paid") cur.paid += n;
  else if (outcome === "approved") cur.approved += n;
  else if (outcome === "rejected") cur.rejected += n;
  m.set(key, cur);
}

export async function verificationCounts(schoolId: string): Promise<VerificationIndex> {
  const [platform, school] = await Promise.all([
    // System, and the ONLY tenant-crossing read in the product: the platform
    // rollup that answers "has anyone, anywhere, watched this rail survive a
    // real cycle?". groupBy returns counts alone — no reason text, no school
    // ids — which is exactly the boundary the privacy note above draws.
    // Under row-level security a tenant-scoped run of this query would not
    // fail; it would silently count only this school and quietly claim the
    // platform has seen less than it has. asSystem keeps it honest.
    asSystem(() =>
      prisma.railObservation.groupBy({
        by: ["railId", "programCode", "outcome"],
        _count: { _all: true },
      })
    ),
    prisma.railObservation.groupBy({
      by: ["railId", "programCode", "outcome"],
      where: { schoolId },
      _count: { _all: true },
    }),
  ]);

  const idx: VerificationIndex = {
    railSchool: new Map(),
    railPlatform: new Map(),
    programSchool: new Map(),
    programPlatform: new Map(),
  };
  for (const r of platform) {
    bump(idx.railPlatform, r.railId, r.outcome, r._count._all);
    bump(idx.programPlatform, r.programCode, r.outcome, r._count._all);
  }
  for (const r of school) {
    bump(idx.railSchool, r.railId, r.outcome, r._count._all);
    bump(idx.programSchool, r.programCode, r.outcome, r._count._all);
  }
  return idx;
}

/** Verification for one rail, from a preloaded index. */
export function railVerification(idx: VerificationIndex, railId: string) {
  return verificationFromCounts(
    idx.railSchool.get(railId) ?? NO_EVIDENCE,
    idx.railPlatform.get(railId) ?? NO_EVIDENCE
  );
}

/** Verification for one state's program, from a preloaded index. */
export function programVerification(idx: VerificationIndex, programCode: string) {
  return verificationFromCounts(
    idx.programSchool.get(programCode) ?? NO_EVIDENCE,
    idx.programPlatform.get(programCode) ?? NO_EVIDENCE
  );
}
