// Activity feed — merges a child's day into one reverse-chronological timeline:
// graded work, teacher observations, work-sample photos, and notable attendance.
// This is the surface a parent opens every day.

import { prisma } from "@/lib/db";

export type FeedItem = {
  id: string;
  type: "work" | "observation" | "sample" | "attendance";
  ts: number; // sort key (ms)
  date: string; // display date (YYYY-MM-DD or ISO)
  studentName: string;
  title: string;
  detail: string;
  fileId?: string; // for sample thumbnails
  mime?: string;
};

const toTs = (d: string | null | undefined): number => {
  if (!d) return 0;
  const s = String(d);
  return Date.parse(s.length === 10 ? `${s}T12:00:00` : s) || 0;
};

export async function buildActivityFeed(
  students: { id: string; name: string }[],
  limit = 40
): Promise<FeedItem[]> {
  const ids = students.map((s) => s.id);
  const nameOf = (id: string) => students.find((s) => s.id === id)?.name || "—";
  if (ids.length === 0) return [];

  const [subs, observations, files, attendance] = await Promise.all([
    prisma.submission.findMany({ where: { studentId: { in: ids }, status: "graded" } }),
    prisma.observation.findMany({ where: { studentId: { in: ids } } }),
    prisma.fileRec.findMany({ where: { studentId: { in: ids } } }),
    prisma.attendance.findMany({
      where: { studentId: { in: ids }, status: { in: ["absent", "excused"] } },
    }),
  ]);

  const aIds = [...new Set(subs.map((s) => s.assignmentId))];
  const assignments = aIds.length
    ? await prisma.assignment.findMany({ where: { id: { in: aIds } } })
    : [];
  const titleOf = (assignmentId: string) =>
    assignments.find((a) => a.id === assignmentId)?.title || "Assignment";
  const pointsOf = (assignmentId: string) =>
    assignments.find((a) => a.id === assignmentId)?.points ?? 0;

  const items: FeedItem[] = [];

  for (const s of subs) {
    items.push({
      id: `w_${s.id}`,
      type: "work",
      ts: toTs(s.gradedAt || s.submittedAt),
      date: (s.gradedAt || s.submittedAt || "").slice(0, 10),
      studentName: nameOf(s.studentId),
      title: titleOf(s.assignmentId),
      detail:
        `Scored ${s.score}/${pointsOf(s.assignmentId)}` +
        (s.feedback ? ` — “${s.feedback}”` : ""),
    });
  }
  for (const o of observations) {
    items.push({
      id: `o_${o.id}`,
      type: "observation",
      ts: toTs(o.date),
      date: o.date,
      studentName: nameOf(o.studentId),
      title: "Observation",
      detail: o.text,
    });
  }
  for (const f of files) {
    items.push({
      id: `f_${f.id}`,
      type: "sample",
      ts: toTs(f.capturedAt),
      date: (f.capturedAt || "").slice(0, 10),
      studentName: nameOf(f.studentId),
      title: f.label,
      detail: "Work sample added",
      fileId: f.id,
      mime: f.mime,
    });
  }
  for (const a of attendance) {
    items.push({
      id: `a_${a.id}`,
      type: "attendance",
      ts: toTs(a.date),
      date: a.date,
      studentName: nameOf(a.studentId),
      title: a.status === "excused" ? "Excused absence" : "Marked absent",
      detail: a.note || "",
    });
  }

  return items.sort((x, y) => y.ts - x.ts).slice(0, limit);
}
