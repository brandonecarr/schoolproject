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

  // The trigger, every fired rule's target, and the dedupe check arrive in
  // one parallel round instead of two-per-rule sequential lookups.
  const [trigger, nextRows, existingRows, studentUserIds] = await Promise.all([
    prisma.assignment.findUnique({ where: { id: assignmentId } }),
    prisma.assignment.findMany({
      where: { id: { in: fired.map((r) => r.thenAssignmentId) }, schoolId },
    }),
    prisma.submission.findMany({
      where: { studentId, assignmentId: { in: fired.map((r) => r.thenAssignmentId) } },
      select: { assignmentId: true },
    }),
    studentUserIdFor(studentId),
  ]);
  const alreadyHas = new Set(existingRows.map((s) => s.assignmentId));
  let created = 0;

  for (const rule of fired) {
    const next = nextRows.find((a) => a.id === rule.thenAssignmentId);
    if (!next) continue;

    // Never hand the same student the same work twice — a regrade re-runs the
    // rules, and the student may already have it (or already have done it).
    if (alreadyHas.has(next.id)) continue;

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

    await notifyUsers(studentUserIds, {
      schoolId,
      type: "submitted",
      title: `New work for you: ${next.title}`,
      body: reason,
      linkPath: "/student/work",
    });
  }

  return created;
}
