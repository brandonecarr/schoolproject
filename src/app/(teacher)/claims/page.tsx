// ESA expense claims — the homeschool family's money surface.
//
// A school invoices per student per period; a family files one claim per
// PURCHASE: a receipt, an educational-purpose statement, and the records
// around the purchase as supporting evidence. Cohort prepares the packet;
// the parent uploads it to their state wallet themselves — nothing is sent
// from here. The list page starts a claim and shows the pipeline; the packet
// page (/claims/[id]) is where it gets reviewed and printed.

import Link from "next/link";
import { requireTeacher } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { isFamily } from "@/lib/kind";
import { fmt, today } from "@/lib/dates";
import { Pill, Notice, StatCard } from "@/components/ui";
import type { Tone } from "@/components/ui";
import { reimbursementMetrics, stalledInvoices, waitingDays, STALL_DAYS } from "@/lib/metrics";
import { CLAIM_CATEGORIES, categoryLabel } from "@/lib/claims";
import { createClaim } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "ESA claims — Cohort" };

const STATUS_TONE: Record<string, Tone | "mark"> = {
  paid: "good",
  approved: "mark",
  submitted: "info",
  rejected: "bad",
  draft: "warn",
};

const ERRORS: Record<string, string> = {
  fields: "Pick a child and give the purchase a short title.",
  date: "Enter the purchase date as a real calendar date.",
  amount: "Enter the amount as a positive number (up to $100,000).",
};

