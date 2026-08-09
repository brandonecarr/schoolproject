// /cohort-admin/marketing — what the marketing is actually doing, from
// first-party data only: the beacon's daily page counts, where visitors came
// from, and how leads move through the funnel by source and campaign.
//
// Honesty rules of this page: raw counts (bots included, said so on screen),
// no per-visitor anything, and no email-open tracking — the blast log knows
// what was SENT, and that is all we know.

import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/lib/auth";
import { prismaSystem } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Marketing — Cohort Admin" };

const WINDOW_DAYS = 30;

function dayString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const LEAD_STATUS_ORDER = ["new", "contacted", "scheduled", "won", "lost"] as const;
const FUNNEL_HEADS = ["New", "Cont.", "Sched.", "Won", "Lost"];

export default async function AdminMarketing() {
  await requirePlatformAdmin();

  const since = dayString(new Date(Date.now() - WINDOW_DAYS * 86_400_000));

  // prismaSystem: platform tables. PageView.day is YYYY-MM-DD, so a string
  // comparison IS a date comparison.
  const [views, leads] = await Promise.all([
    prismaSystem.pageView.findMany({ where: { day: { gte: since } } }),
    prismaSystem.lead.findMany({ select: { source: true, status: true, ref: true } }),
  ]);

  const total = views.reduce((n, v) => n + v.count, 0);

  const byPath = new Map<string, number>();
  const byReferrer = new Map<string, number>();
  for (const v of views) {
    byPath.set(v.path, (byPath.get(v.path) ?? 0) + v.count);
    if (v.referrerHost)
      byReferrer.set(v.referrerHost, (byReferrer.get(v.referrerHost) ?? 0) + v.count);
  }
  const paths = [...byPath.entries()].sort((a, b) => b[1] - a[1]);
  const referrers = [...byReferrer.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
  const topPath = paths[0]?.[1] ?? 1;

  const funnel = new Map<string, Map<string, number>>();
  for (const l of leads) {
    const row = funnel.get(l.source) ?? new Map<string, number>();
    row.set(l.status, (row.get(l.status) ?? 0) + 1);
    funnel.set(l.source, row);
  }

  const byRef = new Map<string, { total: number; won: number }>();
  for (const l of leads) {
    if (!l.ref) continue;
    const row = byRef.get(l.ref) ?? { total: 0, won: 0 };
    row.total++;
    if (l.status === "won") row.won++;
    byRef.set(l.ref, row);
  }
  const campaigns = [...byRef.entries()].sort((a, b) => b[1].total - a[1].total);

  return (
    <div className="adm-screen">
      <div className="adm-eyebrow">Marketing</div>
      <h1>Traffic and funnel — last {WINDOW_DAYS} days</h1>
      <p className="adm-intro">
        First-party counts from the public pages only: no cookies read, no IPs stored, bots
        included in the numbers. Email opens are not tracked.
      </p>

      <div className="adm-grid2">
        <div className="adm-card">
          <div className="adm-cardtitle">
            Page views
            <span className="adm-cardmeta">
              {total.toLocaleString()} across {paths.length} page{paths.length === 1 ? "" : "s"}
            </span>
          </div>
          <div style={{ marginTop: 10 }}>
            {paths.length === 0 ? (
              <p className="adm-cardsub" style={{ marginTop: 8 }}>
                Nothing yet — counts start with the next visit to the landing page.
              </p>
            ) : (
              paths.map(([path, n]) => (
                <div key={path} className="adm-viewrow">
                  <span className="adm-viewpath">{path}</span>
                  <span className="adm-viewtrack">
                    <span
                      className="adm-viewfill"
                      style={{ width: `${Math.max(3, (n / topPath) * 100)}%`, display: "block" }}
                    />
                  </span>
                  <span className="adm-viewcount">{n.toLocaleString()}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="adm-card">
          <div className="adm-cardtitle">Referrers</div>
          <p className="adm-cardsub">
            Direct visits and stripped referrers don&apos;t appear.
          </p>
          <div style={{ marginTop: 4 }}>
            {referrers.length === 0 ? (
              <p className="adm-cardsub" style={{ marginTop: 8 }}>
                No referred visits in the window.
              </p>
            ) : (
              referrers.map(([host, n]) => (
                <div key={host} className="adm-refrow">
                  <span className="mono" style={{ fontSize: 12 }}>
                    {host}
                  </span>
                  <span className="adm-viewcount">{n.toLocaleString()}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="adm-grid2 adm-grid2-views">
        <div className="adm-card">
          <div className="adm-cardtitle">Lead funnel</div>
          <p className="adm-cardsub">Every lead ever, by where it came from and where it stands.</p>
          {funnel.size === 0 ? (
            <p className="adm-cardsub" style={{ marginTop: 8 }}>
              No leads yet.
            </p>
          ) : (
            <div className="adm-funnelgrid">
              <div className="adm-funnelhead">Source</div>
              {FUNNEL_HEADS.map((h) => (
                <div key={h} className="adm-funnelhead adm-funnelnum">
                  {h}
                </div>
              ))}
              {[...funnel.entries()].map(([source, row]) => (
                <div key={source} style={{ display: "contents" }}>
                  <div className="adm-cellcap">{source}</div>
                  {LEAD_STATUS_ORDER.map((s) => {
                    const n = row.get(s) ?? 0;
                    const cls =
                      s === "won"
                        ? "adm-funnelnum adm-funnelwon"
                        : s === "lost"
                          ? "adm-funnelnum adm-funnellost"
                          : "adm-funnelnum";
                    return (
                      <div key={s} className={cls}>
                        {n}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="adm-card">
          <div className="adm-cardtitle">Campaigns</div>
          <p className="adm-cardsub">
            Tag any link you post with <span className="mono">?ref=</span> and bookings credit it
            for 30 days.
          </p>
          <div style={{ marginTop: 4 }}>
            {campaigns.length === 0 ? (
              <p className="adm-cardsub" style={{ marginTop: 8 }}>
                No campaign-tagged leads yet. Try{" "}
                <span className="mono">schoolcohort.com/?ref=your-campaign</span> on the next
                post.
              </p>
            ) : (
              campaigns.map(([ref, row]) => (
                <div key={ref} className="adm-camprow">
                  <span className="mono" style={{ fontSize: 12 }}>
                    {ref}
                  </span>
                  <span className="adm-campnums">
                    <span>{row.total}</span>
                    <span className="adm-campwon">{row.won}</span>
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
