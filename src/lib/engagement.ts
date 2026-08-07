// Engagement signals — "is this child slipping?", and nothing else.
//
// Attendance answers whether a child was marked present. It does not answer
// whether they did anything. A student can be present every day of a period and
// produce nothing, and the attendance line on the evidence board will look
// perfect the whole time. This module is the other axis: on how many of the
// days we expected work from this child did work actually appear.
//
// WHY IT'S WEDGE-RELEVANT. "Present on 14 of 14 days" is seat time. "Produced
// work on 12 of 14 expected days" is instruction, which is what an ESA reviewer
// is actually buying. The second sentence is strictly stronger and we can
// derive it from rows we already store.
//
// THE FRAMING CONSTRAINT, WHICH IS LOAD-BEARING. Engagement metrics on children
// slide into surveillance with almost no effort, so three rules hold here:
//
//   1. No child is ever compared to another child. Every judgement in this file
//      compares a student to THEIR OWN recent past. There is no cohort average,
//      no percentile, no ranking, and there must never be one — a teacher who
//      can sort children by engagement will, and that is a different product.
//   2. The *state* ("quieter than usual") is for the teacher only. The *count*
//      ("work on 12 of 14 days") is factual and may go on a record a family or
//      a reviewer reads. A parent must never be shown something that reads as a
//      behaviour score for their child.
//   3. Nothing new is tracked to produce any of this. Every signal is derived
//      from rows the child's own actions already created. We are not adding
//      telemetry to children.
//
// WHAT DELIBERATELY DOESN'T COUNT. Logins. A session row means someone opened
// the app, which is presence at a screen rather than learning, and counting it
// would reward leaving a tab open. It is also the single most surveillance-
// shaped thing we store about a child. Attendance doesn't count either — that's
// the teacher's record and it is the axis this one exists to complement.
//
// Pure: no Prisma, no I/O. Dates are "YYYY-MM-DD" throughout.

/** Things a child did that left a row behind. */
export type ActivityKind = "work" | "coursework" | "portfolio" | "message";

export type ActivityEvent = { date: string; kind: ActivityKind };

export type AttendanceMark = { date: string; status: string };

/**
 * The most recent N expected days count as "recent"; everything before is the
 * baseline. Counted in EXPECTED DAYS rather than calendar dates on purpose — a
 * fortnight that contains a week of half-term is not two weeks of school, and
 * splitting by date would read the holiday as a child going quiet.
 */
export const RECENT_DAYS = 10;

/** Below this many expected days a window is too small to mean anything. Small
 *  denominators are noisy, and a signal that fires on noise gets ignored. */
export const MIN_WINDOW = 5;

export type EngagementState =
  /** Not enough history to say anything — a new student, or the start of term. */
  | "unknown"
  /** Working at roughly their own usual rate. */
  | "steady"
  /** Worth a look. Either below their OWN recent baseline, or little work in
   *  absolute terms whatever the history. Named for the action rather than for
   *  a diagnosis of the child: "worth a check-in" is a thing the teacher does,
   *  "disengaged" is a label on a nine-year-old. */
  | "check-in"
  /** Nothing at all across the recent window, while instruction was happening. */
  | "silent";

/** Why a "check-in" fired, so the teacher's prompt can be specific. */
export type CheckInReason = "dropped" | "low";

/** At or below this share of expected days, a check-in is warranted regardless
 *  of trend. A child who has ALWAYS worked one day in ten is not "steady"; they
 *  are the child a teacher most needs to notice, and a reassuring label is the
 *  one thing that would stop them noticing. */
export const LOW_RATE = 0.3;

export type EngagementWindow = {
  /** Days we expected work: instructional days minus this child's absences. */
  expected: number;
  /** Of those, days that produced at least one piece of activity. */
  active: number;
  /** active / expected, or null when expected is 0. */
  rate: number | null;
};

