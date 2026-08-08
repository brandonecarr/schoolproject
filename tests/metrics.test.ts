import { describe, it, expect } from "vitest";
import { reimbursementMetrics, formatPct, stalledInvoices, waitingDays, STALL_DAYS } from "@/lib/metrics";

const day = (n: number) => new Date(2026, 0, 1 + n).toISOString();

describe("reimbursementMetrics", () => {
  it("computes first-pass approval rate over decided invoices", () => {
    const m = reimbursementMetrics([
      { status: "paid", amount: 740, rejectionCount: 0 }, // first-pass
      { status: "paid", amount: 740, rejectionCount: 0 }, // first-pass
      { status: "paid", amount: 740, rejectionCount: 1 }, // paid but reworked
      { status: "rejected", amount: 740, rejectionCount: 1 }, // decided, not first-pass
      { status: "draft", amount: 740, rejectionCount: 0 }, // not decided
      { status: "submitted", amount: 740, rejectionCount: 0 }, // not decided
    ]);
    // decided = 3 paid + 1 rejected = 4; first-pass = 2 → 50%
    expect(m.decided).toBe(4);
    expect(m.firstPassPaid).toBe(2);
    expect(m.firstPassRate).toBeCloseTo(0.5);
    expect(formatPct(m.firstPassRate)).toBe("50%");
  });

  it("returns null rates before anything is decided", () => {
    const m = reimbursementMetrics([
      { status: "draft", amount: 740 },
      { status: "submitted", amount: 740 },
    ]);
    expect(m.firstPassRate).toBeNull();
    expect(m.avgDaysToCash).toBeNull();
    expect(formatPct(null)).toBe("—");
  });

  it("averages days-to-cash over paid invoices with both timestamps", () => {
    const m = reimbursementMetrics([
      { status: "paid", amount: 740, submittedAt: day(0), paidAt: day(40) }, // 40
      { status: "paid", amount: 740, submittedAt: day(0), paidAt: day(50) }, // 50
      { status: "paid", amount: 740, paidAt: day(60) }, // no submittedAt — excluded
    ]);
    expect(m.avgDaysToCash).toBe(45);
    expect(m.paidCount).toBe(3);
  });

  it("rolls up dollars by lifecycle position", () => {
    const m = reimbursementMetrics([
      { status: "draft", amount: 100 },
      { status: "submitted", amount: 200 },
      { status: "approved", amount: 300 },
      { status: "paid", amount: 400 },
      { status: "rejected", amount: 500 },
    ]);
    expect(m.inFlight).toBe(500); // submitted + approved
    expect(m.paidTotal).toBe(400);
    expect(m.draftTotal).toBe(100);
    expect(m.rejectedTotal).toBe(500);
    expect(m.counts).toEqual({ draft: 1, submitted: 1, approved: 1, paid: 1, rejected: 1 });
  });
});

describe("stalledInvoices", () => {
  const TODAY = "2026-08-08";
  const daysAgo = (n: number) => new Date(Date.parse(TODAY + "T12:00:00") - n * 86_400_000).toISOString();

  it("flags submitted packets at the threshold, not before", () => {
    const { stalled } = stalledInvoices(
      [
        { status: "submitted", amount: 740, submittedAt: daysAgo(21) }, // exactly at → stalled
        { status: "submitted", amount: 740, submittedAt: daysAgo(20) }, // one short → not
      ],
      TODAY
    );
    expect(stalled.length).toBe(1);
    expect(stalled[0].waitingDays).toBe(21);
  });

  it("only counts submitted — a decision, either way, ends the stall", () => {
    const { stalled } = stalledInvoices(
      [
        { status: "paid", amount: 740, submittedAt: daysAgo(60) },
        { status: "rejected", amount: 740, submittedAt: daysAgo(60) },
        { status: "approved", amount: 740, submittedAt: daysAgo(60) },
        { status: "draft", amount: 740 },
      ],
      TODAY
    );
    expect(stalled).toEqual([]);
  });

  it("ignores a submitted row with no timestamp rather than guessing", () => {
    const { stalled } = stalledInvoices([{ status: "submitted", amount: 740 }], TODAY);
    expect(stalled).toEqual([]);
  });

  it("totals the money at risk and orders oldest first", () => {
    const { stalled, atRisk } = stalledInvoices(
      [
        { status: "submitted", amount: 1200, submittedAt: daysAgo(25) },
        { status: "submitted", amount: 2500, submittedAt: daysAgo(40) },
      ],
      TODAY
    );
    expect(atRisk).toBe(3700);
    expect(stalled.map((s) => s.waitingDays)).toEqual([40, 25]);
  });

  it("waitingDays floors to whole days and never goes negative", () => {
    expect(waitingDays(daysAgo(3), TODAY)).toBe(3);
    // Submitted "in the future" (clock skew) reads as zero, not negative.
    expect(waitingDays(daysAgo(-2), TODAY)).toBe(0);
    expect(waitingDays(null, TODAY)).toBeNull();
    expect(waitingDays("not-a-date", TODAY)).toBeNull();
  });

  it("the threshold is a named constant someone can find and argue with", () => {
    expect(STALL_DAYS).toBe(21);
  });
});
