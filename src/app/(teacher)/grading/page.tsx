import { requireTeacher } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fmt } from "@/lib/dates";
import { Pill } from "@/components/ui";
import { saveGrade } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Grading — Cohort" };

export default async function GradingPage({
  searchParams,
}: {
  searchParams: Promise<{ graded?: string }>;
}) {
  const { school } = await requireTeacher();
  const schoolId = school!.id;
  const sp = await searchParams;

  const queueRaw = await prisma.submission.findMany({
    where: { schoolId, status: "submitted" },
    orderBy: { createdAt: "asc" },
  });
  const aIds = [...new Set(queueRaw.map((s) => s.assignmentId))];
  const sIds = [...new Set(queueRaw.map((s) => s.studentId))];
  const assignments = await prisma.assignment.findMany({ where: { id: { in: aIds } } });
  const students = await prisma.student.findMany({ where: { id: { in: sIds } } });
  const queue = queueRaw.map((s) => ({
    s,
    a: assignments.find((x) => x.id === s.assignmentId),
    st: students.find((x) => x.id === s.studentId),
  }));

  return (
    <>
      {sp.graded && (
        <div className="notice good">
          Graded. That feedback just strengthened this student&apos;s ESA evidence.
        </div>
      )}
      <div className="topbar">
        <div>
          <div className="eyebrow">Waiting on you</div>
          <h1>Grading queue</h1>
        </div>
      </div>

      {queue.length === 0 ? (
        <div className="card">
          <h3>Nothing waiting.</h3>
          <p className="muted" style={{ margin: "8px 0 0" }}>
            When students turn work in, it lands here.
          </p>
        </div>
      ) : (
        queue.map(({ s, a, st }) => (
          <form key={s.id} action={saveGrade} className="card">
            <input type="hidden" name="id" value={s.id} />
            <div className="spread">
              <div>
                <div className="eyebrow">{st ? st.name : "—"}</div>
                <h3 style={{ marginTop: 4 }}>{a ? a.title : "—"}</h3>
              </div>
              <Pill tone="info">Due {fmt(a ? a.dueDate : null)}</Pill>
            </div>
            <p className="small muted" style={{ margin: "10px 0 0" }}>
              Student response: {s.responseText || "—"}
            </p>
            <div className="row" style={{ gap: 12, alignItems: "flex-end" }}>
              <div style={{ width: 150 }}>
                <label htmlFor={`sc_${s.id}`}>Score / {a ? a.points : 0}</label>
                <input id={`sc_${s.id}`} name="score" type="number" min={0} max={a ? a.points : 100} required />
              </div>
              <div style={{ flex: 1, minWidth: 240 }}>
                <label htmlFor={`fb_${s.id}`}>Feedback the parent will see</label>
                <input
                  id={`fb_${s.id}`}
                  name="feedback"
                  placeholder="Steps are clear now. Watch the remainder on #14."
                />
              </div>
              <button className="btn mark">Save grade</button>
            </div>
          </form>
        ))
      )}
    </>
  );
}
