import { requireTeacher } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { today, fmt } from "@/lib/dates";
import { addAssignment } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Assignments — Cohort" };

export default async function AssignmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ course?: string; created?: string }>;
}) {
  const { school } = await requireTeacher();
  const schoolId = school!.id;
  const sp = await searchParams;

  const courses = await prisma.course.findMany({ where: { schoolId }, orderBy: { createdAt: "asc" } });
  const students = await prisma.student.findMany({ where: { schoolId } });
  const where = sp.course ? { schoolId, courseId: sp.course } : { schoolId };
  const list = await prisma.assignment.findMany({ where, orderBy: { dueDate: "desc" } });
  const subs = await prisma.submission.findMany({ where: { schoolId } });

  const courseName = (id: string) => courses.find((c) => c.id === id)?.name || "—";

  return (
    <>
      {sp.created && <div className="notice good">Assignment created and assigned to every student.</div>}
      <div className="topbar">
        <div>
          <div className="eyebrow">Work assigned</div>
          <h1>Assignments</h1>
        </div>
      </div>

      <form action={addAssignment} className="card">
        <div className="row" style={{ gap: 12 }}>
          <div style={{ flex: 2, minWidth: 240 }}>
            <label htmlFor="t">Title</label>
            <input id="t" name="title" required placeholder="Fractions on a number line" />
          </div>
          <div style={{ flex: 1, minWidth: 180 }}>
            <label htmlFor="c">Course</label>
            <select id="c" name="courseId">
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <label htmlFor="i">Instructions for the student</label>
        <textarea
          id="i"
          name="instructions"
          placeholder="Place each fraction on the number line, then explain in one sentence how you decided."
        />
        <div className="row" style={{ gap: 12 }}>
          <div style={{ width: 180 }}>
            <label htmlFor="d">Due</label>
            <input id="d" type="date" name="dueDate" defaultValue={today()} />
          </div>
          <div style={{ width: 120 }}>
            <label htmlFor="p">Points</label>
            <input id="p" type="number" name="points" defaultValue={20} min={1} />
          </div>
        </div>
        <button className="btn" style={{ marginTop: 12 }}>
          Assign to all students
        </button>
      </form>

      <div className="sep" />
      <div className="card" style={{ padding: "16px 10px" }}>
        <table>
          <thead>
            <tr>
              <th>Assignment</th>
              <th>Course</th>
              <th>Due</th>
              <th>Turned in</th>
              <th>Graded</th>
            </tr>
          </thead>
          <tbody>
            {list.map((a) => {
              const mine = subs.filter((s) => s.assignmentId === a.id);
              const instr = a.instructions || "";
              return (
                <tr key={a.id}>
                  <td>
                    <strong>{a.title}</strong>
                    <div className="small muted">
                      {instr.slice(0, 70)}
                      {instr.length > 70 ? "…" : ""}
                    </div>
                  </td>
                  <td className="small">{courseName(a.courseId)}</td>
                  <td className="small">{fmt(a.dueDate)}</td>
                  <td className="mono">
                    {mine.filter((s) => s.status !== "assigned").length}/{students.length}
                  </td>
                  <td className="mono">{mine.filter((s) => s.status === "graded").length}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
