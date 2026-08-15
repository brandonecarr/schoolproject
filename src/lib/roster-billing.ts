// After any roster change: recount the children and tell Stripe.
//
// One place, called by addStudent / importStudents / deleteStudent (and the
// retention purge's deletion path), so the billed overage is always DERIVED
// from the roster — never incremented, never trusted from a form. A school
// with no subscription (pre-billing, dev, preview) is simply skipped.

import { prisma } from "@/lib/db";
import { syncSeatOverage } from "@/lib/stripe";
import { overageFor } from "@/lib/seats";
import { logAudit } from "@/lib/auth";

export async function syncRosterBilling(
  school: { id: string; kind: string; stripeSubscriptionId: string },
  actorId: string | null
): Promise<void> {
  if (!school.stripeSubscriptionId) return;
  const count = await prisma.student.count({ where: { schoolId: school.id } });
  const kind = school.kind === "family" ? "family" : "school";
  const overage = overageFor(count, kind);
  const r = await syncSeatOverage({ subscriptionId: school.stripeSubscriptionId, kind, overage });
  // Audited either way — a billing change is exactly the sort of thing a
  // founder wants to be able to reconstruct later.
  await logAudit(
    actorId,
    r.ok ? "seats_synced" : "seats_sync_failed",
    `${count} children, overage ${overage}${r.detail ? ` — ${r.detail}` : ""}`
  );
}
