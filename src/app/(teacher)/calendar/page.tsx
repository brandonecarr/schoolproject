// The school calendar.
//
// Framed as billing, not scheduling, because that is what it is here: the term
// dates and closures below decide how many instructional days an ESA invoice
// can claim. A teacher who publishes a calendar can say "present for 12 of the
// 14 instructional days in this period" instead of "we logged 12 days", and the
// first sentence is the one a state reviewer can check.
//
// So the page leads with the derived count for the current billing window, not
// with a month grid. The number is the point.

import { requireTeacher } from "@/lib/auth";
import { currentOrigin } from "@/lib/tenant-server";
import { prisma } from "@/lib/db";
import { fmt, today, periodStart } from "@/lib/dates";
import {
  instructionalDays,
  parseSchoolDays,
  hasCalendar,
  WEEKDAY_LABEL,
  type CalEvent,
} from "@/lib/calendar";
import { Pill, Notice } from "@/components/ui";
import type { Tone } from "@/components/ui";
import { addCalendarEvent, deleteCalendarEvent, saveSchoolDays, regenerateCalendarToken } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Calendar — Cohort" };

const KIND: Record<string, { label: string; tone: Tone; help: string }> = {
  term: { label: "Term", tone: "good", help: "Instruction is in session. Sets the outer bound of what can be billed." },
  closure: { label: "Closed", tone: "bad", help: "Inside a term but not instructional — subtracted from the count." },
  event: { label: "Event", tone: "info", help: "Shown to families. Does not change the instructional count." },
};

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ added?: string; deleted?: string; saved?: string; rotated?: string; error?: string }>;
}) {
  const { user, school } = await requireTeacher();
  const sp = await searchParams;

  const events: CalEvent[] = await prisma.calendarEvent.findMany({
    where: { schoolId: school!.id },
    orderBy: [{ startDate: "asc" }],
  });

  const days = parseSchoolDays(school!.schoolDays);
  const start = periodStart();
  const end = today();
  const inPeriod = instructionalDays(start, end, events, days);
  const published = hasCalendar(events);

  // Attendance actually logged in the window, to show the gap immediately.
  const logged = await prisma.attendance.findMany({
    where: { schoolId: school!.id, date: { gte: start, lte: end } },
    select: { date: true },
    distinct: ["date"],
  });
  const loggedDates = new Set(logged.map((a) => a.date));
  const unlogged = inPeriod.filter((d) => !loggedDates.has(d));

  // Absolute: this is copied out of the page and pasted into Apple Calendar,
  // where a relative path means nothing. Built from the address the school is
  // already using, so on a subdomain it is the school's own.
  const feedUrl = user.calendarToken
    ? `${await currentOrigin()}/calendar/${user.calendarToken}.ics`
    : null;

  return (
    <>
      <div className="eyebrow">Learning</div>
      <h1>Calendar</h1>
      <p className="small muted" style={{ maxWidth: "72ch" }}>
        Term dates and closures decide how many <strong>instructional days</strong> an invoice can
        claim. Publishing them turns “we logged 12 days” into “present for 12 of the 14 instructional
        days in this period” — a claim a reviewer can check against your own calendar.
      </p>

      {sp.added && <Notice tone="good">Added to the calendar.</Notice>}
      {sp.deleted && <Notice tone="good">Removed.</Notice>}
      {sp.saved && <Notice tone="good">Instructional weekdays saved.</Notice>}
      {sp.rotated && (
        <Notice tone="good">
          Subscription link rotated. The previous link stopped working immediately — anyone
          subscribed will need the new one.
        </Notice>
      )}
      {sp.error === "invalid" && <Notice tone="bad">A title and a valid start date are required.</Notice>}
      {sp.error === "backwards" && <Notice tone="bad">The end date cannot be before the start date.</Notice>}
      {sp.error === "nodays" && <Notice tone="bad">A school has to teach on at least one weekday.</Notice>}

      {!published && (
        <Notice tone="warn">
          No term dates published yet, so invoices fall back to counting whatever attendance happens
          to be logged. Add a term below to get a real denominator.
        </Notice>
      )}

      {published && (
        <div className="cmd-metrics" style={{ marginTop: 14 }}>
          <div className="cmd-metric">
            <div className="n">{inPeriod.length}</div>
            <div className="l">Instructional days</div>
          </div>
          <div className="cmd-metric">
            <div className="n">{inPeriod.length - unlogged.length}</div>
            <div className="l">Attendance logged</div>
          </div>
          <div className={`cmd-metric ${unlogged.length > 0 ? "accent" : ""}`}>
            <div className="n">{unlogged.length}</div>
            <div className="l">Days unlogged</div>
          </div>
          <div className="cmd-metric">
            <div className="n">{[...days].length}</div>
            <div className="l">Days per week</div>
          </div>
        </div>
      )}

      {published && unlogged.length > 0 && (
        <Notice tone="warn">
          {unlogged.length} instructional day{unlogged.length === 1 ? "" : "s"} in the current billing
          window {unlogged.length === 1 ? "has" : "have"} no attendance record: {unlogged.slice(0, 8).map(fmt).join(", ")}
          {unlogged.length > 8 ? `, +${unlogged.length - 8} more` : ""}. A reviewer comparing your
          calendar to your attendance will find the same gap.
        </Notice>
      )}

      <div className="card" style={{ marginTop: 14 }}>
        <div className="eyebrow">Which weekdays do you teach?</div>
        <p className="small muted" style={{ margin: "6px 0 10px" }}>
          Four-day weeks are common and entirely legitimate — but the invoice has to match, or every
          Friday looks like an unexplained absence.
        </p>
        <form action={saveSchoolDays} className="row" style={{ gap: 14, alignItems: "center", flexWrap: "wrap" }}>
          {[1, 2, 3, 4, 5, 6, 7].map((d) => (
            <label key={d} className="row" style={{ gap: 6, alignItems: "center", margin: 0 }}>
              <input type="checkbox" name={`d${d}`} defaultChecked={days.has(d)} />
              {WEEKDAY_LABEL[d]}
            </label>
          ))}
          <button className="btn sec sm">Save</button>
        </form>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="eyebrow">Add to the calendar</div>
        <form action={addCalendarEvent} style={{ marginTop: 8 }}>
          <div className="row" style={{ gap: 12 }}>
            <div style={{ flex: 1, minWidth: 150 }}>
              <label htmlFor="kind">Kind</label>
              <select id="kind" name="kind" defaultValue="term">
                {Object.entries(KIND).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ flex: 2, minWidth: 200 }}>
              <label htmlFor="title">Title</label>
              <input id="title" name="title" required placeholder="Autumn term" />
            </div>
            <div style={{ flex: 1, minWidth: 150 }}>
              <label htmlFor="startDate">Starts</label>
              <input id="startDate" name="startDate" type="date" required defaultValue={today()} />
            </div>
            <div style={{ flex: 1, minWidth: 150 }}>
              <label htmlFor="endDate">Ends (inclusive)</label>
              <input id="endDate" name="endDate" type="date" />
            </div>
          </div>
          <div className="row" style={{ gap: 12, marginTop: 10, alignItems: "center" }}>
            <div style={{ flex: 2, minWidth: 220 }}>
              <label htmlFor="note">Note (optional)</label>
              <input id="note" name="note" placeholder="Shown to families" />
            </div>
            <label className="row small" style={{ gap: 6, alignItems: "center", margin: "18px 0 0" }}>
              <input type="checkbox" name="staffOnly" /> Staff only
            </label>
            <button className="btn mark" style={{ marginTop: 18 }}>
              Add
            </button>
          </div>
          <p className="small muted" style={{ margin: "10px 0 0" }}>
            Leave the end date blank for a single day. {KIND.term.help} {KIND.closure.help}
          </p>
        </form>
      </div>

      <div className="card" style={{ marginTop: 12, padding: "16px 10px" }}>
        <table>
          <thead>
            <tr>
              <th>Kind</th>
              <th>Title</th>
              <th>Dates</th>
              <th>Visible to families</th>
              <th><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 ? (
              <tr>
                <td colSpan={5} className="small muted">
                  Nothing on the calendar yet.
                </td>
              </tr>
            ) : (
              events.map((e) => {
                const k = KIND[e.kind] ?? KIND.event;
                return (
                  <tr key={e.id}>
                    <td>
                      <Pill tone={k.tone}>{k.label}</Pill>
                    </td>
                    <td>
                      {e.title}
                      {e.note ? <div className="small muted">{e.note}</div> : null}
                    </td>
                    <td className="small">
                      {fmt(e.startDate)}
                      {e.endDate !== e.startDate ? ` – ${fmt(e.endDate)}` : ""}
                    </td>
                    <td className="small muted">{e.staffOnly ? "No — staff only" : "Yes"}</td>
                    <td style={{ textAlign: "right" }}>
                      <form action={deleteCalendarEvent}>
                        <input type="hidden" name="id" value={e.id} />
                        <button className="btn ghost sm">Remove</button>
                      </form>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="eyebrow">Subscribe in your own calendar</div>
        {feedUrl ? (
          <>
            <p className="small muted" style={{ margin: "6px 0 8px" }}>
              Add this URL in Apple Calendar, Google Calendar or Outlook as a subscribed calendar. It
              is read-only and updates on its own.
            </p>
            <code className="small" style={{ wordBreak: "break-all" }}>
              {feedUrl}
            </code>
            <p className="small muted" style={{ margin: "10px 0 8px" }}>
              ⚑ This link <strong>is</strong> the password. Calendar apps cannot send a login, so
              anyone with the URL can read the calendar. Don&apos;t post it publicly, and rotate it if
              it leaks.
            </p>
            <form action={regenerateCalendarToken}>
              <button className="btn ghost sm">Rotate link</button>
            </form>
          </>
        ) : (
          <>
            <p className="small muted" style={{ margin: "6px 0 8px" }}>
              Generate a private subscription link for your own calendar app.
            </p>
            <form action={regenerateCalendarToken}>
              <button className="btn sec sm">Create subscription link</button>
            </form>
          </>
        )}
      </div>
    </>
  );
}
