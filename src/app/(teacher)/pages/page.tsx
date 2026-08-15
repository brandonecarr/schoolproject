import Link from "next/link";
import { requireSchoolTeacher } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fmt } from "@/lib/dates";
import { Notice, Pill } from "@/components/ui";
import { stripMarkdown } from "@/lib/markdown";
import { MarkdownField } from "@/components/MarkdownField";
import { createPage } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pages — Cohort" };

export default async function PagesIndex({
  searchParams,
}: {
  searchParams: Promise<{ deleted?: string; err?: string }>;
}) {
  const { school } = await requireSchoolTeacher();
  const sp = await searchParams;

  const [pages, courses] = await Promise.all([
    prisma.page.findMany({ where: { schoolId: school!.id }, orderBy: { updatedAt: "desc" } }),
    prisma.course.findMany({ where: { schoolId: school!.id }, orderBy: { createdAt: "asc" } }),
  ]);
  const courseName = (id: string | null) =>
    id ? courses.find((c) => c.id === id)?.name ?? "—" : "All courses";

  return (
    <>
      {sp.deleted && <Notice tone="good">Page deleted.</Notice>}
      {sp.err === "title" && <Notice tone="bad">A page needs a title.</Notice>}

      <div className="topbar">
        <div>
          <div className="eyebrow">Teaching content</div>
          <h1>Pages</h1>
        </div>
        <Link className="btn sec" href="/modules">
          Modules →
        </Link>
      </div>

      <p className="muted" style={{ margin: "0 0 14px", maxWidth: "62ch" }}>
        A page is something you want a student to read — a lesson, a set of instructions, a reference
        sheet. Pages sit inside modules, so they become part of a sequence rather than loose files.
      </p>

      <details className="card" open={pages.length === 0}>
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>New page</summary>
        <form action={createPage} style={{ marginTop: 10 }}>
          <div className="row" style={{ gap: 12 }}>
            <div style={{ flex: 2, minWidth: 220 }}>
              <label htmlFor="title">Title</label>
              <input id="title" name="title" required placeholder="How to read a number line" />
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
          <MarkdownField name="body" label="Content" rows={10} placeholder="Write the lesson here." />
          <label className="check" style={{ marginTop: 10 }}>
            <input type="checkbox" name="published" defaultChecked /> Published (students can open it)
          </label>
          <button className="btn mark" style={{ marginTop: 12 }}>
            Create page
          </button>
        </form>
      </details>

      <div className="sep" />
      {pages.length === 0 ? (
        <div className="card">
          <p className="muted small" style={{ margin: 0 }}>
            No pages yet. Write your first one above.
          </p>
        </div>
      ) : (
        <div className="card" style={{ padding: "6px 18px" }}>
          {pages.map((p) => (
            <div
              key={p.id}
              className="spread"
              style={{ padding: "12px 0", borderTop: "1px solid var(--rule)", gap: 12 }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <Link href={`/pages/${p.id}`} style={{ fontWeight: 600 }}>
                  {p.title}
                </Link>
                <div className="small muted">
                  {courseName(p.courseId)} · updated {fmt(p.updatedAt.toISOString().slice(0, 10))}
                </div>
                <div className="small muted" style={{ marginTop: 2 }}>
                  {stripMarkdown(p.body).slice(0, 90)}
                  {p.body.length > 90 ? "…" : ""}
                </div>
              </div>
              <Pill tone={p.published ? "good" : "warn"}>{p.published ? "Published" : "Draft"}</Pill>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
