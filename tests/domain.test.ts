import { describe, it, expect } from "vitest";
import { scoreEvidence, readiness } from "@/lib/rules";
import { tuitionSplit, ledgerFor, forecast, addDays } from "@/lib/billing";
import { today } from "@/lib/dates";

// Helpers to build the shapes scoreEvidence expects.
const present = (n: number) => Array.from({ length: n }, () => ({ status: "present" }));
const subs = (statuses: string[]) => statuses.map((status) => ({ status }));
const items = (n: number) => Array.from({ length: n }, (_, i) => i);

describe("scoreEvidence — the product", () => {
  it("reproduces Cole Draper's thin-evidence score of 56", () => {
    const { score } = scoreEvidence({
      attendance: present(12), // ok (30)
      assignments: items(2), // partial (9)
      submissions: subs(["assigned", "assigned"]), // withWork 0, graded 0 (0 + 4)
      observations: items(0), // partial (2)
      samples: items(0), // partial (2)
    });
    expect(score).toBe(56);
  });

  it("reproduces the 97 spread for a full record with no work sample", () => {
    const { score } = scoreEvidence({
      attendance: present(12), // 30
      assignments: items(4), // 25
      submissions: subs(["graded", "graded", "submitted", "assigned"]), // withWork 3 (25) + graded 2 (10)
      observations: items(1), // 5
      samples: items(0), // partial (2)
    });
    expect(score).toBe(97);
  });

  it("hits 100 when every part meets its threshold", () => {
    const { score } = scoreEvidence({
      attendance: present(8),
      assignments: items(3),
      submissions: subs(["graded", "submitted"]),
      observations: items(1),
      samples: items(1),
    });
    expect(score).toBe(100);
  });

  it("counts present days separately from logged days", () => {
    const { presentDays } = scoreEvidence({
      attendance: [...present(11), { status: "absent" }],
      assignments: items(3),
      submissions: subs(["graded"]),
      observations: items(1),
      samples: items(0),
    });
    expect(presentDays).toBe(11);
  });
});

describe("readiness bands", () => {
  it("classifies scores into the three bands", () => {
    expect(readiness(100).tone).toBe("good");
    expect(readiness(90).tone).toBe("good");
    expect(readiness(89).tone).toBe("warn");
    expect(readiness(70).tone).toBe("warn");
    expect(readiness(69).tone).toBe("bad");
    expect(readiness(56).label).toBe("Not enough evidence");
  });
});

describe("tuitionSplit", () => {
  it("splits an ESA-funded student into esa + family portions", () => {
    expect(tuitionSplit({ tuitionAnnual: 7400, esaAmount: 7400 })).toEqual({
      annual: 7400,
      esa: 7400,
      family: 0,
    });
  });

  it("caps the ESA portion at annual tuition and puts the rest on the family", () => {
    expect(tuitionSplit({ tuitionAnnual: 10000, esaAmount: 7400 })).toEqual({
      annual: 10000,
      esa: 7400,
      family: 2600,
    });
  });

  it("treats a private-pay student as all family", () => {
    expect(tuitionSplit({ tuitionAnnual: 7400, esaAmount: 0 })).toEqual({
      annual: 7400,
      esa: 0,
      family: 7400,
    });
  });
});

describe("ledgerFor — split-payer ledger", () => {
  it("tracks family payments and ESA paid vs in-flight separately", () => {
    const student = { tuitionAnnual: 10000, esaAmount: 7400 };
    const payments = [
      { payer: "family", amount: 1000 },
      { payer: "family", amount: 500 },
    ];
    const invoices = [
      { status: "paid", amount: 700 },
      { status: "submitted", amount: 740 },
      { status: "draft", amount: 740 },
    ];
    const l = ledgerFor(student, payments, invoices);
    expect(l.familyPaid).toBe(1500);
    expect(l.familyBalance).toBe(1100); // 2600 owed - 1500 paid
    expect(l.esaPaid).toBe(700);
    expect(l.esaPending).toBe(1480); // submitted + draft
    expect(l.collected).toBe(2200); // familyPaid + esaPaid
    expect(l.outstanding).toBe(7800); // 10000 - 1500 - 700
  });
});

