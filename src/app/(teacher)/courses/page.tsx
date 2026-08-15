import Link from "next/link";
import { requireSchoolTeacher } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { addCourse } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Courses — Cohort" };

export default async function CoursesPage() {
  const { school } = await requireSchoolTeacher();
  const schoolId = school!.id;
  const courses = await prisma.course.findMany({ where: { schoolId }, orderBy: { createdAt: "asc" } });
  const counts = await prisma.assignment.groupBy({
    by: ["courseId"],
    where: { schoolId },
    _count: { _all: true },
  });
  const countOf = (courseId: string) => counts.find((c) => c.courseId === courseId)?._count._all || 0;

  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">Course of study</div>
          <h1>Courses</h1>
        </div>
      </div>

      <form action={addCourse} className="card">
        <div className="row" style={{ gap: 12 }}>
          <div style={{ flex: 2, minWidth: 220 }}>
            <label htmlFor="n">Course name</label>
            <input id="n" name="name" required placeholder="Math — Multiplication & Fractions" />
          </div>
          <div style={{ flex: 1, minWidth: 160 }}>
            <label htmlFor="s">Subject</label>
            <input id="s" name="subject" required placeholder="Mathematics" />
          </div>
        </div>
        <button className="btn" style={{ marginTop: 12 }}>
          Add course
        </button>
      </form>

      <div className="sep" />
      <div className="grid g2">
        {courses.map((c) => {
          const n = countOf(c.id);
          return (
            <div key={c.id} className="card">
              <div className="eyebrow">{c.subject}</div>
              <h3 style={{ margin: "6px 0 8px" }}>{c.name}</h3>
              <div className="small muted">
                {n} assignment{n === 1 ? "" : "s"}
              </div>
              <Link className="btn sec sm" style={{ marginTop: 12 }} href={`/assignments?course=${c.id}`}>
                View assignments
              </Link>
            </div>
          );
        })}
      </div>
    </>
  );
}
