// Health of the Tier-1 rule watcher.
//
// This page exists because the failure mode of a scraper is SILENCE. A source
// that has been 403ing for three weeks produces exactly the same user
// experience as a source where nothing has changed: nothing. Without somewhere
// that says "we have not successfully read Arizona's ESA page since July", the
// watcher would quietly stop working and everyone would keep trusting it.
//
// Hence two separate columns that are easy to conflate: "checked" (we reached
// it) and "changed" (it moved). A source checked daily for a year that has
// never once changed is not a healthy source — it is probably a marketing page
// while the real rules live in a PDF behind it.

import { requireTeacher } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { SOURCES } from "@/lib/sources";
import { PROGRAMS, RAILS } from "@/lib/rules";
import { Pill, Notice } from "@/components/ui";
import type { Tone } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Rule sources — Cohort" };

const STATUS: Record<string, { label: string; tone: Tone; why: string }> = {
  new: { label: "Never checked", tone: "warn", why: "The watcher has not run against this source yet." },
  ok: { label: "OK", tone: "good", why: "" },
  blocked: {
    label: "Blocked",
    tone: "bad",
    why: "The page is probably fine — their bot protection is refusing us. Needs a non-blocked URL or manual review.",
  },
  http_error: { label: "Not found", tone: "bad", why: "The URL is wrong or the page moved." },
  fetch_error: { label: "Unreachable", tone: "bad", why: "DNS, TLS or network failure before we saw a page." },
  too_small: {
    label: "No text",
    tone: "warn",
    why: "Reached it, but it rendered almost no text — a JavaScript-only page or a login wall.",
  },
};

function ago(iso: string | null): string {
  if (!iso) return "never";
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  if (!Number.isFinite(days)) return "never";
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export default async function SourcesPage() {
  await requireTeacher();

  const states = await prisma.watchState.findMany();
  const byId = new Map(states.map((s) => [s.sourceId, s]));

  const rows = SOURCES.map((src) => {
    const st = byId.get(src.id);
    const status = st?.lastStatus ?? "new";
    return { src, st, status, meta: STATUS[status] ?? STATUS.new };
  }).sort(
    // Problems first — this is a health page, not a catalogue.
    (a, b) =>
      Number(b.meta.tone === "bad") - Number(a.meta.tone === "bad") ||
      Number(b.meta.tone === "warn") - Number(a.meta.tone === "warn") ||
      a.src.label.localeCompare(b.src.label)
  );

  const ok = rows.filter((r) => r.status === "ok").length;
  const failing = rows.filter((r) => r.meta.tone === "bad").length;
  const pending = rows.filter((r) => r.st?.pendingReview).length;
  const neverChanged = rows.filter((r) => r.status === "ok" && !r.st?.lastChangedAt).length;

  return (
    <>
      <div className="eyebrow">Admin</div>
      <h1>Rule sources</h1>
      <p className="small muted" style={{ maxWidth: "72ch" }}>
        Every day a job fetches these pages and records whether they changed. It does no
        interpretation and never edits any rule — a change here becomes a proposal for a human to
        review, never an automatic update.
      </p>

      <div className="cmd-metrics" style={{ marginTop: 14 }}>
        <div className="cmd-metric">
          <div className="n">
            {ok}/{rows.length}
          </div>
          <div className="l">Reachable</div>
        </div>
        <div className={`cmd-metric ${failing > 0 ? "accent" : ""}`}>
          <div className="n">{failing}</div>
          <div className="l">Failing</div>
        </div>
        <div className="cmd-metric">
          <div className="n">{pending}</div>
          <div className="l">Awaiting review</div>
        </div>
        <div className="cmd-metric">
          <div className="n">{neverChanged}</div>
          <div className="l">Never changed</div>
        </div>
      </div>

      {failing > 0 && (
        <Notice tone="warn">
          {failing} source{failing === 1 ? " is" : "s are"} unreadable, so{" "}
          {failing === 1 ? "that program\u2019s" : "those programs\u2019"} rules could change without us
          noticing. A blocked or missing source is a gap in coverage, not a cosmetic problem.
        </Notice>
      )}

      {neverChanged > 0 && (
        <Notice tone="info">
          {neverChanged} source{neverChanged === 1 ? " has" : "s have"} never changed since we started
          watching. That is expected early on, but a page that never moves for months is usually a
          landing page, not where the rules actually live.
        </Notice>
      )}

      <div className="card" style={{ marginTop: 14, overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Source</th>
              <th>Covers</th>
              <th>Status</th>
              <th>Checked</th>
              <th>Changed</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ src, st, meta, status }) => {
              const covers = src.programCode
                ? (PROGRAMS[src.programCode]?.label ?? src.programCode)
                : src.railId
                  ? (RAILS[src.railId]?.label ?? src.railId)
                  : "All states";
              return (
                <tr key={src.id}>
                  <td>
                    <a href={src.url} target="_blank" rel="noopener noreferrer nofollow">
                      {src.label}
                    </a>
                    <div className="small muted" style={{ wordBreak: "break-all" }}>
                      {src.url}
                    </div>
                    {meta.why && (
                      <div className="small muted" style={{ marginTop: 2 }}>
                        {meta.why}
                      </div>
                    )}
                    {st?.lastError && (
                      <div className="small muted mono" style={{ marginTop: 2 }}>
                        {st.lastError}
                      </div>
                    )}
                  </td>
                  <td className="small">{covers}</td>
                  <td>
                    <Pill tone={meta.tone}>{meta.label}</Pill>
                    {st?.pendingReview && (
                      <div className="small" style={{ marginTop: 4 }}>
                        ⚑ change awaiting review
                      </div>
                    )}
                    {(st?.failureStreak ?? 0) > 1 && (
                      <div className="small muted" style={{ marginTop: 2 }}>
                        {st!.failureStreak} runs in a row
                      </div>
                    )}
                  </td>
                  <td className="small">{ago(st?.lastCheckedAt ?? null)}</td>
                  <td className="small">
                    {status === "ok" && !st?.lastChangedAt ? (
                      <span className="muted">never</span>
                    ) : (
                      ago(st?.lastChangedAt ?? null)
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="small muted" style={{ marginTop: 12, maxWidth: "72ch" }}>
        Run it by hand with <code>npm run watch</code>, or a single source with{" "}
        <code>npm run watch -- az-esa</code>. The registry lives in{" "}
        <code>src/lib/sources.ts</code>.
      </p>
    </>
  );
}
