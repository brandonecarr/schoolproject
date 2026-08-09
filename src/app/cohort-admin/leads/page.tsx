// /admin/leads — every prospect, wherever they came from. The walkthrough
// button will write here once the booking flow exists; until then leads are
// entered by hand after a call or an email.

import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/lib/auth";
import { prismaSystem } from "@/lib/db";
import { Pill, Notice } from "@/components/ui";
import type { Tone } from "@/components/ui";
import { AdminNav } from "../nav";
import { addLead, setLeadStatus, removeLead } from "../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Leads — Cohort Admin" };

const STATUS_TONE: Record<string, Tone> = {
  new: "warn",
  contacted: "info",
  scheduled: "info",
  won: "good",
  lost: "bad",
};
const STATUSES = ["new", "contacted", "scheduled", "won", "lost"];

export default async function AdminLeads({
  searchParams,
}: {
  searchParams: Promise<{ added?: string; removed?: string; error?: string }>;
}) {
  await requirePlatformAdmin();
  const sp = await searchParams;

  // prismaSystem: platform table, no tenant to scope to — admin-only surface.
  const leads = await prismaSystem.lead.findMany({ orderBy: { createdAt: "desc" } });

  return (
    <>
      <AdminNav active="leads" />
      <div className="eyebrow">Pipeline</div>
      <h1>Leads</h1>

      {sp.added && <Notice tone="good">Lead added.</Notice>}
      {sp.removed && <Notice tone="good">Lead removed.</Notice>}
      {sp.error === "email" && <Notice tone="bad">That email doesn&apos;t look right.</Notice>}

      <div className="card" style={{ marginTop: 14 }}>
        <div className="eyebrow">Add a lead</div>
        <form action={addLead} style={{ marginTop: 8 }}>
          <div className="row" style={{ gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 180 }}>
              <label htmlFor="lead-name">Name</label>
              <input id="lead-name" name="name" placeholder="Jordan Alvarez" />
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label htmlFor="lead-email">Email</label>
              <input id="lead-email" name="email" type="email" required />
            </div>
            <div style={{ flex: 2, minWidth: 220 }}>
              <label htmlFor="lead-note">Note</label>
              <input id="lead-note" name="note" placeholder="Met at the homeschool conference…" />
            </div>
            <button className="btn mark">Add</button>
          </div>
        </form>
      </div>

      <div className="card" style={{ marginTop: 12, padding: "16px 10px" }}>
        <table>
          <thead>
            <tr>
              <th>Lead</th>
              <th>Source</th>
              <th>Status</th>
              <th>Added</th>
              <th>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {leads.length === 0 ? (
              <tr>
                <td colSpan={5} className="small muted">
                  No leads yet. They&apos;ll land here from the walkthrough button once booking is
                  wired up — or add one above after a call.
                </td>
              </tr>
            ) : (
              leads.map((l) => (
                <tr key={l.id}>
                  <td>
                    {l.name || <span className="muted">—</span>}
                    <div className="small mono">{l.email}</div>
                    {l.state ? <div className="small">{l.state}</div> : null}
                    {l.note ? <div className="small muted">{l.note}</div> : null}
                  </td>
                  <td className="small">{l.source}</td>
                  <td>
                    <Pill tone={STATUS_TONE[l.status] ?? "info"}>{l.status}</Pill>
                  </td>
                  <td className="small muted">{l.createdAt.toISOString().slice(0, 10)}</td>
                  <td style={{ textAlign: "right" }}>
                    <div className="row" style={{ gap: 6, justifyContent: "flex-end", flexWrap: "wrap" }}>
                      <form action={setLeadStatus} className="row" style={{ gap: 6 }}>
                        <input type="hidden" name="id" value={l.id} />
                        <select name="status" defaultValue={l.status}>
                          {STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                        <button className="btn sec sm">Set</button>
                      </form>
                      <form action={removeLead}>
                        <input type="hidden" name="id" value={l.id} />
                        <button className="btn ghost sm">Remove</button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
