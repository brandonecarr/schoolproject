// The school calendar, and the instructional-day count it derives.
//
// This is billing infrastructure. Attendance evidence used to be scored against
// a flat "at least 8 days in the period", which is a number we invented. Once a
// school publishes term dates and closures, the defensible claim becomes
// "present for 12 of the 14 instructional days in this period" — which is the
// sentence a state reviewer is actually looking for, and which a school can
// stand behind because it comes from its own published calendar.
//
// Pure: no Prisma, no I/O. Dates are inclusive "YYYY-MM-DD" strings throughout
// and compared lexicographically, matching the rest of the domain.

export type CalKind = "term" | "closure" | "event";

export type CalEvent = {
  id: string;
  kind: string;
  title: string;
  startDate: string;
  endDate: string;
  note?: string;
  staffOnly?: boolean;
};

// --- Date arithmetic in string space ----------------------------------------
// UTC throughout. Using local time here would shift a day across a DST boundary
// and silently miscount instructional days twice a year.

export function addDaysISO(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export function weekdayOf(date: string): number {
  const d = new Date(`${date}T00:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

export function eachDay(start: string, end: string): string[] {
  if (!start || !end || start > end) return [];
  const out: string[] = [];
  // Bounded so a typo'd year can't spin forever; ten years of days is far more
  // than any billing period or school year will ask for.
  for (let d = start, i = 0; d <= end && i < 3700; d = addDaysISO(d, 1), i++) out.push(d);
  return out;
}

/** "1,2,3,4" → Set{1,2,3,4}. Falls back to Mon–Fri on anything unparseable. */
export function parseSchoolDays(s: string | null | undefined): Set<number> {
  const nums = String(s ?? "")
    .split(",")
    .map((x) => Number(x.trim()))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 7);
  return nums.length ? new Set(nums) : new Set([1, 2, 3, 4, 5]);
}

export const WEEKDAY_LABEL: Record<number, string> = {
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
  6: "Sat",
  7: "Sun",
};

const covers = (e: CalEvent, day: string) => day >= e.startDate && day <= e.endDate;

/**
 * The instructional days inside [start, end].
 *
 * A day counts when it is inside a term, falls on a weekday the school teaches,
 * and is not inside a closure. Returns [] when the school has published no
 * terms at all — the caller must treat that as "no calendar defined" and fall
 * back, NOT as "zero instructional days", which would read as a school that
 * never taught.
 */
export function instructionalDays(
  start: string,
  end: string,
  events: CalEvent[],
  schoolDays: Set<number>
): string[] {
  const terms = events.filter((e) => e.kind === "term");
  if (terms.length === 0) return [];
  const closures = events.filter((e) => e.kind === "closure");
  return eachDay(start, end).filter(
    (day) =>
      terms.some((t) => covers(t, day)) &&
      schoolDays.has(weekdayOf(day)) &&
      !closures.some((c) => covers(c, day))
  );
}

export function hasCalendar(events: CalEvent[]): boolean {
  return events.some((e) => e.kind === "term");
}

export type AttendanceCoverage = {
  /** Days the calendar says instruction happened. */
  expected: number;
  /** Of those, how many have an attendance record of any status. */
  logged: number;
  /** Of those, how many were marked present. */
  present: number;
  /** Instructional days with no attendance record at all — the gap a reviewer
   *  would ask about, and the one thing this whole feature exists to surface. */
  missing: string[];
};

export function attendanceCoverage(
  days: string[],
  attendance: { date: string; status: string }[]
): AttendanceCoverage {
  const byDate = new Map(attendance.map((a) => [a.date, a.status]));
  const missing = days.filter((d) => !byDate.has(d));
  return {
    expected: days.length,
    logged: days.length - missing.length,
    present: days.filter((d) => byDate.get(d) === "present").length,
    missing,
  };
}

// --- iCal (RFC 5545) --------------------------------------------------------

/** Escape a TEXT value: backslash, semicolon, comma, and newlines. Order
 *  matters — the backslash must be escaped before anything that introduces one. */
export function icalText(s: string): string {
  return String(s ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/**
 * Fold to 75 octets per line, continuations prefixed with a single space.
 *
 * Counted in UTF-8 BYTES, not characters: a line of 75 accented characters is
 * 150 octets and some parsers will reject or truncate it. Multi-byte sequences
 * are never split across a fold.
 */
export function foldLine(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let start = 0;
  let limit = 75; // first line 75, continuations 74 + the leading space
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    // Don't cut inside a UTF-8 multi-byte sequence.
    while (end > start && end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
    out.push(bytes.subarray(start, end).toString("utf8"));
    start = end;
    limit = 74;
  }
  return out.join("\r\n ");
}

export type IcalEntry = {
  uid: string;
  summary: string;
  /** Inclusive start date, YYYY-MM-DD. */
  start: string;
  /** Inclusive end date. Same as start for a single day. */
  end: string;
  description?: string;
  /** Marks the event as busy/free; school closures are informational. */
  transparent?: boolean;
};

const compact = (d: string) => d.replace(/-/g, "");

/**
 * Serialize an all-day calendar.
 *
 * All-day only, on purpose: it sidesteps timezones entirely, and every date in
 * this domain is a date rather than an instant. The one trap is that iCal's
 * DTEND for a DATE value is EXCLUSIVE — an event on the 5th alone needs
 * DTSTART 0105 / DTEND 0106. Getting this wrong shortens every event by a day,
 * which is the single most common iCal bug, so `end` here is inclusive and the
 * extra day is added exactly once, here.
 */
export type IcalTimedEntry = {
  uid: string;
  summary: string;
  /** Floating local time, "YYYYMMDDTHHMMSS" — no Z, no TZID. A parent-teacher
   *  conference is "Tuesday at half three" wherever you happen to be reading
   *  the calendar; attaching a zone would render it as something else after a
   *  DST change or a trip. Floating is the correct iCal form for that. */
  start: string;
  end: string;
  description?: string;
};

export function buildIcal(input: {
  calName: string;
  entries: IcalEntry[];
  /** Real appointments, as opposed to the all-day entries above. */
  timed?: IcalTimedEntry[];
  /** Stamp for DTSTAMP. Passed in rather than read from the clock so output is
   *  deterministic and testable. */
  stamp: string;
  domain?: string;
}): string {
  const domain = input.domain || "cohort.school";
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Cohort//School Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icalText(input.calName)}`,
    // Hint to clients to re-poll roughly daily; most treat it as advisory.
    "REFRESH-INTERVAL;VALUE=DURATION:PT12H",
    "X-PUBLISHED-TTL:PT12H",
  ];

  for (const e of input.entries) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}@${domain}`,
      `DTSTAMP:${input.stamp}`,
      `DTSTART;VALUE=DATE:${compact(e.start)}`,
      `DTEND;VALUE=DATE:${compact(addDaysISO(e.end, 1))}`,
      `SUMMARY:${icalText(e.summary)}`
    );
    if (e.description) lines.push(`DESCRIPTION:${icalText(e.description)}`);
    if (e.transparent) lines.push("TRANSP:TRANSPARENT");
    lines.push("END:VEVENT");
  }

  for (const e of input.timed ?? []) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}@${domain}`,
      `DTSTAMP:${input.stamp}`,
      `DTSTART:${e.start}`,
      `DTEND:${e.end}`,
      `SUMMARY:${icalText(e.summary)}`
    );
    if (e.description) lines.push(`DESCRIPTION:${icalText(e.description)}`);
    // Unlike the all-day entries, this one SHOULD block the subscriber's time:
    // it is an appointment they are expected to attend.
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  // CRLF is required by the spec, and several clients genuinely reject LF-only.
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
