// One expense claim's packet: the receipt, the educational-purpose statement,
// and the records around the purchase as supporting evidence. Mirrors the
// invoice packet page for schools, sized for one purchase and one child.
// Cohort prepares; the family submits in the portal themselves.

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireTeacher } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isFamily } from "@/lib/kind";
import { evidenceFor } from "@/lib/evidence";
import { readiness, RAILS } from "@/lib/rules";
import { fmt } from "@/lib/dates";
import { Pill, Notice } from "@/components/ui";
import type { Tone } from "@/components/ui";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { categoryLabel } from "@/lib/claims";
import {
  saveClaimPurpose,
  regenerateClaimPurpose,
  setClaimStatus,
  rejectClaim,
  uploadClaimReceipt,
  removeClaimReceipt,
  deleteClaim,
} from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Claim packet — Cohort" };

const STATUS_TONE: Record<string, Tone | "mark"> = {
  paid: "good",
  approved: "mark",
  submitted: "info",
  rejected: "bad",
  draft: "warn",
};

const RECEIPT_MSG: Record<string, { tone: Tone; text: string }> = {
  ok: { tone: "good", text: "Receipt attached. It prints first in the packet." },
  removed: { tone: "good", text: "Receipt removed." },
  empty: { tone: "bad", text: "Choose a file first." },
  type: { tone: "bad", text: "Receipts must be PNG, JPG, WebP or PDF." },
  big: { tone: "bad", text: "That file is over 4 MB — a phone photo at normal quality is fine." },
};

const endPunctuated = (s: string) => (/[.!?…]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);