export default async function ClaimsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; deleted?: string }>;
}) {
  const { school, rail } = await requireTeacher();
  // Schools invoice; this ledger is the family's. The nav never shows it to
  // a school, and the URL sends one home rather than to an empty page.
  if (!isFamily(school)) redirect("/invoices");
  const schoolId = school!.id;
  const sp = await searchParams;
  const td = today();

  const [children, claims] = await Promise.all([
    prisma.student.findMany({ where: { schoolId }, orderBy: { name: "asc" } }),
    prisma.expenseClaim.findMany({ where: { schoolId }, orderBy: { createdAt: "desc" } }),
  ]);
  const nameOf = (id: string) => children.find((c) => c.id === id)?.name || "—";
  // The pure metric helpers are input-typed on {status, amount, submittedAt,
  // paidAt, rejectionCount} — claims satisfy them without touching invoices.
  const m = reimbursementMetrics(claims);
  const stall = stalledInvoices(claims, td);

  return (
    <>
      {sp.error && <Notice tone="bad">{ERRORS[sp.error] ?? "That didn't work."}</Notice>}
      {sp.deleted && <Notice tone="good">Draft deleted.</Notice>}

      <div className="topbar">
        <div>
          <div className="eyebrow">
            {rail ? rail.label : "No program on file"} · {school!.state}
          </div>
          <h1>ESA claims</h1>
        </div>
      </div>

      {stall.stalled.length > 0 && (
        <div className="notice warn">
          <strong>
            {stall.stalled.length === 1 ? "One claim has" : `${stall.stalled.length} claims have`}{" "}
            waited {STALL_DAYS}+ days without a recorded decision
          </strong>{" "}
          — ${stall.atRisk.toLocaleString()} outstanding. If the portal already shows a decision,
          record it here so your history stays true; if it doesn&apos;t, this is the nudge to chase
          it.
        </div>
      )}

      {rail && (
        <div className="notice info">
          <strong>{rail.label} asks for:</strong> {rail.requires.map((r) => r.label).join(" · ")}
        </div>
      )}

      <div className="statrow" style={{ marginTop: 16 }}>
        <StatCard
          label="Reimbursed this year"
          value={`$${m.paidTotal.toLocaleString()}`}
          delta={m.paidCount > 0 ? `${m.paidCount} claim${m.paidCount === 1 ? "" : "s"} paid` : "Nothing paid yet"}
          tone="good"
        />
        <StatCard
          label="Awaiting decision"
          value={`$${m.inFlight.toLocaleString()}`}
          delta={m.counts.submitted ? `${m.counts.submitted} in the portal` : "Nothing submitted"}
          tone="info"
        />
        <StatCard
          label="Drafts"
          value={`$${m.draftTotal.toLocaleString()}`}
          delta={m.counts.draft ? `${m.counts.draft} not yet filed` : "No drafts"}
          tone="info"
        />
        <StatCard
          label="Avg days to cash"
          value={m.avgDaysToCash == null ? "—" : m.avgDaysToCash}
          delta={m.paidCount > 0 ? `Across ${m.paidCount} paid` : "No paid claims yet"}
          tone="info"
        />
      </div>

      <details className="card" open={claims.length === 0} style={{ marginTop: 12 }}>
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>New claim</summary>
        <form action={createClaim} style={{ marginTop: 10 }}>
          <div className="row" style={{ gap: 12 }}>
            <div style={{ flex: 1, minWidth: 180 }}>
              <label htmlFor="cl-student">Child</label>
              <select id="cl-student" name="studentId" required defaultValue="">
                <option value="" disabled>
                  Choose…
                </option>
                {children.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ flex: 2, minWidth: 220 }}>
              <label htmlFor="cl-title">What you bought</label>
              <input id="cl-title" name="title" required maxLength={140} placeholder="Math-U-See Gamma set" />
            </div>
          </div>
          <div className="row" style={{ gap: 12, marginTop: 8 }}>
            <div style={{ flex: 1, minWidth: 160 }}>
              <label htmlFor="cl-vendor">From (vendor)</label>
              <input id="cl-vendor" name="vendor" maxLength={100} placeholder="Rainbow Resource" />
            </div>
            <div style={{ width: 150 }}>
              <label htmlFor="cl-date">Purchase date</label>
              <input id="cl-date" name="purchaseDate" type="date" required defaultValue={td} />
            </div>
            <div style={{ width: 130 }}>
              <label htmlFor="cl-amount">Amount</label>
              <input id="cl-amount" name="amount" inputMode="decimal" required placeholder="89.00" />
            </div>
            <div style={{ flex: 1, minWidth: 180 }}>
              <label htmlFor="cl-cat">Category</label>
              <select id="cl-cat" name="category" defaultValue="curriculum">
                {CLAIM_CATEGORIES.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="small muted" style={{ margin: "8px 0 0" }}>
            Categories are labels for your own records — your program&apos;s allowed-use list is the
            truth. Cohort drafts the educational-purpose statement from the records around this
            date; you review it, attach the receipt, and print the packet.
          </p>
          <div className="row" style={{ marginTop: 10 }}>
            <span className="sp" />
            <button className="btn mark">Start claim</button>
          </div>
        </form>
      </details>

      <div className="card2 nopad" style={{ marginTop: 12 }}>
        <table>
          <thead>
            <tr>
              <th>Child</th>
              <th>Purchase</th>
              <th>Date</th>
              <th>Amount</th>
              <th>Status</th>
              <th>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {claims.length ? (
              claims.map((c) => (
                <tr key={c.id}>
                  <td>
                    <strong>{nameOf(c.studentId)}</strong>
                  </td>
                  <td>
                    {c.title}
                    <div className="small muted">
                      {categoryLabel(c.category)}
                      {c.vendor ? ` · ${c.vendor}` : ""}
                    </div>
                  </td>
                  <td className="small">{fmt(c.purchaseDate)}</td>
                  <td className="mono">${Number(c.amount).toLocaleString()}</td>
                  <td>
                    <Pill tone={STATUS_TONE[c.status] ?? "warn"}>{c.status}</Pill>
                    {c.status === "submitted" && waitingDays(c.submittedAt, td) != null && (
                      <span
                        className="small"
                        style={{
                          marginLeft: 8,
                          color:
                            (waitingDays(c.submittedAt, td) ?? 0) >= STALL_DAYS
                              ? "var(--warn)"
                              : "var(--ink3)",
                        }}
                      >
                        waiting {waitingDays(c.submittedAt, td)}d
                      </span>
                    )}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <Link className="btn sec sm" href={`/claims/${c.id}`}>
                      Open packet
                    </Link>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="muted" style={{ padding: "22px 10px" }}>
                  No claims yet. The next time you buy something with ESA funds, start one above —
                  attach the receipt, review the purpose statement, print the packet, and upload it
                  to your state portal.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
