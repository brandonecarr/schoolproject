// Family-facing calendar. Content is identical for parent and student — only
// whose due dates are included differs, and familyCalendarFor resolves that.

import { requireUser } from "@/lib/auth";
import { FamilyCalendar } from "@/components/FamilyCalendar";
import { familyCalendarFor, ensureCalendarToken } from "@/lib/family-calendar";

export const dynamic = "force-dynamic";
export const metadata = { title: "Calendar — Cohort" };

export default async function StudentCalendarPage() {
  const { user } = await requireUser();
  const items = await familyCalendarFor(user);
  const token = await ensureCalendarToken(user.id, user.calendarToken);

  return (
    <>
      <div className="eyebrow">Calendar</div>
      <h1>What&apos;s coming up</h1>
      <p className="small muted" style={{ maxWidth: "64ch" }}>
        Term dates, days the school is closed, and work that&apos;s due.
      </p>
      <FamilyCalendar
        items={items}
        feedUrl={`/calendar/${token}.ics`}
        emptyNote="Nothing scheduled in the next few weeks."
      />
    </>
  );
}
