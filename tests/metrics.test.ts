import { describe, it, expect } from "vitest";
import { reimbursementMetrics, formatPct } from "@/lib/metrics";

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
