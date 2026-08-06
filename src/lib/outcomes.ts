// Standards / learning-outcome mastery.
//
// Pure domain logic (no prisma imports) so it can be unit-tested and used from
// both server actions and client components. The rollup rules mirror what LMSes
// like Canvas do: a student attempts an outcome many times, and the *rollup*
// decides what their current level is.
//
// Why this matters for Cohort: "the student demonstrated mastery of these
// standards" is the strongest single piece of ESA evidence a microschool can
// produce, and it doubles as the progress report families actually want.

export type MasteryMethod = "highest" | "latest" | "decaying";

export const MASTERY_METHOD_LABEL: Record<MasteryMethod, string> = {
  highest: "Highest score",
  latest: "Most recent score",
  decaying: "Decaying average (recent work counts more)",
};

export type ResultLike = {
  outcomeId: string;
  score: number;
  possible: number;
  recordedAt: string; // ISO
};

export type MasteryStatus = "mastered" | "near" | "developing" | "none";

export type Rollup = {
  outcomeId: string;
  attempts: number;
  pct: number | null; // 0..1 rolled-up level, null when never assessed
  mastered: boolean;
  status: MasteryStatus;
  lastAt: string | null;
};

export const pctOf = (r: { score: number; possible: number }): number =>
  r.possible > 0 ? Math.max(0, Math.min(1, r.score / r.possible)) : 0;

// Canvas-style decaying average: the most recent attempt carries 65% of the
// weight, the mean of everything earlier carries 35%. With one attempt it is
// just that attempt.
export function decayingAverage(pcts: number[], recentWeight = 0.65): number {
  if (pcts.length === 0) return 0;
  if (pcts.length === 1) return pcts[0];
  const recent = pcts[pcts.length - 1];
  const rest = pcts.slice(0, -1);
  const priorMean = rest.reduce((a, b) => a + b, 0) / rest.length;
  return recent * recentWeight + priorMean * (1 - recentWeight);
}

export function statusFor(pct: number | null, threshold: number): MasteryStatus {
  if (pct == null) return "none";
  if (pct >= threshold) return "mastered";
  if (pct >= threshold * 0.75) return "near";
  return "developing";
}

export const STATUS_META: Record<
  MasteryStatus,
  { label: string; tone: "good" | "warn" | "bad" | "info"; short: string }
> = {
  mastered: { label: "Mastered", tone: "good", short: "M" },
  near: { label: "Almost there", tone: "warn", short: "A" },
  developing: { label: "Developing", tone: "bad", short: "D" },
  none: { label: "Not assessed yet", tone: "info", short: "—" },
};

// Roll one outcome's attempts up to a single level.
export function rollup(
  outcomeId: string,
  results: ResultLike[],
  threshold: number,
  method: MasteryMethod = "highest"
): Rollup {
  const mine = results
    .filter((r) => r.outcomeId === outcomeId)
    .slice()
    .sort((a, b) => (a.recordedAt < b.recordedAt ? -1 : a.recordedAt > b.recordedAt ? 1 : 0));

  if (mine.length === 0) {
    return { outcomeId, attempts: 0, pct: null, mastered: false, status: "none", lastAt: null };
  }

  const pcts = mine.map(pctOf);
  let pct: number;
  if (method === "latest") pct = pcts[pcts.length - 1];
  else if (method === "decaying") pct = decayingAverage(pcts);
  else pct = Math.max(...pcts);

  const status = statusFor(pct, threshold);
  return {
    outcomeId,
    attempts: mine.length,
    pct,
    mastered: status === "mastered",
    status,
    lastAt: mine[mine.length - 1].recordedAt,
  };
}

// Roll up every outcome for one student.
export function rollupAll(
  outcomeIds: string[],
  results: ResultLike[],
  threshold: number,
  method: MasteryMethod = "highest"
): Rollup[] {
  return outcomeIds.map((id) => rollup(id, results, threshold, method));
}

export type MasterySummary = {
  total: number;
  mastered: number;
  near: number;
  developing: number;
  notAssessed: number;
  assessed: number;
  masteredPct: number; // of assessed outcomes
};

export function summarize(rollups: Rollup[]): MasterySummary {
  const mastered = rollups.filter((r) => r.status === "mastered").length;
  const near = rollups.filter((r) => r.status === "near").length;
  const developing = rollups.filter((r) => r.status === "developing").length;
  const notAssessed = rollups.filter((r) => r.status === "none").length;
  const assessed = rollups.length - notAssessed;
  return {
    total: rollups.length,
    mastered,
    near,
    developing,
    notAssessed,
    assessed,
    masteredPct: assessed > 0 ? Math.round((mastered / assessed) * 100) : 0,
  };
}