export default async function ClaimPacketPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ receipt?: string; saved?: string; regenerated?: string; created?: string }>;
}) {
  const { school, rail: sessionRail } = await requireTeacher();
  if (!isFamily(school)) redirect("/invoices");
  const { id } = await params;
  const { receipt, saved, regenerated, created } = await searchParams;

  const claim = await prisma.expenseClaim.findFirst({ where: { id, schoolId: school!.id } });
  if (!claim) notFound();

  const [child, e, receipts] = await Promise.all([
    prisma.student.findUnique({ where: { id: claim.studentId } }),
    evidenceFor(claim.studentId, claim.windowStart, claim.windowEnd),
    prisma.fileRec.findMany({
      where: { schoolId: school!.id, claimId: claim.id },
      orderBy: { createdAt: "asc" },
      select: { id: true, label: true, mime: true, bytes: true },
    }),
  ]);
  const rail = (claim.railId ? RAILS[claim.railId] : null) ?? sessionRail;
  const r = readiness(e.score);
  const graded = e.submissions.filter((x) => x.status === "graded");
  const missingReceipt = receipts.length === 0;

  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">
            <Link href="/claims">ESA claims</Link> · {child?.name ?? "—"}
          </div>
          <h1>{claim.title}</h1>
          <p className="small muted" style={{ margin: "4px 0 0" }}>
            {categoryLabel(claim.category)}
            {claim.vendor ? ` · ${claim.vendor}` : ""} · bought {fmt(claim.purchaseDate)} ·{" "}
            <strong>${Number(claim.amount).toLocaleString()}</strong>
            {claim.portalRef ? ` · portal ref ${claim.portalRef}` : ""}
          </p>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <Pill tone={STATUS_TONE[claim.status] ?? "warn"}>{claim.status}</Pill>
          <a className="btn mark" href={`/claims/${claim.id}/print`} target="_blank" rel="noopener noreferrer">
            Print packet
          </a>
          {claim.status === "draft" && (
            <form action={setClaimStatus} className="row" style={{ gap: 6 }}>
              <input type="hidden" name="id" value={claim.id} />
              <input type="hidden" name="status" value="submitted" />
              <input name="portalRef" placeholder="Portal claim # (optional)" style={{ width: 190 }} />
              <button className="btn sec">Mark submitted in portal</button>
            </form>
          )}
          {claim.status === "submitted" && (
            <>
              <Transition id={claim.id} status="approved" label="Mark approved" className="btn sec" />
              <Transition id={claim.id} status="paid" label="Mark paid" />
            </>
          )}
          {claim.status === "approved" && <Transition id={claim.id} status="paid" label="Mark paid" />}
          {claim.status === "rejected" && <Transition id={claim.id} status="submitted" label="Resubmit" />}
        </div>
      </div>

      {created && (
        <Notice tone="good">
          Claim started and a purpose statement drafted from your records. Attach the receipt, read
          the statement, then print the packet.
        </Notice>
      )}
      {saved && <Notice tone="good">Purpose statement saved.</Notice>}
      {regenerated && <Notice tone="good">Purpose statement redrafted from the latest records.</Notice>}
      {RECEIPT_MSG[receipt ?? ""] && (
        <Notice tone={RECEIPT_MSG[receipt!].tone}>{RECEIPT_MSG[receipt!].text}</Notice>
      )}

      {claim.status === "paid" ? (
        <Notice tone="good">
          <strong>Reimbursed{claim.paidAt ? ` ${fmt(claim.paidAt)}` : ""}.</strong> This claim is done.
        </Notice>
      ) : claim.status === "rejected" ? (
        <Notice tone="bad">
          <strong>Rejected{claim.rejectedAt ? ` ${fmt(claim.rejectedAt)}` : ""}:</strong>{" "}
          {endPunctuated(claim.rejectionReason || "No reason recorded")} Redraft the statement from the
          latest records, fix what the portal asked for, then resubmit.
        </Notice>
      ) : (
        <Notice tone="warn">
          Cohort prepares the packet. You upload it to {rail ? rail.label : "your state portal"} yourself
          — nothing is sent from here.
          {missingReceipt ? " No receipt attached yet — the receipt is the claim." : ""}
        </Notice>
      )}

      {/* RECEIPT first — for a claim, this is the document. */}
      <div className="card">
        <div className="eyebrow">Receipt</div>
        <p className="small muted" style={{ margin: "6px 0 12px", maxWidth: "64ch" }}>
          The itemised proof of purchase. It prints first in the packet. PNG, JPG, WebP or PDF, up
          to 4 MB — a phone photo is fine.
        </p>
        {receipts.length > 0 && (
          <div className="row" style={{ gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
            {receipts.map((f) => (
              <div key={f.id} className="card2" style={{ padding: 10, width: 200 }}>
                {f.mime === "application/pdf" ? (
                  <a href={`/files/${f.id}`} target="_blank" rel="noreferrer" className="small">
                    PDF · {f.label}
                  </a>
                ) : (
                  <a href={`/files/${f.id}`} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/files/${f.id}`} alt={f.label} style={{ width: "100%", borderRadius: 8 }} />
                  </a>
                )}
                <form action={removeClaimReceipt} style={{ marginTop: 6 }}>
                  <input type="hidden" name="fileId" value={f.id} />
                  <input type="hidden" name="claimId" value={claim.id} />
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
        <form action={uploadClaimReceipt} className="row" style={{ gap: 10, alignItems: "center" }}>
          <input type="hidden" name="claimId" value={claim.id} />
          <input type="file" name="file" accept="image/png,image/jpeg,image/webp,application/pdf" required />
          <button className="btn sm">Attach receipt</button>
        </form>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="spread">
          <div className="eyebrow">
            Educational purpose statement{" "}
            {claim.purposeSource === "template"
              ? "· drafted without AI (no API key set)"
              : claim.purposeSource === "ai"
                ? "· AI draft, review before use"
                : "· edited by you"}
          </div>
          <Pill tone={r.tone}>{r.label}</Pill>
        </div>
        <form action={saveClaimPurpose}>
          <input type="hidden" name="id" value={claim.id} />
          <textarea
            name="purpose"
            defaultValue={claim.purpose}
            style={{ minHeight: 170, marginTop: 10, fontSize: 14.5, lineHeight: 1.65 }}
          />
          <button className="btn sec" style={{ marginTop: 10 }}>
            Save edits
          </button>
        </form>
        <form action={regenerateClaimPurpose} style={{ marginTop: 10 }}>
          <input type="hidden" name="id" value={claim.id} />
          <button className="btn ghost">Redraft from records</button>
        </form>
      </div>

      {(claim.status === "submitted" || claim.status === "approved") && (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="eyebrow">Log a rejection</div>
          <p className="small muted" style={{ margin: "6px 0 10px" }}>
            If {rail ? rail.label : "the portal"} sends this back, record why — it drives the rework
            and your first-pass approval rate.
          </p>
          <form action={rejectClaim}>
            <input type="hidden" name="id" value={claim.id} />
            <div style={{ maxWidth: 560 }}>
              <label htmlFor="reasonRaw">What the portal actually said</label>
              <textarea id="reasonRaw" name="reasonRaw" required rows={2} placeholder="Paste the notice word for word" />
            </div>
            <div className="row" style={{ alignItems: "flex-end", gap: 12, marginTop: 8 }}>
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
      <div className="eyebrow" style={{ marginBottom: 8 }}>
        Supporting records · {fmt(claim.windowStart)} – {fmt(claim.windowEnd)}
      </div>
      <div className="grid g2">
        <div className="card">
          <div className="eyebrow">Attendance</div>
          <p style={{ margin: "8px 0 0" }}>
            <strong>{e.presentDays}</strong> present of{" "}
            <strong>{e.instructionalDays ?? e.attendance.length}</strong>{" "}
            {e.instructionalDays != null ? "instructional" : "logged"} days around the purchase
          </p>
        </div>
        <div className="card">
          <div className="eyebrow">Observations</div>
          <div className="rollbook" style={{ marginTop: 8 }}>
            {e.observations.length ? (
              e.observations.slice(0, 6).map((o) => (
                <div key={o.id} className="line">
                  <span className="mono small" style={{ marginRight: 8 }}>
                    {fmt(o.date)}
                  </span>
                  <span style={{ flex: 1 }}>{o.text}</span>
                </div>
              ))
            ) : (
              <div className="line muted">None logged in this window</div>
            )}
          </div>
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
            <div className="line muted">No graded work in this window</div>
          )}
        </div>
      </div>

      {claim.status === "draft" && (
        <form action={deleteClaim} style={{ marginTop: 16 }}>
          <input type="hidden" name="id" value={claim.id} />
          <ConfirmSubmit className="btn ghost sm" message="Delete this draft claim and its receipt?">
            Delete draft
          </ConfirmSubmit>
        </form>
      )}
    </>
  );
}

function Transition({
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
    <form action={setClaimStatus}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <button className={className}>{label}</button>
    </form>
  );
}
