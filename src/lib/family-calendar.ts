// Assemble the family-facing calendar for one subscriber.
//
// Shared by the parent page, the student page and the iCal feed so all three
// agree on what a family may see. Three implementations of that question would
// be three chances to leak another family's data.

import { prisma } from "@/lib/db";
import { threadStudentIds } from "@/lib/messages";
import { today, daysAgo, daysAhead } from "@/lib/dates";
import type { FamilyCalItem } from "@/components/FamilyCalendar";
import type { UserModel as User } from "@/generated/prisma/models";

/**
 * Calendar entries plus the subscriber's own due dates, sorted by date.
 *
 * Windowed to a few weeks either side of today by default: a family wants "what
 * is happening", not the full academic history. The iCal feed passes a wider
 * window because a subscribed calendar is expected to hold the whole year.
 */
export async function familyCalendarFor(
  user: User,
  opts: { from?: string; to?: string } = {}
): Promise<FamilyCalItem[]> {
  if (!user.schoolId) return [];
  const from = opts.from ?? daysAgo(14);
  const to = opts.to ?? daysAhead(60);

  const events = await prisma.calendarEvent.findMany({
    // staffOnly is the teacher's switch for "families don't need this one".
    where: { schoolId: user.schoolId, staffOnly: false, startDate: { lte: to }, endDate: { gte: from } },
    orderBy: { startDate: "asc" },
  });

  const items: FamilyCalItem[] = events.map((e) => ({
    key: `e-${e.id}`,
    kind: (["term", "closure", "event"].includes(e.kind) ? e.kind : "event") as FamilyCalItem["kind"],
    title: e.title,
    startDate: e.startDate,
    endDate: e.endDate,
    note: e.note || undefined,
  }));

  // Due dates for this subscriber's own children only.
  const studentIds = await threadStudentIds(user);
  if (studentIds.length > 0) {
    const subs = await prisma.submission.findMany({
      where: { schoolId: user.schoolId, studentId: { in: studentIds } },
      select: { assignmentId: true },
      distinct: ["assignmentId"],
    });
    const ids = subs.map((s) => s.assignmentId);
    const assignments = ids.length
      ? await prisma.assignment.findMany({
          where: { id: { in: ids }, dueDate: { gte: from, lte: to } },
          select: { id: true, title: true, dueDate: true },
        })
      : [];
    for (const a of assignments) {
      items.push({
        key: `d-${a.id}`,
        kind: "due",
        title: a.title,
        startDate: a.dueDate,
        endDate: a.dueDate,
        href: user.role === "student" ? "/student/work" : "/parent/feed",
      });
    }
  }

  return items.sort((a, b) => a.startDate.localeCompare(b.startDate) || a.title.localeCompare(b.title));
}

/** Ensure the user has a subscription token, creating one on first view. */
export async function ensureCalendarToken(userId: string, existing: string | null): Promise<string> {
  if (existing) return existing;
  const { newTokenValue } = await import("@/lib/tokens");
  const token = newTokenValue();
  await prisma.user.update({ where: { id: userId }, data: { calendarToken: token } });
  return token;
}

export { today };
