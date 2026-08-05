// Reimbursement metrics — "the sentence the whole go-to-market rests on":
// schools using Cohort get paid faster, with a high first-pass approval rate.
// (COHORT-HANDOFF §7 — instrument first-pass approval rate and days-to-cash.)
//
// Pure functions over invoice-like rows so they're unit-testable and reusable
// across the invoices page and the dashboard.

export type InvoiceMetricInput = {
  status: string;
  amount: number;
  submittedAt?: string | null;
  paidAt?: string | null;
  rejectionCount?: number | null;
};

export type ReimbursementMetrics = {
  // First-pass approval rate: of invoices that have reached a decision (paid, or
  // currently rejected), the share that were paid without ever being rejected.
  // null when nothing has been decided yet.
  firstPassRate: number | null;
  firstPassPaid: number;
  decided: number;
  // Average days from submission to payment, over paid invoices that have both
  // timestamps. null when nothing has been paid yet.
  avgDaysToCash: number | null;
  paidCount: number;
  // Dollar rollups by lifecycle position.
  inFlight: number; // submitted + approved (money on the clock)
  paidTotal: number;
  draftTotal: number;
  rejectedTotal: number;
  counts: Record<string, number>;
};

const MS_PER_DAY = 86_400_000;

export function reimbursementMetrics(invoices: InvoiceMetricInput[]): ReimbursementMetrics {
  const counts: Record<string, number> = {};
  let inFlight = 0;
  let paidTotal = 0;
  let draftTotal = 0;
  let rejectedTotal = 0;

  const paid: InvoiceMetricInput[] = [];
  let rejectedNow = 0;

  for (const inv of invoices) {
    counts[inv.status] = (counts[inv.status] || 0) + 1;
    const amt = Number(inv.amount) || 0;
    if (inv.status === "submitted" || inv.status === "approved") inFlight += amt;
    else if (inv.status === "paid") {
      paidTotal += amt;
      paid.push(inv);
    } else if (inv.status === "draft") draftTotal += amt;
    else if (inv.status === "rejected") {
      rejectedTotal += amt;
      rejectedNow++;
    }
  }

  const firstPassPaid = paid.filter((i) => (i.rejectionCount || 0) === 0).length;
  const decided = paid.length + rejectedNow;
  const firstPassRate = decided > 0 ? firstPassPaid / decided : null;

  const spans = paid
    .filter((i) => i.submittedAt && i.paidAt)
    .map((i) => (Date.parse(i.paidAt as string) - Date.parse(i.submittedAt as string)) / MS_PER_DAY)
    .filter((d) => Number.isFinite(d) && d >= 0);
  const avgDaysToCash =
    spans.length > 0 ? Math.round((spans.reduce((a, b) => a + b, 0) / spans.length) * 10) / 10 : null;

  return {
    firstPassRate,
    firstPassPaid,
    decided,
    avgDaysToCash,
    paidCount: paid.length,
    inFlight,
    paidTotal,
    draftTotal,
    rejectedTotal,
    counts,
  };
}

export function formatPct(rate: number | null): string {
  return rate == null ? "—" : `${Math.round(rate * 100)}%`;
}
