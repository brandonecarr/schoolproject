// Proposed rule changes awaiting a human.
//
// This page is the entire point of the watcher. Everything upstream — the daily
// fetch, the fingerprint, the model call — exists to fill this list, and
// nothing in it is applied until a person acts. A proposal here has changed
// exactly nothing about what any school bills.
//
// Immaterial verdicts are shown too, collapsed at the bottom. They look like
// noise, but they are the record of what the watcher looked at and dismissed —
// and if a rule turns out to have changed under us, the dismissed pile is the
// first place to look for why we missed it.

import { requireTeacher } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { sourceById } from "@/lib/sources";
import { Pill, Notice } from "@/components/ui";
import type { Tone } from "@/components/ui";
import { decideProposal } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Rule proposals — Cohort" };

type Change = { field: string; before: string; after: string; quote: string };

const CONF: Record<string, Tone> = { high: "good", medium: "warn", low: "bad" };

function parseChanges(json: string): Change[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function when(iso: Date | string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default async function ProposalsPage() {
  await requireTeacher();

  const all = await prisma.ruleProposal.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
  const open = all.filter((p) => p.material && (p.status === "open" || p.status === "pr_opened"));
  const decided = all.filter((p) => p.material && p.status !== "open" && p.status !== "pr_opened");
  const dismissed = all.filter((p) => !p.material);

  return (
    <>
      <div className="eyebrow">Admin</div>
      <h1>Rule proposals</h1>
      <p className="small muted" style={{ maxWidth: "72ch" }}>
        Drafted by a model from a page that changed. <strong>Nothing here has been applied.</strong>{" "}
        Every proposal quotes the page so you can check it against the source rather than take the
        summary on faith — the page is public web content, which is untrusted input.
      </p>

      {open.length === 0 && (
        <Notice tone="info">
          No proposals waiting. Either nothing has changed materially, or nothing has been
          interpreted yet — check <a href="/sources">Rule sources</a> for anything still flagged.
        </Notice>
      )}

      {open.map((p) => {
        const src = sourceById(p.sourceId);
        const changes = parseChanges(p.changesJson);
        return (
          <div key={p.id} className="card" style={{ marginTop: 12 }}>
            <div className="spread">
              <div>
                <div className="eyebrow">
                  {src?.label ?? p.sourceId} · {when(p.createdAt)}
                </div>
                <h3 style={{ margin: "4px 0 0" }}>{p.summary}</h3>
              </div>
              <div className="row" style={{ gap: 8 }}>
                <Pill tone={CONF[p.confidence] ?? "bad"}>{p.confidence} confidence</Pill>
                {p.status === "pr_opened" && <Pill tone="info">PR open</Pill>}
              </div>
            </div>

            {changes.length > 0 && (
              <div className="rollbook" style={{ marginTop: 12 }}>
                {changes.map((c, i) => (
                  <div key={i} className="line">
                    <span className="mono" style={{ minWidth: 90 }}>
                      {c.field}
                    </span>
                    <span style={{ flex: 1 }}>
                      <span className="muted">{c.before || "—"}</span> → <strong>{c.after || "—"}</strong>
                    </span>
                  </div>
                ))}
              </div>
            )}

            {changes.some((c) => c.quote) && (
              <>
                <div className="eyebrow" style={{ marginTop: 14 }}>
                  What the page actually says
                </div>
                {changes
                  .filter((c) => c.quote)
                  .map((c, i) => (
                    <blockquote key={i} className="small" style={{ margin: "6px 0 0", paddingLeft: 12, borderLeft: "3px solid var(--rule)" }}>
                      {c.quote}
                    </blockquote>
                  ))}
              </>
            )}

            {p.patch && (
              <>
                <div className="eyebrow" style={{ marginTop: 14 }}>
                  Generated edit
                </div>
                <pre className="small mono" style={{ overflowX: "auto", background: "#fff", border: "1px solid var(--rule)", borderRadius: 8, padding: 10 }}>
                  {p.patch}
                </pre>
              </>
            )}

            <div className="row" style={{ gap: 10, marginTop: 12, alignItems: "center", flexWrap: "wrap" }}>
              {src && (
                <a className="btn ghost sm" href={src.url} target="_blank" rel="noopener noreferrer nofollow">
                  Open the source
                </a>
              )}
              {p.prUrl && (
                <a className="btn ghost sm" href={p.prUrl} target="_blank" rel="noopener noreferrer">
                  View pull request
                </a>
              )}
              <form action={decideProposal} className="row" style={{ gap: 8, alignItems: "center" }}>
                <input type="hidden" name="id" value={p.id} />
                <input name="note" placeholder="Note (optional)" style={{ minWidth: 200 }} />
                <button name="decision" value="accepted" className="btn sm">
                  Applied it
                </button>
                <button name="decision" value="rejected" className="btn ghost sm">
                  Reject
                </button>
              </form>
            </div>
            <p className="small muted" style={{ margin: "8px 0 0" }}>
              ⚑ Accepting records your decision — it does not edit any file. Make the change in{" "}
              <code>src/lib/rules.ts</code> (or merge the PR) yourself, and leave the{" "}
              <code>verify</code> flag set: a webpage is not an invoice cycle.
            </p>
          </div>
        );
      })}

      {decided.length > 0 && (
        <>
          <div className="sep" />
          <div className="eyebrow">Decided</div>
          <div className="rollbook" style={{ marginTop: 8 }}>
            {decided.map((p) => (
              <div key={p.id} className="line">
                <span style={{ flex: 1 }}>
                  {sourceById(p.sourceId)?.label ?? p.sourceId} — {p.summary}
                </span>
                <Pill tone={p.status === "accepted" ? "good" : "bad"}>{p.status}</Pill>
              </div>
            ))}
          </div>
        </>
      )}

      {dismissed.length > 0 && (
        <>
          <div className="sep" />
          <details>
            <summary style={{ cursor: "pointer", fontWeight: 600 }}>
              {dismissed.length} change{dismissed.length === 1 ? "" : "s"} judged immaterial
            </summary>
            <p className="small muted" style={{ margin: "8px 0" }}>
              Pages that moved but where nothing a school bills against changed. Kept because if a
              rule does turn out to have shifted, this is the first list to audit.
            </p>
            <div className="rollbook">
              {dismissed.map((p) => (
                <div key={p.id} className="line muted">
                  <span style={{ minWidth: 150 }}>{sourceById(p.sourceId)?.label ?? p.sourceId}</span>
                  <span style={{ flex: 1 }}>{p.summary}</span>
                  <span className="small">{when(p.createdAt)}</span>
                </div>
              ))}
            </div>
          </details>
        </>
      )}
    </>
  );
}
