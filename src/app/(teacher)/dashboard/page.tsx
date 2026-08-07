import Link from "next/link";
import { requireTeacher } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { evidenceFor } from "@/lib/evidence";
import { readiness, PROGRAMS } from "@/lib/rules";
import { today, fmt } from "@/lib/dates";
import { dueLabel, daysBetween } from "@/lib/due";
import { typeMeta } from "@/lib/lms";
import { Icon } from "@/components/icons";
import { Bar, Card, CardHead, Notice, PageHead, Pill, StackBar, StatCard } from "@/components/ui";
import { currentOrigin } from "@/lib/tenant-server";
import { reimbursementMetrics, formatPct } from "@/lib/metrics";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard — Cohort" };

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>;
}) {
  const { user, school } = await requireTeacher();
  const { welcome } = await searchParams;
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

  // Oldest thing waiting on the teacher. "3 waiting" is a number; "oldest 4
  // days" is the one that makes someone open the queue.
  const oldestSub = await prisma.submission.findFirst({
    where: { schoolId, status: "submitted", submittedAt: { not: null } },
    orderBy: { submittedAt: "asc" },
    select: { submittedAt: true },
  });
  const oldestDays = oldestSub?.submittedAt ? daysBetween(oldestSub.submittedAt.slice(0, 10), td) : null;

  const onEsa = students.filter((x) => x.esaProgram).length;
  const openCycles = invoices.filter((i) => i.status === "draft" || i.status === "submitted").length;
  const COUNT_WORD = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];
  const word = (n: number) => COUNT_WORD[n] ?? String(n);
  const subline =
    `${word(students.length)} student${students.length === 1 ? "" : "s"}, ` +
    `${openCycles === 0 ? "no invoice cycle" : `${word(openCycles).toLowerCase()} invoice cycle${openCycles === 1 ? "" : "s"}`} open. ` +
    `Here's what needs you today.`;

  // Paid / in review / not built, as shares of everything this year.
  const totalMoney = m.paidTotal + m.inFlight + m.draftTotal;
  const share = (v: number) => (totalMoney > 0 ? (v / totalMoney) * 100 : 0);

  // First arrival after signup. The address is the one thing a new owner has
  // to take away from this screen — every family they invite reaches the
  // school through it, and it is not something they can change later.
  const origin = welcome ? await currentOrigin() : null;

  return (
    <>
      {origin && (
        <Notice tone="good">
          <strong>{school!.name} is set up.</strong> Your school lives at{" "}
          <span className="mono">{origin.replace(/^https?:\/\//, "")}</span> — that address is where
          you and your families sign in, so send it out with your invitations. Add your students
          next, then invite their parents.
        </Notice>
      )}
      <PageHead
        eyebrow={fmt(today())}
        title={`Good morning, ${user.name.split(" ")[0]}.`}
        sub={subline}
        actions={
          <>
            <Link className="btn sec" href="/attendance">
              Take attendance
            </Link>
            <Link className="btn" href="/invoices">
              ESA invoices
            </Link>
          </>
        }
      />

      <div className="statrow">
        <StatCard
          glyph={<Icon name="students" />}
          tone="info"
          label="Students"
          value={students.length}
          delta={onEsa > 0 ? `${onEsa} on ESA` : "None on ESA"}
        />
        <StatCard
          glyph={<Icon name="grading" />}
          tone={ungraded > 0 ? "warn" : "good"}
          label="Waiting to grade"
          value={ungraded}
          delta={ungraded === 0 ? "Queue is clear" : oldestDays != null ? `Oldest: ${oldestDays} days` : "Just arrived"}
        />
        <StatCard
          glyph={<Icon name="evidence" />}
          tone={avg >= 90 ? "good" : avg >= 70 ? "warn" : "bad"}
          label="Avg evidence"
          value={avg}
          delta={`Across ${students.length} student${students.length === 1 ? "" : "s"}`}
        />
        <StatCard
          glyph={<Icon name="invoices" />}
          tone="info"
          label="First-pass approval"
          value={hasReimbursementData ? formatPct(m.firstPassRate) : "—"}
          delta={m.decided > 0 ? `${m.firstPassPaid} of ${m.decided} accepted` : "Nothing decided yet"}
        />
      </div>

      {attToday === 0 && (
        <div className="notice warn" style={{ marginTop: 16 }}>
          Attendance isn&apos;t logged for today yet — it&apos;s the single biggest input to every ESA
          invoice. <Link href="/attendance">Take it now</Link>.
        </div>
      )}

      <div className="split">
        {/* Sorted ascending by evidence score — least ready first. This is the
            point of the screen, and alphabetical would defeat it. */}
        <Card pad={false}>
          <CardHead eyebrow="Needs attention" title="Who isn't invoice-ready" href="/evidence" linkLabel="Full board" />
          <div className="rowlist">
            {triage.map(({ s: st, e }) => {
              const r = readiness(e.score);
              return (
                <Link key={st.id} href={`/students/${st.id}`} className="rowitem attnrow">
                  <div style={{ minWidth: 0 }}>
                    <div className="rowname">{st.name}</div>
                    <div className="rowmeta">
                      Grade {st.grade} ·{" "}
                      {st.esaProgram ? PROGRAMS[st.esaProgram]?.label ?? st.esaProgram : "Private pay"}
                    </div>
                  </div>
                  <Bar pct={e.score} tone={r.tone} />
                  <Pill tone={r.tone}>{r.label}</Pill>
                  <span className="num rowscore">{e.score}</span>
                </Link>
              );
            })}
          </div>
        </Card>

        <div className="stack">
          <Card>
            <div className="eyebrow">Getting paid</div>
            {hasReimbursementData ? (
              <>
                <h3 className="cardfig">{formatPct(m.firstPassRate)} approved first-pass</h3>
                <p className="cardbody">
                  {m.avgDaysToCash != null ? `${m.avgDaysToCash} days to cash · ` : ""}
                  <strong className="num">${m.inFlight.toLocaleString()}</strong> in flight,{" "}
                  <strong className="num">${m.paidTotal.toLocaleString()}</strong> paid this year.
                </p>
                <div style={{ marginTop: 12 }}>
                  <StackBar
                    parts={[
                      { pct: share(m.paidTotal), tone: "good" },
                      { pct: share(m.inFlight), tone: "info" },
                      { pct: share(m.draftTotal), tone: "line" },
                    ]}
                  />
                  <div className="legend">
                    <span className="k">
                      <i style={{ background: "var(--good-f)" }} /> Paid
                    </span>
                    <span className="k">
                      <i style={{ background: "var(--accent)" }} /> In review
                    </span>
                    <span className="k">
                      <i style={{ background: "var(--line)" }} /> Not built
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <>
                <h3 className="cardfig">Nothing submitted yet</h3>
                <p className="cardbody">
                  Build packets from the teaching you&apos;ve already logged.{" "}
                  <Link href="/invoices">ESA invoices</Link>.
                </p>
              </>
            )}
          </Card>

          <Card>
            <div className="eyebrow">Grading queue</div>
            <h3 className="cardfig">
              {ungraded} submission{ungraded === 1 ? "" : "s"} waiting
            </h3>
            <p className="cardbody">
              Graded work with feedback is the strongest evidence a state accepts.
            </p>
            <Link className="btn tint sm" href="/grading" style={{ marginTop: 12 }}>
              Open grading queue
            </Link>
          </Card>

          <Card pad={false}>
            <CardHead eyebrow="Coming due soon" title="" href="/assignments" linkLabel="All" />
            {upcomingRows.length === 0 ? (
              <p className="cardbody" style={{ padding: "0 var(--card-pad) var(--card-pad)" }}>
                No assignments due ahead. <Link href="/assignments">Assign some work</Link>.
              </p>
            ) : (
              <div className="rowlist">
                {upcomingRows.map(({ a, inHand, total, daysLeft }) => {
                  const tm = typeMeta(a.type);
                  const tone = daysLeft <= 1 ? "warn" : "info";
                  return (
                    <div key={a.id} className="rowitem duerow">
                      <span className="glyph" aria-hidden>
                        {tm.icon}
                      </span>
                      <span style={{ minWidth: 0 }}>
                        <span className="rowname ellip">{a.title}</span>
                        <span className="rowmeta">
                          {inHand}/{total} turned in · {fmt(a.dueDate)}
                        </span>
                      </span>
                      <Pill tone={tone}>{dueLabel(daysLeft)}</Pill>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
