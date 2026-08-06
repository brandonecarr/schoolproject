import Link from "next/link";
import { requireTeacher } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { today, fmt } from "@/lib/dates";
import { typeMeta } from "@/lib/lms";
import { stripMarkdown } from "@/lib/markdown";
import { addAssignment, setAssignmentOutcomes } from "../actions";
import { AssignmentBuilder } from "@/components/AssignmentBuilder";

export const dynamic = "force-dynamic";
export const metadata = { title: "Assignments — Cohort" };

export default async function AssignmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ course?: string; created?: string; aligned?: string }>;
}) {
  const { school } = await requireTeacher();
  const schoolId = school!.id;
  const sp = await searchParams;

  const courses = await prisma.course.findMany({ where: { schoolId }, orderBy: { createdAt: "asc" } });
  const students = await prisma.student.findMany({
    where: { schoolId },
    orderBy: { name: "asc" },
  });
  const where = sp.course ? { schoolId, courseId: sp.course } : { schoolId };
  const list = await prisma.assignment.findMany({ where, orderBy: { dueDate: "desc" } });
  const subs = await prisma.submission.findMany({ where: { schoolId } });
  const outcomes = await prisma.outcome.findMany({
    where: { schoolId },
    orderBy: [{ subject: "asc" }, { code: "asc" }],
  });
  const alignments = await prisma.outcomeAlignment.findMany({ where: { schoolId } });

  const courseName = (id: string) => courses.find((c) => c.id === id)?.name || "—";
  const alignedTo = (assignmentId: string) =>
    alignments
      .filter((a) => a.assignmentId === assignmentId)
      .map((a) => outcomes.find((o) => o.id === a.outcomeId))
      .filter(Boolean) as typeof outcomes;

  return (
    <>
      {sp.created && (
        <div className="notice good">
          Assignment created and assigned to {sp.created} student{sp.created === "1" ? "" : "s"}.
        </div>
      )}
      {sp.aligned && <div className="notice good">Standards updated for that assignment.</div>}
      <div className="topbar">
        <div>
          <div className="eyebrow">Work assigned</div>
          <h1>Assignments</h1>
        </div>
        <Link className="btn sec" href="/worksheets">
          Worksheet library →
        </Link>
      </div>

      {courses.length === 0 ? (
        <div className="notice warn">
          Add a course first — <Link href="/courses">create one</Link> — then you can assign work.
        </div>
      ) : (
        <AssignmentBuilder
          action={addAssignment}
          courses={courses.map((c) => ({ id: c.id, name: c.name }))}
          students={students.map((s) => ({ id: s.id, name: s.name, grade: s.grade }))}
          outcomes={outcomes.map((o) => ({
            id: o.id,
            code: o.code,
            title: o.title,
            subject: o.subject,
          }))}
          today={today()}
        />
      )}
      {outcomes.length === 0 && courses.length > 0 && (
        <p className="small muted" style={{ margin: "10px 2px 0" }}>
          Tip: <Link href="/outcomes">add standards</Link> and you can align assignments to them —
          Cohort then tracks mastery automatically as you grade.
        </p>
      )}

      <div className="sep" />
      <div className="card" style={{ padding: "16px 10px" }}>
        <table>
          <thead>
            <tr>
              <th>Assignment</th>
              <th>Type</th>
              <th>Course</th>
              <th>Standards</th>
              <th>Due</th>
              <th>Turned in</th>
              <th>Graded</th>
            </tr>
          </thead>
          <tbody>
            {list.map((a) => {
              const mine = subs.filter((s) => s.assignmentId === a.id);
              const m = typeMeta(a.type);
              // Snippets show readable text, not raw markdown syntax.
              const instr =
                a.instructionsFormat === "markdown"
                  ? stripMarkdown(a.instructions || "")
                  : a.instructions || "";
              return (
                <tr key={a.id}>
                  <td>
                    <strong>{a.title}</strong>
                    <div className="small muted">
                      {instr.slice(0, 70)}
                      {instr.length > 70 ? "…" : ""}
                    </div>
                    {a.resourceFileId && <span className="small muted">▤ resource attached</span>}
                  </td>
                  <td className="small">
                    <span className="typechip">
                      <span aria-hidden>{m.icon}</span> {m.label}
                    </span>
                  </td>
                  <td className="small">{courseName(a.courseId)}</td>
                  <td className="small">
                    {outcomes.length === 0 ? (
                      <span className="muted">—</span>
                    ) : (
                      <details className="align-cell">
                        <summary>
                          {alignedTo(a.id).length ? (
                            alignedTo(a.id).map((o) => (
                              <span key={o.id} className="typechip" style={{ marginRight: 4 }}>
                                {o.code}
                              </span>
                            ))
                          ) : (
                            <span className="muted">Align…</span>
                          )}
                        </summary>
                        <form action={setAssignmentOutcomes} className="align-pop">
                          <input type="hidden" name="assignmentId" value={a.id} />
                          <div className="stu-check">
                            {outcomes.map((o) => (
                              <label key={o.id} className="check" title={o.title}>
                                <input
                                  type="checkbox"
                                  name="outcomeId"
                                  value={o.id}
                                  defaultChecked={alignments.some(
                                    (x) => x.assignmentId === a.id && x.outcomeId === o.id
                                  )}
                                />
                                {o.code}
                              </label>
                            ))}
                          </div>
                          <button className="btn sec sm" style={{ marginTop: 8 }}>
                            Save standards
                          </button>
                        </form>
                      </details>
                    )}
                  </td>
                  <td className="small">{fmt(a.dueDate)}</td>
                  <td className="mono">
                    {mine.filter((s) => s.status !== "assigned" && s.status !== "draft").length}/
                    {mine.length}
                  </td>
                  <td className="mono">{mine.filter((s) => s.status === "graded").length}</td>
                </tr>
              );
            })}
            {list.length === 0 && (
              <tr>
                <td colSpan={7} className="muted small" style={{ padding: 16 }}>
                  No assignments yet. Build your first one above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
