// Server-side read/write for RailObservation. Pairs with the pure rollups in
// src/lib/observations.ts the same way lib/mastery.ts pairs with lib/outcomes.ts.

import { prisma } from "@/lib/db";
import type { Observation } from "@/lib/observations";

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

/** Everything this school has observed about one rail, oldest first. */
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
