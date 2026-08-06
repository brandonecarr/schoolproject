import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTeacher } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fmt } from "@/lib/dates";
import { Notice, Pill } from "@/components/ui";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { MarkdownField } from "@/components/MarkdownField";
import { Markdown } from "@/components/Markdown";
import { updatePage, deletePage } from "../../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit page — Cohort" };

export default async function EditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { school } = await requireTeacher();
  const { id } = await params;
  const sp = await searchParams;

  const page = await prisma.page.findFirst({ where: { id, schoolId: school!.id } });
  if (!page) notFound();
  const [courses, usedIn] = await Promise.all([
    prisma.course.findMany({ where: { schoolId: school!.id }, orderBy: { createdAt: "asc" } }),
    prisma.moduleItem.findMany({ where: { schoolId: school!.id, kind: "page", refId: id } }),
  ]);
  const modules = usedIn.length
    ? await prisma.module.findMany({ where: { id: { in: usedIn.map((u) => u.moduleId) } } })
    : [];

  return (
    <>
      {sp.saved && <Notice tone="good">Page saved.</Notice>}

      <div className="topbar">
        <div>
          <div className="eyebrow">Page · updated {fmt(page.updatedAt.toISOString().slice(0, 10))}</div>
          <h1>{page.title}</h1>
        </div>
        <div className="row" style={{ gap: 10, alignItems: "center" }}>
          <Pill tone={page.published ? "good" : "warn"}>
            {page.published ? "Published" : "Draft"}
          </Pill>
          <Link className="btn ghost sm" href="/pages">
            All pages
          </Link>
        </div>
      </div>

      <form action={updatePage} className="card">
        <input type="hidden" name="id" value={page.id} />
        <div className="row" style={{ gap: 12 }}>
          <div style={{ flex: 2, minWidth: 220 }}>
            <label htmlFor="title">Title</label>
            <input id="title" name="title" defaultValue={page.title} required />
          </div>
          <div style={{ flex: 1, minWidth: 180 }}>
            <label htmlFor="courseId">Course</label>
            <select id="courseId" name="courseId" defaultValue={page.courseId ?? ""}>
              <option value="">All courses</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <MarkdownField name="body" label="Content" rows={14} defaultValue={page.body} />
        <div className="spread" style={{ marginTop: 12, alignItems: "center" }}>
          <label className="check">
            <input type="checkbox" name="published" defaultChecked={page.published} /> Published
          </label>
          <button className="btn mark">Save page</button>
        </div>
      </form>

      <div className="card">
        <div className="eyebrow">Student preview</div>
        <div style={{ marginTop: 10 }}>
          {page.body ? (
            <Markdown text={page.body} format={page.format} />
          ) : (
            <p className="muted small" style={{ margin: 0 }}>
              Nothing written yet.
            </p>
          )}
        </div>
      </div>

      <div className="card">
        <div className="eyebrow">Used in</div>
        {modules.length === 0 ? (
          <p className="small muted" style={{ margin: "6px 0 0" }}>
            Not in a module yet. Add it from a <Link href="/modules">module</Link> so students reach
            it in sequence.
          </p>
        ) : (
          <ul className="crit-list" style={{ marginTop: 6 }}>
            {modules.map((m) => (
              <li key={m.id}>
                <Link href={`/modules/${m.id}`}>{m.name}</Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="sep" />
      <details>
        <summary className="small muted" style={{ cursor: "pointer" }}>
          Delete this page
        </summary>
        <p className="small muted" style={{ margin: "8px 0 10px", maxWidth: "60ch" }}>
          Deleting removes it from any module it appears in. Student progress on those items goes
          with it.
        </p>
        <form action={deletePage}>
          <input type="hidden" name="id" value={page.id} />
          <ConfirmSubmit className="btn ghost sm" message={`Delete "${page.title}" permanently?`}>
            Delete page
          </ConfirmSubmit>
        </form>
      </details>
    </>
  );
}
