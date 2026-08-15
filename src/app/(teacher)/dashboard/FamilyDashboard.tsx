// The homeschool family's front page. Same bones as the school dashboard —
// who needs more evidence, what's due, what's owed — but the money column is
// CLAIMS (a receipt filed for reimbursement) rather than invoices, there is
// no grading queue or provider ID, and the words are a parent's. One round
// of parallel queries; nothing here scales with the number of children.

import Link from "next/link";
import { prisma } from "@/lib/db";
import { evidenceForStudents } from "@/lib/evidence";
import { PROGRAMS } from "@/lib/rules";
import { today, fmt } from "@/lib/dates";
import { Icon } from "@/components/icons";
import { Card, Notice, PageHead, StackBar, StatCard } from "@/components/ui";
import { reimbursementMetrics, formatPct, stalledInvoices, STALL_DAYS } from "@/lib/metrics";
import { classifyDeadlines, deadlinePhrase } from "@/lib/deadlines";
import { OnboardingModal } from "./OnboardingModal";
import { TriageView } from "./TriageView";
import type { SchoolWithRail } from "@/lib/auth";
import type { UserModel as User } from "@/generated/prisma/models";

export async function FamilyDashboard({ user, school }: { user: User; school: SchoolWithRail }) {
  const schoolId = school.id;
  const td = today();

  const children = await prisma.student.findMany({ where: { schoolId }, orderBy: { createdAt: "asc" } });
  const [evMap, attToday, claims, deadlineRows] = await Promise.all([
    evidenceForStudents(children.map((c) => c.id)),
    prisma.attendance.count({ where: { schoolId, date: td } }),
    prisma.expenseClaim.findMany({ where: { schoolId }, orderBy: { createdAt: "desc" } }),
    prisma.complianceDeadline.findMany({
      where: { schoolId },
      select: { id: true, label: true, dueDate: true, completedAt: true },
    }),
  ]);
  const ev = children.map((c) => ({ s: c, e: evMap.get(c.id)! }));
  const avg = Math.round(ev.reduce((a, x) => a + x.e.score, 0) / (ev.length || 1));
  const triage = [...ev].sort((a, b) => a.e.score - b.e.score);

  const m = reimbursementMetrics(claims);
  const stall = stalledInvoices(claims, td);
  const hasClaims = claims.length > 0;
  const rejected = claims.filter((c) => c.status === "rejected");
  const dl = classifyDeadlines(deadlineRows, td);
  const dlUrgent = [...dl.overdue, ...dl.soon];
  const totalMoney = m.paidTotal + m.inFlight + m.draftTotal;
  const share = (v: number) => (totalMoney > 0 ? (v / totalMoney) * 100 : 0);

  const n = children.length;
  const kidsWord = n === 1 ? "One child" : `${n} children`;
  const inPortal = m.counts.submitted ?? 0;
  const subline =
    `${kidsWord} · ` +
    (inPortal === 0
      ? "no claims waiting on the portal."
      : `${inPortal === 1 ? "one claim" : `${inPortal} claims`} waiting on the portal.`) +
    " Here's what needs you today.";

  const program = PROGRAMS[school.state];

  return (
    <>
      {user.role === "owner" && !school.onboardedAt && (
        <OnboardingModal schoolName={school.name} kind="family" />
      )}

      <PageHead
        eyebrow={fmt(td)}
        title={`Good morning, ${user.name.split(" ")[0]}.`}
        sub={subline}
        actions={
          <>
            <Link className="btn sec" href="/attendance">
              Log attendance
            </Link>
            <Link className="btn" href="/claims">
              New claim
            </Link>
          </>
        }
      />

      <div className="statrow">
        <StatCard
          glyph={<Icon name="students" />}
          tone="info"
          label="Children"
          value={n}
          delta={program ? program.label : "No program on file"}
        />
        <StatCard
          glyph={<Icon name="evidence" />}
          tone={avg >= 90 ? "good" : avg >= 70 ? "warn" : "bad"}
          label="Avg evidence"
          value={avg}
          delta={`Across ${kidsWord.toLowerCase()}`}
        />
        <StatCard
          glyph={<Icon name="invoices" />}
          tone="info"
          label="Awaiting decision"
          value={`$${m.inFlight.toLocaleString()}`}
          delta={inPortal ? `${inPortal} in the portal` : "Nothing submitted"}
        />
        <StatCard
          glyph={<Icon name="cashflow" />}
          tone={m.decided > 0 && (m.firstPassRate ?? 0) < 0.8 ? "warn" : "good"}
          label="First-pass approval"
          value={formatPct(m.firstPassRate)}
          delta={m.decided > 0 ? `${m.firstPassPaid} of ${m.decided} accepted` : "Nothing decided yet"}
        />
      </div>

      {attToday === 0 && (
        <div className="notice warn" style={{ marginTop: 16 }}>
          Attendance isn&apos;t logged for today yet — it&apos;s the record a reviewer asks for
          first. <Link href="/attendance">Log it now</Link>.
        </div>
      )}
      {dlUrgent.length > 0 && (
        <div className={`notice ${dl.overdue.length > 0 ? "bad" : "warn"}`} style={{ marginTop: 16 }}>
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
      {program?.homeEducation && (
        <Notice tone="info">
          <strong>{program.label}, home education:</strong> {program.homeEducation}
        </Notice>
      )}

      <div className="split">
        <TriageView
          rows={triage.map(({ s, e }) => ({
            id: s.id,
            name: s.name,
            grade: s.grade,
            programLabel: s.esaProgram ? (PROGRAMS[s.esaProgram]?.label ?? s.esaProgram) : program?.label ?? "—",
            score: e.score,
            presentDays: e.presentDays,
            graded: e.submissions.filter((x) => x.status === "graded").length,
            samples: e.samples.length,
          }))}
        />

        <div className="stack">
          <Card>
            <div className="eyebrow">Getting reimbursed</div>
            {stall.stalled.length > 0 && (
              <div className="notice warn" style={{ margin: "8px 0 10px" }}>
                {stall.stalled.length === 1
                  ? `A claim has waited ${stall.stalled[0].waitingDays} days`
                  : `${stall.stalled.length} claims have waited ${STALL_DAYS}+ days`}{" "}
                without a recorded decision — <strong>${stall.atRisk.toLocaleString()}</strong>{" "}
                outstanding. Check the portal, then <Link href="/claims">record what you find</Link>.
              </div>
            )}
            {rejected.length > 0 && (
              <div className="notice bad" style={{ margin: "8px 0 10px" }}>
                {rejected.length === 1 ? "A claim was rejected" : `${rejected.length} claims were rejected`}
                {" — "}
                <Link href={`/claims/${rejected[0].id}`}>redraft and resubmit</Link>.
              </div>
            )}
            {hasClaims ? (
              <>
                <h3 className="cardfig">{formatPct(m.firstPassRate)} approved first-pass</h3>
                <p className="cardbody">
                  {m.avgDaysToCash != null ? `${m.avgDaysToCash} days to cash · ` : ""}
                  <strong className="num">${m.inFlight.toLocaleString()}</strong> awaiting decision,{" "}
                  <strong className="num">${m.paidTotal.toLocaleString()}</strong> reimbursed this year.
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
                      <i style={{ background: "var(--good-f)" }} /> Reimbursed
                    </span>
                    <span className="k">
                      <i style={{ background: "var(--accent)" }} /> In the portal
                    </span>
                    <span className="k">
                      <i style={{ background: "var(--line)" }} /> Draft
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <>
                <h3 className="cardfig">No claims yet</h3>
                <p className="cardbody">
                  The next time you buy something with ESA funds, start a claim from the receipt.{" "}
                  <Link href="/claims">ESA claims</Link>.
                </p>
              </>
            )}
          </Card>

          <Card>
            <div className="eyebrow">Log today</div>
            <p className="cardbody" style={{ marginTop: 6 }}>
              A minute a day is the whole discipline. Each entry is evidence behind the next claim.
            </p>
            <div className="row" style={{ gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <Link className="btn tint sm" href="/attendance">
                Attendance
              </Link>
              <Link className="btn tint sm" href="/observations">
                Observation
              </Link>
              <Link className="btn tint sm" href="/students">
                Work sample
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
