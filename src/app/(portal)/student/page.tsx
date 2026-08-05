import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fmt, today } from "@/lib/dates";
import { Pill, Notice } from "@/components/ui";
import { computeAchievements } from "@/lib/achievements";
import { submitWork } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "My work — Cohort" };

export default async function StudentPortalPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>;
}) {
  const { user } = await requireRole("student");
  const sp = await searchParams;
  const sid = user.studentId ?? "";

  const student = sid ? await prisma.student.findUnique({ where: { id: sid } }) : null;
  const [subsRaw, attendance] = await Promise.all([
    prisma.submission.findMany({ where: { studentId: sid } }),
    prisma.attendance.findMany({ where: { studentId: sid } }),
  ]);
  const aIds = [...new Set(subsRaw.map((s) => s.assignmentId))];
  const assignments = await prisma.assignment.findMany({ where: { id: { in: aIds } } });
  const courseIds = [...new Set(assignments.map((a) => a.courseId))];
  const courses = await prisma.course.findMany({ where: { id: { in: courseIds } } });
  const assignmentOf = (id: string) => assignments.find((x) => x.id === id);
  const courseName = (assignmentId: string) => {
    const a = assignmentOf(assignmentId);
    return courses.find((c) => c.id === a?.courseId)?.name || "—";
  };

  const subs = subsRaw
    .map((x) => ({ x, a: assignmentOf(x.assignmentId) }))
    .sort((p, q) => (p.a && q.a ? (p.a.dueDate < q.a.dueDate ? 1 : -1) : 0));
  const todo = subs.filter((s) => s.x.status === "assigned");
  const done = subs.filter((s) => s.x.status !== "assigned");
  const recentGraded = done.filter((s) => s.x.status === "graded").slice(0, 3);

  const { streak, stats, badges } = computeAchievements({
    attendance,
    submissions: subsRaw.map((s) => ({
      status: s.status,
      score: s.score,
      points: assignmentOf(s.assignmentId)?.points ?? 0,
      courseName: courseName(s.assignmentId),
    })),
  });
  const firstName = (student ? student.name : user.name).split(" ")[0];
  const td = today();

  return (
    <>
      {sp.sent && (
        <Notice tone="good">Turned in! Your teacher will see it in her grading queue.</Notice>
      )}
      <div className="spread" style={{ alignItems: "flex-end" }}>
        <h1>Hi {firstName}.</h1>
        {streak > 0 && (
          <div className="streak" title={`${streak}-day attendance streak`}>
            🔥 {streak}-day streak
          </div>
        )}
      </div>
      <p className="muted" style={{ marginTop: 4 }}>
        {todo.length
          ? `You have ${todo.length} thing${todo.length === 1 ? "" : "s"} to do.`
          : "You're all caught up. Nice."}
      </p>

      {/* Progress */}
      <div className="grid g3" style={{ marginTop: 16 }}>
        {stats.slice(0, 3).map((s) => (
          <div key={s.label} className="stat">
            <div className="n">{s.value}</div>
            <div className="l">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Achievements */}
      <div className="card" style={{ marginTop: 12 }}>
        <div className="spread">
          <div className="eyebrow">Achievements</div>
          <Link className="small" href="/student/portfolio">
            See my portfolio →
          </Link>
        </div>
        <div className="badges" style={{ marginTop: 10 }}>
          {badges.map((b) => (
            <div key={b.key} className={`badge ${b.earned ? "earned" : ""}`} title={b.hint}>
              <span className="badge-emoji">{b.emoji}</span>
              <span className="badge-label">{b.label}</span>
              <span className="badge-hint">{b.earned ? "Earned" : b.hint}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="sep" />
      <div className="eyebrow">To do</div>
      {todo.length === 0 && (
        <div className="card" style={{ marginTop: 10 }}>
          <p className="muted" style={{ margin: 0 }}>
            Nothing due right now. 🎉
          </p>
        </div>
      )}
      {todo.map(({ x, a }) => {
        const overdue = a ? a.dueDate < td : false;
        return (
          <form key={x.id} action={submitWork} className="card" style={{ marginTop: 10 }}>
            <input type="hidden" name="id" value={x.id} />
            <div className="spread">
              <div className="eyebrow">
                {courseName(x.assignmentId)} · due {fmt(a ? a.dueDate : null)}
              </div>
              {overdue && <Pill tone="bad">Overdue</Pill>}
            </div>
            <h3 style={{ margin: "5px 0 8px" }}>{a ? a.title : "—"}</h3>
            <p className="small" style={{ margin: "0 0 4px" }}>
              {a ? a.instructions : ""}
            </p>
            <label htmlFor={`r_${x.id}`}>Your answer</label>
            <textarea
              id={`r_${x.id}`}
              name="responseText"
              required
              placeholder="Type your work here, or describe what you did on paper."
            />
            <button className="btn mark" style={{ marginTop: 10 }}>
              Turn it in
            </button>
          </form>
        );
      })}

      {recentGraded.length > 0 && (
        <>
          <div className="sep" />
          <div className="spread">
            <div className="eyebrow">Recently graded</div>
            <Link className="small" href="/student/portfolio">
              All my work →
            </Link>
          </div>
          <div className="card" style={{ marginTop: 10, padding: "6px 18px" }}>
            {recentGraded.map(({ x, a }) => (
              <div key={x.id} style={{ padding: "13px 0", borderTop: "1px solid var(--rule)" }}>
                <div className="spread">
                  <strong>{a ? a.title : "—"}</strong>
                  <Pill tone="mark">
                    {x.score}/{a ? a.points : 0}
                  </Pill>
                </div>
                {x.feedback && (
                  <p className="small muted" style={{ margin: "6px 0 0" }}>
                    {x.feedback}
                  </p>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
