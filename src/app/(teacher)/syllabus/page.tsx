import Link from "next/link";
import { requireTeacher } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fmt } from "@/lib/dates";
import { typeMeta } from "@/lib/lms";
import { KIND_ICON } from "@/lib/modules";

export const dynamic = "force-dynamic";
export const metadata = { title: "Syllabus — Cohort" };

// Assembled, never authored — the syllabus is a view of the courses, modules,
// and assignments that already exist, so it can't drift from what's being taught.
export default async function SyllabusPage() {
  const { school } = await requireTeacher();
  const schoolId = school!.id;

  const [courses, modules, items, pages, assignments] = await Promise.all([
    prisma.course.findMany({ where: { schoolId }, orderBy: { createdAt: "asc" } }),
    prisma.module.findMany({ where: { schoolId }, orderBy: { position: "asc" } }),
    prisma.moduleItem.findMany({ where: { schoolId }, orderBy: { position: "asc" } }),
    prisma.page.findMany({ where: { schoolId } }),
    prisma.assignment.findMany({ where: { schoolId }, orderBy: { dueDate: "asc" } }),
  ]);

  const modulesOf = (courseId: string | null) => modules.filter((m) => m.courseId === courseId);
  const itemsOf = (moduleId: string) => items.filter((i) => i.moduleId === moduleId);
  const labelOf = (kind: string, refId: string, title: string) => {
    if (kind === "header") return title || "Section";
    if (kind === "page") return pages.find((p) => p.id === refId)?.title ?? "(removed)";
    return assignments.find((a) => a.id === refId)?.title ?? "(removed)";
  };
  const unscheduled = assignments.filter(
    (a) => !items.some((i) => i.kind === "assignment" && i.refId === a.id)
  );
  const schoolWide = modulesOf(null);

  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">What this school teaches</div>
          <h1>Syllabus</h1>
        </div>
        <a className="btn sec" href="/syllabus/print" target="_blank" rel="noreferrer">
          Print / Save as PDF
        </a>
      </div>

      <p className="muted" style={{ margin: "0 0 16px", maxWidth: "64ch" }}>
        Assembled automatically from your courses, modules, and assignments — so it always matches
        what you&apos;re actually teaching. Useful for families, and for showing a reviewer the shape
        of the program.
      </p>

      {schoolWide.length > 0 && (
        <div className="card">
          <div className="eyebrow">School-wide</div>
          {schoolWide.map((m) => (
            <div key={m.id} style={{ marginTop: 10 }}>
              <strong>{m.name}</strong>
              <ul className="crit-list">
                {itemsOf(m.id).map((i) => (
                  <li key={i.id}>
                    {KIND_ICON[i.kind]} {labelOf(i.kind, i.refId, i.title)}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {courses.length === 0 ? (
        <div className="card">
          <p className="muted small" style={{ margin: 0 }}>
            No courses yet. <Link href="/courses">Add a course</Link> to start a syllabus.
          </p>
        </div>
      ) : (
        courses.map((c) => {
          const mods = modulesOf(c.id);
          const courseAssignments = assignments.filter((a) => a.courseId === c.id);
          return (
            <div key={c.id} className="card">
              <div className="eyebrow">{c.subject}</div>
              <h2 style={{ margin: "2px 0 0" }}>{c.name}</h2>
              <div className="small muted" style={{ marginTop: 4 }}>
                {mods.length} module{mods.length === 1 ? "" : "s"} · {courseAssignments.length}{" "}
                assignment{courseAssignments.length === 1 ? "" : "s"}
              </div>

              {mods.length === 0 ? (
                <p className="small muted" style={{ margin: "10px 0 0" }}>
                  No modules yet — <Link href="/modules">build one</Link> to give this course a
                  sequence.
                </p>
              ) : (
                mods.map((m) => (
                  <div key={m.id} style={{ marginTop: 14 }}>
                    <strong>{m.name}</strong>
                    {m.description && (
                      <div className="small muted" style={{ marginTop: 2 }}>
                        {m.description}
                      </div>
                    )}
                    <ul className="crit-list" style={{ marginTop: 6 }}>
                      {itemsOf(m.id).map((i) => {
                        const a =
                          i.kind === "assignment" ? assignments.find((x) => x.id === i.refId) : null;
                        return (
                          <li key={i.id}>
                            {KIND_ICON[i.kind]} {labelOf(i.kind, i.refId, i.title)}
                            {a && (
                              <span className="muted">
                                {" "}
                                · {typeMeta(a.type).label} · {a.points} pts · due {fmt(a.dueDate)}
                              </span>
                            )}
                          </li>
                        );
                      })}
                      {itemsOf(m.id).length === 0 && <li className="muted">Empty</li>}
                    </ul>
                  </div>
                ))
              )}
            </div>
          );
        })
      )}

      {unscheduled.length > 0 && (
        <div className="card">
          <div className="eyebrow">Not in a module yet</div>
          <p className="small muted" style={{ margin: "4px 0 8px" }}>
            These assignments exist but aren&apos;t part of any sequence.
          </p>
          <ul className="crit-list">
            {unscheduled.map((a) => (
              <li key={a.id}>
                {a.title} <span className="muted">· due {fmt(a.dueDate)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
