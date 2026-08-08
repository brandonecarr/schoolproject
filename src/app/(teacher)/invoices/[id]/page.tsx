import { notFound } from "next/navigation";
import { requireTeacher } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { evidenceFor } from "@/lib/evidence";
import { readiness, RAILS } from "@/lib/rules";
import { fmt } from "@/lib/dates";
import { Pill, Notice, VerifyFlag } from "@/components/ui";
import type { Tone } from "@/components/ui";
import { RailKnowledge } from "@/components/RailKnowledge";
import { observationsForRail, verificationCounts, railVerification } from "@/lib/observe";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import {
  saveNarrative,
  setInvoiceStatus,
  rejectInvoice,
  regenerateNarrative,
  uploadReceipt,
  removeReceipt,
} from "../../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Invoice packet — Cohort" };

const RECEIPT_MSG: Record<string, { tone: "good" | "bad"; text: string }> = {
  ok: { tone: "good", text: "Receipt attached. It now prints in the packet." },
  removed: { tone: "good", text: "Receipt removed." },
  empty: { tone: "bad", text: "Choose a file first." },
  type: { tone: "bad", text: "Receipts must be PNG, JPG, WebP or PDF." },
  big: { tone: "bad", text: "That file is over 4 MB — export a smaller copy." },
};

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
  searchParams: Promise<{ regenerated?: string; receipt?: string }>;
}) {
  const { school, rail: sessionRail } = await requireTeacher();
  const { id } = await params;
  const { regenerated, receipt } = await searchParams;

  const inv = await prisma.invoice.findFirst({ where: { id, schoolId: school!.id } });
  if (!inv) notFound();

  const s = await prisma.student.findUnique({ where: { id: inv.studentId } });
  const rail = (inv.railId ? RAILS[inv.railId] : null) ?? sessionRail;
  const e = await evidenceFor(inv.studentId, inv.periodStart, inv.periodEnd);
  // Everything this school has actually watched this rail do — the counterweight
  // to the predictions in rules.ts.
  const obs = rail ? await observationsForRail(school!.id, rail.id) : [];
  // Level from platform-wide evidence; the reason tallies above stay this
  // school's, since they carry verbatim portal text.
  const railV = rail ? railVerification(await verificationCounts(school!.id), rail.id) : null;
  const r = readiness(inv.evidenceScore);
  const graded = e.submissions.filter((x) => x.status === "graded");
  const receipts = await prisma.fileRec.findMany({
    where: { schoolId: school!.id, invoiceId: inv.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, label: true, mime: true, bytes: true },
  });
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
          {/* With a published calendar the denominator is the school's own
              stated instructional days, which a reviewer can check against it.
              Without one, all we can honestly say is how many days we logged. */}
          {e.instructionalDays != null ? (
            <>
              <p style={{ margin: "8px 0 0" }}>
                <strong>{e.presentDays}</strong> present of{" "}
                <strong>{e.instructionalDays}</strong> instructional days in the period
              </p>
              {e.attendance.length < e.instructionalDays && (
                <p className="small muted" style={{ margin: "6px 0 0" }}>
                  {e.instructionalDays - e.attendance.length} day
                  {e.instructionalDays - e.attendance.length === 1 ? "" : "s"} with no attendance
                  record — <a href="/attendance">log them</a> before submitting.
                </p>
              )}
            </>
          ) : (
            <p style={{ margin: "8px 0 0" }}>
              <strong>{e.presentDays}</strong> present of <strong>{e.attendance.length}</strong> logged
              days. <a href="/calendar">Publish term dates</a> to state this against your own
              calendar.
            </p>
          )}
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

      {/* RECEIPTS — the itemised proof of purchase a reviewer matches against
          the amount claimed. AZ's rail lists "itemised receipts" by name. */}
      <div className="card" style={{ marginTop: 12 }}>
        <div className="eyebrow">Receipts</div>
        <p className="small muted" style={{ margin: "6px 0 12px", maxWidth: "64ch" }}>
          The itemised proof of purchase behind the amount claimed — curriculum orders, materials,
          service invoices. These print in the packet after the work samples. PNG, JPG, WebP or
          PDF, up to 4 MB each.
        </p>

        {RECEIPT_MSG[receipt ?? ""] && (
          <Notice tone={RECEIPT_MSG[receipt ?? ""].tone}>{RECEIPT_MSG[receipt ?? ""].text}</Notice>
        )}

        {receipts.length > 0 && (
          <div className="rollbook" style={{ margin: "10px 0 14px" }}>
            {receipts.map((f) => (
              <div key={f.id} className="line" style={{ alignItems: "center", gap: 10 }}>
                <a href={`/files/${f.id}`} target="_blank" rel="noopener noreferrer" style={{ flex: 1 }}>
                  {f.label}
                </a>
                <span className="small muted mono">{Math.max(1, Math.round(f.bytes / 1024))} KB</span>
                <form action={removeReceipt}>
                  <input type="hidden" name="fileId" value={f.id} />
                  <input type="hidden" name="invoiceId" value={inv.id} />
                  <ConfirmSubmit
                    className="btn ghost sm"
                    message="Remove this receipt? It will no longer print in the packet."
                  >
                    Remove
                  </ConfirmSubmit>
                </form>
              </div>
            ))}
          </div>
        )}

        <form action={uploadReceipt} className="row" style={{ gap: 10, alignItems: "center" }}>
          <input type="hidden" name="invoiceId" value={inv.id} />
          <input type="file" name="file" accept="image/png,image/jpeg,image/webp,application/pdf" required />
          <button className="btn sm">Attach receipt</button>
        </form>
      </div>

      {rail && railV && <RailKnowledge rail={rail} obs={obs} v={railV} />}
    </>
  );
}
