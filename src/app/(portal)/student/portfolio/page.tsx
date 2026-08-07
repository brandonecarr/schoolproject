// The student's curated portfolio.
//
// This replaced an automatic gallery that listed everything the child had ever
// produced. A filing cabinet is not a portfolio: the choosing and the
// explaining are what make it one, and a child writing why a piece matters is
// better evidence of learning than any list of scores.
//
// Everything is still reachable — the pool to choose from is at the bottom —
// but the top of the page is only what they picked.

import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { fmt } from "@/lib/dates";
import { Markdown } from "@/components/Markdown";
import { MarkdownField } from "@/components/MarkdownField";
import { Notice } from "@/components/ui";
import { portfolioFor, portfolioCandidates } from "@/lib/portfolio-read";
import { reflectionGap } from "@/lib/portfolio";
import {
  addPortfolioEntry,
  savePortfolioEntry,
  movePortfolioEntry,
  removePortfolioEntry,
} from "../../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "My portfolio — Cohort" };

export default async function StudentPortfolioPage({
  searchParams,
}: {
  searchParams: Promise<{ added?: string; saved?: string; removed?: string; already?: string }>;
}) {
  const { user } = await requireRole("student");
  const sid = user.studentId ?? "";
  const sp = await searchParams;

  const [pieces, pool] = await Promise.all([portfolioFor(sid), portfolioCandidates(sid)]);
  const gap = reflectionGap(pieces);

  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">Chosen by you</div>
          <h1>My portfolio</h1>
        </div>
        {pieces.length > 0 && (
          <a className="btn sec" href="/student/portfolio/print" target="_blank" rel="noreferrer">
            Print / Save as PDF
          </a>
        )}
      </div>

      <p className="small muted" style={{ maxWidth: "64ch" }}>
        Pick the work you&apos;re proudest of and write a bit about each piece — what was hard, what
        you figured out, what you&apos;d do differently. Only you, your family and your teacher can
        see this.
      </p>

      {sp.added && <Notice tone="good">Added. Now write something about it.</Notice>}
      {sp.saved && <Notice tone="good">Saved.</Notice>}
      {sp.removed && (
        <Notice tone="good">Taken out of your portfolio. The work itself is still safe.</Notice>
      )}
      {sp.already && <Notice tone="info">That one&apos;s already in your portfolio.</Notice>}

      {pieces.length === 0 ? (
        <Notice tone="info">
          Your portfolio is empty. Choose something from below to start it.
        </Notice>
      ) : (
        gap > 0 && (
          <Notice tone="warn">
            {gap} {gap === 1 ? "piece has" : "pieces have"} no reflection yet. The writing is the part
            that shows what you learned.
          </Notice>
        )
      )}

      {pieces.map((p, i) => (
        <div key={p.id} className="card" style={{ marginTop: 12 }}>
          <div className="spread">
            <div className="eyebrow">
              {i + 1} of {pieces.length} · {p.sourceLabel}
              {p.score ? ` · ${p.score}` : ""}
              {p.when ? ` · ${fmt(p.when.slice(0, 10))}` : ""}
            </div>
            <div className="row" style={{ gap: 6 }}>
              <form action={movePortfolioEntry}>
                <input type="hidden" name="id" value={p.id} />
                <input type="hidden" name="dir" value="up" />
                <button className="btn ghost sm" disabled={i === 0} title="Move up">
                  ↑
                </button>
              </form>
              <form action={movePortfolioEntry}>
                <input type="hidden" name="id" value={p.id} />
                <input type="hidden" name="dir" value="down" />
                <button className="btn ghost sm" disabled={i === pieces.length - 1} title="Move down">
                  ↓
                </button>
              </form>
              <form action={removePortfolioEntry}>
                <input type="hidden" name="id" value={p.id} />
                <button className="btn ghost sm">Take out</button>
              </form>
            </div>
          </div>

          {p.fileId && p.isImage && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={`/files/${p.fileId}`}
              alt={p.title}
              style={{
                display: "block",
                maxWidth: 320,
                width: "100%",
                marginTop: 10,
                border: "1px solid var(--rule)",
                borderRadius: 10,
              }}
            />
          )}

          <form action={savePortfolioEntry} style={{ marginTop: 10 }}>
            <input type="hidden" name="id" value={p.id} />
            <label htmlFor={`t-${p.id}`}>What do you want to call this?</label>
            <input id={`t-${p.id}`} name="title" defaultValue={p.title} maxLength={160} />
            <div style={{ marginTop: 10 }}>
              <MarkdownField
                name="reflection"
                id={`r-${p.id}`}
                label="Why did you pick this one?"
                rows={4}
                defaultValue={p.reflection}
                placeholder="This was the hardest one because… I got stuck on… then I figured out…"
              />
            </div>
            <button className="btn sm" style={{ marginTop: 8 }}>
              Save
            </button>
          </form>

          {p.addedByRole === "teacher" && (
            <p className="small muted" style={{ margin: "8px 0 0" }}>
              {p.addedByName} thought this one belonged here.
            </p>
          )}
        </div>
      ))}

      <div className="sep" />
      <div className="eyebrow">Add to your portfolio</div>
      <p className="small muted" style={{ margin: "6px 0 0" }}>
        Everything you&apos;ve finished. Adding a piece here doesn&apos;t move it — it just puts a
        copy in your collection.
      </p>

      {pool.submissions.length === 0 && pool.files.length === 0 ? (
        <p className="small muted" style={{ marginTop: 10 }}>
          Nothing left to add — everything you&apos;ve finished is already in.
        </p>
      ) : (
        <div className="card" style={{ marginTop: 10, padding: "6px 18px" }}>
          {pool.submissions.map((s) => (
            <div key={s.id} style={{ padding: "12px 0", borderTop: "1px solid var(--rule)" }}>
              <div className="spread">
                <div>
                  <strong>{s.title}</strong>
                  <div className="small muted">
                    {s.score != null ? `${s.score}/${s.points}` : "Graded"}
                  </div>
                </div>
                <form action={addPortfolioEntry}>
                  <input type="hidden" name="submissionId" value={s.id} />
                  <input type="hidden" name="title" value={s.title} />
                  <button className="btn sec sm">Add</button>
                </form>
              </div>
            </div>
          ))}
          {pool.files.map((f) => (
            <div key={f.id} style={{ padding: "12px 0", borderTop: "1px solid var(--rule)" }}>
              <div className="spread">
                <div>
                  <strong>{f.label}</strong>
                  <div className="small muted">Work sample</div>
                </div>
                <form action={addPortfolioEntry}>
                  <input type="hidden" name="fileId" value={f.id} />
                  <input type="hidden" name="title" value={f.label} />
                  <button className="btn sec sm">Add</button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="small muted" style={{ marginTop: 18, maxWidth: "64ch" }}>
        🔒 This portfolio is private. There is no public link and no way to publish it — it is your
        work and your words, so it stays between you, your family and your school. To share it
        outside, print it and send it yourself.
      </p>
      <p className="small muted" style={{ maxWidth: "64ch" }}>
        <Link href="/student/work">← Back to my work</Link>
      </p>
    </>
  );
}
