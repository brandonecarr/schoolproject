// LMS domain logic — the shared brain for assignment TYPES.
//
// Imported by both server actions and client builders, so it must stay pure
// TypeScript (no prisma, no server-only imports). It defines the type registry,
// the quiz/worksheet Item shape, config + answer parsing, and auto-scoring.

export type AssignmentType = "written" | "quiz" | "upload" | "checkoff" | "rubric";

export const ASSIGNMENT_TYPES: AssignmentType[] = [
  "written",
  "quiz",
  "upload",
  "checkoff",
  "rubric",
];

export type TypeMeta = {
  key: AssignmentType;
  label: string; // teacher-facing noun ("Quiz")
  icon: string; // schoolbook mark used in lists/pickers
  blurb: string; // one line in the type picker
  studentCta: string; // button label on the student side
  autoGradable: boolean; // can score itself, fully or partly
};

export const TYPE_META: Record<AssignmentType, TypeMeta> = {
  written: {
    key: "written",
    label: "Written response",
    icon: "✎",
    blurb: "A long-form typed answer. You grade it with a score and feedback.",
    studentCta: "Turn it in",
    autoGradable: false,
  },
  quiz: {
    key: "quiz",
    label: "Quiz",
    icon: "◉",
    blurb: "Multiple-choice, true/false, and short answers. Choices score themselves.",
    studentCta: "Submit answers",
    autoGradable: true,
  },
  upload: {
    key: "upload",
    label: "Photo / file upload",
    icon: "▤",
    blurb: "The student turns in a photo or PDF of work done on paper. Becomes a work sample.",
    studentCta: "Upload my work",
    autoGradable: false,
  },
  checkoff: {
    key: "checkoff",
    label: "Reading / practice check-off",
    icon: "☑",
    blurb: "A task the student marks complete, with an optional reflection. Auto-credits on completion.",
    studentCta: "Mark complete",
    autoGradable: true,
  },
  rubric: {
    key: "rubric",
    label: "Rubric-graded project",
    icon: "◆",
    blurb: "Bigger work scored on several named criteria. Strong state evidence.",
    studentCta: "Turn it in",
    autoGradable: false,
  },
};

export function typeMeta(type: string): TypeMeta {
  return TYPE_META[(type as AssignmentType) in TYPE_META ? (type as AssignmentType) : "written"];
}

// --- Items (shared by quiz assignments AND worksheets) ---

export type ItemKind =
  | "mc"
  | "tf"
  | "short"
  | "fill"
  | "multi" // choose all that apply
  | "numeric" // a number, with an allowed tolerance
  | "matching" // pair each left with its right
  | "ordering"; // put the steps in order

export type MatchPair = { left: string; right: string };

export type Item = {
  id: string;
  kind: ItemKind;
  prompt: string;
  choices?: string[]; // mc / multi: the options
  answerIndex?: number; // mc/tf: index of the correct option (tf: 0=True, 1=False)
  answerIndices?: number[]; // multi: every correct option
  answer?: string; // fill: expected text (optional — omit to grade by hand)
  numAnswer?: number; // numeric: the expected value
  tolerance?: number; // numeric: ± allowed (0 = exact)
  pairs?: MatchPair[]; // matching: authored left/right pairs
  ordering?: string[]; // ordering: the steps, stored in correct order
  points: number;
};

export const ITEM_KIND_LABEL: Record<ItemKind, string> = {
  mc: "Multiple choice",
  tf: "True / False",
  short: "Short answer",
  fill: "Fill in the blank",
  multi: "Choose all that apply",
  numeric: "Numeric answer",
  matching: "Matching",
  ordering: "Put in order",
};

// Kinds where the student's response is a set of indices rather than one value.
export const MULTI_VALUE_KINDS: ItemKind[] = ["multi", "matching", "ordering"];

// An item scores itself when the answer key is knowable. Short answer is always
// graded by hand; fill and numeric only when an expected value was supplied.
export function itemIsAuto(item: Item): boolean {
  switch (item.kind) {
    case "mc":
    case "tf":
    case "multi":
    case "matching":
    case "ordering":
      return true;
    case "fill":
      return !!(item.answer && item.answer.trim());
    case "numeric":
      return typeof item.numAnswer === "number" && !Number.isNaN(item.numAnswer);
    default:
      return false;
  }
}

