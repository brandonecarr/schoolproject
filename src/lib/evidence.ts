// evidenceFor() — the single most-used query in the app. Ported from server.js.
//
// Assembles one student's proof over a billing window: attendance, submissions
// (joined to their assignment + course), observations, the assignments actually
// delivered to them, and work-sample files — then scores it. This is what the
// Evidence Board, student page, invoice packet, and parent reports all read.

import { prisma } from "@/lib/db";
import { scoreEvidence, type ScoredEvidence } from "@/lib/rules";
import { rollup } from "@/lib/outcomes";
import { periodStart, today } from "@/lib/dates";

export type EvidenceSubmission = {
  id: string;
  assignmentId: string;
  studentId: string;
  status: string;
  submittedAt: string | null;
  responseText: string;
  score: number | null;
  feedback: string;
  gradedAt: string | null;
  assignmentTitle: string;
  points: number;
  dueDate: string | null;
  courseName: string;
};

export type EvidenceAssignment = {
  id: string;
  title: string;
  dueDate: string;
  points: number;
  courseName: string;
};

export type EvidenceSample = {
  id: string;
  label: string;
  ext: string;
  mime: string;
};

export type EvidenceStandard = {
  code: string;
  title: string;
  pct: number;
  mastered: boolean;
};

export type Evidence = ScoredEvidence & {
  attendance: { id: string; date: string; status: string }[];
  submissions: EvidenceSubmission[];
  observations: { id: string; date: string; text: string; author: string }[];
  assignments: EvidenceAssignment[];
  samples: EvidenceSample[];
  // Standards demonstrated in this window (empty when the school tracks none).
  standards: EvidenceStandard[];
  standardsMastered: number;
};

export async function evidenceFor(
  studentId: string,
  start: string = periodStart(),
  end: string = today()
): Promise<Evidence> {
  const inRange = (d: string) => d >= start && d <= end;

  // Pull everything for this student, then join in memory (small per-student
  // sets — the same shape as the MVP's JSON store did it).
  const [attendanceAll, subsRaw, observationsAll, filesAll, outcomeResultsAll] = await Promise.all([
    prisma.attendance.findMany({ where: { studentId } }),
    prisma.submission.findMany({ where: { studentId } }),
    prisma.observation.findMany({ where: { studentId } }),
    prisma.fileRec.findMany({ where: { studentId } }),
    prisma.outcomeResult.findMany({ where: { studentId } }),
  ]);

  const attendance = attendanceAll.filter((a) => inRange(a.date));
  const observations = observationsAll
    .filter((o) => inRange(o.date))
    .map((o) => ({ id: o.id, date: o.date, text: o.text, author: o.author }));

  // Join submissions to assignment + course.
  const assignmentIds = [...new Set(subsRaw.map((s) => s.assignmentId))];
  const assignmentRows = assignmentIds.length
    ? await prisma.assignment.findMany({ where: { id: { in: assignmentIds } } })
    : [];
  const courseIds = [...new Set(assignmentRows.map((a) => a.courseId))];
  const courseRows = courseIds.length
    ? await prisma.course.findMany({ where: { id: { in: courseIds } } })
    : [];
  const courseName = (courseId: string) => courseRows.find((c) => c.id === courseId)?.name || "—";

  const submissions: EvidenceSubmission[] = subsRaw.map((s) => {
    const a = assignmentRows.find((x) => x.id === s.assignmentId);
    return {
      id: s.id,
      assignmentId: s.assignmentId,
      studentId: s.studentId,
      status: s.status,
      submittedAt: s.submittedAt,
      responseText: s.responseText,
      score: s.score,
      feedback: s.feedback,
      gradedAt: s.gradedAt,
      assignmentTitle: a ? a.title : "—",
      points: a ? a.points : 0,
      dueDate: a ? a.dueDate : null,
      courseName: a ? courseName(a.courseId) : "—",
    };
  });

  const assignments: EvidenceAssignment[] = assignmentRows.map((a) => ({
    id: a.id,
    title: a.title,
    dueDate: a.dueDate,
    points: a.points,
    courseName: courseName(a.courseId),
  }));

  const samples: EvidenceSample[] = filesAll
    .filter((f) => inRange((f.capturedAt || "").slice(0, 10)))
    .map((f) => ({ id: f.id, label: f.label, ext: f.ext, mime: f.mime }));

  // Standards demonstrated in this window. Rolled up per outcome (highest
  // attempt wins), so re-attempts read as growth rather than extra rows.
  const resultsInRange = outcomeResultsAll.filter((r) => inRange((r.recordedAt || "").slice(0, 10)));
  let standards: EvidenceStandard[] = [];
  if (resultsInRange.length > 0) {
    const outcomeIds = [...new Set(resultsInRange.map((r) => r.outcomeId))];
    const outcomeRows = await prisma.outcome.findMany({ where: { id: { in: outcomeIds } } });
    const school = await prisma.school.findUnique({ where: { id: outcomeRows[0]?.schoolId ?? "" } });
    const threshold = school?.masteryThreshold ?? 0.8;

    standards = outcomeIds
      .map((id) => {
        const o = outcomeRows.find((x) => x.id === id);
        const r = rollup(
          id,
          resultsInRange.map((x) => ({
            outcomeId: x.outcomeId,
            score: x.score,
            possible: x.possible,
            recordedAt: x.recordedAt,
          })),
          threshold
        );
        return {
          code: o?.code ?? "—",
          title: o?.title ?? "—",
          pct: r.pct ?? 0,
          mastered: r.mastered,
        };
      })
      .sort((a, b) => (a.code < b.code ? -1 : 1));
  }
  const standardsMastered = standards.filter((s) => s.mastered).length;

  const scored = scoreEvidence({
    attendance,
    submissions,
    observations,
    assignments,
    samples,
    standards: standards.length > 0 ? { assessed: standards.length, mastered: standardsMastered } : null,
  });

  return {
    attendance,
    submissions,
    observations,
    assignments,
    samples,
    standards,
    standardsMastered,
    ...scored,
  };
}
