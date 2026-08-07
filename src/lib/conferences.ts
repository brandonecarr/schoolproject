// Conference slot arithmetic. Pure — no Prisma, no DOM.
//
// Times are minutes from midnight throughout. That choice is the point of this
// module: a conference is "Tuesday at half three", a local-time appointment, and
// representing it as an instant would mean choosing a timezone, then rendering
// something other than what the teacher typed the moment DST moved.

export type SlotSpan = { startMin: number; endMin: number };

export const MIN_SLOT = 5;
export const DAY_MINUTES = 24 * 60;

/** "15:30" → 930. Returns null for anything that isn't a real time of day. */
export function parseTime(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** 930 → "3:30 pm". Twelve-hour because that is how a US school says it. */
export function formatTime(mins: number): string {
  const m = ((Math.round(mins) % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  const h24 = Math.floor(m / 60);
  const mm = String(m % 60).padStart(2, "0");
  const period = h24 < 12 ? "am" : "pm";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${mm} ${period}`;
}

export function formatSpan(s: SlotSpan): string {
  return `${formatTime(s.startMin)} – ${formatTime(s.endMin)}`;
}

/** For an iCal DTSTART: "2026-09-15" + 930 → "20260915T153000". */
export function icalLocalStamp(date: string, mins: number): string {
  const h = String(Math.floor(mins / 60)).padStart(2, "0");
  const m = String(mins % 60).padStart(2, "0");
  return `${date.replace(/-/g, "")}T${h}${m}00`;
}

export type GenerateInput = {
  startMin: number;
  endMin: number;
  /** Length of each conference. */
  durationMin: number;
  /** Breathing room between them. Zero is allowed and common. */
  gapMin?: number;
};

/**
 * Turn "Tuesday 3pm to 6pm, 20 minutes each" into the individual slots.
 *
 * The teacher should type that once, not create nine records by hand — the
 * hand-made version is where the 4:40 that should have been 4:45 comes from.
 *
 * A partial slot at the end is dropped rather than shortened: a 15-minute
 * conference in a 20-minute series is a scheduling surprise nobody asked for.
 */
export function generateSlots(input: GenerateInput): SlotSpan[] {
  const { startMin, endMin, durationMin } = input;
  const gap = Math.max(0, input.gapMin ?? 0);
  if (
    !Number.isFinite(startMin) ||
    !Number.isFinite(endMin) ||
    durationMin < MIN_SLOT ||
    endMin <= startMin ||
    startMin < 0 ||
    endMin > DAY_MINUTES
  ) {
    return [];
  }
  const out: SlotSpan[] = [];
  // Bounded: a full day of 5-minute slots is 288, so 500 can only be reached by
  // bad input and never by a real afternoon of conferences.
  for (let t = startMin; t + durationMin <= endMin && out.length < 500; t += durationMin + gap) {
    out.push({ startMin: t, endMin: t + durationMin });
  }
  return out;
}

/** Do two spans share any minute? Touching end-to-start does not count. */
export function overlaps(a: SlotSpan, b: SlotSpan): boolean {
  return a.startMin < b.endMin && b.startMin < a.endMin;
}

/**
 * Drop any generated slot that collides with one already published.
 *
 * Publishing the same afternoon twice is an easy mis-click, and the result
 * without this is two slots at 3:20 that two different families each book.
 */
export function withoutClashes(candidates: SlotSpan[], existing: SlotSpan[]): SlotSpan[] {
  return candidates.filter((c) => !existing.some((e) => overlaps(c, e)));
}

export type SlotLike = {
  date: string;
  startMin: number;
  studentId?: string | null;
  bookedByUserId?: string | null;
};

/** Chronological. Same shape everywhere so the teacher list, the family list
 *  and the feed agree. */
export function sortSlots<T extends SlotLike>(slots: T[]): T[] {
  return [...slots].sort((a, b) => a.date.localeCompare(b.date) || a.startMin - b.startMin);
}

export const isBooked = (s: SlotLike): boolean => Boolean(s.bookedByUserId);

/**
 * Is this family already booked for this child?
 *
 * One conference per child per round. Without the rule a keen parent can take
 * four of the six slots, and the quiet family gets none.
 */
export function alreadyBookedFor(slots: SlotLike[], studentId: string): boolean {
  return slots.some((s) => s.studentId === studentId && isBooked(s));
}