export type EngagementSignal = {
  recent: EngagementWindow;
  prior: EngagementWindow;
  /** Over both windows together — the number that goes on a record. */
  overall: EngagementWindow;
  state: EngagementState;
  /** Set only when state is "check-in". */
  reason: CheckInReason | null;
  /** Most recent day with any activity, or null if there has never been one. */
  lastActive: string | null;
  /** Expected days since lastActive. Null when lastActive is null. Counted in
   *  expected days, not calendar days, so a child is not reported as "8 days
   *  quiet" when six of those were the winter break. */
  quietFor: number | null;
  /** Which kinds of activity appeared at all, for a teacher wondering what a
   *  child is engaging with rather than only how much. */
  kinds: ActivityKind[];
};

/**
 * The days we actually expected this child to be producing work.
 *
 * Instructional days from the school calendar, minus the days this child was
 * marked absent or excused. Leaving absences in the denominator would make the
 * whole signal a proxy for how often a child is ill, which is both unfair and
 * useless — the teacher already knows about the absence, and it would bury the
 * case this exists to surface: a child who is *there* and not working.
 */
export function expectedDays(instructional: string[], attendance: AttendanceMark[]): string[] {
  const away = new Set(
    attendance.filter((a) => a.status === "absent" || a.status === "excused").map((a) => a.date)
  );
  return instructional.filter((d) => !away.has(d)).sort();
}

/** Distinct days inside `days` on which anything happened. */
export function activeDaysIn(events: ActivityEvent[], days: string[]): string[] {
  const inWindow = new Set(days);
  const hit = new Set<string>();
  for (const e of events) if (inWindow.has(e.date)) hit.add(e.date);
  return [...hit].sort();
}

function windowFor(events: ActivityEvent[], days: string[]): EngagementWindow {
  const active = activeDaysIn(events, days).length;
  return { expected: days.length, active, rate: days.length > 0 ? active / days.length : null };
}

/**
 * Decide whether this child is worth a look, using only their own rows.
 *
 * Two independent grounds for a check-in, and both are needed:
 *
 *   LOW — little work in absolute terms. This one has no baseline in it at all,
 *   which is deliberate. A trend-only test tells a teacher that a child who has
 *   worked one day in ten all term is "steady", which is true and useless: it
 *   is a reassuring word attached to the child who most needs attention.
 *
 *   DROPPED — at or below 60% of the child's own earlier rate. A signal that
 *   goes off often is one a teacher learns to dismiss, and then it is worth
 *   nothing on the day it is real, so an ordinary fortnight's variation (nine
 *   days in ten down to six) must not trigger it. It doesn't: 0.6 ≤ 0.54 is
 *   false.
 *
 * An earlier version also required an absolute drop of 0.2 before calling
 * DROPPED. It was removed as dead code, not as a relaxation — with the LOW
 * floor at 0.3, satisfying the ratio while failing the absolute test requires
 * recent < 0.3, which LOW has already caught. Keeping an unreachable condition
 * around implies a protection that isn't doing anything.
 *
 * There is no third ground involving any other child, and there must not be.
 */
function classify(
  recent: EngagementWindow,
  prior: EngagementWindow
): { state: EngagementState; reason: CheckInReason | null } {
  // Nothing at all, while we were expecting something, needs no baseline to be
  // worth saying.
  if (recent.expected >= 3 && recent.active === 0) return { state: "silent", reason: null };
  if (recent.expected < MIN_WINDOW || recent.rate === null) return { state: "unknown", reason: null };

  // DROPPED is tested first, because where both apply it is the more useful
  // thing to tell a teacher: "was working every day, now isn't" points at
  // something that changed, where "works two days in ten" does not.
  const haveBaseline = prior.expected >= MIN_WINDOW && prior.rate !== null;
  if (haveBaseline && recent.rate <= prior.rate! * 0.6) {
    return { state: "check-in", reason: "dropped" };
  }

  if (recent.rate <= LOW_RATE) return { state: "check-in", reason: "low" };

  // Without a baseline we will not call a trend, but note that we have already
  // applied the LOW floor above — so "unknown" here means genuinely unremarkable
  // activity with too little history to say more, never a struggling child.
  return haveBaseline ? { state: "steady", reason: null } : { state: "unknown", reason: null };
}

