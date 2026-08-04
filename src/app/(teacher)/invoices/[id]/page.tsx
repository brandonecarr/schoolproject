import { notFound } from "next/navigation";
import { requireTeacher } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { evidenceFor } from "@/lib/evidence";
import { readiness, RAILS } from "@/lib/rules";
import { fmt } from "@/lib/dates";
import { Pill, Notice, VerifyFlag } from "@/components/ui";
import { saveNarrative, setInvoiceStatus } from "../../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Invoice packet — Cohort" };

export default async function InvoicePacketPage({ params }: { params: Promise<{ id: string }> }) {
  const { school, rail: sessionRail } = await requireTeacher();
  const { id } = await params;

  const inv = await prisma.invoice.findFirst({ where: { id, schoolId: school!.id } });
  if (!inv) notFound();

  const s = await prisma.student.findUnique({ where: { id: inv.studentId } });
  const rail = (inv.railId ? RAILS[inv.railId] : null) ?? sessionRail;
  const e = await evidenceFor(inv.studentId, inv.periodStart, inv.periodEnd);
  const r = readiness(inv.evidenceScore);
  const graded = e.submissions.filter((x) => x.status === "graded");

  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">
            {rail ? rail.label : ""} · {fmt(inv.periodStart)} – {fmt(inv.periodEnd)}
          </div>
          <h1>{s ? s.name : "—"}</h1>
        </div>
        <div className="row">
          <Pill tone={r.tone}>{r.label}</Pill>
          <a className="btn mark" href={`/invoices/${inv.id}/print`} target="_blank" rel="noopener noreferrer">
            Print / Save as PDF
          </a>
          <form action={setInvoiceStatus}>
            <input type="hidden" name="id" value={inv.id} />
            <input type="hidden" name="status" value="submitted" />
            <button className="btn">Mark submitted</button>
          </form>
        </div>
      </div>

      <Notice tone="warn">
        Cohort prepares the packet. You review it and submit it in the state portal yourself — nothing
        here is sent to {rail ? rail.label : "the state"} automatically.
      </Notice>

      <div className="card">
        <div className="eyebrow">
          Educational purpose statement{" "}
          {inv.narrativeSource === "template"
            ? "· generated without AI (no API key set)"
            : inv.narrativeSource === "ai"
              ? "· AI draft, review before use"
              : "· edited by you"}
        </div>
        <form action={saveNarrative}>
          <input type="hidden" name="id" value={inv.id} />
          <textarea
            name="narrative"
            defaultValue={inv.narrative}
            style={{ minHeight: 190, marginTop: 10, fontSize: 14.5, lineHeight: 1.65 }}
          />
          <button className="btn sec" style={{ marginTop: 10 }}>
            Save edits
          </button>
        </form>
      </div>

      <div className="sep" />
      <div className="grid g2">
        <div className="card">
          <div className="eyebrow">Attendance summary</div>
          <p style={{ margin: "8px 0 0" }}>
            <strong>{e.presentDays}</strong> present of <strong>{e.attendance.length}</strong> logged
            instructional days
          </p>
        </div>
        <div className="card">
          <div className="eyebrow">Amount</div>
          <p style={{ margin: "8px 0 0" }}>
            <strong>${Number(inv.amount).toLocaleString()}</strong> for this period
            {rail && rail.vendorFeePct ? (
              <span className="small muted">
                {" "}
                (less {rail.vendorFeePct}% rail fee ≈ $
                {Math.round(inv.amount * (1 - rail.vendorFeePct / 100)).toLocaleString()} net)
              </span>
            ) : null}
          </p>
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="eyebrow">Instruction delivered</div>
        <div className="rollbook" style={{ marginTop: 10 }}>
          {e.assignments.length ? (
            e.assignments.map((a) => (
              <div key={a.id} className="line">
                <span style={{ flex: 1 }}>
                  {a.courseName} — {a.title}
                </span>
                <span className="mono">due {fmt(a.dueDate)}</span>
              </div>
            ))
          ) : (
            <div className="line muted">No assignments in this period</div>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="eyebrow">Work assessed</div>
        <div className="rollbook" style={{ marginTop: 10 }}>
          {graded.length ? (
            graded.map((x) => (
              <div key={x.id} className="line">
                <span style={{ flex: 1 }}>{x.assignmentTitle}</span>
                <span className="mono">
                  {x.score}/{x.points}
                </span>
              </div>
            ))
          ) : (
            <div className="line muted">No graded work in this period</div>
          )}
        </div>
      </div>

      {rail && (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="eyebrow">Most common rejection reasons for {rail.label}</div>
          <ul className="small muted" style={{ margin: "10px 0 0", paddingLeft: 18, lineHeight: 1.9 }}>
            {rail.rejectionReasons.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
          {rail.verify && (
            <VerifyFlag>
              Placeholder list — replace with the real taxonomy from design-partner interviews.
            </VerifyFlag>
          )}
        </div>
      )}
    </>
  );
}
