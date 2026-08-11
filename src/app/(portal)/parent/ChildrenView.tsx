"use client";

// The per-child cards with the slide-out treatment: click a child's card and
// their snapshot slides out — the four numbers, standards progress, and the
// two places to go next. The quick links on the card still work directly.
// URL-backed via ?child=<id>.

import Link from "next/link";
import { StandardsBars } from "@/components/StandardsSummary";
import type { MasterySummary } from "@/lib/outcomes";
import { useShallowParams } from "@/components/use-shallow-params";
import { SidePanel, SideSection, SideKV } from "@/components/SidePanel";

export type ChildRow = {
  id: string;
  name: string;
  grade: string;
  openCount: number;
  avgPct: number | null;
  presentDays: number;
  loggedDays: number;
  owe: number;
  mastery: MasterySummary;
};

export function ChildrenView({ rows, multi }: { rows: ChildRow[]; multi: boolean }) {
  const [params, updateParams] = useShallowParams();
  const open = rows.find((r) => r.id === params.get("child")) ?? null;
  const close = () => updateParams((p) => p.delete("child"));

  return (
    <>
      <div className="eyebrow" style={{ marginTop: 22 }}>
        {multi ? "Each child" : "Snapshot"}
      </div>
      <div className="child-grid" style={{ marginTop: 10 }}>
        {rows.map((c) => (
          <div
            key={c.id}
            className="card child-card app-clickcard"
            role="button"
            tabIndex={0}
            onClick={() => updateParams((p) => p.set("child", c.id))}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                updateParams((p) => p.set("child", c.id));
              }
            }}
          >
            <div className="spread">
              <div>
                <div className="eyebrow" style={{ margin: 0 }}>
                  Grade {c.grade}
                </div>
                <h2 style={{ margin: "2px 0 0" }}>{c.name}</h2>
              </div>
            </div>
            <div className="child-stats">
              <div>
                <div className="cs-n">{c.openCount}</div>
                <div className="cs-l">To do</div>
              </div>
              <div>
                <div className="cs-n">{c.avgPct != null ? `${c.avgPct}%` : "—"}</div>
                <div className="cs-l">Avg grade</div>
              </div>
              <div>
                <div className="cs-n">
                  {c.presentDays}
                  <span className="cs-sub">/{c.loggedDays}</span>
                </div>
                <div className="cs-l">Present</div>
              </div>
              <div>
                <div className="cs-n">${Math.round(c.owe).toLocaleString()}</div>
                <div className="cs-l">You owe</div>
              </div>
            </div>
            {c.mastery.assessed > 0 && (
              <div style={{ marginTop: 14 }}>
                <div className="spread" style={{ alignItems: "baseline" }}>
                  <span className="small muted">Standards mastered</span>
                  <span className="small">
                    <strong>{c.mastery.mastered}</strong> of {c.mastery.assessed}
                  </span>
                </div>
                <StandardsBars summary={c.mastery} />
              </div>
            )}
            <div className="row" style={{ gap: 10, marginTop: 12 }}>
              <Link className="btn ghost sm" href="/parent/feed" onClick={(e) => e.stopPropagation()}>
                Feed
              </Link>
              <Link
                className="btn ghost sm"
                href="/parent/children"
                onClick={(e) => e.stopPropagation()}
              >
                Details
              </Link>
            </div>
          </div>
        ))}
      </div>

      {open && (
        <SidePanel
          title={open.name}
          onClose={close}
          meta={<span>Grade {open.grade}</span>}
          footer={
            <>
              <Link className="btn sec" href="/parent/feed">
                Activity feed
              </Link>
              <Link className="btn" href="/parent/children">
                Full details
              </Link>
            </>
          }
        >
          <div className="app-side-id">
            <span className="app-side-mono">
              {open.name
                .split(/\s+/)
                .slice(0, 2)
                .map((w) => w[0]?.toUpperCase())
                .join("")}
            </span>
          </div>
          <SideSection label="This week">
            <SideKV k="To do" v={open.openCount} />
            <SideKV k="Average grade" v={open.avgPct != null ? `${open.avgPct}%` : "—"} />
            <SideKV k="Days present" v={`${open.presentDays} of ${open.loggedDays} logged`} />
            <SideKV k="You owe" v={`$${Math.round(open.owe).toLocaleString()}`} />
          </SideSection>
          {open.mastery.assessed > 0 && (
            <SideSection label="Standards">
              <div className="spread" style={{ alignItems: "baseline", marginBottom: 6 }}>
                <span className="small muted">Mastered</span>
                <span className="small">
                  <strong>{open.mastery.mastered}</strong> of {open.mastery.assessed}
                </span>
              </div>
              <StandardsBars summary={open.mastery} />
            </SideSection>
          )}
        </SidePanel>
      )}
    </>
  );
}
