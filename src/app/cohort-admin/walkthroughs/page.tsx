// /cohort-admin/walkthroughs — the operator's side of the booking calendar:
// publish slots, see who booked, clear what didn't get taken.

import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/lib/auth";
import { prismaSystem } from "@/lib/db";
import { Pill, Notice } from "@/components/ui";
import { LocalTime } from "@/components/LocalTime";
import { AdminNav } from "../nav";
import { deleteSlot } from "../actions";
import { AddSlots } from "./AddSlots";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Walkthroughs — Cohort Admin" };

export default async function AdminWalkthroughs({
  searchParams,
}: {
  searchParams: Promise<{ added?: string; removed?: string }>;
}) {
  await requirePlatformAdmin();
  const sp = await searchParams;

  // prismaSystem: platform tables — the operator's calendar and pipeline.
  const slots = await prismaSystem.walkthroughSlot.findMany({
    where: { startsAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } },
    orderBy: { startsAt: "asc" },
  });
  const leadIds = slots.map((s) => s.leadId).filter((x): x is string => Boolean(x));
  const leads = leadIds.length
    ? await prismaSystem.lead.findMany({ where: { id: { in: leadIds } } })
    : [];
  const leadById = new Map(leads.map((l) => [l.id, l]));

  return (
    <>
      <AdminNav active="walkthroughs" />
      <div className="eyebrow">Booking</div>
      <h1>Walkthrough calendar</h1>

      {sp.added && <Notice tone="good">Slots published — they&apos;re live on /book now.</Notice>}
      {sp.removed && <Notice tone="good">Slot removed.</Notice>}

      <div className="card" style={{ marginTop: 14 }}>
        <div className="eyebrow">Publish slots</div>
        <p className="small muted" style={{ margin: "6px 0 10px" }}>
          Each one becomes bookable on <span className="mono">/book</span> the moment it&apos;s
          added, and disappears there the moment someone takes it.
        </p>
        <AddSlots />
      </div>

      <div className="card" style={{ marginTop: 12, padding: "16px 10px" }}>
        <table>
          <thead>
            <tr>
              <th>When (your time)</th>
              <th>Length</th>
              <th>Status</th>
              <th>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {slots.length === 0 ? (
              <tr>
                <td colSpan={4} className="small muted">
                  No upcoming slots. Publish some above and the walkthrough button starts
                  converting.
                </td>
              </tr>
            ) : (
              slots.map((s) => {
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
                        <Pill tone="info">Open</Pill>
                      )}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {!lead && (
                        <form action={deleteSlot}>
                          <input type="hidden" name="id" value={s.id} />
                          <button className="btn ghost sm">Remove</button>
                        </form>
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
