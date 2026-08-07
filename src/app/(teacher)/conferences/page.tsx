// Parent-teacher conferences.
//
// The teacher publishes an afternoon in one go — "Tuesday 3 to 6, twenty
// minutes each" — rather than creating nine records by hand, which is where the
// 4:40 that should have been 4:45 comes from. Families claim a slot themselves.
//
// The note field after each conference is what makes this more than a diary: a
// documented conversation with a family is exactly the engagement evidence some
// ESA programs look for, so it carries through to the student's printed record.

import { requireTeacher } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fmt, today } from "@/lib/dates";
import { formatSpan, sortSlots, isBooked } from "@/lib/conferences";
import { Pill, Notice } from "@/components/ui";
import { MarkdownField } from "@/components/MarkdownField";
import { Markdown } from "@/components/Markdown";
import { publishConferenceSlots, deleteConferenceSlot, saveConferenceNote } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Conferences — Cohort" };

export default async function ConferencesPage({
  searchParams,
}: {
  searchParams: Promise<{ added?: string; skipped?: string; saved?: string; error?: string }>;
}) {
  const { school } = await requireTeacher();
  const sp = await searchParams;

  const slots = sortSlots(
    await prisma.conferenceSlot.findMany({ where: { schoolId: school!.id } })
  );
  const students = await prisma.student.findMany({ where: { schoolId: school!.id } });
  const nameOf = (id: string | null) => students.find((s) => s.id === id)?.name ?? "—";

  const td = today();
  const upcoming = slots.filter((s) => s.date >= td);
  const past = slots.filter((s) => s.date < td).reverse();
  const booked = upcoming.filter(isBooked).length;

  return (
    <>
      <div className="eyebrow">People</div>
      <h1>Conferences</h1>
      <p className="small muted" style={{ maxWidth: "72ch" }}>
        Publish an afternoon of slots and let families pick one. Bookings land on their calendar and
        in their subscribed feed, and you get a notification.
      </p>

      {sp.added && (
        <Notice tone="good">
          Published {sp.added} slot{sp.added === "1" ? "" : "s"}.
          {Number(sp.skipped) > 0 && ` Skipped ${sp.skipped} that clashed with slots already up.`}
        </Notice>
      )}
      {sp.saved && <Notice tone="good">Note saved.</Notice>}
      {sp.error === "when" && <Notice tone="bad">Pick a date and valid start and end times.</Notice>}
      {sp.error === "none" && (
        <Notice tone="bad">
          That window doesn&apos;t fit a single conference. Check the times and the length.
        </Notice>
      )}
      {sp.error === "clash" && <Notice tone="warn">Every one of those slots is already published.</Notice>}
      {sp.error === "booked" && (
        <Notice tone="bad">
          That slot is booked. Ask the family to cancel first — removing it here would drop their
          appointment without telling them.
        </Notice>
      )}

      {upcoming.length > 0 && (
        <div className="cmd-metrics" style={{ marginTop: 14 }}>
          <div className="cmd-metric">
            <div className="n">{upcoming.length}</div>
            <div className="l">Slots ahead</div>
          </div>
          <div className="cmd-metric">
            <div className="n">{booked}</div>
            <div className="l">Booked</div>
          </div>
          <div className={`cmd-metric ${upcoming.length - booked > 0 ? "accent" : ""}`}>
            <div className="n">{upcoming.length - booked}</div>
            <div className="l">Still open</div>
          </div>
        </div>
      )}

      <details className="card" open={slots.length === 0}>
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>Publish an afternoon</summary>
        <form action={publishConferenceSlots} style={{ marginTop: 10 }}>
          <div className="row" style={{ gap: 12 }}>
            <div style={{ flex: 1, minWidth: 150 }}>
              <label htmlFor="date">Date</label>
              <input id="date" name="date" type="date" required defaultValue={today()} />
            </div>
            <div style={{ flex: 1, minWidth: 110 }}>
              <label htmlFor="start">From</label>
              <input id="start" name="start" type="time" required defaultValue="15:00" />
            </div>
            <div style={{ flex: 1, minWidth: 110 }}>
              <label htmlFor="end">Until</label>
              <input id="end" name="end" type="time" required defaultValue="18:00" />
            </div>
            <div style={{ flex: 1, minWidth: 110 }}>
              <label htmlFor="duration">Each lasts</label>
              <input id="duration" name="duration" type="number" min={5} max={240} defaultValue={20} />
            </div>
            <div style={{ flex: 1, minWidth: 110 }}>
              <label htmlFor="gap">Gap between</label>
              <input id="gap" name="gap" type="number" min={0} max={120} defaultValue={0} />
            </div>
          </div>
          <div className="row" style={{ gap: 12, marginTop: 10, alignItems: "flex-end" }}>
            <div style={{ flex: 2, minWidth: 220 }}>
              <label htmlFor="location">Where (optional)</label>
              <input id="location" name="location" placeholder="At school, or a video link" />
            </div>
            <button className="btn mark">Publish slots</button>
          </div>
          <p className="small muted" style={{ margin: "10px 0 0" }}>
            A part-slot at the end is dropped rather than shortened, and anything clashing with what
            you&apos;ve already published is skipped.
          </p>
        </form>
      </details>

      <div className="eyebrow" style={{ marginTop: 18 }}>
        Coming up
      </div>
      {upcoming.length === 0 ? (
        <p className="small muted" style={{ marginTop: 8 }}>
          Nothing scheduled. Publish an afternoon above.
        </p>
      ) : (
        <div className="card" style={{ marginTop: 10, padding: "6px 18px" }}>
          {upcoming.map((s) => (
            <div key={s.id} style={{ padding: "12px 0", borderTop: "1px solid var(--rule)" }}>
              <div className="spread">
                <div>
                  <strong>
                    {fmt(s.date)} · {formatSpan(s)}
                  </strong>
                  <div className="small muted">
                    {isBooked(s)
                      ? `${nameOf(s.studentId)} — booked by ${s.bookedByName}`
                      : "Open"}
                    {s.location ? ` · ${s.location}` : ""}
                  </div>
                </div>
                <div className="row" style={{ gap: 8 }}>
                  {isBooked(s) ? <Pill tone="good">Booked</Pill> : <Pill tone="warn">Open</Pill>}
                  {!isBooked(s) && (
                    <form action={deleteConferenceSlot}>
                      <input type="hidden" name="id" value={s.id} />
                      <button className="btn ghost sm">Remove</button>
                    </form>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {past.length > 0 && (
        <>
          <div className="eyebrow" style={{ marginTop: 18 }}>
            Already happened
          </div>
          <p className="small muted" style={{ margin: "6px 0 0", maxWidth: "70ch" }}>
            A note here becomes part of the child&apos;s record — a documented conversation with the
            family is engagement evidence a reviewer reads differently from an attendance figure.
          </p>
          {past.filter(isBooked).map((s) => (
            <div key={s.id} className="card" style={{ marginTop: 12 }}>
              <div className="eyebrow">
                {fmt(s.date)} · {formatSpan(s)} · {nameOf(s.studentId)}
              </div>
              {s.note && (
                <div style={{ marginTop: 8 }}>
                  <Markdown text={s.note} format={s.noteFormat} />
                </div>
              )}
              <form action={saveConferenceNote} style={{ marginTop: 10 }}>
                <input type="hidden" name="id" value={s.id} />
                <MarkdownField
                  name="note"
                  id={`note-${s.id}`}
                  label={s.note ? "Edit the note" : "What did you discuss?"}
                  rows={3}
                  defaultValue={s.note}
                  placeholder="Talked through the reading gap; agreed on 15 minutes nightly and a check-in in three weeks."
                />
                <button className="btn sm" style={{ marginTop: 8 }}>
                  Save note
                </button>
              </form>
            </div>
          ))}
        </>
      )}
    </>
  );
}
