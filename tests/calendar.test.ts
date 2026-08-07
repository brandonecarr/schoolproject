import { describe, it, expect } from "vitest";
import {
  addDaysISO,
  weekdayOf,
  eachDay,
  parseSchoolDays,
  instructionalDays,
  hasCalendar,
  attendanceCoverage,
  icalText,
  foldLine,
  buildIcal,
  type CalEvent,
} from "@/lib/calendar";

const ev = (o: Partial<CalEvent> & { kind: string; startDate: string; endDate: string }): CalEvent => ({
  id: o.startDate + o.kind,
  title: o.kind,
  ...o,
});

// A term covering two full weeks: Mon 2026-09-07 .. Fri 2026-09-18.
const TERM = ev({ kind: "term", title: "Autumn term", startDate: "2026-09-07", endDate: "2026-09-18" });

describe("date arithmetic in string space", () => {
  it("adds days across a month boundary", () => {
    expect(addDaysISO("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDaysISO("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("handles a leap day", () => {
    expect(addDaysISO("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDaysISO("2026-02-28", 1)).toBe("2026-03-01");
  });

  it("does not skip or repeat a day across a DST boundary", () => {
    // US DST springs forward 2026-03-08. Local-time arithmetic loses a day here;
    // UTC does not. Getting this wrong miscounts instructional days twice a year.
    const days = eachDay("2026-03-06", "2026-03-10");
    expect(days).toEqual(["2026-03-06", "2026-03-07", "2026-03-08", "2026-03-09", "2026-03-10"]);
    const back = eachDay("2026-10-31", "2026-11-03");
    expect(back).toEqual(["2026-10-31", "2026-11-01", "2026-11-02", "2026-11-03"]);
  });

  it("numbers weekdays ISO-style, Monday first", () => {
    expect(weekdayOf("2026-09-07")).toBe(1); // Monday
    expect(weekdayOf("2026-09-12")).toBe(6); // Saturday
    expect(weekdayOf("2026-09-13")).toBe(7); // Sunday
  });

  it("returns nothing for an inverted or empty range", () => {
    expect(eachDay("2026-09-10", "2026-09-01")).toEqual([]);
    expect(eachDay("", "2026-09-01")).toEqual([]);
  });
});

describe("parseSchoolDays", () => {
  it("reads a four-day week — plenty of microschools run one", () => {
    expect([...parseSchoolDays("1,2,3,4")]).toEqual([1, 2, 3, 4]);
  });

  it("falls back to Mon–Fri rather than to zero days", () => {
    // An empty set would silently make every invoice claim no instruction.
    for (const bad of ["", null, undefined, "garbage", "0,8,9"]) {
      expect([...parseSchoolDays(bad)]).toEqual([1, 2, 3, 4, 5]);
    }
  });
});

describe("instructionalDays", () => {
  it("counts weekdays inside the term and skips the weekend", () => {
    const d = instructionalDays("2026-09-01", "2026-09-30", [TERM], parseSchoolDays("1,2,3,4,5"));
    expect(d).toHaveLength(10);
    expect(d[0]).toBe("2026-09-07");
    expect(d.at(-1)).toBe("2026-09-18");
    expect(d).not.toContain("2026-09-12"); // Saturday
  });

  it("honours a four-day school week", () => {
    const d = instructionalDays("2026-09-01", "2026-09-30", [TERM], parseSchoolDays("1,2,3,4"));
    expect(d).toHaveLength(8);
    expect(d).not.toContain("2026-09-11"); // Friday
  });

  it("subtracts a closure inside the term", () => {
    const closure = ev({ kind: "closure", title: "In-service", startDate: "2026-09-09", endDate: "2026-09-10" });
    const d = instructionalDays("2026-09-01", "2026-09-30", [TERM, closure], parseSchoolDays("1,2,3,4,5"));
    expect(d).toHaveLength(8);
    expect(d).not.toContain("2026-09-09");
    expect(d).not.toContain("2026-09-10");
  });

  it("never counts a day outside every term", () => {
    const d = instructionalDays("2026-08-01", "2026-08-31", [TERM], parseSchoolDays("1,2,3,4,5"));
    expect(d).toEqual([]);
  });

  it("clips to the requested window, not the whole term", () => {
    const d = instructionalDays("2026-09-14", "2026-09-30", [TERM], parseSchoolDays("1,2,3,4,5"));
    expect(d).toHaveLength(5);
    expect(d[0]).toBe("2026-09-14");
  });

  it("handles two terms with a break between them", () => {
    const t2 = ev({ kind: "term", title: "Spring", startDate: "2026-09-28", endDate: "2026-10-02" });
    const d = instructionalDays("2026-09-01", "2026-10-31", [TERM, t2], parseSchoolDays("1,2,3,4,5"));
    expect(d).toHaveLength(15);
    expect(d).not.toContain("2026-09-21"); // in the break
  });

  it("ignores 'event' entries entirely — a field trip is still school", () => {
    const trip = ev({ kind: "event", title: "Museum trip", startDate: "2026-09-09", endDate: "2026-09-09" });
    const d = instructionalDays("2026-09-01", "2026-09-30", [TERM, trip], parseSchoolDays("1,2,3,4,5"));
    expect(d).toHaveLength(10);
    expect(d).toContain("2026-09-09");
  });

  it("returns empty when no term is published, and says so separately", () => {
    // The caller MUST distinguish this from a real zero: no calendar means fall
    // back to the old scoring, not "this school never taught".
    expect(instructionalDays("2026-09-01", "2026-09-30", [], parseSchoolDays("1,2,3,4,5"))).toEqual([]);
    expect(hasCalendar([])).toBe(false);
    expect(hasCalendar([TERM])).toBe(true);
    expect(hasCalendar([ev({ kind: "closure", startDate: "2026-09-09", endDate: "2026-09-09" })])).toBe(false);
  });
});

describe("attendanceCoverage", () => {
  const days = ["2026-09-07", "2026-09-08", "2026-09-09"];

  it("separates logged, present and missing", () => {
    const c = attendanceCoverage(days, [
      { date: "2026-09-07", status: "present" },
      { date: "2026-09-08", status: "absent" },
    ]);
    expect(c).toEqual({ expected: 3, logged: 2, present: 1, missing: ["2026-09-09"] });
  });

  it("counts an absence as logged — a recorded absence is evidence, not a gap", () => {
    const c = attendanceCoverage(days, days.map((d) => ({ date: d, status: "absent" })));
    expect(c.logged).toBe(3);
    expect(c.present).toBe(0);
    expect(c.missing).toEqual([]);
  });

  it("ignores attendance on a non-instructional day", () => {
    const c = attendanceCoverage(days, [
      { date: "2026-09-07", status: "present" },
      { date: "2026-09-12", status: "present" }, // a Saturday
    ]);
    expect(c.logged).toBe(1);
    expect(c.expected).toBe(3);
  });
});

describe("icalText", () => {
  it("escapes the four characters the spec requires", () => {
    expect(icalText("a,b;c\\d")).toBe("a\\,b\\;c\\\\d");
    expect(icalText("line1\nline2")).toBe("line1\\nline2");
    expect(icalText("crlf\r\nhere")).toBe("crlf\\nhere");
  });

  it("escapes the backslash first, so an escape cannot be double-processed", () => {
    // Wrong order turns "\," into "\\," and corrupts the value.
    expect(icalText("\\,")).toBe("\\\\\\,");
  });
});

describe("foldLine", () => {
  it("leaves a short line alone", () => {
    expect(foldLine("SUMMARY:short")).toBe("SUMMARY:short");
  });

  it("folds at 75 octets with a leading space on continuations", () => {
    const folded = foldLine("SUMMARY:" + "x".repeat(200));
    const parts = folded.split("\r\n");
    expect(parts.length).toBeGreaterThan(1);
    expect(Buffer.from(parts[0], "utf8").length).toBe(75);
    for (const p of parts.slice(1)) expect(p.startsWith(" ")).toBe(true);
    expect(folded.replace(/\r\n /g, "")).toBe("SUMMARY:" + "x".repeat(200));
  });

  it("counts octets, not characters", () => {
    // 75 é characters is 150 bytes; folding by character length would emit an
    // over-long line that strict parsers reject.
    const folded = foldLine("SUMMARY:" + "é".repeat(75));
    for (const p of folded.split("\r\n")) expect(Buffer.from(p, "utf8").length).toBeLessThanOrEqual(75);
  });

  it("never splits a multi-byte character across a fold", () => {
    const folded = foldLine("SUMMARY:" + "é".repeat(100));
    // A split sequence would decode to U+FFFD.
    expect(folded).not.toContain("�");
    expect(folded.replace(/\r\n /g, "")).toBe("SUMMARY:" + "é".repeat(100));
  });
});

describe("buildIcal", () => {
  const ics = buildIcal({
    calName: "Cedar Grove",
    stamp: "20260807T000000Z",
    entries: [
      { uid: "a1", summary: "Autumn term", start: "2026-09-07", end: "2026-09-18" },
      { uid: "b2", summary: "Closed: in-service", start: "2026-09-09", end: "2026-09-09", transparent: true },
    ],
  });

  it("emits a well-formed envelope", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
    expect(ics).toContain("VERSION:2.0");
    expect(ics).toContain("PRODID:-//Cohort//School Calendar//EN");
  });

  it("uses CRLF line endings, which some clients require", () => {
    expect(ics).toContain("\r\n");
    expect(ics.split("\r\n").join("")).not.toContain("\n");
  });

  it("makes DTEND exclusive for all-day events", () => {
    // The classic iCal bug: an event ending 09-18 inclusive must serialize as
    // DTEND 09-19, or every event shows a day short.
    expect(ics).toContain("DTSTART;VALUE=DATE:20260907");
    expect(ics).toContain("DTEND;VALUE=DATE:20260919");
  });

  it("gives a single-day event a one-day span, not a zero-day one", () => {
    expect(ics).toContain("DTSTART;VALUE=DATE:20260909");
    expect(ics).toContain("DTEND;VALUE=DATE:20260910");
  });

  it("pairs every BEGIN:VEVENT with an END and a UID", () => {
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics.match(/END:VEVENT/g)).toHaveLength(2);
    expect(ics).toContain("UID:a1@cohort.school");
  });

  it("marks informational entries transparent so they don't block free/busy", () => {
    expect(ics).toContain("TRANSP:TRANSPARENT");
  });

  it("escapes a title that would otherwise break the format", () => {
    const out = buildIcal({
      calName: "X",
      stamp: "20260807T000000Z",
      entries: [{ uid: "u", summary: "Field trip: museum, 9am\nBring lunch", start: "2026-09-09", end: "2026-09-09" }],
    });
    expect(out).toContain("SUMMARY:Field trip: museum\\, 9am\\nBring lunch");
    // The injected newline must not have created a new content line.
    expect(out.split("\r\n").filter((l) => l.startsWith("Bring"))).toHaveLength(0);
  });

  it("cannot be made to inject a fake event through a title", () => {
    const out = buildIcal({
      calName: "X",
      stamp: "20260807T000000Z",
      entries: [
        { uid: "u", summary: "ok\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nSUMMARY:injected", start: "2026-09-09", end: "2026-09-09" },
      ],
    });
    // The words survive as text inside the SUMMARY value — that is expected and
    // harmless. What must not happen is a new CONTENT LINE, so unfold and count
    // lines rather than substrings. (Checking the substring is absent is the
    // weaker, wrong assertion: it would fail on correct output.)
    const lines = out.replace(/\r\n /g, "").split("\r\n");
    expect(lines.filter((l) => l === "BEGIN:VEVENT")).toHaveLength(1);
    expect(lines.filter((l) => l === "END:VEVENT")).toHaveLength(1);
    expect(lines.some((l) => l === "SUMMARY:injected")).toBe(false);
    // And the whole payload is still one event.
    expect(lines.filter((l) => l.startsWith("SUMMARY:"))).toHaveLength(1);
  });
});

describe("buildIcal — timed events (conferences)", () => {
  const ics = buildIcal({
    calName: "Cedar Grove",
    stamp: "20260807T000000Z",
    entries: [{ uid: "t1", summary: "Autumn term", start: "2026-09-07", end: "2026-09-18" }],
    timed: [
      { uid: "c1", summary: "Parent-teacher conference", start: "20260915T153000", end: "20260915T155000", description: "At school" },
    ],
  });

  it("emits a real appointment, not an all-day block", () => {
    expect(ics).toContain("DTSTART:20260915T153000");
    expect(ics).toContain("DTEND:20260915T155000");
    // No VALUE=DATE on this one — that's what makes it all-day.
    expect(ics).not.toContain("DTSTART;VALUE=DATE:20260915");
  });

  it("uses floating local time, with no zone and no Z", () => {
    // "Tuesday at half three" is the same wherever the parent reads it. A zone
    // would re-render it after a DST change or a trip.
    const line = ics.split("\r\n").find((l) => l.startsWith("DTSTART:"))!;
    expect(line).not.toContain("Z");
    expect(line).not.toContain("TZID");
  });

  it("does NOT mark the appointment transparent — it should block time", () => {
    const block = ics.slice(ics.indexOf("UID:c1"), ics.indexOf("END:VEVENT", ics.indexOf("UID:c1")));
    expect(block).not.toContain("TRANSP:TRANSPARENT");
  });

  it("still emits the all-day entries alongside", () => {
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics).toContain("DTSTART;VALUE=DATE:20260907");
  });

  it("omits the section entirely when there are none", () => {
    const none = buildIcal({ calName: "X", stamp: "20260807T000000Z", entries: [] });
    expect(none.match(/BEGIN:VEVENT/g)).toBeNull();
  });
});
