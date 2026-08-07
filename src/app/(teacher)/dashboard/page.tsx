import Link from "next/link";
import { requireTeacher } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { evidenceFor } from "@/lib/evidence";
import { readiness, PROGRAMS } from "@/lib/rules";
import { today, fmt } from "@/lib/dates";
import { dueLabel, daysBetween } from "@/lib/due";
import { typeMeta } from "@/lib/lms";
import { EvidenceBar } from "@/components/EvidenceBar";
import { Pill } from "@/components/ui";
import { reimbursementMetrics, formatPct } from "@/lib/metrics";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard — Cohort" };

export default async function Dashboard() {
  const { user, school } = await requireTeacher();
  const schoolId = school!.id;

  const students = await prisma.student.findMany({ where: { schoolId }, orderBy: { createdAt: "asc" } });
  const ev = await Promise.all(students.map(async (s) => ({ s, e: await evidenceFor(s.id) })));
  const ungraded = await prisma.submission.count({ where: { schoolId, status: "submitted" } });
  const attToday = await prisma.attendance.count({ where: { schoolId, date: today() } });
  const invoices = await prisma.invoice.findMany({ where: { schoolId } });
  const m = reimbursementMetrics(invoices);

  const avg = Math.round(ev.reduce((a, x) => a + x.e.score, 0) / (ev.length || 1));
  const hasReimbursementData = m.decided > 0 || m.inFlight > 0;
  // Triage: least-ready students first — this is a command deck, not a roster.
  const triage = [...ev].sort((a, b) => a.e.score - b.e.score);

  // Coming due soon: the next assignments due, with turn-in progress.
  const td = today();
  const upcoming = await prisma.assignment.findMany({
    where: { schoolId, dueDate: { gte: td } },
    orderBy: { dueDate: "asc" },
    take: 5,
  });
  const upSubs = upcoming.length
    ? await prisma.submission.findMany({
        where: { schoolId, assignmentId: { in: upcoming.map((a) => a.id) } },
      })
    : [];
  const upcomingRows = upcoming.map((a) => {
    const mine = upSubs.filter((s) => s.assignmentId === a.id);
    const inHand = mine.filter((s) => s.status === "submitted" || s.status === "graded").length;
    return { a, inHand, total: mine.length, daysLeft: daysBetween(td, a.dueDate) };
  });

  return (
    <>
      <section className="cmd-hero">
        <div className="spread">
          <div>
            <div className="eyebrow">{fmt(today())}</div>
            <h1>Good morning, {user.name.split(" ")[0]}.</h1>
          </div>
          <div className="row">
            <Link className="btn sec" href="/attendance">
              Take attendance
            </Link>
            <Link className="btn mark" href="/invoices">
              ESA invoices
            </Link>
          </div>
        </div>
        <div className="cmd-metrics">
          <div className="cmd-metric">
            <div className="n">{students.length}</div>
            <div className="l">Students</div>
          </div>
          <div className={`cmd-metric ${ungraded > 0 ? "accent" : ""}`}>
            <div className="n">{ungraded}</div>
            <div className="l">Waiting to grade</div>
          </div>
          <div className="cmd-metric">
            <div className="n">{avg}</div>
            <div className="l">Avg evidence</div>
          </div>
          <div className="cmd-metric">
            <div className="n">{hasReimbursementData ? formatPct(m.firstPassRate) : "—"}</div>
            <div className="l">First-pass approval</div>
          </div>
        </div>
      </section>

      {attToday === 0 && (
        <div className="notice warn" style={{ marginTop: 16 }}>
          Attendance isn&apos;t logged for today yet — it&apos;s the single biggest input to every ESA
          invoice. <Link href="/attendance">Take it now</Link>.
        </div>
      )}

      <div className="cmd-grid">
        <div>
          <div className="spread" style={{ margin: "6px 2px 12px" }}>
            <div>
              <div className="eyebrow">Needs attention</div>
              <h2>Who isn&apos;t invoice-ready</h2>
            </div>
            <Link className="btn ghost sm" href="/evidence">
              Full board
            </Link>
          </div>
          {triage.map(({ s, e }) => {
            const r = readiness(e.score);
            return (
              <div key={s.id} className={`attn-row ${r.tone}`}>
                <div className="who">
                  <Link href={`/students/${s.id}`} style={{ fontWeight: 600, textDecoration: "none" }}>
                    {s.name}
                  </Link>
                  <div className="small muted">
                    Grade {s.grade} · {s.esaProgram ? PROGRAMS[s.esaProgram]?.label ?? s.esaProgram : "Private pay"}
                  </div>
                </div>
                <div className="bar">
                  <EvidenceBar parts={e.parts} legend={false} />
                </div>
                <Pill tone={r.tone}>{r.label}</Pill>
                <div className="sc">{e.score}</div>
              </div>
            );
          })}
        </div>

        <div>
          <div className="card">
            <div className="eyebrow">Getting paid</div>
            {hasReimbursementData ? (
              <>
                <h3 style={{ margin: "6px 0 8px" }}>
                  {formatPct(m.firstPassRate)} approved first-pass
                </h3>
                <p className="small muted" style={{ margin: 0 }}>
                  {m.avgDaysToCash != null ? `${m.avgDaysToCash} days to cash · ` : ""}$
                  {m.inFlight.toLocaleString()} in flight, ${m.paidTotal.toLocaleString()} paid.{" "}
                  <Link href="/invoices">Open ESA invoices</Link>.
                </p>
              </>
            ) : (
              <>
                <h3 style={{ margin: "6px 0 8px" }}>Nothing submitted yet</h3>
                <p className="small muted" style={{ margin: 0 }}>
                  Build packets from the teaching you&apos;ve already logged.{" "}
                  <Link href="/invoices">ESA invoices</Link>.
                </p>
              </>
            )}
          </div>
          <div className="card">
            <div className="eyebrow">Grading queue</div>
            <h3 style={{ margin: "6px 0 10px" }}>
              {ungraded} submission{ungraded === 1 ? "" : "s"} waiting
            </h3>
            <p className="small muted" style={{ margin: "0 0 12px" }}>
              Graded work with feedback is the strongest evidence a state accepts.
            </p>
            <Link className="btn sm" href="/grading">
              Open grading queue
            </Link>
          </div>

          <div className="card">
            <div className="spread">
              <div className="eyebrow">Coming due soon</div>
              <Link className="small" href="/assignments">
                Assignments →
              </Link>
            </div>
            {upcomingRows.length === 0 ? (
              <p className="small muted" style={{ margin: "8px 0 0" }}>
                No assignments due ahead. <Link href="/assignments">Assign some work</Link>.
              </p>
            ) : (
              <div style={{ marginTop: 8 }}>
                {upcomingRows.map(({ a, inHand, total, daysLeft }) => {
                  const m = typeMeta(a.type);
                  const tone = daysLeft <= 1 ? "warn" : "info";
                  return (
                    <div key={a.id} className="due-row compact">
                      <span className="due-ic" aria-hidden>
                        {m.icon}
                      </span>
                      <span className="due-main">
                        <span className="due-title">{a.title}</span>
                        <span className="small muted">
                          {inHand}/{total} turned in · {fmt(a.dueDate)}
                        </span>
                      </span>
                      <span className={`due-when ${tone}`}>{dueLabel(daysLeft)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
