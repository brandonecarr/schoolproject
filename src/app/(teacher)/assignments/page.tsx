import Link from "next/link";
import { requireTeacher } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { today, fmt } from "@/lib/dates";
import { typeMeta } from "@/lib/lms";
import { addAssignment } from "../actions";
import { AssignmentBuilder } from "@/components/AssignmentBuilder";

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
  const students = await prisma.student.findMany({
    where: { schoolId },
    orderBy: { name: "asc" },
  });
  const where = sp.course ? { schoolId, courseId: sp.course } : { schoolId };
  const list = await prisma.assignment.findMany({ where, orderBy: { dueDate: "desc" } });
  const subs = await prisma.submission.findMany({ where: { schoolId } });

  const courseName = (id: string) => courses.find((c) => c.id === id)?.name || "—";

  return (
    <>
      {sp.created && (
        <div className="notice good">
          Assignment created and assigned to {sp.created} student{sp.created === "1" ? "" : "s"}.
        </div>
      )}
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
          today={today()}
        />
      )}

      <div className="sep" />
      <div className="card" style={{ padding: "16px 10px" }}>
        <table>
          <thead>
            <tr>
              <th>Assignment</th>
              <th>Type</th>
              <th>Course</th>
              <th>Due</th>
              <th>Turned in</th>
              <th>Graded</th>
            </tr>
          </thead>
          <tbody>
            {list.map((a) => {
              const mine = subs.filter((s) => s.assignmentId === a.id);
              const m = typeMeta(a.type);
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
                  <td className="small">
                    <span className="typechip">
                      <span aria-hidden>{m.icon}</span> {m.label}
                    </span>
                  </td>
                  <td className="small">{courseName(a.courseId)}</td>
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
                <td colSpan={6} className="muted small" style={{ padding: 16 }}>
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
