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

export type EvidenceCounts = { paid: number; approved: number; rejected: number };

export const NO_EVIDENCE: EvidenceCounts = { paid: 0, approved: 0, rejected: 0 };

export function countOutcomes(obs: Observation[]): EvidenceCounts {
  return {
    paid: obs.filter((o) => o.outcome === "paid").length,
    approved: obs.filter((o) => o.outcome === "approved").length,
    rejected: obs.filter((o) => o.outcome === "rejected").length,
  };
}

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
  progress: number; // 0..1 toward confirmed
  /** This school's own record, which may lag the platform's. */
  school: EvidenceCounts;
  /** Every school's, including this one. */
  platform: EvidenceCounts;
};

/**
 * How confident we are that our stored rules for a rail or program are right.
 *
 * Scoped to the PLATFORM, not to one school, because the thing being verified is
 * the rules — whether Arizona pays $7,400 and what ClassWallet rejects for is
 * true or false independently of who is asking. A school that has never invoiced
 * still benefits from forty cycles other schools have been through.
 *
 * The school's own record is carried alongside and reported separately, because
 * it answers a different and also useful question: "has this worked for ME yet".
 *
 * Approval is not payment. A state can approve an invoice and never pay it, so
 * the ladder is keyed on money landing; approvals are counted and shown but
 * never treated as proof.
 *
 * PRIVACY: only counts cross the school boundary here. Verbatim rejection text
 * stays with the school that recorded it — a portal message can name a child,
 * and an aggregate is not a licence to share one school's paperwork with
 * another. See tallyReasons, which is always called with one school's rows.
 */
export function verificationFromCounts(
  school: EvidenceCounts,
  platform: EvidenceCounts = school
): RailVerification {
  const paid = platform.paid;
  const rejected = platform.rejected;
  const decided = paid + rejected;
  const progress = Math.min(1, paid / CONFIRM_PAID_CYCLES);
  const elsewhere = paid > 0 && school.paid === 0;
  // "on this rail" reads wrong once other schools are in the count.
  const scope = elsewhere ? " by other schools" : "";

  const common = {
    paid,
    approved: platform.approved,
    rejected,
    decided,
    progress,
    school,
    platform,
  };

  if (paid === 0) {
    return {
      ...common,
      level: "unverified",
      label: "Unverified",
      tone: "bad",
      detail:
        decided === 0
          ? "No invoice has completed a cycle here yet. Every rule shown is a starting guess."
          : `${rejected} rejection${rejected === 1 ? "" : "s"} recorded and nothing paid yet — the rules here are still a guess.`,
    };
  }
  if (paid < CONFIRM_PAID_CYCLES) {
    return {
      ...common,
      level: "observed",
      label: `Observed ${paid}/${CONFIRM_PAID_CYCLES}`,
      tone: "warn",
      detail:
        `${paid} invoice${paid === 1 ? "" : "s"} paid${scope}. Enough to know it works, not enough to call the rules confirmed.` +
        (elsewhere ? " Your school has not completed a cycle here yet." : ""),
    };
  }
  return {
    ...common,
    level: "confirmed",
    label: "Confirmed",
    tone: "good",
    detail:
      `${paid} invoices paid${scope}. These rules have been through real cycles.` +
      (elsewhere ? " Your school has not completed one here yet." : ""),
  };
}

/** Single-scope convenience: verification from one school's observations. */
export function verificationFor(obs: Observation[]): RailVerification {
  return verificationFromCounts(countOutcomes(obs));
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
