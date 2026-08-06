import { describe, it, expect } from "vitest";
import {
  rollup,
  rollupAll,
  summarize,
  statusFor,
  decayingAverage,
  pctOf,
  STARTER_PACKS,
  packByKey,
  type ResultLike,
} from "@/lib/outcomes";
import { scoreEvidence } from "@/lib/rules";

const r = (outcomeId: string, score: number, possible: number, day: string): ResultLike => ({
  outcomeId,
  score,
  possible,
  recordedAt: `2026-08-${day}T12:00:00.000Z`,
});

describe("rollup", () => {
  it("takes the highest attempt by default — re-attempts read as growth", () => {
    const res = [r("o1", 5, 10, "01"), r("o1", 9, 10, "02"), r("o1", 7, 10, "03")];
    const u = rollup("o1", res, 0.8);
    expect(u.attempts).toBe(3);
    expect(u.pct).toBeCloseTo(0.9);
    expect(u.mastered).toBe(true);
    expect(u.status).toBe("mastered");
  });

  it("can use the most recent attempt instead", () => {
    const res = [r("o1", 9, 10, "01"), r("o1", 6, 10, "02")];
    expect(rollup("o1", res, 0.8, "latest").pct).toBeCloseTo(0.6);
  });

  it("reports never-assessed outcomes as none, not zero", () => {
    const u = rollup("missing", [r("o1", 10, 10, "01")], 0.8);
    expect(u.attempts).toBe(0);
    expect(u.pct).toBeNull();
    expect(u.status).toBe("none");
    expect(u.mastered).toBe(false);
  });

  it("ignores other outcomes' results", () => {
    const res = [r("o1", 10, 10, "01"), r("o2", 0, 10, "01")];
    expect(rollup("o1", res, 0.8).pct).toBe(1);
  });
});

describe("decayingAverage", () => {
  it("weights the most recent attempt at 65%", () => {
    // prior mean 0.5, recent 1.0 → 1.0*0.65 + 0.5*0.35 = 0.825
    expect(decayingAverage([0.4, 0.6, 1.0])).toBeCloseTo(0.825);
  });
  it("is just the single value with one attempt", () => {
    expect(decayingAverage([0.42])).toBeCloseTo(0.42);
  });
});

describe("statusFor", () => {
  it("bands at the threshold and 75% of it", () => {
    expect(statusFor(0.9, 0.8)).toBe("mastered");
    expect(statusFor(0.8, 0.8)).toBe("mastered");
    expect(statusFor(0.65, 0.8)).toBe("near"); // >= 0.6
    expect(statusFor(0.4, 0.8)).toBe("developing");
    expect(statusFor(null, 0.8)).toBe("none");
  });
});

describe("pctOf", () => {
  it("guards divide-by-zero and clamps", () => {
    expect(pctOf({ score: 5, possible: 0 })).toBe(0);
    expect(pctOf({ score: 15, possible: 10 })).toBe(1);
  });
});

describe("summarize", () => {
  it("counts each band and reports mastered-of-assessed", () => {
    const res = [r("a", 10, 10, "01"), r("b", 7, 10, "01"), r("c", 2, 10, "01")];
    const s = summarize(rollupAll(["a", "b", "c", "d"], res, 0.8));
    expect(s.total).toBe(4);
    expect(s.mastered).toBe(1);
    expect(s.near).toBe(1); // 0.7 >= 0.6
    expect(s.developing).toBe(1);
    expect(s.notAssessed).toBe(1);
    expect(s.assessed).toBe(3);
    expect(s.masteredPct).toBe(33);
  });
});

describe("starter packs", () => {
  it("every pack has a unique key and non-empty outcomes with unique codes", () => {
    const keys = STARTER_PACKS.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
    const allCodes = STARTER_PACKS.flatMap((p) => p.outcomes.map((o) => o.code));
    expect(new Set(allCodes).size).toBe(allCodes.length);
    for (const p of STARTER_PACKS) expect(p.outcomes.length).toBeGreaterThan(0);
  });
  it("looks packs up by key", () => {
    expect(packByKey("math-35")?.subject).toBe("Math");
    expect(packByKey("nope")).toBeUndefined();
  });
});

describe("evidence scoring with standards", () => {
  const base = {
    attendance: Array(10).fill({ status: "present" }),
    submissions: [
      { status: "graded" },
      { status: "graded" },
      { status: "submitted" },
    ],
    observations: [{}],
    assignments: [{}, {}, {}],
    samples: [{}],
  };

  it("is unchanged for schools that don't track standards", () => {
    const without = scoreEvidence(base).score;
    const explicitNull = scoreEvidence({ ...base, standards: null }).score;
    expect(explicitNull).toBe(without);
    expect(scoreEvidence(base).parts.some((p) => p.key === "standards")).toBe(false);
  });

  it("adds a standards part that rewards demonstrated mastery", () => {
    const none = scoreEvidence({ ...base, standards: { assessed: 3, mastered: 0 } });
    const some = scoreEvidence({ ...base, standards: { assessed: 3, mastered: 2 } });
    expect(some.parts.some((p) => p.key === "standards")).toBe(true);
    expect(some.score).toBeGreaterThan(none.score);
  });

  it("never exceeds 100", () => {
    const perfect = scoreEvidence({ ...base, standards: { assessed: 5, mastered: 5 } });
    expect(perfect.score).toBeLessThanOrEqual(100);
  });
});
