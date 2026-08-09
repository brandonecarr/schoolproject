// The availability engine — recurring weekly windows expanded into concrete
// UTC instants. These are real unit tests against the pure lib, and the DST
// cases are the point: "9:00 in New York" must stay 9:00 in New York when
// the clocks move, because a walkthrough booked at the wrong hour is a
// no-show with a calendar invite.

import { describe, it, expect } from "vitest";
import { expandRules, zonedTimeToUtc, isValidTimeZone } from "../src/lib/availability";

const NY = "America/New_York";
const PHX = "America/Phoenix"; // no DST, ever

const rule = (over: Partial<Parameters<typeof expandRules>[0][number]> = {}) => ({
  weekday: 1, // Monday
  startMin: 9 * 60,
  endMin: 11 * 60,
  slotMinutes: 20,
  timezone: NY,
  ...over,
});

describe("zonedTimeToUtc", () => {
  it("converts winter wall time in New York (UTC-5)", () => {
    // Mon Jan 5 2026, 9:00 EST
    expect(zonedTimeToUtc(2026, 1, 5, 9 * 60, NY).toISOString()).toBe("2026-01-05T14:00:00.000Z");
  });

  it("converts summer wall time in New York (UTC-4)", () => {
    // Mon Jul 6 2026, 9:00 EDT
    expect(zonedTimeToUtc(2026, 7, 6, 9 * 60, NY).toISOString()).toBe("2026-07-06T13:00:00.000Z");
  });

  it("Phoenix is UTC-7 in January and July alike", () => {
    expect(zonedTimeToUtc(2026, 1, 5, 9 * 60, PHX).toISOString()).toBe("2026-01-05T16:00:00.000Z");
    expect(zonedTimeToUtc(2026, 7, 6, 9 * 60, PHX).toISOString()).toBe("2026-07-06T16:00:00.000Z");
  });
});

describe("expandRules", () => {
  const jan1 = new Date("2026-01-01T00:00:00Z"); // a Thursday

  it("generates every slot in the window for each matching weekday", () => {
    const slots = expandRules([rule()], jan1, new Set());
    // Mondays Jan 5 and Jan 12 inside the horizon: 6 twenty-minute slots each.
    const isos = slots.map((s) => s.startsAt.toISOString());
    expect(isos).toContain("2026-01-05T14:00:00.000Z");
    expect(isos).toContain("2026-01-05T15:40:00.000Z");
    expect(isos).toContain("2026-01-12T14:00:00.000Z");
    expect(slots.filter((s) => s.startsAt.toISOString().startsWith("2026-01-05")).length).toBe(6);
    expect(slots.every((s) => s.durationMin === 20)).toBe(true);
  });

  it("crosses the spring DST jump without moving the wall clock", () => {
    // Sundays 9:00–10:00 NY. US clocks spring forward on Mar 8 2026.
    const sunday = rule({ weekday: 7, startMin: 9 * 60, endMin: 10 * 60, slotMinutes: 60 });
    const slots = expandRules([sunday], new Date("2026-02-25T12:00:00Z"), new Set());
    const isos = slots.map((s) => s.startsAt.toISOString());
    expect(isos).toContain("2026-03-01T14:00:00.000Z"); // 9:00 EST
    expect(isos).toContain("2026-03-08T13:00:00.000Z"); // 9:00 EDT — same wall clock
  });

  it("applies minimum notice — no bookings four hours out or closer", () => {
    // 13:00Z on Monday Jan 5 = 8:00 NY; that whole morning's window is
    // inside the notice period and must vanish.
    const now = new Date("2026-01-05T13:00:00Z");
    const slots = expandRules([rule()], now, new Set());
    expect(slots.length).toBeGreaterThan(0);
    expect(slots.every((s) => s.startsAt.getTime() >= now.getTime() + 4 * 60 * 60 * 1000)).toBe(true);
    expect(slots.some((s) => s.startsAt.toISOString().startsWith("2026-01-05"))).toBe(false);
  });

  it("subtracts booked instants", () => {
    const taken = Date.parse("2026-01-05T14:00:00.000Z");
    const slots = expandRules([rule()], jan1, new Set([taken]));
    expect(slots.some((s) => s.startsAt.getTime() === taken)).toBe(false);
    expect(slots.some((s) => s.startsAt.toISOString() === "2026-01-05T14:20:00.000Z")).toBe(true);
  });

  it("overlapping rules dedupe to one slot per instant", () => {
    const slots = expandRules([rule(), rule({ slotMinutes: 20 })], jan1, new Set());
    const isos = slots.map((s) => s.startsAt.toISOString());
    expect(new Set(isos).size).toBe(isos.length);
  });

  it("returns sorted ascending", () => {
    const slots = expandRules([rule({ weekday: 3 }), rule()], jan1, new Set());
    const times = slots.map((s) => s.startsAt.getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it("a malformed rule offers nothing rather than throwing", () => {
    expect(expandRules([rule({ timezone: "Not/AZone" })], jan1, new Set())).toEqual([]);
    expect(expandRules([rule({ startMin: 600, endMin: 610 })], jan1, new Set())).toEqual([]); // no slot fits
    expect(expandRules([rule({ weekday: 0 })], jan1, new Set())).toEqual([]);
  });
});

describe("isValidTimeZone", () => {
  it("accepts IANA names and rejects junk", () => {
    expect(isValidTimeZone("America/Phoenix")).toBe(true);
    expect(isValidTimeZone("Not/AZone")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
  });
});
