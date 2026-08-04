import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fmt } from "@/lib/dates";
import { Pill, Notice } from "@/components/ui";
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

  const student = user.studentId
    ? await prisma.student.findUnique({ where: { id: user.studentId } })
    : null;

  const subsRaw = await prisma.submission.findMany({ where: { studentId: user.studentId ?? "" } });
  const aIds = [...new Set(subsRaw.map((s) => s.assignmentId))];
  const assignments = await prisma.assignment.findMany({ where: { id: { in: aIds } } });
  const courseIds = [...new Set(assignments.map((a) => a.courseId))];
  const courses = await prisma.course.findMany({ where: { id: { in: courseIds } } });
  const courseName = (assignmentId: string) => {
    const a = assignments.find((x) => x.id === assignmentId);
    return courses.find((c) => c.id === a?.courseId)?.name || "—";
  };

  const subs = subsRaw
    .map((x) => ({ x, a: assignments.find((y) => y.id === x.assignmentId) }))
    .sort((p, q) => (p.a && q.a ? (p.a.dueDate < q.a.dueDate ? 1 : -1) : 0));

  const todo = subs.filter((s) => s.x.status === "assigned");
  const done = subs.filter((s) => s.x.status !== "assigned");
  const firstName = (student ? student.name : user.name).split(" ")[0];

  return (
    <>
      {sp.sent && (
        <Notice tone="good">Turned in. Your teacher will see it in her grading queue.</Notice>
      )}
      <h1>Hi {firstName}.</h1>
      <p className="muted" style={{ marginTop: 4 }}>
        {todo.length
          ? `You have ${todo.length} thing${todo.length === 1 ? "" : "s"} to do.`
          : "You're all caught up."}
      </p>
      <div className="sep" />

      {todo.map(({ x, a }) => (
        <form key={x.id} action={submitWork} className="card">
          <input type="hidden" name="id" value={x.id} />
          <div className="eyebrow">
            {courseName(x.assignmentId)} · due {fmt(a ? a.dueDate : null)}
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
      ))}

      {done.length > 0 && (
        <>
          <div className="sep" />
          <div className="eyebrow">Turned in</div>
          <div className="card" style={{ marginTop: 10, padding: "6px 18px" }}>
            {done.map(({ x, a }) => (
              <div key={x.id} style={{ padding: "13px 0", borderTop: "1px solid var(--rule)" }}>
                <div className="spread">
                  <strong>{a ? a.title : "—"}</strong>
                  {x.status === "graded" ? (
                    <Pill tone="mark">
                      {x.score}/{a ? a.points : 0}
                    </Pill>
                  ) : (
                    <Pill tone="info">waiting on grading</Pill>
                  )}
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
