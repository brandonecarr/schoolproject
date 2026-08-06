import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Markdown } from "@/components/Markdown";
import { pathForStudent } from "@/lib/path";
import { markPageRead } from "../../../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reading — Cohort" };

// The [id] here is the MODULE ITEM id, not the page id — progress is recorded
// against the item, and the same page can appear in more than one module.
export default async function StudentPageView({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireRole("student");
  const { id } = await params;
  const sid = user.studentId ?? "";

  const item = await prisma.moduleItem.findFirst({
    where: { id, schoolId: user.schoolId, kind: "page" },
  });
  if (!item) redirect("/student/path");

  // Respect the same locks the path shows — a student shouldn't reach a locked
  // page by URL just because the link wasn't rendered.
  const { states } = await pathForStudent(sid, user.schoolId);
  const state = states
    .flatMap((s) => s.items.map((is) => ({ is, mod: s })))
    .find((x) => x.is.item.id === id);
  if (!state || state.is.locked) redirect("/student/path?locked=1");

  const page = await prisma.page.findFirst({
    where: { id: item.refId, schoolId: user.schoolId, published: true },
  });
  if (!page) redirect("/student/path");

  return (
    <>
      <div className="spread" style={{ alignItems: "flex-end" }}>
        <div>
          <div className="eyebrow">{state.mod.module.name}</div>
          <h1 style={{ margin: "2px 0 0" }}>{page.title}</h1>
        </div>
        <Link className="small" href="/student/path">
          ← My path
        </Link>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <Markdown text={page.body} format={page.format} />
      </div>

      <div className="card">
        {state.is.complete ? (
          <p className="small" style={{ margin: 0 }}>
            ✓ You&apos;ve marked this as read. <Link href="/student/path">Back to your path</Link>.
          </p>
        ) : (
          <form action={markPageRead}>
            <input type="hidden" name="moduleItemId" value={item.id} />
            <button className="btn mark">I&apos;ve read this</button>
            <p className="small muted" style={{ margin: "10px 0 0" }}>
              This marks the step complete on your path.
            </p>
          </form>
        )}
      </div>
    </>
  );
}
