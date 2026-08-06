import Link from "next/link";
import { requireTeacher } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fmt } from "@/lib/dates";
import { parseItems, quizMax } from "@/lib/lms";
import { createWorksheet } from "../actions";
import { WorksheetBuilder } from "@/components/WorksheetBuilder";

export const dynamic = "force-dynamic";
export const metadata = { title: "Worksheets — Cohort" };

export default async function WorksheetsPage() {
  const { school } = await requireTeacher();
  const list = await prisma.worksheet.findMany({
    where: { schoolId: school!.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">Build once, reuse</div>
          <h1>Worksheets</h1>
        </div>
        <Link className="btn sec" href="/assignments">
          ← Assignments
        </Link>
      </div>

      <p className="muted" style={{ margin: "0 0 16px", maxWidth: "60ch" }}>
        Compose a worksheet once, then <strong>print it</strong> (save as PDF for paper) or{" "}
        <strong>assign it digitally</strong> as an auto-graded quiz. Same questions, either way.
      </p>

      <WorksheetBuilder action={createWorksheet} />

      <div className="sep" />
      <div className="eyebrow">Your library</div>
      {list.length === 0 ? (
        <div className="card" style={{ marginTop: 10 }}>
          <p className="muted" style={{ margin: 0 }}>
            No worksheets yet. Build your first one above.
          </p>
        </div>
      ) : (
        <div className="ws-grid" style={{ marginTop: 10 }}>
          {list.map((w) => {
            const items = parseItems(w.itemsJson);
            return (
              <Link key={w.id} href={`/worksheets/${w.id}`} className="ws-card">
                <div className="ws-subj">{w.subject || "Worksheet"}</div>
                <div className="ws-title">{w.title}</div>
                <div className="small muted">
                  {items.length} question{items.length === 1 ? "" : "s"} · {quizMax(items)} pts ·{" "}
                  {fmt(w.createdAt.toISOString().slice(0, 10))}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
