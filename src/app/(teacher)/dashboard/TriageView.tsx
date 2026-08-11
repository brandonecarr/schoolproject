"use client";

// The triage board and coming-due list with the slide-out treatment: click a
// student and their evidence snapshot slides out; click an assignment and
// its turn-in picture does the same. Both URL-backed (?student=, ?due=),
// both instant — the dashboard already loaded everything the panels show.

import Link from "next/link";
import { readiness, } from "@/lib/rules";
import { dueLabel } from "@/lib/due-label";
import { Bar, Card, CardHead, Pill } from "@/components/ui";
import { useShallowParams } from "@/components/use-shallow-params";
import { SidePanel, SideSection, SideKV } from "@/components/SidePanel";

export type TriageRow = {
  id: string;
  name: string;
  grade: string;
  programLabel: string;
  score: number;
  presentDays: number;
  graded: number;
  samples: number;
};

export type DueRow = {
  id: string;
  title: string;
  icon: string;
  typeLabel: string;
  inHand: number;
  total: number;
  dueDateLabel: string;
  daysLeft: number;
};

export function TriageView({ rows }: { rows: TriageRow[] }) {
  const [params, updateParams] = useShallowParams();
  const open = rows.find((r) => r.id === params.get("student")) ?? null;
  const close = () => updateParams((p) => p.delete("student"));
  const r = open ? readiness(open.score) : null;

  return (
    <>
      <Card pad={false}>
        <CardHead eyebrow="Needs attention" title="Who isn't invoice-ready" href="/evidence" linkLabel="Full board" />
        <div className="rowlist">
          {rows.map((st) => {
            const rd = readiness(st.score);
            return (
              <a
                key={st.id}
                href={`/students/${st.id}`}
                className="rowitem attnrow"
                onClick={(e) => {
                  e.preventDefault();
                  updateParams((p) => {
                    p.delete("due");
                    p.set("student", st.id);
                  });
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div className="rowname">{st.name}</div>
                  <div className="rowmeta">
                    Grade {st.grade} · {st.programLabel}
                  </div>
                </div>
                <Bar pct={st.score} tone={rd.tone} />
                <Pill tone={rd.tone}>{rd.label}</Pill>
                <span className="num rowscore">{st.score}</span>
              </a>
            );
          })}
        </div>
      </Card>

      {open && r && (
        <SidePanel
          title={open.name}
          onClose={close}
          meta={
            <>
              <Pill tone={r.tone}>{r.label}</Pill>
              <span>Grade {open.grade}</span>
            </>
          }
          footer={
            <>
              <Link className="btn sec" href="/evidence">
                Evidence board
              </Link>
              <Link className="btn" href={`/students/${open.id}`}>
                Open student
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
            <span className="small muted">{open.programLabel}</span>
          </div>
          <SideSection label="Evidence">
            <div style={{ marginBottom: 8 }}>
              <Bar pct={open.score} tone={r.tone} />
            </div>
            <SideKV k="Evidence score" v={open.score} />
            <SideKV k="Days present" v={open.presentDays} />
            <SideKV k="Graded work" v={open.graded} />
            <SideKV k="Work samples" v={open.samples} />
          </SideSection>
        </SidePanel>
      )}
    </>
  );
}

export function DueSoonView({ rows }: { rows: DueRow[] }) {
  const [params, updateParams] = useShallowParams();
  const open = rows.find((r) => r.id === params.get("due")) ?? null;
  const close = () => updateParams((p) => p.delete("due"));

  return (
    <>
      <Card pad={false}>
        <CardHead eyebrow="Coming due soon" title="" href="/assignments" linkLabel="All" />
        {rows.length === 0 ? (
          <p className="cardbody" style={{ padding: "0 var(--card-pad) var(--card-pad)" }}>
            No assignments due ahead. <Link href="/assignments">Assign some work</Link>.
          </p>
        ) : (
          <div className="rowlist">
            {rows.map((a) => {
              const tone = a.daysLeft <= 1 ? "warn" : "info";
              return (
                <a
                  key={a.id}
                  href="/assignments"
                  className="rowitem duerow"
                  onClick={(e) => {
                    e.preventDefault();
                    updateParams((p) => {
                      p.delete("student");
                      p.set("due", a.id);
                    });
                  }}
                >
                  <span className="glyph" aria-hidden>
                    {a.icon}
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span className="rowname ellip">{a.title}</span>
                    <span className="rowmeta">
                      {a.inHand}/{a.total} turned in · {a.dueDateLabel}
                    </span>
                  </span>
                  <Pill tone={tone}>{dueLabel(a.daysLeft)}</Pill>
                </a>
              );
            })}
          </div>
        )}
      </Card>

      {open && (
        <SidePanel
          title={open.title}
          onClose={close}
          meta={
            <>
              <Pill tone={open.daysLeft <= 1 ? "warn" : "info"}>{dueLabel(open.daysLeft)}</Pill>
              <span>Due {open.dueDateLabel}</span>
            </>
          }
          footer={
            <>
              <Link className="btn sec" href="/assignments">
                All assignments
              </Link>
              <Link className="btn" href="/grading">
                Grading queue
              </Link>
            </>
          }
        >
          <SideSection label="Turn-in">
            <SideKV k="Type" v={`${open.icon} ${open.typeLabel}`} />
            <SideKV k="Turned in" v={`${open.inHand} of ${open.total}`} />
            <SideKV k="Still out" v={Math.max(0, open.total - open.inHand)} />
          </SideSection>
        </SidePanel>
      )}
    </>
  );
}
