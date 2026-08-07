import { describe, it, expect } from "vitest";
import {
  expectedDays,
  activeDaysIn,
  engagementSignal,
  factualSummary,
  teacherPrompt,
  stateTone,
  LOW_RATE,
  RECENT_DAYS,
  type ActivityEvent,
} from "@/lib/engagement";

/** N consecutive weekday-ish dates. Real instructional days come from the
 *  calendar module; here we only need a stable ordered list. */
function days(n: number, from = 1): string[] {
  return Array.from({ length: n }, (_, i) => `2026-03-${String(from + i).padStart(2, "0")}`);
}

const work = (date: string): ActivityEvent => ({ date, kind: "work" });

describe("expectedDays", () => {
  it("drops the days a child was away", () => {
    // The point of the whole module: an absence is not disengagement. The
    // teacher already knows about it, and counting it would turn this into a
    // report on how often a child is ill.
    const out = expectedDays(days(5), [
      { date: "2026-03-02", status: "absent" },
      { date: "2026-03-04", status: "excused" },
    ]);
    expect(out).toEqual(["2026-03-01", "2026-03-03", "2026-03-05"]);
  });

  it("keeps days the child was present", () => {
    const out = expectedDays(days(3), [{ date: "2026-03-02", status: "present" }]);
    expect(out).toHaveLength(3);
  });

  it("ignores attendance for days that aren't instructional", () => {
    expect(expectedDays(days(2), [{ date: "2026-04-19", status: "absent" }])).toHaveLength(2);
  });
});

describe("activeDaysIn", () => {
  it("counts each day once however much happened on it", () => {
    const events = [work("2026-03-01"), work("2026-03-01"), { date: "2026-03-01", kind: "message" as const }];
    expect(activeDaysIn(events, days(3))).toEqual(["2026-03-01"]);
  });

  it("ignores activity outside the window", () => {
    expect(activeDaysIn([work("2026-02-01")], days(3))).toEqual([]);
  });
});

describe("engagementSignal — states", () => {
  it("says nothing when there isn't enough history", () => {
    const s = engagementSignal({ instructional: days(4), attendance: [], events: [work("2026-03-01")] });
    expect(s.state).toBe("unknown");
    expect(teacherPrompt(s)).toBeNull();
  });

  it("reads steady work as steady", () => {
    const all = days(20);
    const s = engagementSignal({ instructional: all, attendance: [], events: all.map(work) });
    expect(s.state).toBe("steady");
    expect(s.recent.rate).toBe(1);
    expect(teacherPrompt(s)).toBeNull();
  });

  it("flags a child who has stopped entirely", () => {
    const all = days(20);
    // Active for the first ten days, nothing since.
    const s = engagementSignal({ instructional: all, attendance: [], events: all.slice(0, 10).map(work) });
    expect(s.state).toBe("silent");
    expect(s.lastActive).toBe("2026-03-10");
    expect(s.quietFor).toBe(10);
  });

  it("flags a real drop against the child's own baseline", () => {
    const all = days(20);
    const prior = all.slice(0, 10); // 10 of 10
    const recent = [all[10], all[11]]; // 2 of 10
    const s = engagementSignal({ instructional: all, attendance: [], events: [...prior, ...recent].map(work) });
    expect(s.state).toBe("check-in");
    expect(s.reason).toBe("dropped");
    expect(teacherPrompt(s)).toContain("against 10 of 10 before");
  });

  it("does not flag a mild dip", () => {
    // 10-of-10 down to 7-of-10 is a normal fortnight, not a child in trouble.
    const all = days(20);
    const s = engagementSignal({
      instructional: all,
      attendance: [],
      events: [...all.slice(0, 10), ...all.slice(10, 17)].map(work),
    });
    expect(s.state).toBe("steady");
  });

  it("does not fire on an ordinary fortnight's variation", () => {
    // 9-of-10 down to 6-of-10 clears neither the ratio nor the absolute floor.
    // A signal that cries wolf gets dismissed, and is then worth nothing on the
    // day it is right.
    const all = days(20);
    const s = engagementSignal({
      instructional: all,
      attendance: [],
      events: [...all.slice(0, 9), ...all.slice(10, 16)].map(work),
    });
    expect(s.state).toBe("steady");
  });

  it("does not call a barely-working child steady just because they always were", () => {
    // The bug this exists to prevent. Three days in ten, then three days in
    // ten: no trend at all, so a pure trend test reports "steady" — literally
    // true, and a reassuring word attached to the child a teacher most needs to
    // look at. Flat-but-low is its own reason for a check-in.
    const all = days(20);
    const s = engagementSignal({
      instructional: all,
      attendance: [],
      events: [all[0], all[3], all[6], all[10], all[13], all[16]].map(work),
    });
    expect(s.prior).toMatchObject({ active: 3, expected: 10 });
    expect(s.recent).toMatchObject({ active: 3, expected: 10 });
    expect(s.state).toBe("check-in");
    expect(s.reason).toBe("low");
  });

  it("flags low absolute activity even with no baseline at all", () => {
    const all = days(10);
    const s = engagementSignal({ instructional: all, attendance: [], events: [work(all[2])] });
    expect(s.prior.expected).toBe(0);
    expect(s.recent.rate).toBeLessThanOrEqual(LOW_RATE);
    expect(s.state).toBe("check-in");
  });
});

