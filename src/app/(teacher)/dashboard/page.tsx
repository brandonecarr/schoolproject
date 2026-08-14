import Link from "next/link";
import { requireTeacher } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { evidenceForStudents } from "@/lib/evidence";
import { readiness, PROGRAMS, railForState } from "@/lib/rules";
import { providerStatus } from "@/lib/provider";
import { today, fmt } from "@/lib/dates";
import { dueLabel, daysBetween } from "@/lib/due";
import { typeMeta } from "@/lib/lms";
import { Icon } from "@/components/icons";
import { Bar, Card, CardHead, Notice, PageHead, Pill, StackBar, StatCard } from "@/components/ui";
import { currentOrigin } from "@/lib/tenant-server";
import { reimbursementMetrics, formatPct, stalledInvoices, STALL_DAYS } from "@/lib/metrics";
import { classifyDeadlines, deadlinePhrase } from "@/lib/deadlines";
import { OnboardingModal } from "./OnboardingModal";
import { TriageView, DueSoonView } from "./TriageView";

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

  const td = today();
  const students = await prisma.student.findMany({ where: { schoolId }, orderBy: { createdAt: "asc" } });
  // One round of parallel fetches. These were sequential awaits, and with
  // every query paying its own transaction round-trips, seven-in-a-row was
  // most of this page's load time.
  const [ev, ungraded, attToday, invoices, deadlineRows, upcoming, oldestSub] = await Promise.all([
    evidenceForStudents(students.map((s) => s.id)).then((m) =>
      students.map((s) => ({ s, e: m.get(s.id)! }))
    ),
    prisma.submission.count({ where: { schoolId, status: "submitted" } }),
    prisma.attendance.count({ where: { schoolId, date: td } }),
    prisma.invoice.findMany({ where: { schoolId } }),
    prisma.complianceDeadline.findMany({
      where: { schoolId },
      select: { id: true, label: true, dueDate: true, completedAt: true },
    }),
    prisma.assignment.findMany({
      where: { schoolId, dueDate: { gte: td } },
      orderBy: { dueDate: "asc" },
      take: 5,
    }),
    // Oldest thing waiting on the teacher. "3 waiting" is a number; "oldest 4
    // days" is the one that makes someone open the queue.
    prisma.submission.findFirst({
      where: { schoolId, status: "submitted", submittedAt: { not: null } },
      orderBy: { submittedAt: "asc" },
      select: { submittedAt: true },
    }),
  ]);
  const m = reimbursementMetrics(invoices);

  const avg = Math.round(ev.reduce((a, x) => a + x.e.score, 0) / (ev.length || 1));
  const hasReimbursementData = m.decided > 0 || m.inFlight > 0;
  // Triage: least-ready students first — this is a command deck, not a roster.
  const triage = [...ev].sort((a, b) => a.e.score - b.e.score);

  const stall = stalledInvoices(invoices, td);

  // Program deadlines close enough to matter. Only overdue + soon surface
  // here — the full list lives on /calendar, and a nudge that fires for a
  // date three months out trains people to ignore it.
  const dl = classifyDeadlines(deadlineRows, td);
  const dlUrgent = [...dl.overdue, ...dl.soon];
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

  // The provider ID a reviewer matches an invoice against. Silence when the
  // school has no rail; a prompt when it has one and no number on file; a
  // reminder when nobody has stood behind the number in six months.
  const pIdentity = {
    providerId: school!.providerId,
    providerRail: school!.providerRail,
    providerAttestedAt: school!.providerAttestedAt,
  };
  const pStatus = railForState(school!.state) ? providerStatus(pIdentity, td) : "attested";
  const providerNudge =
    pStatus === "none"
      ? "No provider ID on file — your reimbursement packets go out without the number a reviewer uses to match them to your approved-provider record."
      : pStatus === "stale"
        ? "Your provider ID hasn't been confirmed in a while. If it's lapsed with your administrator, every invoice built on it bounces."
        : null;

  return (
    <>
      {user.role === "owner" && !school!.onboardedAt && (
        <OnboardingModal schoolName={school!.name} />
      )}
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

      {/* Only for schools that actually have an administrator to be approved
          by. A school in a state with no configured program has no provider ID
          to record, and nagging them for one would be nagging them for
          something that does not exist. */}
      {providerNudge && (
        <div className="notice warn" style={{ marginTop: 16 }}>
          {providerNudge} <Link href="/settings">Settings</Link>.
        </div>
      )}

      <div className="split">
        {/* Sorted ascending by evidence score — least ready first. This is the
            point of the screen, and alphabetical would defeat it. */}
        <TriageView
          rows={triage.map(({ s: st, e }) => ({
            id: st.id,
            name: st.name,
            grade: st.grade,
            programLabel: st.esaProgram
              ? (PROGRAMS[st.esaProgram]?.label ?? st.esaProgram)
              : "Private pay",
            score: e.score,
            presentDays: e.presentDays,
            graded: e.submissions.filter((x) => x.status === "graded").length,
            samples: e.samples.length,
          }))}
        />

        <div className="stack">
          <Card>
            <div className="eyebrow">Getting paid</div>
            {/* Stalled packets outrank every other number in this card: money
                submitted, no decision recorded, nobody chasing. Or the decision
                happened and was never recorded here — either way, look. */}
            {stall.stalled.length > 0 && (
              <div className="notice warn" style={{ margin: "8px 0 10px" }}>
                {stall.stalled.length === 1
                  ? `A packet has waited ${stall.stalled[0].waitingDays} days`
                  : `${stall.stalled.length} packets have waited ${STALL_DAYS}+ days`}{" "}
                without a recorded decision — <strong>${stall.atRisk.toLocaleString()}</strong> at
                risk. Check the portal, then <Link href="/invoices">record what you find</Link>.
              </div>
            )}
            {/* A missed reporting deadline can cost a family the next award
                year — worth a line here even when every invoice is healthy. */}
            {dlUrgent.length > 0 && (
              <div className={`notice ${dl.overdue.length > 0 ? "bad" : "warn"}`} style={{ margin: "8px 0 10px" }}>
                {dlUrgent.length === 1 ? (
                  <>
                    <strong>{dlUrgent[0].label}</strong> — {deadlinePhrase(dlUrgent[0].daysLeft).toLowerCase()}.
                  </>
                ) : (
                  <>
                    {dlUrgent.length} program deadlines need attention — nearest:{" "}
                    <strong>{dlUrgent[0].label}</strong>, {deadlinePhrase(dlUrgent[0].daysLeft).toLowerCase()}.
                  </>
                )}{" "}
                <Link href="/calendar">See deadlines</Link>.
              </div>
            )}
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

          <DueSoonView
            rows={upcomingRows.map(({ a, inHand, total, daysLeft }) => {
              const tm = typeMeta(a.type);
              return {
                id: a.id,
                title: a.title,
                icon: tm.icon,
                typeLabel: tm.label,
                inHand,
                total,
                dueDateLabel: fmt(a.dueDate),
                daysLeft,
              };
            })}
          />
        </div>
      </div>
    </>
  );
}
