// The trophy case.
//
// The badges were already computed by lib/achievements.ts and already rendered
// in a strip on the student's home page; this gives them the room the handoff
// draws. No new data — computeAchievements takes the same attendance and
// submission rows it always has.
//
// Locked trophies are SHOWN, dimmed, with the requirement spelled out. Hiding
// them would turn the case into a list of things already done, which is a
// record rather than an invitation; the whole point is knowing what is still
// reachable.

import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { computeAchievements } from "@/lib/achievements";
import { PageHead } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Trophy case — Cohort" };

export default async function TrophyCasePage() {
  const { user } = await requireRole("student");
  const sid = user.studentId ?? "";

  const [subsRaw, attendance] = await Promise.all([
    prisma.submission.findMany({ where: { studentId: sid } }),
    prisma.attendance.findMany({ where: { studentId: sid } }),
  ]);
  const assignments = await prisma.assignment.findMany({
    where: { id: { in: [...new Set(subsRaw.map((s) => s.assignmentId))] } },
  });
  const courses = await prisma.course.findMany({
    where: { id: { in: [...new Set(assignments.map((a) => a.courseId))] } },
  });
  const courseNameFor = (assignmentId: string) => {
    const a = assignments.find((x) => x.id === assignmentId);
    return courses.find((c) => c.id === a?.courseId)?.name || "—";
  };

  const { badges } = computeAchievements({
    attendance,
    submissions: subsRaw.map((s) => ({
      status: s.status,
      score: s.score,
      points: assignments.find((a) => a.id === s.assignmentId)?.points ?? 0,
      courseName: courseNameFor(s.assignmentId),
    })),
  });

  const earned = badges.filter((b) => b.earned).length;
  const left = badges.length - earned;

  return (
    <>
      <PageHead
        title="Trophy case"
        sub={left === 0 ? `All ${earned} earned. Every one of them.` : `${earned} earned, ${left} to go.`}
      />

      <div className="trophies big">
        {badges.map((b) => (
          <div key={b.key} className={`trophy ${b.earned ? "" : "locked"}`}>
            <span className="em" aria-hidden>
              {b.emoji}
            </span>
            <div>
              <div className="nm">{b.label}</div>
              <div className="hn">{b.earned ? "Earned" : b.hint}</div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
