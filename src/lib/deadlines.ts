// Sorting a school's compliance deadlines into "act now" and "coming".
//
// Same philosophy as the stall detector in metrics.ts: derived signals over
// data the school already keeps, no task list to maintain. What is different
// here is where the dates come from — THE SCHOOL TYPED THEM, off the family's
// award letter or the program portal. rules.ts suggests which obligations a
// program carries (⚑, from public writing), but it never supplies a date,
// because a confidently wrong deadline is worse than none: a missed SLP
// submission has cost Florida families a full year of funding.
//
// Pure: no Prisma, no I/O.

import { daysBetween } from "@/lib/due";

/** How close a deadline gets before the dashboard starts talking about it.
 *  Two weeks: enough time to actually do the thing (chase families for
 *  signatures, gather receipts), short enough that the nudge stays rare. */
export const DEADLINE_SOON_DAYS = 14;

export type DeadlineInput = {
  dueDate: string; // YYYY-MM-DD
  completedAt?: string | null;
};

export type ClassifiedDeadlines<T> = {
  /** Past due and not marked handled — most overdue first. */
  overdue: (T & { daysLeft: number })[];
  /** Due within DEADLINE_SOON_DAYS — nearest first. */
  soon: (T & { daysLeft: number })[];
  /** Open but further out — nearest first. */
  later: (T & { daysLeft: number })[];
  /** Marked handled. Kept so surfaces can show a quiet history. */
  done: T[];
};

export function classifyDeadlines<T extends DeadlineInput>(
  rows: T[],
  today: string
): ClassifiedDeadlines<T> {
  const overdue: (T & { daysLeft: number })[] = [];
  const soon: (T & { daysLeft: number })[] = [];
  const later: (T & { daysLeft: number })[] = [];
  const done: T[] = [];

  for (const row of rows) {
    if (row.completedAt) {
      done.push(row);
      continue;
    }
    // A malformed date classifies as overdue rather than disappearing: a
    // deadline the school bothered to record must never silently vanish from
    // every surface because of a typo — overdue is the state that gets looked
    // at, which is where a typo gets found.
    const valid = /^\d{4}-\d{2}-\d{2}$/.test(row.dueDate);
    const daysLeft = valid ? daysBetween(today, row.dueDate) : -1;
    const entry = { ...row, daysLeft };
    if (daysLeft < 0) overdue.push(entry);
    else if (daysLeft <= DEADLINE_SOON_DAYS) soon.push(entry);
    else later.push(entry);
  }

  overdue.sort((a, b) => a.daysLeft - b.daysLeft);
  soon.sort((a, b) => a.daysLeft - b.daysLeft);
  later.sort((a, b) => a.daysLeft - b.daysLeft);
  return { overdue, soon, later, done };
}

/** "Due today", "Due in 3 days", "4 days overdue" — the phrasing surfaces use. */
export function deadlinePhrase(daysLeft: number): string {
  if (daysLeft < 0) return daysLeft === -1 ? "1 day overdue" : `${-daysLeft} days overdue`;
  if (daysLeft === 0) return "Due today";
  if (daysLeft === 1) return "Due tomorrow";
  return `Due in ${daysLeft} days`;
}
