// /cohort-admin/walkthroughs — the operator's booking calendar, stated once:
// weekly availability windows ("Mon–Fri 9:00–11:00, 20-minute slots") that
// /book expands into concrete times forever. Rows in WalkthroughSlot exist
// only when a real person books.

import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/lib/auth";
import { prismaSystem } from "@/lib/db";
import { expandRules } from "@/lib/availability";
import { LocalTime } from "@/components/LocalTime";
import { AdmNotice } from "../ui";
import { addAvailability, deleteAvailability } from "../actions";
import { TimezoneField } from "./TimezoneField";
import { BookingsView, type BookingRow } from "./BookingsView";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Walkthroughs — Cohort Admin" };

const DAY_SHORT = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

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

  const bookingRows: BookingRow[] = bookings.map((s) => {
    const lead = s.leadId ? leadById.get(s.leadId) : null;
    return {
      id: s.id,
      startsAtIso: s.startsAt.toISOString(),
      durationMin: s.durationMin,
      leadId: lead?.id ?? null,
      leadName: lead?.name ?? "",
      leadEmail: lead?.email ?? "",
      leadState: lead?.state ?? "",
      leadStatus: lead?.status ?? "",
    };
  });

  // The visitor's-eye preview: exactly what /book computes, so "did my rules
  // do what I meant?" is answered here, not by opening an incognito window.
  const preview = expandRules(
    rules,
    new Date(),
    new Set(bookings.map((b) => b.startsAt.getTime())),
  ).slice(0, 8);

  return (
    <div className="adm-screen">
      <div className="adm-eyebrow">Booking</div>
      <h1>Walkthrough calendar</h1>
      <p className="adm-intro">
        Set it once — <span className="mono">/book</span> generates the open times from these
        windows for the next two weeks, rolling forward automatically and hiding anything
        already booked.
      </p>

      {sp.added && (
        <AdmNotice tone="good">Availability saved — /book offers those times from now on.</AdmNotice>
      )}
      {sp.removed && (
        <AdmNotice tone="good">Availability removed. Existing bookings keep their times.</AdmNotice>
      )}
      {sp.error === "window" && (
        <AdmNotice tone="bad">
          Pick at least one day, and an end time late enough to fit one slot after the start.
        </AdmNotice>
      )}

      <div className="adm-grid2">
        <div className="adm-card">
          <div className="adm-cardtitle">Weekly availability</div>

          <div style={{ marginTop: 6 }}>
            {rules.map((r) => (
              <div key={r.id} className="adm-rulerow">
                <span className="adm-daychip">{DAY_SHORT[r.weekday] ?? "—"}</span>
                <span className="adm-rulewhen">
                  <span className="adm-rulewindow">
                    {hm(r.startMin)} – {hm(r.endMin)}
                  </span>
                  <span className="adm-ruledetail" style={{ display: "block" }}>
                    {r.slotMinutes} min · {r.timezone}
                  </span>
                </span>
                <form action={deleteAvailability}>
                  <input type="hidden" name="id" value={r.id} />
                  <button className="adm-btn adm-btn-ghost adm-btn-sm adm-remove">Remove</button>
                </form>
              </div>
            ))}
          </div>

          <form action={addAvailability} className={rules.length > 0 ? "adm-ruleform" : ""}>
            <label>Days</label>
            <div className="adm-daypick">
              {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                <label key={d} className="adm-daycell">
                  <input type="checkbox" name="weekday" value={d} />
                  <span>{DAY_SHORT[d]}</span>
                </label>
              ))}
            </div>

            <div className="adm-fieldrow">
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
            <button className="adm-btn" style={{ marginTop: 14 }}>
              Add availability
            </button>
          </form>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {rules.length > 0 && (
            <div className="adm-accentcard">
              <div className="adm-eyebrow2">What visitors see next</div>
              {preview.length === 0 ? (
                <p className="adm-accentnote">
                  Nothing bookable in the next two weeks — every generated time is either booked
                  or inside the 4-hour notice window.
                </p>
              ) : (
                <>
                  <div className="adm-slotchips">
                    {preview.map((s) => (
                      <span key={s.startsAt.toISOString()} className="adm-slotchip">
                        <LocalTime iso={s.startsAt.toISOString()} />
                      </span>
                    ))}
                  </div>
                  <p className="adm-accentnote">Shown here in your time.</p>
                </>
              )}
            </div>
          )}

          <BookingsView bookings={bookingRows} />
        </div>
      </div>
    </div>
  );
}
