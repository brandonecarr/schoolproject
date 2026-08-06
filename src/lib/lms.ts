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

export type ItemKind = "mc" | "tf" | "short" | "fill";

export type Item = {
  id: string;
  kind: ItemKind;
  prompt: string;
  choices?: string[]; // mc: the options
  answerIndex?: number; // mc/tf: index of the correct option (tf: 0=True, 1=False)
  answer?: string; // fill: expected text (optional — omit to grade by hand)
  points: number;
};

export const ITEM_KIND_LABEL: Record<ItemKind, string> = {
  mc: "Multiple choice",
  tf: "True / False",
  short: "Short answer",
  fill: "Fill in the blank",
};

// An item scores itself when the answer key is knowable: mc/tf always, fill only
// when an expected answer was provided. Short answer is always graded by hand.
export function itemIsAuto(item: Item): boolean {
  if (item.kind === "mc" || item.kind === "tf") return true;
  if (item.kind === "fill") return !!(item.answer && item.answer.trim());
  return false;
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

// mc/tf → the chosen index (number); short/fill → the typed text (string).
export type QuizAnswer = { itemId: string; value: number | string };
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

// Score the self-gradable portion of a quiz. Short answers (and keyless fills)
// land in manualMax for the teacher to finish.
export function autoScoreQuiz(items: Item[], answers: QuizAnswer[]): AutoScore {
  let auto = 0;
  let autoMax = 0;
  let manualMax = 0;
  for (const item of items) {
    const pts = Number(item.points) || 0;
    if (itemIsAuto(item)) {
      autoMax += pts;
      const ans = answers.find((a) => a.itemId === item.id);
      if (ans != null) {
        if (item.kind === "fill") {
          if (normalize(String(ans.value)) === normalize(item.answer || "")) auto += pts;
        } else if (Number(ans.value) === item.answerIndex) {
          auto += pts;
        }
      }
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