describe("engagementSignal — absence interaction", () => {
  it("does not report a child as quiet for being off sick", () => {
    const all = days(20);
    // Worked every day they were in. Away for the whole recent stretch.
    const attendance = all.slice(10).map((date) => ({ date, status: "absent" }));
    const s = engagementSignal({
      instructional: all,
      attendance,
      events: all.slice(0, 10).map(work),
    });
    // Those ten days left the denominator entirely, so there is nothing to be
    // quiet in: the child reads as having worked every day we expected them to.
    expect(s.recent.expected).toBe(10);
    expect(s.recent.active).toBe(10);
    // No false alarm — which is the whole point. (The state is "unknown"
    // rather than "steady" only because removing the absences left no earlier
    // window to compare against, and we would rather say nothing than invent
    // a trend from a single window.)
    expect(s.state).not.toBe("silent");
    expect(s.state).not.toBe("check-in");
    expect(teacherPrompt(s)).toBeNull();
  });

  it("counts quiet time in school days, not calendar days", () => {
    const all = [...days(5), ...days(5, 20)]; // a gap between the two blocks
    const s = engagementSignal({ instructional: all, attendance: [], events: [work("2026-03-05")] });
    // Four school days have passed since, not fifteen calendar days.
    expect(s.quietFor).toBe(5);
  });
});

describe("windows", () => {
  it("splits on the most recent RECENT_DAYS expected days", () => {
    const all = days(25);
    const s = engagementSignal({ instructional: all, attendance: [], events: [] });
    expect(s.recent.expected).toBe(RECENT_DAYS);
    expect(s.prior.expected).toBe(25 - RECENT_DAYS);
    expect(s.overall.expected).toBe(25);
  });

  it("puts everything in the recent window when history is short", () => {
    const s = engagementSignal({ instructional: days(6), attendance: [], events: [] });
    expect(s.recent.expected).toBe(6);
    expect(s.prior.expected).toBe(0);
  });
});

describe("what a family may see", () => {
  it("gives a factual count with no judgement in it", () => {
    const all = days(14);
    const s = engagementSignal({ instructional: all, attendance: [], events: all.slice(0, 12).map(work) });
    expect(factualSummary(s)).toBe("Produced work on 12 of 14 expected school days");
  });

  it("refuses to invent a denominator when there is no calendar", () => {
    // "0 of 0 days" on a printed record reads as a failing child.
    const s = engagementSignal({ instructional: [], attendance: [], events: [] });
    expect(factualSummary(s)).toBeNull();
  });

  it("keeps every interpretive word out of the family-facing string", () => {
    // The state is the teacher's to act on and share in their own words. If any
    // of this vocabulary reaches the printed record, the record has become a
    // behaviour score on a child.
    const all = days(20);
    for (const events of [[], all.slice(0, 10).map(work), all.map(work)]) {
      const summary = factualSummary(engagementSignal({ instructional: all, attendance: [], events }));
      for (const word of ["quiet", "usual", "check-in", "slipping", "engaged", "disengaged", "behind"]) {
        expect(summary?.toLowerCase() ?? "").not.toContain(word);
      }
    }
  });
});

describe("no child is ever compared to another child", () => {
  it("produces an identical signal regardless of what any other student did", () => {
    // This is the structural guarantee, not a style preference: engagementSignal
    // takes one child's rows and nothing else, so there is nowhere for a cohort
    // average or a ranking to enter. If someone later adds a peer-comparison
    // parameter, this test is where it should become an argument.
    const all = days(20);
    const mine = engagementSignal({ instructional: all, attendance: [], events: all.slice(0, 5).map(work) });
    const again = engagementSignal({ instructional: all, attendance: [], events: all.slice(0, 5).map(work) });
    expect(mine).toEqual(again);
    expect(Object.keys(mine)).not.toContain("percentile");
    expect(Object.keys(mine)).not.toContain("rank");
  });
});

describe("tones", () => {
  it("maps states onto the Pill vocabulary", () => {
    expect(stateTone("steady")).toBe("good");
    expect(stateTone("check-in")).toBe("warn");
    expect(stateTone("silent")).toBe("bad");
    expect(stateTone("unknown")).toBe("info");
  });
});
