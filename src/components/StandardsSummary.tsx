// Standards mastery, shown the same way everywhere it appears: the teacher's
// student page, the parent portal, and the student's own dashboard.
// Server component — presentational only, fed by masteryForStudent().

import { STATUS_META, type Rollup } from "@/lib/outcomes";
import type { OutcomeLite } from "@/lib/mastery";
import type { MasterySummary } from "@/lib/outcomes";

export function StandardsBars({ summary }: { summary: MasterySummary }) {
  const seg = (n: number) => ({ flexGrow: Math.max(n, 0) || 0.001 });
  return (
    <div className="std-bars" aria-hidden>
      <span className="b-mastered" style={seg(summary.mastered)} />
      <span className="b-near" style={seg(summary.near)} />
      <span className="b-developing" style={seg(summary.developing)} />
      <span className="b-none" style={seg(summary.notAssessed)} />
    </div>
  );
}

export function StandardsSummary({
  outcomes,
  rollups,
  summary,
  heading = "Standards progress",
  limit,
  showEmpty = true,
  audience = "teacher",
}: {
  outcomes: OutcomeLite[];
  rollups: Rollup[];
  summary: MasterySummary;
  heading?: string;
  limit?: number;
  showEmpty?: boolean;
  audience?: "teacher" | "family";
}) {
  if (outcomes.length === 0) {
    if (!showEmpty) return null;
    return (
      <p className="small muted" style={{ margin: 0 }}>
        No standards are being tracked yet.
      </p>
    );
  }

  const byId = (id: string) => rollups.find((r) => r.outcomeId === id);
  // Lead with what's been assessed — an unassessed list tells nobody anything.
  const ordered = [...outcomes].sort((a, b) => {
    const ra = byId(a.id);
    const rb = byId(b.id);
    const rank = (r?: Rollup) =>
      r?.status === "mastered" ? 0 : r?.status === "near" ? 1 : r?.status === "developing" ? 2 : 3;
    return rank(ra) - rank(rb);
  });
  const shown = limit ? ordered.slice(0, limit) : ordered;

  return (
    <>
      <div className="spread" style={{ alignItems: "baseline" }}>
        <div className="eyebrow" style={{ margin: 0 }}>
          {heading}
        </div>
        <span className="small muted">
          <strong>{summary.mastered}</strong> mastered
          {summary.assessed > 0 ? ` of ${summary.assessed} assessed` : ""}
        </span>
      </div>
      <StandardsBars summary={summary} />

      <div style={{ marginTop: 10 }}>
        {shown.map((o) => {
          const r = byId(o.id);
          const m = STATUS_META[r?.status ?? "none"];
          return (
            <div key={o.id} className="std-row">
              <span className="code">{o.code}</span>
              <span className="ttl">{o.title}</span>
              <span className={`pill ${m.tone}`}>
                {audience === "family" && r?.status === "mastered" ? "Mastered ✓" : m.label}
                {r?.pct != null ? ` · ${Math.round(r.pct * 100)}%` : ""}
              </span>
            </div>
          );
        })}
      </div>

      {limit && ordered.length > limit && (
        <p className="small muted" style={{ margin: "10px 0 0" }}>
          + {ordered.length - limit} more standard{ordered.length - limit === 1 ? "" : "s"}
        </p>
      )}
    </>
  );
}
