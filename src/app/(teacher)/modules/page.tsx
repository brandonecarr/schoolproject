import Link from "next/link";
import { requireSchoolTeacher } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Notice, Pill } from "@/components/ui";
import { KIND_ICON } from "@/lib/modules";
import { createModule, moveModule } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Modules — Cohort" };

export default async function ModulesIndex({
  searchParams,
}: {
  searchParams: Promise<{ deleted?: string; err?: string }>;
}) {
  const { school } = await requireSchoolTeacher();
  const sp = await searchParams;

  const [modules, items, courses] = await Promise.all([
    prisma.module.findMany({ where: { schoolId: school!.id }, orderBy: { position: "asc" } }),
    prisma.moduleItem.findMany({ where: { schoolId: school!.id }, orderBy: { position: "asc" } }),
    prisma.course.findMany({ where: { schoolId: school!.id }, orderBy: { createdAt: "asc" } }),
  ]);
  const courseName = (id: string | null) =>
    id ? courses.find((c) => c.id === id)?.name ?? "—" : "All courses";
  const itemsOf = (moduleId: string) => items.filter((i) => i.moduleId === moduleId);

  return (
    <>
      {sp.deleted && <Notice tone="good">Module deleted.</Notice>}
      {sp.err === "name" && <Notice tone="bad">A module needs a name.</Notice>}

      <div className="topbar">
        <div>
          <div className="eyebrow">The path students follow</div>
          <h1>Modules</h1>
        </div>
        <Link className="btn sec" href="/pages">
          Pages →
        </Link>
      </div>

      <p className="muted" style={{ margin: "0 0 14px", maxWidth: "64ch" }}>
        A module is a sequence — read this page, then do this assignment, then the next one. You can
        hold a module until a date, require the previous one first, or make items open strictly in
        order. Structured instruction is also easier to defend as ESA evidence than a loose pile of
        assignments.
      </p>

      <details className="card" open={modules.length === 0}>
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>New module</summary>
        <form action={createModule} style={{ marginTop: 10 }}>
          <div className="row" style={{ gap: 12 }}>
            <div style={{ flex: 2, minWidth: 220 }}>
              <label htmlFor="name">Name</label>
              <input id="name" name="name" required placeholder="Unit 1 — Fractions" />
            </div>
            <div style={{ flex: 1, minWidth: 180 }}>
              <label htmlFor="courseId">Course</label>
              <select id="courseId" name="courseId" defaultValue="">
                <option value="">All courses</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <label htmlFor="description">Description (optional)</label>
          <input id="description" name="description" placeholder="What this unit covers" />
          <button className="btn mark" style={{ marginTop: 12 }}>
            Create module
          </button>
        </form>
      </details>

      <div className="sep" />

      {modules.length === 0 ? (
        <div className="card">
          <p className="muted small" style={{ margin: 0 }}>
            No modules yet. Create one above, then add pages and assignments to it.
          </p>
        </div>
      ) : (
        modules.map((m, idx) => {
          const mine = itemsOf(m.id);
          const required = mine.filter((i) => i.required && i.kind !== "header").length;
          return (
            <div key={m.id} className="card">
              <div className="spread" style={{ gap: 12, alignItems: "flex-start" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="eyebrow" style={{ margin: 0 }}>
                    {courseName(m.courseId)}
                  </div>
                  <h2 style={{ margin: "2px 0 0" }}>
                    <Link href={`/modules/${m.id}`} style={{ textDecoration: "none" }}>
                      {m.name}
                    </Link>
                  </h2>
                  <div className="small muted" style={{ marginTop: 4 }}>
                    {mine.length} item{mine.length === 1 ? "" : "s"} · {required} required
                    {m.requireSequential && " · in order"}
                    {m.unlockAt && ` · opens ${m.unlockAt}`}
                    {m.prereqModuleId &&
                      ` · after ${modules.find((x) => x.id === m.prereqModuleId)?.name ?? "another module"}`}
                  </div>
                  {mine.length > 0 && (
                    <div className="small muted" style={{ marginTop: 6 }}>
                      {mine.slice(0, 6).map((i) => (
                        <span key={i.id} style={{ marginRight: 10 }}>
                          {KIND_ICON[i.kind] ?? "•"} {i.title || i.kind}
                        </span>
                      ))}
                      {mine.length > 6 && <span>+{mine.length - 6} more</span>}
                    </div>
                  )}
                </div>
                <div className="row" style={{ gap: 6, alignItems: "center" }}>
                  <Pill tone={m.published ? "good" : "warn"}>
                    {m.published ? "Published" : "Draft"}
                  </Pill>
                  <form action={moveModule}>
                    <input type="hidden" name="id" value={m.id} />
                    <input type="hidden" name="dir" value="up" />
                    <button className="btn ghost sm" disabled={idx === 0} title="Move up">
                      ↑
                    </button>
                  </form>
                  <form action={moveModule}>
                    <input type="hidden" name="id" value={m.id} />
                    <input type="hidden" name="dir" value="down" />
                    <button
                      className="btn ghost sm"
                      disabled={idx === modules.length - 1}
                      title="Move down"
                    >
                      ↓
                    </button>
                  </form>
                  <Link className="btn sec sm" href={`/modules/${m.id}`}>
                    Open
                  </Link>
                </div>
              </div>
            </div>
          );
        })
      )}
    </>
  );
}
