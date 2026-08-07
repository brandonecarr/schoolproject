// Booking a conference.
//
// Deliberately plain: a list of times with a button. The only real complexity
// is whose child a slot is for, and that only appears when a family has more
// than one at the school.

import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fmt, today } from "@/lib/dates";
import { formatSpan, sortSlots, isBooked } from "@/lib/conferences";
import { threadStudentIds } from "@/lib/messages";
import { Pill, Notice } from "@/components/ui";
import { Markdown } from "@/components/Markdown";
import { bookConference, cancelConference } from "../../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Conferences — Cohort" };

export default async function ParentConferencesPage({
  searchParams,
}: {
  searchParams: Promise<{ booked?: string; cancelled?: string; error?: string }>;
}) {
  const { user } = await requireRole("parent");
  const sp = await searchParams;

  const myStudentIds = await threadStudentIds(user);
  const [slotsRaw, kids] = await Promise.all([
    prisma.conferenceSlot.findMany({ where: { schoolId: user.schoolId, date: { gte: today() } } }),
    prisma.student.findMany({ where: { id: { in: myStudentIds } } }),
  ]);
  const slots = sortSlots(slotsRaw);

  const mine = slots.filter((s) => s.bookedByUserId === user.id);
  // Someone else's booking is shown as unavailable, never as whose — a parent
  // has no business learning which other families are meeting the teacher.
  const open = slots.filter((s) => !isBooked(s));
  const bookedStudentIds = new Set(mine.map((s) => s.studentId));

  return (
    <>
      <div className="eyebrow">Parent-teacher</div>
      <h1>Conferences</h1>

      {sp.booked && <Notice tone="good">Booked. It&apos;s on your calendar now.</Notice>}
      {sp.cancelled && <Notice tone="good">Cancelled. The slot is open for someone else.</Notice>}
      {sp.error === "taken" && (
        <Notice tone="warn">Someone claimed that one first. Here&apos;s what&apos;s still free.</Notice>
      )}
      {sp.error === "already" && (
        <Notice tone="warn">
          You already have a conference booked for that child. Cancel it first if you need a
          different time.
        </Notice>
      )}
      {sp.error === "notyours" && <Notice tone="bad">That isn&apos;t one of your children.</Notice>}

      {mine.length > 0 && (
        <>
          <div className="eyebrow" style={{ marginTop: 14 }}>
            Your conference{mine.length === 1 ? "" : "s"}
          </div>
          {mine.map((s) => (
            <div key={s.id} className="card" style={{ marginTop: 10 }}>
              <div className="spread">
                <div>
                  <h2 style={{ margin: 0 }}>
                    {fmt(s.date)} · {formatSpan(s)}
                  </h2>
                  <div className="small muted">
                    About {kids.find((k) => k.id === s.studentId)?.name ?? "your child"}
                    {s.location ? ` · ${s.location}` : ""}
                  </div>
                </div>
                <form action={cancelConference}>
                  <input type="hidden" name="slotId" value={s.id} />
                  <button className="btn ghost sm">Cancel</button>
                </form>
              </div>
              {s.note && (
                <div style={{ marginTop: 10 }}>
                  <div className="eyebrow">Notes from your teacher</div>
                  <Markdown text={s.note} format={s.noteFormat} />
                </div>
              )}
            </div>
          ))}
        </>
      )}

      <div className="eyebrow" style={{ marginTop: 18 }}>
        Available times
      </div>
      {open.length === 0 ? (
        <p className="small muted" style={{ marginTop: 8 }}>
          {slots.length === 0
            ? "No conference times have been offered yet. Your teacher will post some."
            : "Every time has been taken. Ask your teacher if more can be added."}
        </p>
      ) : (
        <div className="card" style={{ marginTop: 10, padding: "6px 18px" }}>
          {open.map((s) => (
            <div key={s.id} style={{ padding: "12px 0", borderTop: "1px solid var(--rule)" }}>
              <div className="spread">
                <div>
                  <strong>
                    {fmt(s.date)} · {formatSpan(s)}
                  </strong>
                  {s.location && <div className="small muted">{s.location}</div>}
                </div>
                <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                  {kids.map((k) =>
                    bookedStudentIds.has(k.id) ? (
                      <Pill key={k.id} tone="good">
                        {k.name} booked
                      </Pill>
                    ) : (
                      <form key={k.id} action={bookConference}>
                        <input type="hidden" name="slotId" value={s.id} />
                        <input type="hidden" name="studentId" value={k.id} />
                        <button className="btn sec sm">
                          {kids.length === 1 ? "Book this time" : `Book for ${k.name.split(" ")[0]}`}
                        </button>
                      </form>
                    )
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="small muted" style={{ marginTop: 14, maxWidth: "64ch" }}>
        One conference per child. Times other families have taken aren&apos;t shown.
      </p>
    </>
  );
}
