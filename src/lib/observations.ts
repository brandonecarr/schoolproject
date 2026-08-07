// What we have actually seen a rail do, as opposed to what src/lib/rules.ts
// guesses it will do.
//
// Pure functions only — no Prisma, no I/O — so the thresholds that decide
// "verified" are testable and can't drift into a component. The read/write side
// lives in the server actions that record outcomes.
//
// The point of this file: every rail in RAILS carries `verify: true`, meaning
// "derived from public writing, never confirmed against a real invoice cycle."
// A webpage can never clear that flag. Only this can — the school submitting an
// invoice and the state actually paying it.

export type Observation = {
  railId: string;
  outcome: string; // approved | paid | rejected
  reasonRaw: string;
  reasonKey: string;
  observedAt: string; // ISO
};

/** Payments needed before we stop calling a rail's rules a guess. Five is a
 *  judgement call, not a discovered constant: enough that one lucky submission
 *  doesn't count as proof, few enough that a real school reaches it in a term. */
export const CONFIRM_PAID_CYCLES = 5;

export type VerifyLevel = "unverified" | "observed" | "confirmed";

export type RailVerification = {
  level: VerifyLevel;
  label: string;
  detail: string;
  tone: "bad" | "warn" | "good";
  paid: number;
  approved: number;
  rejected: number;
  /** Outcomes that actually resolved — approvals don't count, money does. */
  decided: number;
  /** Share of decided cycles that were paid without a rejection on the way. */
  progress: number; // 0..1 toward confirmed
};

/**
 * Approval is not payment. A state can approve an invoice and still not pay it,
 * and a school only learns the rules were right when the money lands — so the
 * ladder below is keyed on payments, and approvals are reported but never
 * counted as proof.
 */
export function verificationFor(obs: Observation[]): RailVerification {
  const paid = obs.filter((o) => o.outcome === "paid").length;
  const approved = obs.filter((o) => o.outcome === "approved").length;
  const rejected = obs.filter((o) => o.outcome === "rejected").length;
  const decided = paid + rejected;
  const progress = Math.min(1, paid / CONFIRM_PAID_CYCLES);

  if (paid === 0) {
    return {
      level: "unverified",
      label: "Unverified",
      tone: "bad",
      detail:
        decided === 0
          ? "No invoice has completed a cycle on this rail yet. Every rule shown is a starting guess."
          : `${rejected} rejection${rejected === 1 ? "" : "s"} recorded and nothing paid yet — the rules here are still a guess.`,
      paid,
      approved,
      rejected,
      decided,
      progress,
    };
  }
  if (paid < CONFIRM_PAID_CYCLES) {
    return {
      level: "observed",
      label: `Observed ${paid}/${CONFIRM_PAID_CYCLES}`,
      tone: "warn",
      detail: `${paid} invoice${paid === 1 ? "" : "s"} paid on this rail. Enough to know it works, not enough to call the rules confirmed.`,
      paid,
      approved,
      rejected,
      decided,
      progress,
    };
  }
  return {
    level: "confirmed",
    label: "Confirmed",
    tone: "good",
    detail: `${paid} invoices paid on this rail. These rules have been through real cycles.`,
    paid,
    approved,
    rejected,
    decided,
    progress,
  };
}

// --- Rejection taxonomy -----------------------------------------------------

export type ReasonTally = {
  /** Display text: the predicted taxonomy entry, or the verbatim portal wording
   *  when the teacher said none of the predictions fit. */
  reason: string;
  count: number;
  /** True when this reason is NOT in the rail's predicted list — these are the
   *  rows that grow the taxonomy, and the whole reason to capture verbatim. */
  novel: boolean;
  lastSeen: string;
  /** Distinct verbatim wordings seen, newest first. The portal rarely words the
   *  same rejection the same way twice, and the variants are the useful part. */
  samples: string[];
};

/** Group novel wordings that differ only in case, spacing, or trailing
 *  punctuation. Deliberately conservative — anything cleverer risks merging two
 *  genuinely different rejections into one, which loses information we can't
 *  get back. */
function groupKey(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").replace(/[.\s]+$/, "").trim();
}

/**
 * Tally observed rejections against the rail's predicted reasons.
 * Sorted by count, novel reasons first at equal counts — an unpredicted reason
 * costing a school two rejections matters more than a predicted one costing two.
 */
export function tallyReasons(obs: Observation[], predicted: string[]): ReasonTally[] {
  const predictedSet = new Set(predicted.map(groupKey));
  const buckets = new Map<string, ReasonTally>();

  for (const o of obs) {
    if (o.outcome !== "rejected") continue;
    // A filed reasonKey means the teacher matched it to a prediction. With no
    // key, the verbatim text stands on its own.
    const filed = o.reasonKey.trim();
    const verbatim = o.reasonRaw.trim();
    const display = filed || verbatim;
    if (!display) continue;

    const key = groupKey(display);
    const novel = !predictedSet.has(key);
    let b = buckets.get(key);
    if (!b) {
      b = { reason: display, count: 0, novel, lastSeen: o.observedAt, samples: [] };
      buckets.set(key, b);
    }
    b.count++;
    if (o.observedAt > b.lastSeen) b.lastSeen = o.observedAt;
    if (verbatim && !b.samples.includes(verbatim)) b.samples.push(verbatim);
  }

  return [...buckets.values()].sort(
    (a, b) => b.count - a.count || Number(b.novel) - Number(a.novel) || a.reason.localeCompare(b.reason)
  );
}

export type TaxonomyQuality = {
  /** Predicted reasons that have actually happened at least once. */
  hit: string[];
  /** Predicted reasons never once observed — plausible-sounding guesses that
   *  may simply be wrong about this rail. */
  unseen: string[];
  /** Real rejections nobody predicted. The backlog for the next rules update. */
  novel: ReasonTally[];
};

/**
 * How good the guess in rules.ts turned out to be. This is the honest scorecard:
 * a rail with three unseen predictions and four novel reasons has a taxonomy
 * that was mostly invented, and saying so is more useful than hiding it.
 */
export function taxonomyQuality(obs: Observation[], predicted: string[]): TaxonomyQuality {
  const tallies = tallyReasons(obs, predicted);
  const seen = new Set(tallies.filter((t) => !t.novel).map((t) => groupKey(t.reason)));
  return {
    hit: predicted.filter((p) => seen.has(groupKey(p))),
    unseen: predicted.filter((p) => !seen.has(groupKey(p))),
    novel: tallies.filter((t) => t.novel),
  };
}
