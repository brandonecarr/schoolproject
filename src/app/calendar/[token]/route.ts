// GET /calendar/<token>.ics — a subscribable school calendar.
//
// AUTH BY URL, deliberately and unavoidably. Calendar clients cannot send an
// Authorization header on a subscription, so the token in the path is the
// credential. That has real consequences, and the design answers each one:
//
//   - It leaks through referrers, proxy logs and shared screenshots. So the feed
//     exposes CALENDAR DATA ONLY — never grades, scores, attendance, evidence,
//     or invoices. The worst a leaked link gives up is when the school is shut
//     and what homework is due.
//   - It cannot be expired by the user mid-session. So it is rotatable: the
//     "Rotate link" button on /calendar issues a new token and the old URL dies
//     immediately.
//   - It must not be guessable. Tokens come from newTokenValue(), the same
//     source as password-reset links.
//
// Scope follows the subscriber: staff see everything including staff-only
// entries and every due date; a parent sees their own children's; a student sees
// their own. Nobody sees another family's.

import { prisma } from "@/lib/db";
import { buildIcal, type IcalEntry, type CalEvent } from "@/lib/calendar";
import { threadStudentIds, isStaff as isStaffRole } from "@/lib/messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KIND_PREFIX: Record<string, string> = {
  term: "",
  closure: "Closed: ",
  event: "",
};

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token: raw } = await params;
  // Next matches the whole segment, so strip the extension calendar clients
  // expect to see in the URL.
  const token = raw.replace(/\.ics$/i, "");

  const user = token
    ? await prisma.user.findUnique({ where: { calendarToken: token } })
    : null;
  // 404 rather than 401: an unauthenticated probe should not be able to tell a
  // wrong token from a revoked one.
  if (!user || !user.schoolId) {
    return new Response("Not found", { status: 404 });
  }

  const school = await prisma.school.findUnique({ where: { id: user.schoolId } });
  if (!school) return new Response("Not found", { status: 404 });

  const staff = isStaffRole(user.role);

  const events: CalEvent[] = await prisma.calendarEvent.findMany({
    where: { schoolId: school.id, ...(staff ? {} : { staffOnly: false }) },
    orderBy: { startDate: "asc" },
  });

  // Which students' due dates this subscriber may see. Reuses the same resolver
  // the messaging system uses — a second implementation of "whose child is
  // this" is a second place for the answer to be wrong.
  const studentIds = await threadStudentIds(user);

  const entries: IcalEntry[] = events.map((e) => ({
    uid: `event-${e.id}`,
    summary: `${KIND_PREFIX[e.kind] ?? ""}${e.title}`,
    start: e.startDate,
    end: e.endDate,
    description: e.note || undefined,
    // Terms span weeks; marking them busy would black out the subscriber's
    // whole calendar. Closures and notices are informational too.
    transparent: true,
  }));

  // Assignment due dates, but only for work actually assigned to those students —
  // a parent must not learn what another family's child was set.
  if (studentIds.length > 0) {
    const subs = await prisma.submission.findMany({
      where: { schoolId: school.id, studentId: { in: studentIds } },
      select: { assignmentId: true },
      distinct: ["assignmentId"],
    });
    const ids = subs.map((s) => s.assignmentId);
    const assignments = ids.length
      ? await prisma.assignment.findMany({
          where: { id: { in: ids }, dueDate: { not: "" } },
          select: { id: true, title: true, dueDate: true },
        })
      : [];
    for (const a of assignments) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(a.dueDate)) continue;
      entries.push({
        uid: `due-${a.id}`,
        summary: `Due: ${a.title}`,
        start: a.dueDate,
        end: a.dueDate,
        transparent: true,
      });
    }
  }

  const ics = buildIcal({
    calName: school.name,
    entries,
    stamp: new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""),
  });

  return new Response(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="${school.id}.ics"`,
      // The URL is a credential — keep it out of shared caches, and out of the
      // Referer header of anything the subscriber's client might fetch next.
      "Cache-Control": "private, max-age=0, no-store",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
