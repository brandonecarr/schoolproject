// /cohort-admin/email — blasts to leads and customers, through the same
// email layer everything else uses. A blast is a deliberate act: audience
// counts are shown before sending, an explicit checkbox arms the button,
// and every send is logged verbatim.

import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/lib/auth";
import { prismaSystem } from "@/lib/db";
import { emailConfigured } from "@/lib/email";
import { Notice, Pill } from "@/components/ui";
import { AdminNav } from "../nav";
import { sendBlast } from "../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Email — Cohort Admin" };

export default async function AdminEmail({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  await requirePlatformAdmin();
  const sp = await searchParams;

  // prismaSystem: platform-wide counts for the audience picker.
  const [openLeads, allLeads, owners, blasts] = await Promise.all([
    prismaSystem.lead.count({ where: { status: { in: ["new", "contacted", "scheduled"] } } }),
    prismaSystem.lead.count(),
    prismaSystem.user.count({ where: { role: "owner" } }),
    prismaSystem.emailBlast.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
  ]);

  return (
    <>
      <AdminNav active="email" />
      <div className="eyebrow">Outreach</div>
      <h1>Email blasts</h1>

      {sp.sent && <Notice tone="good">Sent to {sp.sent} recipient{sp.sent === "1" ? "" : "s"}.</Notice>}
      {sp.error === "incomplete" && (
        <Notice tone="bad">Audience, subject, body and the confirm box are all required.</Notice>
      )}
      {!emailConfigured() && (
        <Notice tone="warn">
          Email isn&apos;t configured in this environment — a blast here would send nothing.
          RESEND_API_KEY and EMAIL_FROM make it real.
        </Notice>
      )}

      <div className="card" style={{ marginTop: 14 }}>
        <div className="eyebrow">Compose</div>
        <form action={sendBlast} style={{ marginTop: 8 }}>
          <label htmlFor="blast-audience">Audience</label>
          <select id="blast-audience" name="audience" required>
            <option value="open_leads">Open leads — new, contacted or scheduled ({openLeads})</option>
            <option value="all_leads">All leads, including won and lost ({allLeads})</option>
            <option value="owners">School owners — every customer ({owners})</option>
          </select>

          <label htmlFor="blast-subject" style={{ marginTop: 12 }}>
            Subject
          </label>
          <input id="blast-subject" name="subject" required maxLength={160} />

          <label htmlFor="blast-body" style={{ marginTop: 12 }}>
            Body (plain text)
          </label>
          <textarea id="blast-body" name="body" rows={10} required maxLength={10000} />
          <p className="small muted" style={{ margin: "6px 0 0" }}>
            A footer is added automatically: who this is from, why they got it, and how to opt
            out. Replies land in your inbox via the forwarder.
          </p>

          <label className="row small" style={{ gap: 8, alignItems: "center", marginTop: 14 }}>
            <input type="checkbox" name="confirm" required /> Yes — send this to real people now.
          </label>
          <button className="btn mark" style={{ marginTop: 12 }}>
            Send blast
          </button>
        </form>
      </div>

      <div className="card" style={{ marginTop: 12, padding: "16px 10px" }}>
        <table>
          <thead>
            <tr>
              <th>Sent</th>
              <th>Audience</th>
              <th>Subject</th>
              <th>Recipients</th>
            </tr>
          </thead>
          <tbody>
            {blasts.length === 0 ? (
              <tr>
                <td colSpan={4} className="small muted">
                  No blasts yet. The history lands here, body kept verbatim.
                </td>
              </tr>
            ) : (
              blasts.map((b) => (
                <tr key={b.id}>
                  <td className="small muted">{b.createdAt.toISOString().slice(0, 10)}</td>
                  <td>
                    <Pill tone="info">{b.audience}</Pill>
                  </td>
                  <td>{b.subject}</td>
                  <td className="num">{b.sentCount}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
