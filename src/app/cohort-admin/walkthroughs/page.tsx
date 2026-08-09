// /cohort-admin/walkthroughs — the operator's booking calendar, stated once:
// weekly availability windows ("Mon–Fri 9:00–11:00, 20-minute slots") that
// /book expands into concrete times forever. No per-day slot entry. Rows in
// WalkthroughSlot exist only when a real person books.

import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/lib/auth";
import { prismaSystem } from "@/lib/db";
import { expandRules } from "@/lib/availability";
import { Pill, Notice } from "@/components/ui";
import { LocalTime } from "@/components/LocalTime";
import { AdminNav } from "../nav";
import { addAvailability, deleteAvailability } from "../actions";
import { TimezoneField } from "./TimezoneField";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Walkthroughs — Cohort Admin" };

const DAY_NAMES = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const DAY_OPTIONS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 7, label: "Sun" },
];

function hm(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

export default async function AdminWalkthroughs({
  searchParams,
}: {
  searchParams: Promise<{ added?: string; removed?: string; error?: string }>;
}) {
  await requirePlatformAdmin();
  const sp = await searchParams;

  // prismaSystem: platform tables — the operator's calendar and pipeline.
  const [rules, bookings] = await Promise.all([
    prismaSystem.availabilityRule.findMany({
      orderBy: [{ weekday: "asc" }, { startMin: "asc" }],
    }),
    prismaSystem.walkthroughSlot.findMany({
      where: { startsAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } },
      orderBy: { startsAt: "asc" },
    }),
  ]);
  const leadIds = bookings.map((s) => s.leadId).filter((x): x is string => Boolean(x));
  const leads = leadIds.length
    ? await prismaSystem.lead.findMany({ where: { id: { in: leadIds } } })
    : [];
  const leadById = new Map(leads.map((l) => [l.id, l]));

  // The visitor's-eye preview: exactly what /book computes, so "did my rules
  // do what I meant?" is answered here, not by opening an incognito window.
  const preview = expandRules(
    rules,
    new Date(),
    new Set(bookings.map((b) => b.startsAt.getTime())),
  ).slice(0, 8);

  return (
    <>
      <AdminNav active="walkthroughs" />
      <div className="eyebrow">Booking</div>
      <h1>Walkthrough calendar</h1>

      {sp.added && (
        <Notice tone="good">Availability saved — /book offers those times from now on.</Notice>
      )}
      {sp.removed && <Notice tone="good">Availability removed. Existing bookings keep their times.</Notice>}
      {sp.error === "window" && (
        <Notice tone="bad">
          Pick at least one day, and an end time late enough to fit one slot after the start.
        </Notice>
      )}

      <div className="card" style={{ marginTop: 14 }}>
        <div className="eyebrow">Weekly availability</div>
        <p className="small muted" style={{ margin: "6px 0 10px" }}>
          Set it once — <span className="mono">/book</span> generates the open times from these
          windows for the next two weeks, rolling forward automatically and hiding anything
          already booked.
        </p>

        {rules.length > 0 && (
          <table style={{ marginBottom: 14 }}>
            <thead>
              <tr>
                <th>Day</th>
                <th>Window</th>
                <th>Slot length</th>
                <th>Timezone</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id}>
                  <td>{DAY_NAMES[r.weekday] ?? "—"}</td>
                  <td className="small">
                    {hm(r.startMin)} – {hm(r.endMin)}
                  </td>
                  <td className="small">{r.slotMinutes} min</td>
                  <td className="small mono">{r.timezone}</td>
                  <td style={{ textAlign: "right" }}>
                    <form action={deleteAvailability}>
                      <input type="hidden" name="id" value={r.id} />
                      <button className="btn ghost sm">Remove</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <form action={addAvailability}>
          <label>Days</label>
          <div className="daypick">
            {DAY_OPTIONS.map((d) => (
              <label key={d.value} className="daypick-day">
                <input type="checkbox" name="weekday" value={d.value} />
                <span>{d.label}</span>
              </label>
            ))}
          </div>

          <div className="formrow" style={{ marginTop: 12 }}>
            <div>
              <label htmlFor="avail-start">From</label>
              <input id="avail-start" name="start" type="time" defaultValue="09:00" required />
            </div>
            <div>
              <label htmlFor="avail-end">To</label>
              <input id="avail-end" name="end" type="time" defaultValue="11:00" required />
            </div>
            <div>
              <label htmlFor="avail-len">Slot length</label>
              <select id="avail-len" name="slotMinutes" defaultValue="20">
                <option value="15">15 min</option>
                <option value="20">20 min</option>
                <option value="30">30 min</option>
                <option value="45">45 min</option>
                <option value="60">60 min</option>
              </select>
            </div>
          </div>

          <TimezoneField />
          <button className="btn" style={{ marginTop: 12 }}>
            Add availability
          </button>
        </form>
      </div>

      {rules.length > 0 && (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="eyebrow">What visitors see next</div>
          {preview.length === 0 ? (
            <p className="small muted" style={{ margin: "6px 0 0" }}>
              Nothing bookable in the next two weeks — every generated time is either booked or
              inside the 4-hour notice window.
            </p>
          ) : (
            <p className="small" style={{ margin: "6px 0 0" }}>
              {preview.map((s, i) => (
                <span key={s.startsAt.toISOString()}>
                  {i > 0 && " · "}
                  <LocalTime iso={s.startsAt.toISOString()} />
                </span>
              ))}
              {" — shown here in your time."}
            </p>
          )}
        </div>
      )}

      <div className="card" style={{ marginTop: 12, padding: "16px 10px" }}>
        <div className="eyebrow" style={{ padding: "0 6px" }}>
          Upcoming bookings
        </div>
        <table>
          <thead>
            <tr>
              <th>When (your time)</th>
              <th>Length</th>
              <th>Who</th>
            </tr>
          </thead>
          <tbody>
            {bookings.length === 0 ? (
              <tr>
                <td colSpan={3} className="small muted">
                  No bookings yet. Once availability is set above, the walkthrough button does the
                  rest.
                </td>
              </tr>
            ) : (
              bookings.map((s) => {
                const lead = s.leadId ? leadById.get(s.leadId) : null;
                return (
                  <tr key={s.id}>
                    <td>
                      <LocalTime iso={s.startsAt.toISOString()} />
                    </td>
                    <td className="small">{s.durationMin} min</td>
                    <td>
                      {lead ? (
                        <>
                          <Pill tone="good">Booked</Pill>
                          <div className="small" style={{ marginTop: 4 }}>
                            {lead.name || "—"} <span className="mono">{lead.email}</span>
                          </div>
                        </>
                      ) : (
                        <Pill tone="info">Held</Pill>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
