// /cohort-admin/settings — what this deployment is made of: which required
// environment pieces are present (never their values), the booking constants
// /book runs on, and the one danger surface, spoken about honestly.
//
// The booking defaults are constants in src/lib/availability.ts on purpose —
// so they render here as read-only facts, not as controls that do nothing.

import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/lib/auth";
import { emailConfigured } from "@/lib/email";
import { deploymentEnv } from "@/lib/environment";
import { BOOKING_HORIZON_DAYS, MIN_NOTICE_MS } from "@/lib/availability";
import { AdmPill } from "../ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Settings — Cohort Admin" };

export default async function AdminSettings() {
  await requirePlatformAdmin();

  const envRows = [
    { name: "Transactional email", key: "RESEND_API_KEY", ok: Boolean(process.env.RESEND_API_KEY) },
    { name: "Sender address", key: "EMAIL_FROM", ok: Boolean(process.env.EMAIL_FROM) },
    {
      name: "Inbound forwarder",
      key: "RESEND_WEBHOOK_SECRET",
      ok: Boolean(process.env.RESEND_WEBHOOK_SECRET),
    },
    {
      name: "Forward destination",
      key: "EMAIL_FORWARD_TO",
      ok: Boolean(process.env.EMAIL_FORWARD_TO),
    },
    { name: "Model access", key: "ANTHROPIC_API_KEY", ok: Boolean(process.env.ANTHROPIC_API_KEY) },
    { name: "Database", key: "DATABASE_URL", ok: Boolean(process.env.DATABASE_URL) },
  ];

  const noticeHours = Math.round(MIN_NOTICE_MS / 3_600_000);

  return (
    <div className="adm-screen">
      <div className="adm-eyebrow">Console</div>
      <h1>Settings</h1>
      <p className="adm-intro">
        This deployment is <strong>{deploymentEnv()}</strong>
        {emailConfigured() ? ", and email is live." : ", and email is not configured."} Values
        are never shown here — only whether each piece is present.
      </p>

      <div className="adm-grid2">
        <div className="adm-card">
          <div className="adm-cardtitle">Environment</div>
          <div style={{ marginTop: 6 }}>
            {envRows.map((r) => (
              <div key={r.key} className="adm-envrow">
                <span>
                  <span className="adm-envname">{r.name}</span>
                  <span className="adm-envkey" style={{ display: "block" }}>
                    {r.key}
                  </span>
                </span>
                <AdmPill tone={r.ok ? "good" : "warn"}>{r.ok ? "Configured" : "Missing"}</AdmPill>
              </div>
            ))}
          </div>
        </div>

        <div className="adm-card">
          <div className="adm-cardtitle">Booking defaults</div>
          <p className="adm-cardsub">
            Constants in the availability engine — deliberate, not configurable from here.
          </p>
          <div style={{ marginTop: 6 }}>
            <div className="adm-envrow">
              <span className="adm-envname">Default slot length</span>
              <span className="adm-cellnum adm-cellnum-strong">20 min</span>
            </div>
            <div className="adm-envrow">
              <span className="adm-envname">Minimum notice</span>
              <span className="adm-cellnum adm-cellnum-strong">{noticeHours} hours</span>
            </div>
            <div className="adm-envrow">
              <span className="adm-envname">Booking horizon</span>
              <span className="adm-cellnum adm-cellnum-strong">{BOOKING_HORIZON_DAYS} days</span>
            </div>
          </div>
        </div>
      </div>

      <div className="adm-card adm-dangercard" style={{ marginTop: 12 }}>
        <div className="adm-dangertitle">Retention</div>
        <p className="adm-cardsub" style={{ marginTop: 6, maxWidth: 620, lineHeight: 1.6 }}>
          Purging a school removes its students, work and invoices for good. The platform keeps
          the school row and its totals so the numbers on this console stay honest. There is no
          button for it — a purge runs from the repo, with database access, on purpose:
        </p>
        <div className="adm-noteblock mono" style={{ marginTop: 10, fontSize: 12.5 }}>
          npx tsx scripts/purge-school.ts &lt;school-slug&gt;
        </div>
      </div>
    </div>
  );
}
