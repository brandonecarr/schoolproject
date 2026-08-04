// Tuition ledger + cash flow forecasting. Ported from the MVP's src/billing.js.
//
// The split-payer case is the one nobody handles well: a family covers part of
// tuition with an ESA and pays the rest themselves. Those two streams arrive on
// completely different schedules — the family pays on the 1st, the state pays
// two months after you taught. One balance, two clocks.

// Disbursement behaviour per rail. VERIFY ALL OF THIS with design partners —
// these lag figures are the difference between a useful forecast and a lie.
// (COHORT-HANDOFF §4.5: the ⚑ flag stays until observed in a real cycle.)
export type Disbursement = {
  lagDays: number;
  cadence: string;
  verify: boolean;
  note: string;
};

export const DISBURSEMENT: Record<string, Disbursement> = {
  classwallet: { lagDays: 45, cadence: "rolling", verify: true, note: "Rolling submissions; reimbursement follows approval." },
  stepup: { lagDays: 60, cadence: "rolling", verify: true, note: "Florida operators commonly describe a 60-day bridge." },
  odyssey: { lagDays: 30, cadence: "semester", verify: true, note: "Funds released on a semester calendar." },
};

export function addDays(iso: string, n: number): string {
  const d = new Date(iso + (String(iso).length === 10 ? "T12:00:00" : ""));
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export type StudentLike = { tuitionAnnual?: number | null; esaAmount?: number | null };

// What a student owes across the year, split by who pays which part.
export function tuitionSplit(student: StudentLike) {
  const annual = Number(student.tuitionAnnual || 0);
  const esa = Math.min(Number(student.esaAmount || 0), annual);
  return { annual, esa, family: Math.max(0, annual - esa) };
}

export type PaymentLike = { payer: string; amount: number };
export type InvoiceLike = { status: string; amount: number; submittedAt?: string | null };

// Ledger for one student: charges minus payments, tracked per payer.
export function ledgerFor(
  student: StudentLike,
  payments: PaymentLike[],
  invoices: InvoiceLike[]
) {
  const split = tuitionSplit(student);
  const familyPaid = payments
    .filter((p) => p.payer === "family")
    .reduce((a, p) => a + Number(p.amount), 0);
  const esaPaid = invoices
    .filter((i) => i.status === "paid")
    .reduce((a, i) => a + Number(i.amount), 0);
  const esaPending = invoices
    .filter((i) => i.status === "submitted" || i.status === "draft")
    .reduce((a, i) => a + Number(i.amount), 0);

  return {
    ...split,
    familyPaid,
    familyBalance: Math.max(0, split.family - familyPaid),
    esaPaid,
    esaPending,
    esaBalance: Math.max(0, split.esa - esaPaid - esaPending),
    collected: familyPaid + esaPaid,
    outstanding: Math.max(0, split.annual - familyPaid - esaPaid),
  };
}

export type ForecastBucket = {
  key: string;
  label: string;
  from: string;
  to: string;
  esa: number;
  family: number;
};

// 90-day forecast. Expected inflows from submitted invoices land on
// submittedAt + rail lag. Draft invoices are shown separately because they
// haven't started their clock yet — that distinction is the whole point.
export function forecast(
  invoices: InvoiceLike[],
  railId: string | null,
  monthlyFamilyIncome = 0
) {
  const rail =
    (railId && DISBURSEMENT[railId]) || {
      lagDays: 45,
      cadence: "rolling",
      verify: true,
      note: "Unknown rail — assuming 45 days.",
    };
  const today = new Date().toISOString().slice(0, 10);
  const buckets: ForecastBucket[] = [
    { key: "0-30", label: "Next 30 days", from: today, to: addDays(today, 30), esa: 0, family: 0 },
    { key: "31-60", label: "Days 31–60", from: addDays(today, 31), to: addDays(today, 60), esa: 0, family: 0 },
    { key: "61-90", label: "Days 61–90", from: addDays(today, 61), to: addDays(today, 90), esa: 0, family: 0 },
  ];

  let unscheduled = 0;
  for (const inv of invoices) {
    if (inv.status === "paid" || inv.status === "rejected") continue;
    if (inv.status === "draft") {
      unscheduled += Number(inv.amount);
      continue;
    }
    const land = addDays((inv.submittedAt || today).slice(0, 10), rail.lagDays);
    const b = buckets.find((x) => land >= x.from && land <= x.to);
    if (b) b.esa += Number(inv.amount);
    else if (land < today) buckets[0].esa += Number(inv.amount);
  }

  buckets.forEach((b) => (b.family = monthlyFamilyIncome));
  return { rail, buckets, unscheduled, today };
}
