// Recurring availability → concrete bookable times.
//
// The admin states a weekly pattern once ("Mondays 9:00–11:00, 20-minute
// slots, America/Phoenix") and /book expands it into actual UTC instants for
// the next two weeks, minus what's already booked. No slot rows exist until
// someone books — the rules ARE the calendar.
//
// Everything here is pure: instants in, instants out. Timezone math uses the
// Intl API against the stored IANA name, so "9:00 in Phoenix" stays 9:00 in
// Phoenix across DST transitions without a date library.

export type AvailabilityRuleInput = {
  id?: string;
  weekday: number; // ISO: 1=Mon ... 7=Sun
  startMin: number; // minutes from local midnight
  endMin: number;
  slotMinutes: number;
  timezone: string; // IANA name, e.g. "America/Phoenix"
};

export type OpenSlot = { startsAt: Date; durationMin: number };

export const BOOKING_HORIZON_DAYS = 30; // a month grid needs a month of days
export const MIN_NOTICE_MS = 4 * 60 * 60 * 1000; // no "in ten minutes" bookings

const WEEKDAY_ISO: Record<string, number> = {
  Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7,
};

export function isValidTimeZone(tz: string): boolean {
  if (!tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// What wall-clock date does this instant show in tz?
function wallDateInZone(instant: Date, tz: string): { y: number; m: number; d: number; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    y: Number(get("year")),
    m: Number(get("month")),
    d: Number(get("day")),
    weekday: WEEKDAY_ISO[get("weekday")] ?? 0,
  };
}

// Wall clock (y-m-d + minutes past midnight) in tz → UTC instant.
//
// Two-pass offset trick: guess the instant as if tz were UTC, ask Intl what
// wall time that guess actually shows in tz, and correct by the difference.
// The second pass catches guesses that land on the wrong side of a DST jump.
export function zonedTimeToUtc(y: number, m: number, d: number, minutes: number, tz: string): Date {
  let guess = Date.UTC(y, m - 1, d, 0, minutes);
  for (let i = 0; i < 2; i++) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(guess));
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
    const shown = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
    const want = Date.UTC(y, m - 1, d, 0, minutes);
    if (shown === want) break;
    guess += want - shown;
  }
  return new Date(guess);
}

// Expand rules into open slots: horizon days out, minimum notice applied,
// already-booked instants removed, deduped (overlapping rules collapse to
// the earlier-listed rule's duration), sorted ascending.
export function expandRules(
  rules: AvailabilityRuleInput[],
  now: Date,
  bookedStarts: Set<number>,
  opts?: { horizonDays?: number; minNoticeMs?: number; max?: number },
): OpenSlot[] {
  const horizonDays = opts?.horizonDays ?? BOOKING_HORIZON_DAYS;
  const minNoticeMs = opts?.minNoticeMs ?? MIN_NOTICE_MS;
  const max = opts?.max ?? 500;
  const earliest = now.getTime() + minNoticeMs;

  const byInstant = new Map<number, OpenSlot>();
  for (const rule of rules) {
    if (
      !isValidTimeZone(rule.timezone) ||
      rule.weekday < 1 || rule.weekday > 7 ||
      rule.slotMinutes < 10 || rule.slotMinutes > 120 ||
      rule.startMin < 0 || rule.endMin > 24 * 60 ||
      rule.startMin + rule.slotMinutes > rule.endMin
    ) {
      continue; // a malformed row degrades to "offers nothing", never throws
    }
    for (let dayOffset = 0; dayOffset <= horizonDays; dayOffset++) {
      // Walk days by the RULE's calendar, not the server's: take an instant
      // mid-way through each UTC day and ask what date/weekday tz calls it.
      const probe = new Date(now.getTime() + dayOffset * 86_400_000);
      const wall = wallDateInZone(probe, rule.timezone);
      if (wall.weekday !== rule.weekday) continue;
      for (let t = rule.startMin; t + rule.slotMinutes <= rule.endMin; t += rule.slotMinutes) {
        const startsAt = zonedTimeToUtc(wall.y, wall.m, wall.d, t, rule.timezone);
        const key = startsAt.getTime();
        if (key < earliest) continue;
        if (bookedStarts.has(key)) continue;
        if (!byInstant.has(key)) byInstant.set(key, { startsAt, durationMin: rule.slotMinutes });
      }
    }
  }
  return [...byInstant.values()]
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
    .slice(0, max);
}
