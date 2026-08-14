// Server-side standards mastery: recording results and reading them back.
// Pure rollup math lives in src/lib/outcomes.ts (no prisma) so it stays testable.

import { prisma } from "@/lib/db";
import { rollupAll, summarize, type Rollup, type MasterySummary, type ResultLike } from "@/lib/outcomes";

// --- write ---------------------------------------------------------------
// Called from every path that finalizes a grade — the teacher's saveGrade and
// the auto-graded student paths (quiz with no manual items, check-off) — so
// mastery accrues as a by-product of normal teaching.
export async function recordOutcomesForSubmission({
  schoolId,
  studentId,
  assignmentId,
  submissionId,
  score,
  possible,
}: {
  schoolId: string;
  studentId: string;
  assignmentId: string;
  submissionId: string;
  score: number;
  possible: number;
}): Promise<number> {
  // Fetched together: with every query paying its own RLS transaction,
  // sequential awaits are what make grading feel slow.
  const [aligns, school] = await Promise.all([
    prisma.outcomeAlignment.findMany({ where: { assignmentId, schoolId } }),
    prisma.school.findUnique({ where: { id: schoolId } }),
  ]);
  if (aligns.length === 0) return 0;

  const threshold = school?.masteryThreshold ?? 0.8;
  const pct = possible > 0 ? Math.max(0, Math.min(1, score / possible)) : 0;
  const now = new Date().toISOString();

  // A regrade corrects the existing attempt rather than logging a second one.
  await prisma.outcomeResult.deleteMany({ where: { submissionId, schoolId } });

  // One insert for all aligned outcomes, not one per row.
  await prisma.outcomeResult.createMany({
    data: aligns.map((a) => ({
      schoolId,
      studentId,
      outcomeId: a.outcomeId,
      assignmentId,
      submissionId,
      score,
      possible,
      mastered: pct >= threshold,
      source: "graded",
      recordedAt: now,
    })),
  });
  return aligns.length;
}

// --- read ----------------------------------------------------------------
export type OutcomeLite = { id: string; code: string; title: string; subject: string };
export type StudentMastery = {
  outcomes: OutcomeLite[];
  rollups: Rollup[];
  summary: MasterySummary;
  threshold: number;
  byOutcome: (id: string) => Rollup | undefined;
};

// One student's mastery across every standard the school tracks. `start`/`end`
// optionally restrict to results recorded in a billing/reporting period.
export async function masteryForStudent(
  studentId: string,
  schoolId: string,
  range?: { start: string; end: string }
): Promise<StudentMastery> {
  const [school, outcomes, resultsRaw] = await Promise.all([
    prisma.school.findUnique({ where: { id: schoolId } }),
    prisma.outcome.findMany({
      where: { schoolId },
      orderBy: [{ subject: "asc" }, { code: "asc" }],
    }),
    prisma.outcomeResult.findMany({ where: { schoolId, studentId } }),
  ]);
  const threshold = school?.masteryThreshold ?? 0.8;

  const inRange = (iso: string) => {
    if (!range) return true;
    const d = (iso || "").slice(0, 10);
    return d >= range.start && d <= range.end;
  };
  const results: ResultLike[] = resultsRaw
    .filter((r) => inRange(r.recordedAt))
    .map((r) => ({
      outcomeId: r.outcomeId,
      score: r.score,
      possible: r.possible,
      recordedAt: r.recordedAt,
    }));

  const lite: OutcomeLite[] = outcomes.map((o) => ({
    id: o.id,
    code: o.code,
    title: o.title,
    subject: o.subject,
  }));
  const rollups = rollupAll(
    lite.map((o) => o.id),
    results,
    threshold
  );
  return {
    outcomes: lite,
    rollups,
    summary: summarize(rollups),
    threshold,
    byOutcome: (id: string) => rollups.find((r) => r.outcomeId === id),
  };
}
