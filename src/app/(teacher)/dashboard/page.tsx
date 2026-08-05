import Link from "next/link";
import { requireTeacher } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { evidenceFor } from "@/lib/evidence";
import { readiness, PROGRAMS } from "@/lib/rules";
import { today, fmt } from "@/lib/dates";
import { EvidenceBar } from "@/components/EvidenceBar";
import { Pill } from "@/components/ui";
import { reimbursementMetrics, formatPct } from "@/lib/metrics";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard — Cohort" };

export default async function Dashboard() {
  const { user, school } = await requireTeacher();
  const schoolId = school!.id;

  const students = await prisma.student.findMany({
    where: { schoolId },
    orderBy: { createdAt: "asc" },
  });
  const ev = await Promise.all(students.map(async (s) => ({ s, e: await evidenceFor(s.id) })));

  const ungraded = await prisma.submission.count({
    where: { schoolId, status: "submitted" },
  });
  const attToday = await prisma.attendance.count({ where: { schoolId, date: today() } });

  const esaKids = students.filter((s) => s.esaProgram);
  const avg = Math.round(ev.reduce((a, x) => a + x.e.score, 0) / (ev.length || 1));
  const outstandingCash = esaKids.reduce((a, s) => a + Math.round(s.esaAmount / 10), 0);

  const invoices = await prisma.invoice.findMany({ where: { schoolId } });
  const m = reimbursementMetrics(invoices);
  const hasReimbursementData = m.decided > 0 || m.inFlight > 0;

  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">{fmt(today())}</div>
          <h1>Good morning, {user.name.split(" ")[0]}.</h1>
        </div>
        <div className="row">
          <Link className="btn sec" href="/attendance">
            Take attendance
          </Link>
          <Link className="btn" href="/invoices">
            ESA invoices
          </Link>
        </div>
      </div>

      <div className="grid g3">
        <div className="stat">
          <div className="n">{students.length}</div>
          <div className="l">Students</div>
        </div>
        <div className="stat">
          <div className="n">{ungraded}</div>
          <div className="l">Waiting to grade</div>
        </div>
        <div className="stat">
          <div className="n">
            {avg}
            <span style={{ fontSize: 15, color: "var(--ink-soft)" }}>/100</span>
          </div>
          <div className="l">Avg evidence score</div>
        </div>
      </div>

      {attToday === 0 && (
        <div className="notice warn" style={{ marginTop: 16 }}>
          Attendance isn&apos;t logged for today yet. It&apos;s the single biggest input to every ESA
          invoice. <Link href="/attendance">Take it now</Link>.
        </div>
      )}

      <div className="sep" />

      <div className="spread" style={{ marginBottom: 10 }}>
        <div>
          <div className="eyebrow">Evidence board</div>
          <h2>Who is invoice-ready</h2>
        </div>
        <Link className="btn ghost sm" href="/evidence">
          Open full board
        </Link>
      </div>
      <div className="card" style={{ padding: "16px 10px" }}>
        <table>
          <thead>
            <tr>
              <th>Student</th>
              <th>Attendance · Instruction · Work · Assessment · Notes</th>
              <th>Status</th>
              <th>Score</th>
            </tr>
          </thead>
          <tbody>
            {ev.map(({ s, e }) => {
              const r = readiness(e.score);
              return (
                <tr key={s.id}>
                  <td>
                    <Link href={`/students/${s.id}`} style={{ fontWeight: 600, textDecoration: "none" }}>
                      {s.name}
                    </Link>
                    <div className="small muted">
                      Grade {s.grade} · {s.esaProgram ? PROGRAMS[s.esaProgram].label : "Private pay"}
                    </div>
                  </td>
                  <td style={{ width: 300 }}>
                    <EvidenceBar parts={e.parts} legend={false} />
                  </td>
                  <td style={{ width: 150 }}>
                    <Pill tone={r.tone}>{r.label}</Pill>
                  </td>
                  <td style={{ width: 60 }} className="mono">
                    {e.score}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="sep" />
      <div className="grid g2">
        <div className="card">
          <div className="eyebrow">Getting paid</div>
          {hasReimbursementData ? (
            <>
              <h3 style={{ margin: "6px 0 10px" }}>
                {formatPct(m.firstPassRate)} first-pass approval
                {m.avgDaysToCash != null ? ` · ${m.avgDaysToCash} days to cash` : ""}
              </h3>
              <p className="small muted" style={{ margin: 0 }}>
                ${m.inFlight.toLocaleString()} in flight, ${m.paidTotal.toLocaleString()} paid this
                year. <Link href="/invoices">Open ESA invoices</Link>.
              </p>
            </>
          ) : (
            <>
              <h3 style={{ margin: "6px 0 10px" }}>
                About ${outstandingCash.toLocaleString()} sits in the next ESA cycle
              </h3>
              <p className="small muted" style={{ margin: 0 }}>
                {esaKids.length} of {students.length} families are on {school!.railLabel}.
                Reimbursement typically lands well after the month you taught — build the invoices
                before you need the money, not after.
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
            Graded work with written feedback is the strongest evidence a state accepts.
          </p>
          <Link className="btn sm" href="/grading">
            Open grading queue
          </Link>
        </div>
      </div>
    </>
  );
}
