import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSchoolTeacher } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fmt, today } from "@/lib/dates";
import { Notice, Pill } from "@/components/ui";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { KIND_ICON } from "@/lib/modules";
import { typeMeta } from "@/lib/lms";
import {
  updateModule,
  deleteModule,
  addModuleItem,
  removeModuleItem,
  moveModuleItem,
} from "../../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Module — Cohort" };

export default async function ModuleDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; added?: string; err?: string }>;
}) {
  const { school } = await requireSchoolTeacher();
  const { id } = await params;
  const sp = await searchParams;

  const m = await prisma.module.findFirst({ where: { id, schoolId: school!.id } });
  if (!m) notFound();

  const [items, pages, assignments, courses, otherModules] = await Promise.all([
    prisma.moduleItem.findMany({ where: { moduleId: id }, orderBy: { position: "asc" } }),
    prisma.page.findMany({ where: { schoolId: school!.id }, orderBy: { title: "asc" } }),
    prisma.assignment.findMany({ where: { schoolId: school!.id }, orderBy: { dueDate: "desc" } }),
    prisma.course.findMany({ where: { schoolId: school!.id }, orderBy: { createdAt: "asc" } }),
    prisma.module.findMany({
      where: { schoolId: school!.id, NOT: { id } },
      orderBy: { position: "asc" },
    }),
  ]);

  const labelFor = (kind: string, refId: string, title: string) => {
    if (kind === "header") return title || "Section";
    if (kind === "page") return pages.find((p) => p.id === refId)?.title ?? "(page deleted)";
    return assignments.find((a) => a.id === refId)?.title ?? "(assignment deleted)";
  };
  const subFor = (kind: string, refId: string) => {
    if (kind === "page") {
      const p = pages.find((x) => x.id === refId);
      return p ? (p.published ? "Page" : "Page · draft") : "";
    }
    if (kind === "assignment") {
      const a = assignments.find((x) => x.id === refId);
      return a ? `${typeMeta(a.type).label} · ${a.points} pts · due ${fmt(a.dueDate)}` : "";
    }
    return "";
  };

  return (
    <>
      {sp.saved && <Notice tone="good">Module saved.</Notice>}
      {sp.added && <Notice tone="good">Item added.</Notice>}
      {sp.err === "ref" && <Notice tone="bad">Choose what to add.</Notice>}

      <div className="topbar">
        <div>
          <div className="eyebrow">Module</div>
          <h1>{m.name}</h1>
        </div>
        <div className="row" style={{ gap: 10, alignItems: "center" }}>
          <Pill tone={m.published ? "good" : "warn"}>{m.published ? "Published" : "Draft"}</Pill>
          <Link className="btn ghost sm" href="/modules">
            All modules
          </Link>
        </div>
      </div>

      <div className="cmd-grid">
        {/* items */}
        <div>
          <div className="card">
            <div className="eyebrow">Items, in order</div>
            {items.length === 0 ? (
              <p className="small muted" style={{ margin: "8px 0 0" }}>
                Nothing in this module yet. Add a page or an assignment below.
              </p>
            ) : (
              <div style={{ marginTop: 8 }}>
                {items.map((it, idx) => (
                  <div
                    key={it.id}
                    className="spread"
                    style={{ padding: "11px 0", borderTop: "1px solid var(--rule)", gap: 10 }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: it.kind === "header" ? 700 : 600 }}>
                        <span aria-hidden style={{ marginRight: 6, color: "var(--blue)" }}>
                          {KIND_ICON[it.kind] ?? "•"}
                        </span>
                        {labelFor(it.kind, it.refId, it.title)}
                      </div>
                      <div className="small muted">
                        {subFor(it.kind, it.refId)}
                        {it.kind !== "header" && !it.required && " · optional"}
                        {it.minScore != null && ` · needs ${it.minScore} pts to pass`}
                      </div>
                    </div>
                    <div className="row" style={{ gap: 6 }}>
                      <form action={moveModuleItem}>
                        <input type="hidden" name="id" value={it.id} />
                        <input type="hidden" name="dir" value="up" />
                        <button className="btn ghost sm" disabled={idx === 0}>
                          ↑
                        </button>
                      </form>
                      <form action={moveModuleItem}>
                        <input type="hidden" name="id" value={it.id} />
                        <input type="hidden" name="dir" value="down" />
                        <button className="btn ghost sm" disabled={idx === items.length - 1}>
                          ↓
                        </button>
                      </form>
                      <form action={removeModuleItem}>
                        <input type="hidden" name="id" value={it.id} />
                        <button className="btn ghost sm">Remove</button>
                      </form>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* add item */}
          <div className="card">
            <div className="eyebrow">Add an item</div>
            <form action={addModuleItem} style={{ marginTop: 8 }}>
              <input type="hidden" name="moduleId" value={m.id} />
              <div className="row" style={{ gap: 12 }}>
                <div style={{ width: 150 }}>
                  <label htmlFor="kind">Type</label>
                  <select id="kind" name="kind" defaultValue="page">
                    <option value="page">Page</option>
                    <option value="assignment">Assignment</option>
                    <option value="header">Section header</option>
                  </select>
                </div>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <label htmlFor="refId">Which one</label>
                  <select id="refId" name="refId" defaultValue="">
                    <option value="">— choose —</option>
                    <optgroup label="Pages">
                      {pages.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.title}
                          {p.published ? "" : " (draft)"}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Assignments">
                      {assignments.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.title}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </div>
              </div>
              <div className="row" style={{ gap: 12 }}>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <label htmlFor="title">Header text / label override</label>
                  <input id="title" name="title" placeholder="Only needed for a section header" />
                </div>
                <div style={{ width: 150 }}>
                  <label htmlFor="minScore">Pass mark (optional)</label>
                  <input id="minScore" name="minScore" type="number" min={0} placeholder="e.g. 8" />
                </div>
              </div>
              <label className="check" style={{ marginTop: 10 }}>
                <input type="checkbox" name="required" defaultChecked /> Required to finish the module
              </label>
              <button className="btn mark" style={{ marginTop: 12 }}>
                Add to module
              </button>
            </form>
            <p className="small muted" style={{ margin: "10px 0 0" }}>
              Don&apos;t see what you need? Write a <Link href="/pages">page</Link> or create an{" "}
              <Link href="/assignments">assignment</Link> first.
            </p>
          </div>
        </div>

        {/* settings */}
        <div>
          <form action={updateModule} className="card">
            <input type="hidden" name="id" value={m.id} />
            <div className="eyebrow">Settings</div>
            <label htmlFor="name">Name</label>
            <input id="name" name="name" defaultValue={m.name} required />
            <label htmlFor="description">Description</label>
            <input id="description" name="description" defaultValue={m.description} />
            <label htmlFor="courseId">Course</label>
            <select id="courseId" name="courseId" defaultValue={m.courseId ?? ""}>
              <option value="">All courses</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            <label htmlFor="unlockAt">Opens on (optional)</label>
            <input
              id="unlockAt"
              type="date"
              name="unlockAt"
              defaultValue={m.unlockAt}
              min={today()}
            />

            <label htmlFor="prereqModuleId">Locked until this module is finished</label>
            <select id="prereqModuleId" name="prereqModuleId" defaultValue={m.prereqModuleId ?? ""}>
              <option value="">No prerequisite</option>
              {otherModules.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>

            <label className="check" style={{ marginTop: 12 }}>
              <input
                type="checkbox"
                name="requireSequential"
                defaultChecked={m.requireSequential}
              />{" "}
              Items must be done in order
            </label>
            <label className="check" style={{ marginTop: 8 }}>
              <input type="checkbox" name="published" defaultChecked={m.published} /> Published
            </label>
            <button className="btn mark" style={{ marginTop: 14, width: "100%", justifyContent: "center" }}>
              Save settings
            </button>
          </form>

          <details className="card">
            <summary className="small muted" style={{ cursor: "pointer" }}>
              Delete this module
            </summary>
            <p className="small muted" style={{ margin: "8px 0 10px" }}>
              Removes the module and its item list. The pages and assignments themselves are kept.
            </p>
            <form action={deleteModule}>
              <input type="hidden" name="id" value={m.id} />
              <ConfirmSubmit className="btn ghost sm" message={`Delete the module "${m.name}"?`}>
                Delete module
              </ConfirmSubmit>
            </form>
          </details>
        </div>
      </div>
    </>
  );
}
