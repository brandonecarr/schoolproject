// /cohort-admin — the operator's dashboard: the four numbers that say
// whether the business is working, schools joined over twelve weeks, the
// pipeline at a glance, the next walkthroughs, and what happened lately.
//
// EVERY query on this surface runs on prismaSystem, and the justification is
// the surface itself: this console exists to see across schools, it is behind
// requirePlatformAdmin (a flag no UI can set), and nothing here ever renders
// to anyone but the operator. Child data stays out of it — schools, counts
// and invoice totals, never student names or work.

import type { Metadata } from "next";
import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/auth";
import { prismaSystem } from "@/lib/db";
import { LocalTime } from "@/components/LocalTime";
import { fmtDate, relTime } from "./ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin — Cohort" };

const PIPE_ORDER = ["new", "contacted", "scheduled", "won", "lost"] as const;
const PIPE_FILL: Record<string, string> = {
  new: "#F5DC72",
  contacted: "#C6D3EA",
  scheduled: "#9FB6DC",
  won: "#8FCB9C",
  lost: "#E4C7C1",
};
const MONTHS_UP = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

export default async function AdminOverview() {
  await requirePlatformAdmin();

  const now = new Date();
  const [schools, students, users, invoices, leadGroups, upcoming, recentLeads, recentBlasts] =
    await Promise.all([
      prismaSystem.school.findMany({
        orderBy: { createdAt: "desc" },
        select: { id: true, name: true, createdAt: true },
      }),
      prismaSystem.student.groupBy({ by: ["schoolId"], _count: true }),
      prismaSystem.user.groupBy({ by: ["schoolId"], _count: true }),
      prismaSystem.invoice.groupBy({ by: ["status"], _sum: { amount: true } }),
      prismaSystem.lead.groupBy({ by: ["status"], _count: true }),
      prismaSystem.walkthroughSlot.findMany({
        where: { startsAt: { gt: now } },
        orderBy: { startsAt: "asc" },
        take: 5,
      }),
      prismaSystem.lead.findMany({
        orderBy: { createdAt: "desc" },
        take: 8,
        select: { name: true, source: true, createdAt: true },
      }),
      prismaSystem.emailBlast.findMany({
        orderBy: { createdAt: "desc" },
        take: 4,
        select: { subject: true, sentCount: true, createdAt: true },
      }),
    ]);

  const leadIds = upcoming.map((s) => s.leadId).filter((x): x is string => Boolean(x));
  const upcomingLeads = leadIds.length
    ? await prismaSystem.lead.findMany({ where: { id: { in: leadIds } } })
    : [];
  const leadById = new Map(upcomingLeads.map((l) => [l.id, l]));

  const studentTotal = students.reduce((a, s) => a + s._count, 0);
  const paidTotal = invoices.find((i) => i.status === "paid")?._sum.amount ?? 0;
  const countByStatus = new Map(leadGroups.map((g) => [g.status, g._count]));
  const openLeads =
    (countByStatus.get("new") ?? 0) +
    (countByStatus.get("contacted") ?? 0) +
    (countByStatus.get("scheduled") ?? 0);
  const leadTotal = leadGroups.reduce((a, g) => a + g._count, 0);

  // Twelve ISO-ish weeks of school signups, oldest first, current week last.
  const weekMs = 7 * 86_400_000;
  const weeks = Array.from({ length: 12 }, (_, i) => {
    const end = now.getTime() - (11 - i) * weekMs;
    const start = end - weekMs;
    return schools.filter((s) => {
      const t = s.createdAt.getTime();
      return t > start && t <= end;
    }).length;
  });

  // Recent activity from real timestamps only: schools joining, leads
  // arriving (booked vs added), blasts going out. Status changes carry no
  // timestamp of their own, so they are honestly absent.
  const activity = [
    ...schools.slice(0, 4).map((s) => ({
      at: s.createdAt,
      dot: "#8FCB9C",
      text: `${s.name} joined Cohort`,
    })),
    ...recentLeads.map((l) => ({
      at: l.createdAt,
      dot: "#F5DC72",
      text:
        l.source === "walkthrough"
          ? `${l.name || "Someone"} booked a walkthrough`
          : `${l.name || l.source} added to the pipeline`,
    })),
    ...recentBlasts.map((b) => ({
      at: b.createdAt,
      dot: "#C6D3EA",
      text: `Blast sent to ${b.sentCount} — “${b.subject}”`,
    })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 6);

  const metric4 = openLeads > 0 ? "adm-metric adm-metric-accent" : "adm-metric";

  return (
    <div className="adm-screen">
      <div className="adm-eyebrow">Platform</div>
      <h1>Every school, one table</h1>

      <div className="adm-metrics">
        <div className="adm-metric">
          <div className="n">{schools.length}</div>
          <div className="l">Schools</div>
        </div>
        <div className="adm-metric">
          <div className="n">{studentTotal}</div>
          <div className="l">Students</div>
        </div>
        <div className="adm-metric">
          <div className="n">${paidTotal.toLocaleString()}</div>
          <div className="l">Reimbursed, all time</div>
        </div>
        <div className={metric4}>
          <div className="n">{openLeads}</div>
          <div className="l">Open leads</div>
        </div>
      </div>

      <div className="adm-grid2 adm-grid2-wide">
        <div className="adm-card">
          <div className="adm-cardtitle">
            Schools joined
            <span className="adm-cardmeta">last 12 weeks</span>
          </div>
          <div className="adm-bars">
            {weeks.map((v, i) => {
              const barCls = i === 11 ? "adm-bar adm-bar-now" : "adm-bar";
              return (
                <div key={i} className="adm-barcol">
                  <div className={barCls} style={{ height: 18 + v * 22 }} />
                  <div className="adm-barlabel">w{i + 1}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="adm-card">
          <div className="adm-cardtitle">Pipeline</div>
          <div style={{ marginTop: 12 }}>
            {PIPE_ORDER.map((status) => {
              const n = countByStatus.get(status) ?? 0;
              const pct = leadTotal > 0 ? Math.max(n > 0 ? 4 : 0, (n / leadTotal) * 100) : 0;
              return (
                <div key={status} className="adm-piperow">
                  <span className="adm-pipelabel">{status}</span>
                  <span className="adm-pipetrack">
                    <span
                      className="adm-pipefill"
                      style={{ width: `${pct}%`, background: PIPE_FILL[status], display: "block" }}
                    />
                  </span>
                  <span className="adm-pipecount">{n}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="adm-grid2">
        <div className="adm-card">
          <div className="adm-cardtitle">Next walkthroughs</div>
          <div style={{ marginTop: 6 }}>
            {upcoming.length === 0 ? (
              <p className="adm-cardsub" style={{ marginTop: 10 }}>
                Nothing booked yet — availability lives on the Walkthroughs tab.
              </p>
            ) : (
              upcoming.map((s) => {
                const lead = s.leadId ? leadById.get(s.leadId) : null;
                const inner = (
                  <>
                    <div className="adm-dateblock">
                      <div className="adm-datemonth">{MONTHS_UP[s.startsAt.getUTCMonth()]}</div>
                      <div className="adm-dateday">{s.startsAt.getUTCDate()}</div>
                    </div>
                    <div className="adm-listmain">
                      <div className="adm-listname">{lead?.name || "Held"}</div>
                      <div className="adm-listsub">{lead?.email || "no lead attached"}</div>
                    </div>
                    <div className="adm-listend">
                      <LocalTime iso={s.startsAt.toISOString()} />
                    </div>
                  </>
                );
                // A booking with a lead opens that lead's panel over on Leads.
                return lead ? (
                  <Link
                    key={s.id}
                    className="adm-listrow adm-rowlink"
                    href={`/cohort-admin/leads?lead=${lead.id}`}
                  >
                    {inner}
                  </Link>
                ) : (
                  <div key={s.id} className="adm-listrow">
                    {inner}
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="adm-card">
          <div className="adm-cardtitle">Recent activity</div>
          <div style={{ marginTop: 6 }}>
            {activity.length === 0 ? (
              <p className="adm-cardsub" style={{ marginTop: 10 }}>
                Quiet so far.
              </p>
            ) : (
              activity.map((a, i) => (
                <div key={i} className="adm-activityrow">
                  <span className="adm-activitydot" style={{ background: a.dot }} />
                  <span className="adm-activitytext">{a.text}</span>
                  <span className="adm-activitytime" title={fmtDate(a.at)}>
                    {relTime(a.at, now)}
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
