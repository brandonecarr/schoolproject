import Link from "next/link";
import { requireTeacher } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Notice, VerifyFlag } from "@/components/ui";
import { STARTER_PACKS } from "@/lib/outcomes";
import { addOutcome, deleteOutcome, importOutcomePack } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Standards — Cohort" };

export default async function OutcomesPage({
  searchParams,
}: {
  searchParams: Promise<{ added?: string; deleted?: string; imported?: string; err?: string }>;
}) {
  const { school } = await requireTeacher();
  const sp = await searchParams;

  const [outcomes, alignments, results] = await Promise.all([
    prisma.outcome.findMany({ where: { schoolId: school!.id }, orderBy: [{ subject: "asc" }, { code: "asc" }] }),
    prisma.outcomeAlignment.findMany({ where: { schoolId: school!.id } }),
    prisma.outcomeResult.findMany({ where: { schoolId: school!.id }, select: { outcomeId: true } }),
  ]);

  const alignedCount = (id: string) => alignments.filter((a) => a.outcomeId === id).length;
  const resultCount = (id: string) => results.filter((r) => r.outcomeId === id).length;

  // Group for display.
  const subjects = [...new Set(outcomes.map((o) => o.subject || "General"))].sort();

  return (
    <>
      {sp.added && <Notice tone="good">Standard added.</Notice>}
      {sp.deleted && <Notice tone="good">Standard removed.</Notice>}
      {sp.imported && (
        <Notice tone="good">
          Imported {sp.imported} standard{sp.imported === "1" ? "" : "s"}. Edit the wording to match
          your program.
        </Notice>
      )}
      {sp.err === "title" && <Notice tone="bad">A standard needs a title.</Notice>}

      <div className="topbar">
        <div>
          <div className="eyebrow">What you teach to</div>
          <h1>Standards</h1>
        </div>
        {outcomes.length > 0 && (
          <Link className="btn sec" href="/mastery">
            Mastery board →
          </Link>
        )}
      </div>

      <p className="muted" style={{ margin: "0 0 14px", maxWidth: "64ch" }}>
        Standards are the skills your school teaches to. Align assignments to them, and every time
        that work is graded Cohort records progress automatically — which becomes{" "}
        <strong>documented evidence of educational progress</strong> for your ESA packets and your
        parent reports.
      </p>

      {/* Starter packs */}
      <details className="card" open={outcomes.length === 0}>
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>
          Start from a template ({STARTER_PACKS.length} packs)
        </summary>
        <VerifyFlag>
          These packs are <strong>editable starting points, not official state standards</strong>.
          Before you rely on them for a reimbursement claim, replace the codes and wording with the
          standards your ESA program actually recognizes.
        </VerifyFlag>
        <div className="ws-grid" style={{ marginTop: 12 }}>
          {STARTER_PACKS.map((p) => (
            <form key={p.key} action={importOutcomePack} className="card" style={{ margin: 0 }}>
              <input type="hidden" name="packKey" value={p.key} />
              <div className="ws-subj">
                {p.subject} · {p.gradeBand}
              </div>
              <div className="ws-title" style={{ fontSize: 16 }}>
                {p.label}
              </div>
              <div className="small muted" style={{ marginBottom: 10 }}>
                {p.outcomes.length} standards
              </div>
              <button className="btn ghost sm">Import</button>
            </form>
          ))}
        </div>
      </details>

      {/* Add one */}
      <details className="card">
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>Add a standard</summary>
        <form action={addOutcome} style={{ marginTop: 10 }}>
          <div className="row" style={{ gap: 12 }}>
            <div style={{ flex: 1, minWidth: 130 }}>
              <label htmlFor="code">Code</label>
              <input id="code" name="code" placeholder="4.NBT.B.5" />
            </div>
            <div style={{ flex: 3, minWidth: 240 }}>
              <label htmlFor="title">What the student can do</label>
              <input
                id="title"
                name="title"
                required
                placeholder="Multiplies multi-digit whole numbers"
              />
            </div>
          </div>
          <div className="row" style={{ gap: 12 }}>
            <div style={{ flex: 1, minWidth: 150 }}>
              <label htmlFor="subject">Subject</label>
              <input id="subject" name="subject" placeholder="Math" />
            </div>
            <div style={{ flex: 1, minWidth: 120 }}>
              <label htmlFor="gradeBand">Grade band</label>
              <input id="gradeBand" name="gradeBand" placeholder="3-5" />
            </div>
          </div>
          <label htmlFor="description">Notes (optional)</label>
          <input id="description" name="description" placeholder="Any detail you want on reports" />
          <button className="btn mark" style={{ marginTop: 12 }}>
            Add standard
          </button>
        </form>
      </details>

      <div className="sep" />

      {outcomes.length === 0 ? (
        <div className="card">
          <h3 style={{ margin: 0 }}>No standards yet</h3>
          <p className="muted small" style={{ margin: "8px 0 0" }}>
            Import a template above or add your own. Then align assignments to them from the
            assignment builder.
          </p>
        </div>
      ) : (
        subjects.map((subj) => (
          <div key={subj} style={{ marginBottom: 18 }}>
            <div className="eyebrow">{subj}</div>
            <div className="card" style={{ padding: "6px 18px", marginTop: 8 }}>
              {outcomes
                .filter((o) => (o.subject || "General") === subj)
                .map((o) => (
                  <div
                    key={o.id}
                    className="spread"
                    style={{ padding: "12px 0", borderTop: "1px solid var(--rule)", gap: 12 }}
                  >
                    <div style={{ flex: 1 }}>
                      <div>
                        <span className="typechip" style={{ marginRight: 8 }}>
                          {o.code}
                        </span>
                        <strong>{o.title}</strong>
                      </div>
                      <div className="small muted" style={{ marginTop: 3 }}>
                        {o.gradeBand ? `Grades ${o.gradeBand} · ` : ""}
                        {alignedCount(o.id)} assignment{alignedCount(o.id) === 1 ? "" : "s"} aligned ·{" "}
                        {resultCount(o.id)} result{resultCount(o.id) === 1 ? "" : "s"} recorded
                        {o.source.startsWith("pack:") ? " · from template" : ""}
                      </div>
                      {o.description && (
                        <div className="small muted" style={{ marginTop: 3 }}>
                          {o.description}
                        </div>
                      )}
                    </div>
                    <form action={deleteOutcome}>
                      <input type="hidden" name="id" value={o.id} />
                      <button className="btn ghost sm">Remove</button>
                    </form>
                  </div>
                ))}
            </div>
          </div>
        ))
      )}
    </>
  );
}
