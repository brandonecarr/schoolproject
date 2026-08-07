import { notFound } from "next/navigation";
import { requireTeacher } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { evidenceFor } from "@/lib/evidence";
import { readiness, RAILS } from "@/lib/rules";
import { fmt } from "@/lib/dates";
import { Pill, Notice, VerifyFlag } from "@/components/ui";
import type { Tone } from "@/components/ui";
import { RailKnowledge } from "@/components/RailKnowledge";
import { observationsForRail } from "@/lib/observe";
import {
  saveNarrative,
  setInvoiceStatus,
  rejectInvoice,
  regenerateNarrative,
} from "../../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Invoice packet — Cohort" };

const STATUS_TONE: Record<string, Tone | "mark"> = {
  draft: "warn",
  submitted: "info",
  approved: "mark",
  paid: "good",
  rejected: "bad",
};

const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

/** Give a sentence a full stop only if it doesn't already end in one. */
const endPunctuated = (s: string) => (/[.!?:;]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);

// A single hidden-status transition button.
function TransitionButton({
  id,
  status,
  label,
  className = "btn",
}: {
  id: string;
  status: string;
  label: string;
  className?: string;
}) {
  return (
    <form action={setInvoiceStatus}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <button className={className}>{label}</button>
    </form>
  );
}

export default async function InvoicePacketPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ regenerated?: string }>;
}) {
  const { school, rail: sessionRail } = await requireTeacher();
  const { id } = await params;
  const { regenerated } = await searchParams;

  const inv = await prisma.invoice.findFirst({ where: { id, schoolId: school!.id } });
  if (!inv) notFound();

  const s = await prisma.student.findUnique({ where: { id: inv.studentId } });
  const rail = (inv.railId ? RAILS[inv.railId] : null) ?? sessionRail;
  const e = await evidenceFor(inv.studentId, inv.periodStart, inv.periodEnd);
  // Everything this school has actually watched this rail do — the counterweight
  // to the predictions in rules.ts.
  const obs = rail ? await observationsForRail(school!.id, rail.id) : [];
  const r = readiness(inv.evidenceScore);
  const graded = e.submissions.filter((x) => x.status === "graded");
  const daysToCash =
    inv.status === "paid" && inv.submittedAt && inv.paidAt
      ? daysBetween(inv.submittedAt, inv.paidAt)
      : null;

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
          <Pill tone={STATUS_TONE[inv.status] ?? "warn"}>{inv.status}</Pill>
          <a className="btn mark" href={`/invoices/${inv.id}/print`} target="_blank" rel="noopener noreferrer">
            Print / Save as PDF
          </a>
          {inv.status === "draft" && (
            <TransitionButton id={inv.id} status="submitted" label="Mark submitted" />
          )}
          {inv.status === "submitted" && (
            <>
              <TransitionButton id={inv.id} status="approved" label="Mark approved" className="btn sec" />
              <TransitionButton id={inv.id} status="paid" label="Mark paid" />
            </>
          )}
          {inv.status === "approved" && (
            <TransitionButton id={inv.id} status="paid" label="Mark paid" />
          )}
          {inv.status === "rejected" && (
            <TransitionButton id={inv.id} status="submitted" label="Resubmit" />
          )}
        </div>
      </div>

      {regenerated && (
        <Notice tone="good">
          Documentation regenerated from the latest evidence. Review it, then resubmit.
        </Notice>
      )}

      {/* Lifecycle status banner */}
      {inv.status === "paid" ? (
        <Notice tone="good">
          Paid{inv.paidAt ? ` on ${fmt(inv.paidAt)}` : ""}
          {daysToCash != null ? ` — ${daysToCash} days from submission to cash` : ""}.
          {inv.rejectionCount === 0
            ? " Approved first-pass."
            : ` Approved after ${inv.rejectionCount} rejection${inv.rejectionCount === 1 ? "" : "s"}.`}
        </Notice>
      ) : inv.status === "rejected" ? (
        <Notice tone="bad">
          <strong>Rejected{inv.rejectedAt ? ` ${fmt(inv.rejectedAt)}` : ""}:</strong>{" "}
          {/* The reason is now the portal's verbatim wording, which usually ends
              in its own punctuation — don't add a second full stop. */}
          {endPunctuated(inv.rejectionReason || "No reason recorded")} Regenerate the documentation
          from the latest evidence, review it, then resubmit.
        </Notice>
      ) : (
        <Notice tone="warn">
          Cohort prepares the packet. You review it and submit it in the state portal yourself — nothing
          here is sent to {rail ? rail.label : "the state"} automatically.
        </Notice>
      )}

      <div className="card">
        <div className="spread">
          <div className="eyebrow">
            Educational purpose statement{" "}
            {inv.narrativeSource === "template"
              ? "· generated without AI (no API key set)"
              : inv.narrativeSource === "ai"
                ? "· AI draft, review before use"
                : "· edited by you"}
          </div>
          <Pill tone={r.tone}>{r.label}</Pill>
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
        {/* Separate form — regenerate the draft from the latest evidence */}
        <form action={regenerateNarrative} style={{ marginTop: 10 }}>
          <input type="hidden" name="id" value={inv.id} />
          <button className="btn ghost">Regenerate from evidence</button>
        </form>
      </div>

      {/* Rejection capture — only while the invoice is out for review */}
      {(inv.status === "submitted" || inv.status === "approved") && (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="eyebrow">Log a rejection</div>
          <p className="small muted" style={{ margin: "6px 0 10px" }}>
            If {rail ? rail.label : "the state"} sends this back, record why — it feeds the rework loop
            and your first-pass approval rate.
          </p>
          <form action={rejectInvoice}>
            <input type="hidden" name="id" value={inv.id} />
            <div style={{ maxWidth: 560 }}>
              <label htmlFor="reasonRaw">What the portal actually said</label>
              <textarea
                id="reasonRaw"
                name="reasonRaw"
                required
                rows={2}
                placeholder="Paste the rejection notice word for word"
              />
              <p className="small muted" style={{ margin: "4px 0 12px" }}>
                Paste it verbatim, even if it&apos;s badly worded. Our category list below is a{" "}
                <em>guess</em> — the portal&apos;s own wording is what teaches us the real one.
              </p>
            </div>
            <div className="row" style={{ alignItems: "flex-end", gap: 12 }}>
              <div style={{ flex: 1, minWidth: 260 }}>
                <label htmlFor="reason">Closest category {rail ? `(${rail.label})` : ""}</label>
                {rail && rail.rejectionReasons.length ? (
                  <select id="reason" name="reason" defaultValue="">
                    {rail.rejectionReasons.map((x) => (
                      <option key={x} value={x}>
                        {x}
                      </option>
                    ))}
                    <option value="">None of these fit</option>
                  </select>
                ) : (
                  <input id="reason" name="reason" placeholder="Category, if you know one" />
                )}
              </div>
              <button className="btn ghost">Mark rejected</button>
            </div>
          </form>
        </div>
      )}

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

      {rail && <RailKnowledge rail={rail} obs={obs} />}
    </>
  );
}