export function engagementSignal(input: {
  /** Instructional days in the period, from the school's published calendar. */
  instructional: string[];
  attendance: AttendanceMark[];
  events: ActivityEvent[];
}): EngagementSignal {
  const expected = expectedDays(input.instructional, input.attendance);
  const split = Math.max(0, expected.length - RECENT_DAYS);
  const priorDays = expected.slice(0, split);
  const recentDays = expected.slice(split);

  const recent = windowFor(input.events, recentDays);
  const prior = windowFor(input.events, priorDays);
  const overall = windowFor(input.events, expected);

  const activeAll = activeDaysIn(input.events, expected);
  const lastActive = activeAll.at(-1) ?? null;
  // Counted in expected days: a child is not "quiet for 8 days" when six of
  // them were a holiday nobody expected them to work through.
  const quietFor = lastActive === null ? null : expected.filter((d) => d > lastActive).length;

  const expectedSet = new Set(expected);
  const seen = new Set(input.events.filter((e) => expectedSet.has(e.date)).map((e) => e.kind));
  const ORDER: ActivityKind[] = ["work", "coursework", "portfolio", "message"];
  const { state, reason } = classify(recent, prior);

  return {
    recent,
    prior,
    overall,
    state,
    reason,
    lastActive,
    quietFor,
    kinds: ORDER.filter((k) => seen.has(k)),
  };
}

const KIND_LABEL: Record<ActivityKind, string> = {
  work: "turned in work",
  coursework: "worked through course material",
  portfolio: "added to their portfolio",
  message: "wrote to their teacher",
};

export function kindLabel(k: ActivityKind): string {
  return KIND_LABEL[k];
}

/**
 * The factual sentence. Safe for a family or a reviewer to read: it counts what
 * happened and makes no claim about the child.
 *
 * Returns null when there is no calendar to count against, rather than
 * inventing a denominator — "0 of 0 days" reads as a failing child.
 */
export function factualSummary(s: EngagementSignal): string | null {
  if (s.overall.expected === 0) return null;
  return `Produced work on ${s.overall.active} of ${s.overall.expected} expected school days`;
}

/**
 * The teacher-only prompt. Never render this to a family — "quieter than usual"
 * is an interpretation of a child, which is the teacher's to make and share in
 * their own words, not ours to publish to a parent.
 */
export function teacherPrompt(s: EngagementSignal): string | null {
  if (s.state === "silent") {
    return s.lastActive
      ? `No work in the last ${s.recent.expected} school days — last active ${s.lastActive}.`
      : `No work recorded yet across ${s.recent.expected} school days.`;
  }
  if (s.state !== "check-in") return null;
  if (s.reason === "dropped") {
    return `Working less than they were — ${s.recent.active} of ${s.recent.expected} recent school days, against ${s.prior.active} of ${s.prior.expected} before.`;
  }
  return `Work on ${s.recent.active} of the last ${s.recent.expected} school days.`;
}

/** Display tone, in the Pill component's vocabulary. "unknown" gets a tone for
 *  completeness, but callers should render no pill at all in that case — an
 *  "unknown" chip beside a child's name is visual noise that says nothing. */
export function stateTone(state: EngagementState): "good" | "warn" | "bad" | "info" {
  switch (state) {
    case "steady":
      return "good";
    case "check-in":
      return "warn";
    case "silent":
      return "bad";
    default:
      return "info";
  }
}

/**
 * The teacher-facing label.
 *
 * Every one of these names an observation or an action, never a property of the
 * child. "Worth a check-in" is something the teacher does; "disengaged" or
 * "low-effort" would be a verdict on a nine-year-old sitting in a list next to
 * their classmates, which is the product this must not become.
 */
export function stateLabel(state: EngagementState): string {
  switch (state) {
    case "steady":
      return "Working steadily";
    case "check-in":
      return "Worth a check-in";
    case "silent":
      return "No recent work";
    default:
      return "Not enough history";
  }
}
