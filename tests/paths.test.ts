import { describe, it, expect } from "vitest";
import {
  pctOf,
  rulesTriggeredBy,
  bandFor,
  describeBand,
  reasonFor,
  isSelfReferential,
  type RuleLike,
} from "@/lib/paths";

const rule = (over: Partial<RuleLike> = {}): RuleLike => ({
  id: "r1",
  assignmentId: "a1",
  minPct: 0,
  maxPct: 69,
  thenAssignmentId: "a2",
  note: "",
  ...over,
});

describe("pctOf", () => {
  it("converts a score to a percentage", () => {
    expect(pctOf(18, 20)).toBe(90);
    expect(pctOf(0, 20)).toBe(0);
  });
  it("guards divide-by-zero", () => {
    expect(pctOf(5, 0)).toBe(0);
  });
});

describe("bandFor", () => {
  it("turns 'below 70' into 0–69 so 69.5 rounds cleanly either side", () => {
    expect(bandFor("below", 70, 0)).toEqual({ minPct: 0, maxPct: 69 });
  });
  it("turns '70 and above' into 70–100", () => {
    expect(bandFor("atOrAbove", 70, 0)).toEqual({ minPct: 70, maxPct: 100 });
  });
  it("builds an explicit range, tolerating reversed inputs", () => {
    expect(bandFor("between", 50, 79)).toEqual({ minPct: 50, maxPct: 79 });
    expect(bandFor("between", 79, 50)).toEqual({ minPct: 50, maxPct: 79 });
  });
  it("clamps to 0..100", () => {
    expect(bandFor("atOrAbove", 140, 0)).toEqual({ minPct: 100, maxPct: 100 });
    expect(bandFor("below", -20, 0)).toEqual({ minPct: 0, maxPct: 0 });
  });
});

describe("rulesTriggeredBy", () => {
  const rules = [
    rule({ id: "support", minPct: 0, maxPct: 69, thenAssignmentId: "reteach" }),
    rule({ id: "extend", minPct: 90, maxPct: 100, thenAssignmentId: "challenge" }),
    rule({ id: "other", assignmentId: "different", minPct: 0, maxPct: 100 }),
  ];

  it("fires the support rule for a low score", () => {
    expect(rulesTriggeredBy(rules, "a1", 55).map((r) => r.id)).toEqual(["support"]);
  });

  it("fires the extension rule for a high score", () => {
    expect(rulesTriggeredBy(rules, "a1", 95).map((r) => r.id)).toEqual(["extend"]);
  });

  it("fires nothing in the gap between bands", () => {
    expect(rulesTriggeredBy(rules, "a1", 80)).toEqual([]);
  });

  it("treats band edges as inclusive", () => {
    expect(rulesTriggeredBy(rules, "a1", 69).map((r) => r.id)).toEqual(["support"]);
    expect(rulesTriggeredBy(rules, "a1", 70)).toEqual([]);
    expect(rulesTriggeredBy(rules, "a1", 90).map((r) => r.id)).toEqual(["extend"]);
  });

  it("ignores rules belonging to another assignment", () => {
    expect(rulesTriggeredBy(rules, "a1", 50).some((r) => r.id === "other")).toBe(false);
  });

  it("can fire more than one rule when bands overlap", () => {
    const overlapping = [
      rule({ id: "one", minPct: 0, maxPct: 60 }),
      rule({ id: "two", minPct: 50, maxPct: 70 }),
    ];
    expect(rulesTriggeredBy(overlapping, "a1", 55).map((r) => r.id)).toEqual(["one", "two"]);
  });
});

describe("describeBand", () => {
  it("reads the way a teacher would say it", () => {
    expect(describeBand(0, 69)).toBe("below 70%");
    expect(describeBand(70, 100)).toBe("70% or above");
    expect(describeBand(50, 79)).toBe("50–79%");
    expect(describeBand(0, 100)).toBe("any score");
  });
});

describe("reasonFor", () => {
  it("prefers the teacher's own words", () => {
    expect(reasonFor(rule({ note: "Let's practise carrying." }), "Long division", 55)).toBe(
      "Let's practise carrying."
    );
  });
  it("falls back to a plain explanation", () => {
    expect(reasonFor(rule(), "Long division", 55)).toBe(
      "Assigned after scoring 55% on “Long division”."
    );
  });
});

describe("isSelfReferential", () => {
  it("catches a rule that would assign its own trigger forever", () => {
    expect(isSelfReferential("a1", "a1")).toBe(true);
    expect(isSelfReferential("a1", "a2")).toBe(false);
  });
});