describe("forecast — 90-day cash flow", () => {
  it("puts draft invoices in unscheduled and lands submitted ones by rail lag", () => {
    const t = today();
    const invoices = [
      { status: "draft", amount: 740, submittedAt: null },
      { status: "submitted", amount: 740, submittedAt: `${t}T12:00:00.000Z` },
      { status: "paid", amount: 700, submittedAt: `${t}T12:00:00.000Z` }, // excluded
    ];
    const f = forecast(invoices, "classwallet", 300);
    expect(f.unscheduled).toBe(740); // the draft
    expect(f.rail.lagDays).toBe(45);
    // classwallet lag 45 → lands in the 31–60 bucket
    const landed = f.buckets.reduce((a, b) => a + b.esa, 0);
    expect(landed).toBe(740); // only the submitted one
    expect(f.buckets[1].esa).toBe(740);
    // family income is spread across every bucket
    expect(f.buckets.every((b) => b.family === 300)).toBe(true);
  });

  it("falls back to a 45-day assumption for an unknown rail", () => {
    const f = forecast([], null, 0);
    expect(f.rail.lagDays).toBe(45);
    expect(f.rail.verify).toBe(true);
  });
});

describe("addDays", () => {
  it("advances a YYYY-MM-DD string by N days", () => {
    expect(addDays("2026-01-01", 45)).toBe("2026-02-15");
  });
});

describe("scoreEvidence — calendar-aware attendance", () => {
  const base = {
    submissions: [] as { status: string }[],
    observations: [] as unknown[],
    assignments: [] as unknown[],
  };
  const att = (n: number) => Array.from({ length: n }, () => ({ status: "present" }));

  it("is unchanged for a school with no published calendar", () => {
    // The whole point of the null case: adding this feature must not silently
    // move any existing school's score.
    const before = scoreEvidence({ ...base, attendance: att(8) });
    const after = scoreEvidence({ ...base, attendance: att(8), instructionalDays: null });
    expect(after.score).toBe(before.score);
    expect(after.parts.find((p) => p.key === "attendance")!.ok).toBe(true);
  });

  it("passes only when every instructional day is logged", () => {
    const short = scoreEvidence({ ...base, attendance: att(12), instructionalDays: 14 });
    const full = scoreEvidence({ ...base, attendance: att(14), instructionalDays: 14 });
    expect(short.parts.find((p) => p.key === "attendance")!.ok).toBe(false);
    expect(full.parts.find((p) => p.key === "attendance")!.ok).toBe(true);
  });

  it("is stricter than the flat threshold when the calendar demands more", () => {
    // 10 days would have passed the old ">= 8" rule; against a 14-day calendar
    // it is a gap a reviewer would find.
    expect(scoreEvidence({ ...base, attendance: att(10) }).parts.find((p) => p.key === "attendance")!.ok).toBe(true);
    expect(
      scoreEvidence({ ...base, attendance: att(10), instructionalDays: 14 }).parts.find(
        (p) => p.key === "attendance"
      )!.ok
    ).toBe(false);
  });

  it("is kinder than the flat threshold for a short billing period", () => {
    // A 4-day week over a fortnight is 8 days; a period containing only 5
    // instructional days should not be marked short for having 5.
    const p = scoreEvidence({ ...base, attendance: att(5), instructionalDays: 5 }).parts.find(
      (x) => x.key === "attendance"
    )!;
    expect(p.ok).toBe(true);
    expect(p.label).toContain("5 of 5");
  });

  it("names the denominator so the invoice can quote it", () => {
    const p = scoreEvidence({ ...base, attendance: att(12), instructionalDays: 14 }).parts.find(
      (x) => x.key === "attendance"
    )!;
    expect(p.label).toBe("Attendance logged (12 of 14 instructional days)");
    expect(p.need).toContain("14 instructional days");
  });

  it("falls back rather than dividing by a zero-day calendar", () => {
    const p = scoreEvidence({ ...base, attendance: att(8), instructionalDays: 0 }).parts.find(
      (x) => x.key === "attendance"
    )!;
    expect(p.ok).toBe(true);
    expect(p.label).toBe("Attendance days logged");
  });
});
