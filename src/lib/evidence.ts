// evidenceFor() — the single most-used query in the app. Ported from server.js.
//
// Assembles one student's proof over a billing window: attendance, submissions
// (joined to their assignment + course), observations, the assignments actually
// delivered to them, and work-sample files — then scores it. This is what the
// Evidence Board, student page, invoice packet, and parent reports all read.

import { prisma } from "@/lib/db";
import { scoreEvidence, type ScoredEvidence } from "@/lib/rules";
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

export type Evidence = ScoredEvidence & {
  attendance: { id: string; date: string; status: string }[];
  submissions: EvidenceSubmission[];
  observations: { id: string; date: string; text: string; author: string }[];
  assignments: EvidenceAssignment[];
  samples: EvidenceSample[];
};

export async function evidenceFor(
  studentId: string,
  start: string = periodStart(),
  end: string = today()
): Promise<Evidence> {
  const inRange = (d: string) => d >= start && d <= end;

  // Pull everything for this student, then join in memory (small per-student
  // sets — the same shape as the MVP's JSON store did it).
  const [attendanceAll, subsRaw, observationsAll, filesAll] = await Promise.all([
    prisma.attendance.findMany({ where: { studentId } }),
    prisma.submission.findMany({ where: { studentId } }),
    prisma.observation.findMany({ where: { studentId } }),
    prisma.fileRec.findMany({ where: { studentId } }),
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

  const scored = scoreEvidence({ attendance, submissions, observations, assignments, samples });

  return { attendance, submissions, observations, assignments, samples, ...scored };
}
