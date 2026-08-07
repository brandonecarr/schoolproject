import { describe, it, expect } from "vitest";
import {
  parseTime,
  formatTime,
  formatSpan,
  icalLocalStamp,
  generateSlots,
  overlaps,
  withoutClashes,
  sortSlots,
  alreadyBookedFor,
  isBooked,
} from "@/lib/conferences";

describe("parseTime", () => {
  it("reads a 24-hour time", () => {
    expect(parseTime("15:30")).toBe(930);
    expect(parseTime("00:00")).toBe(0);
    expect(parseTime("9:05")).toBe(545);
    expect(parseTime("23:59")).toBe(1439);
  });

  it("rejects anything that isn't a time of day", () => {
    for (const bad of ["", "  ", "24:00", "12:60", "3pm", "1530", "15:3", "-1:00", "abc"]) {
      expect(parseTime(bad), bad).toBeNull();
    }
  });
});

describe("formatTime", () => {
  it("uses 12-hour time, the way a school says it", () => {
    expect(formatTime(930)).toBe("3:30 pm");
    expect(formatTime(545)).toBe("9:05 am");
  });

  it("gets the two times everyone gets wrong right", () => {
    expect(formatTime(0)).toBe("12:00 am"); // midnight, not 0:00
    expect(formatTime(720)).toBe("12:00 pm"); // noon, not 0:00 pm
  });

  it("formats a span", () => {
    expect(formatSpan({ startMin: 900, endMin: 920 })).toBe("3:00 pm – 3:20 pm");
  });
});

describe("icalLocalStamp", () => {
  it("builds a floating local timestamp", () => {
    expect(icalLocalStamp("2026-09-15", 930)).toBe("20260915T153000");
    expect(icalLocalStamp("2026-09-15", 545)).toBe("20260915T090500");
  });
});

describe("generateSlots", () => {
  it("turns an afternoon into individual slots", () => {
    // 3:00pm–6:00pm, 20 minutes each = 9 slots.
    const s = generateSlots({ startMin: 900, endMin: 1080, durationMin: 20 });
    expect(s).toHaveLength(9);
    expect(formatSpan(s[0])).toBe("3:00 pm – 3:20 pm");
    expect(formatSpan(s[8])).toBe("5:40 pm – 6:00 pm");
  });

  it("honours a gap between conferences", () => {
    const s = generateSlots({ startMin: 900, endMin: 1000, durationMin: 20, gapMin: 10 });
    expect(formatSpan(s[0])).toBe("3:00 pm – 3:20 pm");
    expect(formatSpan(s[1])).toBe("3:30 pm – 3:50 pm");
  });

  it("drops a partial slot rather than shortening it", () => {
    // 3:00–4:10 at 30 minutes: two fit, the last 10 minutes are not a slot.
    const s = generateSlots({ startMin: 900, endMin: 970, durationMin: 30 });
    expect(s).toHaveLength(2);
    expect(s.at(-1)!.endMin).toBe(960);
  });

  it("returns nothing for input that can't produce a slot", () => {
    expect(generateSlots({ startMin: 1000, endMin: 900, durationMin: 20 })).toEqual([]);
    expect(generateSlots({ startMin: 900, endMin: 900, durationMin: 20 })).toEqual([]);
    expect(generateSlots({ startMin: 900, endMin: 910, durationMin: 20 })).toEqual([]);
    expect(generateSlots({ startMin: 900, endMin: 1000, durationMin: 0 })).toEqual([]);
    expect(generateSlots({ startMin: -10, endMin: 1000, durationMin: 20 })).toEqual([]);
    expect(generateSlots({ startMin: 900, endMin: 2000, durationMin: 20 })).toEqual([]);
  });

  it("cannot be made to loop forever by absurd input", () => {
    const s = generateSlots({ startMin: 0, endMin: 1440, durationMin: 5 });
    expect(s.length).toBeLessThanOrEqual(500);
    expect(s.length).toBe(288);
  });
});

describe("overlaps", () => {
  it("detects a genuine collision", () => {
    expect(overlaps({ startMin: 900, endMin: 920 }, { startMin: 910, endMin: 930 })).toBe(true);
    expect(overlaps({ startMin: 900, endMin: 960 }, { startMin: 910, endMin: 920 })).toBe(true);
  });

  it("treats back-to-back slots as fine", () => {
    // 3:00–3:20 then 3:20–3:40 is a normal schedule, not a clash.
    expect(overlaps({ startMin: 900, endMin: 920 }, { startMin: 920, endMin: 940 })).toBe(false);
  });
});

describe("withoutClashes", () => {
  it("skips slots that collide with what's already published", () => {
    // Publishing the same afternoon twice is an easy mis-click; the result
    // without this is two 3:20s that two different families each book.
    const existing = [{ startMin: 920, endMin: 940 }];
    const out = withoutClashes(generateSlots({ startMin: 900, endMin: 1000, durationMin: 20 }), existing);
    expect(out.map((s) => s.startMin)).toEqual([900, 940, 960, 980]);
  });

  it("keeps everything when nothing is published yet", () => {
    const gen = generateSlots({ startMin: 900, endMin: 960, durationMin: 20 });
    expect(withoutClashes(gen, [])).toHaveLength(3);
  });
});

describe("sortSlots", () => {
  it("orders by date then time", () => {
    const out = sortSlots([
      { date: "2026-09-16", startMin: 900 },
      { date: "2026-09-15", startMin: 960 },
      { date: "2026-09-15", startMin: 900 },
    ]);
    expect(out.map((s) => `${s.date} ${s.startMin}`)).toEqual([
      "2026-09-15 900",
      "2026-09-15 960",
      "2026-09-16 900",
    ]);
  });

  it("does not mutate the input", () => {
    const input = [
      { date: "2026-09-16", startMin: 900 },
      { date: "2026-09-15", startMin: 900 },
    ];
    sortSlots(input);
    expect(input[0].date).toBe("2026-09-16");
  });
});

describe("one conference per child", () => {
  const slots = [
    { date: "2026-09-15", startMin: 900, studentId: "eli", bookedByUserId: "dana" },
    { date: "2026-09-15", startMin: 920, studentId: null, bookedByUserId: null },
  ];

  it("knows which slots are taken", () => {
    expect(isBooked(slots[0])).toBe(true);
    expect(isBooked(slots[1])).toBe(false);
  });

  it("stops one family taking the whole afternoon", () => {
    // Without the rule, a keen parent books four of six and the quiet family
    // gets none.
    expect(alreadyBookedFor(slots, "eli")).toBe(true);
    expect(alreadyBookedFor(slots, "maya")).toBe(false);
  });

  it("does not count an unbooked slot that merely names a student", () => {
    expect(alreadyBookedFor([{ date: "d", startMin: 1, studentId: "eli", bookedByUserId: null }], "eli")).toBe(
      false
    );
  });
});
