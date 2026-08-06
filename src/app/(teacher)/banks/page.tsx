import Link from "next/link";
import { requireTeacher } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Notice } from "@/components/ui";
import { parseItems, quizMax, ITEM_KIND_LABEL } from "@/lib/lms";
import { BankBuilder } from "@/components/BankBuilder";
import { createItemBank, deleteItemBank } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Question banks — Cohort" };

export default async function BanksPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string; saved?: string; deleted?: string; err?: string }>;
}) {
  const { school } = await requireTeacher();
  const sp = await searchParams;

  const banks = await prisma.itemBank.findMany({
    where: { schoolId: school!.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <>
      {sp.created && <Notice tone="good">Bank created.</Notice>}
      {sp.saved && <Notice tone="good">Bank saved.</Notice>}
      {sp.deleted && <Notice tone="good">Bank deleted.</Notice>}
      {sp.err === "name" && <Notice tone="bad">A bank needs a name.</Notice>}

      <div className="topbar">
        <div>
          <div className="eyebrow">Write once, reuse forever</div>
          <h1>Question banks</h1>
        </div>
        <Link className="btn sec" href="/worksheets">
          Worksheets →
        </Link>
      </div>

      <p className="muted" style={{ margin: "0 0 14px", maxWidth: "64ch" }}>
        A bank is a pool of questions you can drop into any quiz or worksheet with{" "}
        <strong>Insert from bank</strong>. Inserted questions are copied, so editing the bank later
        never rewrites a quiz a student has already taken.
      </p>

      <BankBuilder action={createItemBank} />

      <div className="sep" />
      <div className="eyebrow">Your banks</div>
      {banks.length === 0 ? (
        <div className="card" style={{ marginTop: 10 }}>
          <p className="muted small" style={{ margin: 0 }}>
            No banks yet. Build your first one above.
          </p>
        </div>
      ) : (
        <div className="ws-grid" style={{ marginTop: 10 }}>
          {banks.map((b) => {
            const items = parseItems(b.itemsJson);
            const kinds = [...new Set(items.map((i) => ITEM_KIND_LABEL[i.kind] ?? i.kind))];
            return (
              <div key={b.id} className="ws-card" style={{ cursor: "default" }}>
                <div className="ws-subj">{b.subject || "Bank"}</div>
                <div className="ws-title" style={{ fontSize: 17 }}>
                  {b.name}
                </div>
                <div className="small muted">
                  {items.length} question{items.length === 1 ? "" : "s"} · {quizMax(items)} pts
                </div>
                {kinds.length > 0 && (
                  <div className="small muted" style={{ marginTop: 4 }}>
                    {kinds.slice(0, 3).join(", ")}
                    {kinds.length > 3 ? "…" : ""}
                  </div>
                )}
                <form action={deleteItemBank} style={{ marginTop: 10 }}>
                  <input type="hidden" name="id" value={b.id} />
                  <button className="btn ghost sm">Delete</button>
                </form>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