// Deterministic shuffle, seeded by a string.
//
// Matching and ordering questions have to present their options in a scrambled
// order — otherwise the answer is just "pair them top to bottom". But the order
// must be STABLE: the same on the server and the client (or React hydration
// breaks), and the same every time a teacher reopens a submission to review it.
// So this is a seeded permutation, never Math.random().
export function seededOrder(seed: string, length: number): number[] {
  const idx = Array.from({ length }, (_, i) => i);
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // Fisher-Yates driven by a small xorshift PRNG.
  let state = (h >>> 0) || 1;
  const next = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx;
}

// --- Config parsing (per type) ---

export type Criterion = { id: string; label: string; max: number };
export type QuizConfig = { items: Item[] };
export type RubricConfig = { criteria: Criterion[] };
export type CheckoffConfig = { reflection: boolean };

function safeParse<T>(json: string, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

export function parseItems(json: string): Item[] {
  const raw = safeParse<unknown>(json, []);
  const arr = Array.isArray(raw) ? raw : (raw as { items?: unknown })?.items;
  if (!Array.isArray(arr)) return [];
  return (arr as Item[]).filter((i) => i && typeof i.prompt === "string");
}

export function quizConfig(configJson: string): QuizConfig {
  return { items: parseItems(configJson) };
}

export function rubricConfig(configJson: string): RubricConfig {
  const c = safeParse<{ criteria?: Criterion[] }>(configJson, {});
  const criteria = Array.isArray(c.criteria) ? c.criteria : [];
  return { criteria: criteria.filter((x) => x && typeof x.label === "string") };
}

export function checkoffConfig(configJson: string): CheckoffConfig {
  const c = safeParse<{ reflection?: boolean }>(configJson, {});
  return { reflection: !!c.reflection };
}

// --- Answers (student side, stored on Submission.answersJson) ---

// What a student's answer looks like, per kind:
//   mc / tf        → the chosen index (number)
//   short / fill   → the typed text (string)
//   numeric        → the typed number, kept as a string so "" means unanswered
//   multi          → indices of every option ticked (number[])
//   matching       → for each authored pair, the index of the chosen right (number[])
//   ordering       → the authored step indices in the order the student put them (number[])
export type AnswerValue = number | string | number[];
export type QuizAnswer = { itemId: string; value: AnswerValue };
export type RubricAnswer = { critId: string; score: number };
export type CheckoffAnswer = { done: boolean; reflection: string };

export function parseQuizAnswers(json: string): QuizAnswer[] {
  const a = safeParse<QuizAnswer[]>(json, []);
  return Array.isArray(a) ? a : [];
}
export function parseRubricAnswers(json: string): RubricAnswer[] {
  const a = safeParse<RubricAnswer[]>(json, []);
  return Array.isArray(a) ? a : [];
}
export function parseCheckoffAnswer(json: string): CheckoffAnswer {
  return safeParse<CheckoffAnswer>(json, { done: false, reflection: "" });
}

// --- Scoring ---

export function normalize(s: string): string {
  return (s || "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function quizMax(items: Item[]): number {
  return items.reduce((n, i) => n + (Number(i.points) || 0), 0);
}

export function rubricMax(criteria: Criterion[]): number {
  return criteria.reduce((n, c) => n + (Number(c.max) || 0), 0);
}

// The point total the assignment is actually worth, derived from its config
// where the type defines it (quiz/rubric), else the flat `points` field.
export function assignmentMax(type: string, configJson: string, points: number): number {
  if (type === "quiz") return quizMax(parseItems(configJson)) || points;
  if (type === "rubric") return rubricMax(rubricConfig(configJson).criteria) || points;
  return points;
}

export type AutoScore = {
  auto: number; // points earned by self-grading items
  autoMax: number; // points available from self-grading items
  manualMax: number; // points still needing a human
  needsManual: boolean;
};

const asArray = (v: AnswerValue | undefined): number[] =>
  Array.isArray(v) ? v.map(Number).filter((n) => !Number.isNaN(n)) : [];

// Score ONE auto-gradable item, 0..points.
//
// Credit rules, chosen so the mark matches what a teacher would give by hand:
//   - mc / tf / multi / numeric / fill — all-or-nothing. Each is a single
//     judgement: "choose all that apply" is wrong if you missed one or added
//     one, and a number is either inside tolerance or it isn't.
//   - matching / ordering — PROPORTIONAL. Each pair or position is its own
//     small judgement, so getting four of five right earns four fifths. Marking
//     the whole question wrong for one slip would be harsher than any teacher.
export function scoreItem(item: Item, value: AnswerValue | undefined): number {
  const pts = Number(item.points) || 0;
  if (value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) return 0;

  switch (item.kind) {
    case "mc":
    case "tf":
      return Number(value) === item.answerIndex ? pts : 0;

    case "fill":
      return normalize(String(value)) === normalize(item.answer || "") ? pts : 0;

    case "numeric": {
      const given = Number(String(value).trim());
      if (Number.isNaN(given) || typeof item.numAnswer !== "number") return 0;
      const tol = Math.abs(Number(item.tolerance) || 0);
      return Math.abs(given - item.numAnswer) <= tol ? pts : 0;
    }

    case "multi": {
      const want = [...(item.answerIndices ?? [])].sort((a, b) => a - b);
      const got = [...new Set(asArray(value))].sort((a, b) => a - b);
      const same = want.length === got.length && want.every((w, i) => w === got[i]);
      return same ? pts : 0;
    }

    case "matching": {
      const pairs = item.pairs ?? [];
      if (pairs.length === 0) return 0;
      const got = asArray(value);
      // got[i] is the index of the right-hand option chosen for pair i; the
      // correct answer for pair i is right-hand option i.
      const correct = pairs.reduce((n, _p, i) => n + (got[i] === i ? 1 : 0), 0);
      return Math.round((correct / pairs.length) * pts);
    }

    case "ordering": {
      const steps = item.ordering ?? [];
      if (steps.length === 0) return 0;
      const got = asArray(value);
      // got is the authored indices in the student's chosen order, so position
      // p is right when got[p] === p.
      const correct = steps.reduce((n, _s, i) => n + (got[i] === i ? 1 : 0), 0);
      return Math.round((correct / steps.length) * pts);
    }

    default:
      return 0;
  }
}

// Score the self-gradable portion of a quiz. Short answers (and keyless fills
// or numerics) land in manualMax for the teacher to finish.
export function autoScoreQuiz(items: Item[], answers: QuizAnswer[]): AutoScore {
  let auto = 0;
  let autoMax = 0;
  let manualMax = 0;
  for (const item of items) {
    const pts = Number(item.points) || 0;
    if (itemIsAuto(item)) {
      autoMax += pts;
      const ans = answers.find((a) => a.itemId === item.id);
      auto += scoreItem(item, ans?.value);
    } else {
      manualMax += pts;
    }
  }
  return { auto, autoMax, manualMax, needsManual: manualMax > 0 };
}

// True when a submission of this type can be finalized without a human:
// check-offs always; quizzes only when nothing needs manual grading.
export function isAutoComplete(type: string, items?: Item[]): boolean {
  if (type === "checkoff") return true;
  if (type === "quiz" && items) return !items.some((i) => !itemIsAuto(i));
  return false;
}

// --- Submission status ---

export type SubStatus = "assigned" | "draft" | "submitted" | "returned" | "graded";

export function statusMeta(status: string): { label: string; tone: "good" | "warn" | "bad" | "info" } {
  switch (status) {
    case "graded":
      return { label: "Graded", tone: "good" };
    case "submitted":
      return { label: "Turned in", tone: "info" };
    case "draft":
      return { label: "Draft saved", tone: "warn" };
    case "returned":
      return { label: "Returned for revision", tone: "bad" };
    default:
      return { label: "Not started", tone: "warn" };
  }
}
