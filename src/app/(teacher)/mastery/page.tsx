import Link from "next/link";
import { requireTeacher } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Notice } from "@/components/ui";
import { rollupAll, summarize, STATUS_META, type ResultLike } from "@/lib/outcomes";
import { recordOutcomeResult } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mastery board — Cohort" };

export default async function MasteryPage({
  searchParams,
}: {
  searchParams: Promise<{ recorded?: string; subject?: string }>;
}) {
  const { school } = await requireTeacher();
  const schoolId = school!.id;
  const sp = await searchParams;
  const threshold = school!.masteryThreshold ?? 0.8;

  const [students, allOutcomes, results] = await Promise.all([
    prisma.student.findMany({ where: { schoolId }, orderBy: { name: "asc" } }),
    prisma.outcome.findMany({ where: { schoolId }, orderBy: [{ subject: "asc" }, { code: "asc" }] }),
    prisma.outcomeResult.findMany({ where: { schoolId } }),
  ]);

  const subjects = [...new Set(allOutcomes.map((o) => o.subject || "General"))].sort();
  const outcomes = sp.subject
    ? allOutcomes.filter((o) => (o.subject || "General") === sp.subject)
    : allOutcomes;

  const resultsFor = (studentId: string): ResultLike[] =>
    results
      .filter((r) => r.studentId === studentId)
      .map((r) => ({
        outcomeId: r.outcomeId,
        score: r.score,
        possible: r.possible,
        recordedAt: r.recordedAt,
      }));

  const rows = students.map((s) => {
    const ups = rollupAll(
      outcomes.map((o) => o.id),
      resultsFor(s.id),
      threshold
    );
    return { s, ups, summary: summarize(ups) };
  });

  if (allOutcomes.length === 0) {
    return (
      <>
        <div className="topbar">
          <div>
            <div className="eyebrow">Standards progress</div>
            <h1>Mastery board</h1>
          </div>
        </div>
        <div className="card">
          <h3 style={{ margin: 0 }}>No standards yet</h3>
          <p className="muted small" style={{ margin: "8px 0 12px" }}>
            Add the standards you teach to, align assignments to them, and mastery fills in
            automatically as you grade.
          </p>
          <Link className="btn" href="/outcomes">
            Set up standards
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      {sp.recorded && <Notice tone="good">Result recorded.</Notice>}
      <div className="topbar">
        <div>
          <div className="eyebrow">Standards progress</div>
          <h1>Mastery board</h1>
        </div>
        <Link className="btn sec" href="/outcomes">
          Manage standards
        </Link>
      </div>

      <p className="muted" style={{ margin: "0 0 12px", maxWidth: "62ch" }}>
        Mastery is the highest level a student has reached on each standard, from graded work that
        was aligned to it. Mastered = {Math.round(threshold * 100)}% or better.
      </p>

      {subjects.length > 1 && (
        <div className="chip-wrap" style={{ marginBottom: 14 }}>
          <Link className={`chip ${!sp.subject ? "on" : ""}`} href="/mastery">
            All subjects
          </Link>
          {subjects.map((s) => (
            <Link
              key={s}
              className={`chip ${sp.subject === s ? "on" : ""}`}
              href={`/mastery?subject=${encodeURIComponent(s)}`}
            >
              {s}
            </Link>
          ))}
        </div>
      )}

      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table className="mastery-grid">
          <thead>
            <tr>
              <th className="stick">Student</th>
              <th>Mastered</th>
              {outcomes.map((o) => (
                <th key={o.id} title={`${o.code} — ${o.title}`}>
                  <span className="mg-code">{o.code}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ s, ups, summary }) => (
              <tr key={s.id}>
                <td className="stick">
                  <Link href={`/students/${s.id}`} style={{ fontWeight: 600, textDecoration: "none" }}>
                    {s.name}
                  </Link>
                  <div className="small muted">Grade {s.grade}</div>
                </td>
                <td>
                  <strong>
                    {summary.mastered}/{summary.total}
                  </strong>
                  <div className="small muted">{summary.assessed} assessed</div>
                </td>
                {ups.map((u) => {
                  const m = STATUS_META[u.status];
                  return (
                    <td key={u.outcomeId}>
                      <span
                        className={`mcell ${u.status}`}
                        title={`${m.label}${u.pct != null ? ` · ${Math.round(u.pct * 100)}%` : ""} · ${u.attempts} attempt${u.attempts === 1 ? "" : "s"}`}
                      >
                        {u.pct != null ? Math.round(u.pct * 100) : "—"}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="row" style={{ gap: 14, marginTop: 12, flexWrap: "wrap" }}>
        {(["mastered", "near", "developing", "none"] as const).map((k) => (
          <span key={k} className="small muted" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
            <span className={`mcell ${k}`} style={{ width: 20, height: 20, fontSize: 10 }} />
            {STATUS_META[k].label}
          </span>
        ))}
      </div>

      {/* Manual entry — evidence observed off-platform */}
      <details className="card" style={{ marginTop: 16 }}>
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>Record a result by hand</summary>
        <p className="small muted" style={{ margin: "8px 0 10px", maxWidth: "60ch" }}>
          For mastery you observed outside of graded work — a conversation, a demonstration, work
          done on paper. It&apos;s logged with your name in the audit trail.
        </p>
        <form action={recordOutcomeResult}>
          <div className="row" style={{ gap: 12, alignItems: "flex-end" }}>
            <div style={{ flex: 1, minWidth: 150 }}>
              <label htmlFor="studentId">Student</label>
              <select id="studentId" name="studentId">
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ flex: 2, minWidth: 200 }}>
              <label htmlFor="outcomeId">Standard</label>
              <select id="outcomeId" name="outcomeId">
                {allOutcomes.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.code} — {o.title.slice(0, 40)}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1, minWidth: 150 }}>
              <label htmlFor="level">Level</label>
              <select id="level" name="level" defaultValue="1">
                <option value="1">Mastered (100%)</option>
                <option value="0.85">Solid (85%)</option>
                <option value="0.7">Almost there (70%)</option>
                <option value="0.5">Developing (50%)</option>
              </select>
            </div>
            <button className="btn mark">Record</button>
          </div>
        </form>
      </details>
    </>
  );
}
