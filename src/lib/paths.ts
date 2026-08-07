// Mastery paths — deciding what a student gets next based on how they did.
//
// Pure logic (no prisma) so the rules are unit-testable. A rule fires when the
// student's PERCENTAGE on the trigger assignment falls inside an inclusive
// band. Percentages, not raw points, because a 20-point quiz and a 5-point
// check-off should be judged on the same scale.

export type RuleLike = {
  id: string;
  assignmentId: string;
  minPct: number;
  maxPct: number;
  thenAssignmentId: string;
  note: string;
};

export const pctOf = (score: number, possible: number): number =>
  possible > 0 ? Math.round((score / possible) * 100) : 0;

// Every rule on this assignment whose band contains the student's percentage.
export function rulesTriggeredBy(
  rules: RuleLike[],
  assignmentId: string,
  pct: number
): RuleLike[] {
  return rules.filter(
    (r) => r.assignmentId === assignmentId && pct >= r.minPct && pct <= r.maxPct
  );
}

// The three bands a teacher actually reaches for, so the UI doesn't make them
// think in intervals.
export type ConditionPreset = "below" | "atOrAbove" | "between";

export function bandFor(
  preset: ConditionPreset,
  a: number,
  b: number
): { minPct: number; maxPct: number } {
  const lo = Math.max(0, Math.min(100, Math.round(a)));
  const hi = Math.max(0, Math.min(100, Math.round(b)));
  if (preset === "below") return { minPct: 0, maxPct: Math.max(0, lo - 1) };
  if (preset === "atOrAbove") return { minPct: lo, maxPct: 100 };
  return { minPct: Math.min(lo, hi), maxPct: Math.max(lo, hi) };
}

export function describeBand(minPct: number, maxPct: number): string {
  if (minPct <= 0 && maxPct >= 100) return "any score";
  if (minPct <= 0) return `below ${maxPct + 1}%`;
  if (maxPct >= 100) return `${minPct}% or above`;
  return `${minPct}–${maxPct}%`;
}

// The sentence a student sees explaining why extra work appeared. Falls back to
// the band when the teacher didn't write a note.
export function reasonFor(rule: RuleLike, triggerTitle: string, pct: number): string {
  if (rule.note.trim()) return rule.note.trim();
  return `Assigned after scoring ${pct}% on “${triggerTitle}”.`;
}

// A rule that points an assignment at itself would loop forever.
export function isSelfReferential(assignmentId: string, thenAssignmentId: string): boolean {
  return assignmentId === thenAssignmentId;
}