// --- Starter packs -------------------------------------------------------
// ⚑ IMPORTANT: these are EDITABLE STARTER TEMPLATES, not official state
// standards. Codes are intentionally generic (MATH-4.1, not a real state code)
// so nobody mistakes them for an authoritative list. Every school must replace
// or verify them against the standards its ESA program actually recognizes —
// the same "verify before you rely on it" rule the ESA program data follows.

export type PackOutcome = { code: string; title: string; description?: string };
export type StarterPack = {
  key: string;
  subject: string;
  gradeBand: string;
  label: string;
  outcomes: PackOutcome[];
};

export const STARTER_PACKS: StarterPack[] = [
  {
    key: "math-k2",
    subject: "Math",
    gradeBand: "K-2",
    label: "Math · K–2 foundations",
    outcomes: [
      { code: "MATH-K2.1", title: "Counts, reads, and writes numbers to 120" },
      { code: "MATH-K2.2", title: "Adds and subtracts within 20 fluently" },
      { code: "MATH-K2.3", title: "Understands place value to the hundreds" },
      { code: "MATH-K2.4", title: "Measures length and tells time to the half hour" },
      { code: "MATH-K2.5", title: "Identifies and describes two- and three-dimensional shapes" },
    ],
  },
  {
    key: "math-35",
    subject: "Math",
    gradeBand: "3-5",
    label: "Math · 3–5 core skills",
    outcomes: [
      { code: "MATH-35.1", title: "Multiplies and divides multi-digit whole numbers" },
      { code: "MATH-35.2", title: "Understands fractions as numbers and compares them" },
      { code: "MATH-35.3", title: "Adds and subtracts fractions with unlike denominators" },
      { code: "MATH-35.4", title: "Solves multi-step word problems and explains the reasoning" },
      { code: "MATH-35.5", title: "Finds area, perimeter, and volume" },
      { code: "MATH-35.6", title: "Represents and interprets data on graphs" },
    ],
  },
  {
    key: "math-68",
    subject: "Math",
    gradeBand: "6-8",
    label: "Math · 6–8 pre-algebra",
    outcomes: [
      { code: "MATH-68.1", title: "Works with ratios, rates, and proportional relationships" },
      { code: "MATH-68.2", title: "Operates fluently with rational numbers" },
      { code: "MATH-68.3", title: "Writes and solves one- and two-step equations" },
      { code: "MATH-68.4", title: "Understands functions and linear relationships" },
      { code: "MATH-68.5", title: "Applies statistics and probability to real data" },
    ],
  },
  {
    key: "ela-k2",
    subject: "Language Arts",
    gradeBand: "K-2",
    label: "Language Arts · K–2 literacy",
    outcomes: [
      { code: "ELA-K2.1", title: "Decodes words using phonics and word-analysis skills" },
      { code: "ELA-K2.2", title: "Reads grade-level text with accuracy and fluency" },
      { code: "ELA-K2.3", title: "Retells a story including key details" },
      { code: "ELA-K2.4", title: "Writes complete sentences with correct capitalization and punctuation" },
      { code: "ELA-K2.5", title: "Participates in conversations and asks clarifying questions" },
    ],
  },
  {
    key: "ela-35",
    subject: "Language Arts",
    gradeBand: "3-5",
    label: "Language Arts · 3–5 reading & writing",
    outcomes: [
      { code: "ELA-35.1", title: "Determines the main idea and supports it with text evidence" },
      { code: "ELA-35.2", title: "Infers meaning and draws conclusions from a text" },
      { code: "ELA-35.3", title: "Writes a clear narrative with sequence and detail" },
      { code: "ELA-35.4", title: "Writes an opinion or argument supported by reasons" },
      { code: "ELA-35.5", title: "Uses correct grammar, spelling, and mechanics" },
      { code: "ELA-35.6", title: "Researches a topic and reports findings in their own words" },
    ],
  },
  {
    key: "sci-35",
    subject: "Science",
    gradeBand: "3-5",
    label: "Science · 3–5 inquiry",
    outcomes: [
      { code: "SCI-35.1", title: "Asks testable questions and plans an investigation" },
      { code: "SCI-35.2", title: "Collects, records, and interprets observations" },
      { code: "SCI-35.3", title: "Explains relationships in an ecosystem" },
      { code: "SCI-35.4", title: "Describes matter, energy, and simple forces" },
      { code: "SCI-35.5", title: "Constructs an explanation supported by evidence" },
    ],
  },
  {
    key: "soc-35",
    subject: "Social Studies",
    gradeBand: "3-5",
    label: "Social Studies · 3–5",
    outcomes: [
      { code: "SOC-35.1", title: "Uses maps and geographic tools" },
      { code: "SOC-35.2", title: "Explains civic roles, rules, and government basics" },
      { code: "SOC-35.3", title: "Places historical events in sequence and context" },
      { code: "SOC-35.4", title: "Understands basic economic choices and trade" },
    ],
  },
];

export function packByKey(key: string): StarterPack | undefined {
  return STARTER_PACKS.find((p) => p.key === key);
}
