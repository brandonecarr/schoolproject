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
import { AdminNav } from "../nav";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Marketing — Cohort Admin" };

const WINDOW_DAYS = 30;

function dayString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const LEAD_STATUS_ORDER = ["new", "contacted", "scheduled", "won", "lost"] as const;

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
    if (v.referrerHost) byReferrer.set(v.referrerHost, (byReferrer.get(v.referrerHost) ?? 0) + v.count);
  }
  const paths = [...byPath.entries()].sort((a, b) => b[1] - a[1]);
  const referrers = [...byReferrer.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);

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
    <>
      <AdminNav active="marketing" />
      <div className="eyebrow">Marketing</div>
      <h1>Traffic and funnel — last {WINDOW_DAYS} days</h1>
      <p className="small muted" style={{ margin: "6px 0 0" }}>
        First-party counts from the public pages only: no cookies read, no IPs stored, bots
        included in the numbers. Email opens are not tracked — the blast log records what was
        sent, nothing about what happened after.
      </p>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="eyebrow">Page views</div>
        <p style={{ margin: "6px 0 10px" }}>
          <strong>{total.toLocaleString()}</strong>{" "}
          <span className="small muted">views across {paths.length} pages</span>
        </p>
        <table>
          <thead>
            <tr>
              <th>Page</th>
              <th style={{ textAlign: "right" }}>Views</th>
            </tr>
          </thead>
          <tbody>
            {paths.length === 0 ? (
              <tr>
                <td colSpan={2} className="small muted">
                  Nothing yet — counts start with the next visit to the landing page.
                </td>
              </tr>
            ) : (
              paths.map(([path, n]) => (
                <tr key={path}>
                  <td className="mono small">{path}</td>
                  <td style={{ textAlign: "right" }}>{n.toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="eyebrow">Referrers</div>
        <p className="small muted" style={{ margin: "6px 0 10px" }}>
          Where visitors arrived from, when the browser said. Direct visits and stripped
          referrers don&apos;t appear — most traffic legitimately shows nothing.
        </p>
        <table>
          <thead>
            <tr>
              <th>Site</th>
              <th style={{ textAlign: "right" }}>Views</th>
            </tr>
          </thead>
          <tbody>
            {referrers.length === 0 ? (
              <tr>
                <td colSpan={2} className="small muted">
                  No referred visits in the window.
                </td>
              </tr>
            ) : (
              referrers.map(([host, n]) => (
                <tr key={host}>
                  <td className="mono small">{host}</td>
                  <td style={{ textAlign: "right" }}>{n.toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="eyebrow">Lead funnel</div>
        <p className="small muted" style={{ margin: "6px 0 10px" }}>
          Every lead ever, by where it came from and where it stands.
        </p>
        <table>
          <thead>
            <tr>
              <th>Source</th>
              {LEAD_STATUS_ORDER.map((s) => (
                <th key={s} style={{ textAlign: "right" }}>
                  {s}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {funnel.size === 0 ? (
              <tr>
                <td colSpan={6} className="small muted">
                  No leads yet.
                </td>
              </tr>
            ) : (
              [...funnel.entries()].map(([source, row]) => (
                <tr key={source}>
                  <td>{source}</td>
                  {LEAD_STATUS_ORDER.map((s) => (
                    <td key={s} style={{ textAlign: "right" }}>
                      {row.get(s) ?? 0}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="eyebrow">Campaigns</div>
        <p className="small muted" style={{ margin: "6px 0 10px" }}>
          Leads whose first visit carried <span className="mono">?ref=</span> or{" "}
          <span className="mono">?utm_source=</span> — tag any link you post and bookings credit
          it for 30 days.
        </p>
        <table>
          <thead>
            <tr>
              <th>Campaign</th>
              <th style={{ textAlign: "right" }}>Leads</th>
              <th style={{ textAlign: "right" }}>Won</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.length === 0 ? (
              <tr>
                <td colSpan={3} className="small muted">
                  No campaign-tagged leads yet. Try{" "}
                  <span className="mono">schoolcohort.com/?ref=your-campaign</span> on the next
                  post.
                </td>
              </tr>
            ) : (
              campaigns.map(([ref, row]) => (
                <tr key={ref}>
                  <td className="mono small">{ref}</td>
                  <td style={{ textAlign: "right" }}>{row.total}</td>
                  <td style={{ textAlign: "right" }}>{row.won}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
