import Link from "next/link";
import { requireTeacher } from "@/lib/auth";
import { Notice } from "@/components/ui";
import { updateRetention } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings — Cohort" };

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const { school } = await requireTeacher();
  const sp = await searchParams;

  return (
    <>
      {sp.saved && <Notice tone="good">Settings saved.</Notice>}
      <div className="topbar">
        <div>
          <div className="eyebrow">School</div>
          <h1>Settings</h1>
        </div>
      </div>

      <div className="card">
        <div className="eyebrow">Data retention</div>
        <p className="small muted" style={{ margin: "6px 0 12px", maxWidth: "64ch" }}>
          COPPA prohibits keeping children&apos;s data indefinitely. Attendance, observations,
          submissions, and work samples older than this window are permanently deleted by a nightly
          job. Financial records (invoices, payments) are kept for reimbursement audit and are not
          affected.
        </p>
        <form action={updateRetention} className="row" style={{ alignItems: "flex-end", gap: 12 }}>
          <div style={{ width: 200 }}>
            <label htmlFor="retentionDays">Retention window (days)</label>
            <input
              id="retentionDays"
              name="retentionDays"
              type="number"
              min={1}
              max={3650}
              defaultValue={school!.retentionDays}
              required
            />
          </div>
          <button className="btn">Save</button>
        </form>
        <p className="small muted" style={{ margin: "10px 0 0" }}>
          Currently retaining child records for <strong>{school!.retentionDays}</strong> days
          (~{Math.round((school!.retentionDays / 365) * 10) / 10} years).
        </p>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="eyebrow">Privacy &amp; security program</div>
        <p className="small muted" style={{ margin: "6px 0 10px", maxWidth: "64ch" }}>
          Draft policy documents live in the repo under <span className="mono">docs/</span> (WISP,
          retention schedule, privacy policy, DPA). They are starting templates and must be reviewed
          by an edtech-privacy attorney before you rely on them.
        </p>
        <Link className="btn sec sm" href="/audit">
          View audit log
        </Link>
      </div>
    </>
  );
}
