// /cohort-admin/email — blasts to leads and customers, through the same
// email layer everything else uses. A blast is a deliberate act: audience
// counts are shown before sending, an explicit checkbox arms the button,
// and every send is logged verbatim.

import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/lib/auth";
import { prismaSystem } from "@/lib/db";
import { emailConfigured } from "@/lib/email";
import { AdmNotice } from "../ui";
import { sendBlast } from "../actions";
import { BlastsView, type BlastRow } from "./BlastsView";

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
    <div className="adm-screen">
      <div className="adm-eyebrow">Outreach</div>
      <h1>Email blasts</h1>

      {sp.sent && (
        <AdmNotice tone="good">
          Sent to {sp.sent} recipient{sp.sent === "1" ? "" : "s"}.
        </AdmNotice>
      )}
      {sp.error === "incomplete" && (
        <AdmNotice tone="bad">Audience, subject, body and the confirm box are all required.</AdmNotice>
      )}
      {!emailConfigured() && (
        <AdmNotice tone="warn">
          Email isn&apos;t configured in this environment — a blast here would send nothing.
          RESEND_API_KEY and EMAIL_FROM make it real.
        </AdmNotice>
      )}

      <div className="adm-grid2" style={{ gridTemplateColumns: "1.1fr 1fr" }}>
        <div className="adm-card">
          <div className="adm-cardtitle">Compose</div>
          <form action={sendBlast} style={{ marginTop: 4 }}>
            <div className="adm-field">
              <label htmlFor="blast-audience">Audience</label>
              <select id="blast-audience" name="audience" required>
                <option value="open_leads">
                  Open leads — new, contacted or scheduled ({openLeads})
                </option>
                <option value="all_leads">All leads, including won and lost ({allLeads})</option>
                <option value="owners">School owners — every customer ({owners})</option>
              </select>
            </div>

            <div className="adm-field">
              <label htmlFor="blast-subject">Subject</label>
              <input id="blast-subject" name="subject" required maxLength={160} />
            </div>

            <div className="adm-field">
              <label htmlFor="blast-body">Body (plain text)</label>
              <textarea
                id="blast-body"
                name="body"
                rows={8}
                required
                maxLength={10000}
                style={{ lineHeight: 1.6, resize: "vertical" }}
              />
              <p className="adm-cardsub" style={{ marginTop: 7 }}>
                A footer is added automatically: who this is from, why they got it, and how to
                opt out. Replies land in your inbox via the forwarder.
              </p>
            </div>

            <label className="adm-checkline">
              <input type="checkbox" name="confirm" required /> Yes — send this to real people
              now.
            </label>
            <button className="adm-btn adm-btn-accent" style={{ marginTop: 14, padding: "11px 20px" }}>
              Send blast
            </button>
          </form>
        </div>

        <BlastsView
          blasts={blasts.map(
            (b): BlastRow => ({
              id: b.id,
              subject: b.subject,
              body: b.body,
              audience: b.audience,
              sentCount: b.sentCount,
              createdIso: b.createdAt.toISOString(),
            }),
          )}
        />
      </div>
    </div>
  );
}
