// Running mastery paths: after a grade is finalized, work out what the student
// should get next and assign it.
//
// Called from EVERY path that settles a score — the grading queue, the gradebook
// bulk save, and the auto-graded student submissions — so a rule fires the same
// way no matter how the mark was entered.

import { prisma } from "@/lib/db";
import { pctOf, rulesTriggeredBy, reasonFor } from "@/lib/paths";
import { notifyUsers, studentUserIdFor } from "@/lib/notify";

export async function runMasteryPaths({
  schoolId,
  studentId,
  assignmentId,
  score,
  possible,
}: {
  schoolId: string;
  studentId: string;
  assignmentId: string;
  score: number;
  possible: number;
}): Promise<number> {
  const rules = await prisma.pathRule.findMany({ where: { schoolId, assignmentId } });
  if (rules.length === 0) return 0;

  const pct = pctOf(score, possible);
  const fired = rulesTriggeredBy(
    rules.map((r) => ({
      id: r.id,
      assignmentId: r.assignmentId,
      minPct: r.minPct,
      maxPct: r.maxPct,
      thenAssignmentId: r.thenAssignmentId,
      note: r.note,
    })),
    assignmentId,
    pct
  );
  if (fired.length === 0) return 0;

  const trigger = await prisma.assignment.findUnique({ where: { id: assignmentId } });
  let created = 0;

  for (const rule of fired) {
    const next = await prisma.assignment.findFirst({
      where: { id: rule.thenAssignmentId, schoolId },
    });
    if (!next) continue;

    // Never hand the same student the same work twice — a regrade re-runs the
    // rules, and the student may already have it (or already have done it).
    const existing = await prisma.submission.findFirst({
      where: { studentId, assignmentId: next.id },
    });
    if (existing) continue;

    const reason = reasonFor(rule, trigger?.title ?? "earlier work", pct);
    await prisma.submission.create({
      data: {
        schoolId,
        assignmentId: next.id,
        studentId,
        status: "assigned",
        assignedReason: reason,
      },
    });
    created++;

    await notifyUsers(await studentUserIdFor(studentId), {
      schoolId,
      type: "submitted",
      title: `New work for you: ${next.title}`,
      body: reason,
      linkPath: "/student/work",
    });
  }

  return created;
}
