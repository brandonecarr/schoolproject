// Gradebook math — pure functions, no prisma, so it stays unit-testable.
//
// Cohort's gradebook is points-based: a student's grade is points earned over
// points possible on the work that has actually been graded. Ungraded work is
// deliberately EXCLUDED from the denominator (rather than counted as zero) so a
// grade never lies about performance just because the teacher is behind on
// marking. Missing work is surfaced separately, as a flag.

export type CellStatus =
  | "graded"
  | "submitted" // turned in, awaiting a grade
  | "returned" // sent back for revision
  | "draft"
  | "missing" // past due, never turned in
  | "assigned"; // not yet due

export type CellInput = {
  submissionId: string;
  studentId: string;
  assignmentId: string;
  status: string;
  score: number | null;
  submittedAt: string | null;
};

export type AssignmentInput = {
  id: string;
  title: string;
  points: number;
  dueDate: string;
  courseId: string;
  type: string;
};

export type Cell = {
  submissionId: string;
  assignmentId: string;
  status: CellStatus;
  score: number | null;
  points: number;
  pct: number | null;
  late: boolean;
};

export type StudentRow = {
  studentId: string;
  cells: Cell[];
  earned: number;
  possible: number;
  pct: number | null;
  letter: string;
  gradedCount: number;
  missingCount: number;
};

// Default scale. Schools can't configure this yet — when that lands it becomes
// a School field and this stays the fallback.
export const DEFAULT_SCALE: { min: number; letter: string }[] = [
  { min: 0.9, letter: "A" },
  { min: 0.8, letter: "B" },
  { min: 0.7, letter: "C" },
  { min: 0.6, letter: "D" },
  { min: 0, letter: "F" },
];

export function letterFor(pct: number | null, scale = DEFAULT_SCALE): string {
  if (pct == null) return "—";
  const hit = scale.find((s) => pct >= s.min);
  return hit ? hit.letter : "F";
}

export function cellStatus(c: CellInput, dueDate: string, today: string): CellStatus {
  if (c.status === "graded") return "graded";
  if (c.status === "submitted") return "submitted";
  if (c.status === "returned") return "returned";
  if (c.status === "draft") return dueDate < today ? "missing" : "draft";
  // assigned
  return dueDate < today ? "missing" : "assigned";
}

export function isLate(submittedAt: string | null, dueDate: string): boolean {
  if (!submittedAt) return false;
  return submittedAt.slice(0, 10) > dueDate;
}

export function buildRow(
  studentId: string,
  assignments: AssignmentInput[],
  cells: CellInput[],
  today: string
): StudentRow {
  const mine = cells.filter((c) => c.studentId === studentId);
  const out: Cell[] = [];
  let earned = 0;
  let possible = 0;
  let gradedCount = 0;
  let missingCount = 0;

  for (const a of assignments) {
    const c = mine.find((x) => x.assignmentId === a.id);
    if (!c) {
      // Not assigned to this student (differentiated work) — no cell.
      out.push({
        submissionId: "",
        assignmentId: a.id,
        status: "assigned",
        score: null,
        points: a.points,
        pct: null,
        late: false,
      });
      continue;
    }
    const status = cellStatus(c, a.dueDate, today);
    const scored = status === "graded" && c.score != null;
    if (scored) {
      earned += c.score as number;
      possible += a.points;
      gradedCount++;
    }
    if (status === "missing") missingCount++;
    out.push({
      submissionId: c.submissionId,
      assignmentId: a.id,
      status,
      score: c.score,
      points: a.points,
      pct: scored && a.points > 0 ? (c.score as number) / a.points : null,
      late: isLate(c.submittedAt, a.dueDate),
    });
  }

  const pct = possible > 0 ? earned / possible : null;
  return {
    studentId,
    cells: out,
    earned,
    possible,
    pct,
    letter: letterFor(pct),
    gradedCount,
    missingCount,
  };
}

// Class average on one assignment, over graded work only.
export function assignmentAverage(assignmentId: string, rows: StudentRow[]): number | null {
  const pcts = rows
    .map((r) => r.cells.find((c) => c.assignmentId === assignmentId))
    .filter((c): c is Cell => !!c && c.pct != null)
    .map((c) => c.pct as number);
  if (pcts.length === 0) return null;
  return pcts.reduce((a, b) => a + b, 0) / pcts.length;
}

export const STATUS_TONE: Record<CellStatus, string> = {
  graded: "g-graded",
  submitted: "g-submitted",
  returned: "g-returned",
  draft: "g-draft",
  missing: "g-missing",
  assigned: "g-assigned",
};

export const STATUS_LABEL: Record<CellStatus, string> = {
  graded: "Graded",
  submitted: "Turned in, needs grading",
  returned: "Returned for revision",
  draft: "Draft saved",
  missing: "Missing — past due",
  assigned: "Not due yet",
};

export const fmtPct = (pct: number | null): string =>
  pct == null ? "—" : `${Math.round(pct * 100)}%`;
