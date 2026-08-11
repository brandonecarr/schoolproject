// "Coming due soon" — the shared forward-looking view of a student's open work.
// Powers the student and parent dashboards so both count the same thing.

import { prisma } from "@/lib/db";
import { today } from "@/lib/dates";

export type DueItem = {
  submissionId: string;
  assignmentId: string;
  studentId: string;
  title: string;
  type: string;
  dueDate: string;
  courseName: string;
  status: string; // assigned | draft | returned
  daysLeft: number; // whole days from today; negative = overdue, 0 = due today
};

// Whole days between two YYYY-MM-DD strings (to - from). Noon anchor avoids DST edge cases.
export function daysBetween(from: string, to: string): number {
  const a = new Date(from + "T12:00:00").getTime();
  const b = new Date(to + "T12:00:00").getTime();
  return Math.round((b - a) / 86_400_000);
}

// A friendly urgency label: "Overdue", "Due today", "Due tomorrow", "in 3 days".
export { dueLabel } from "@/lib/due-label";

// Open work (not yet turned in) for a set of students, joined to assignment +
// course, sorted soonest-due first. Returns everything open; callers slice.
export async function dueSoonForStudents(studentIds: string[]): Promise<DueItem[]> {
  if (studentIds.length === 0) return [];
  const td = today();

  const subs = await prisma.submission.findMany({
    where: { studentId: { in: studentIds }, status: { in: ["assigned", "draft", "returned"] } },
  });
  if (subs.length === 0) return [];

  const aIds = [...new Set(subs.map((s) => s.assignmentId))];
  const assignments = await prisma.assignment.findMany({ where: { id: { in: aIds } } });
  const cIds = [...new Set(assignments.map((a) => a.courseId))];
  const courses = cIds.length ? await prisma.course.findMany({ where: { id: { in: cIds } } }) : [];

  const items: DueItem[] = [];
  for (const s of subs) {
    const a = assignments.find((x) => x.id === s.assignmentId);
    if (!a) continue;
    items.push({
      submissionId: s.id,
      assignmentId: a.id,
      studentId: s.studentId,
      title: a.title,
      type: a.type,
      dueDate: a.dueDate,
      courseName: courses.find((c) => c.id === a.courseId)?.name || "—",
      status: s.status,
      daysLeft: daysBetween(td, a.dueDate),
    });
  }
  items.sort((x, y) => (x.dueDate < y.dueDate ? -1 : x.dueDate > y.dueDate ? 1 : 0));
  return items;
}
