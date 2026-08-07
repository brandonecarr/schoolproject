import Link from "next/link";
import { requireTeacher } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Notice } from "@/components/ui";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { accentOf, readableOn, accentIsLegible, logoDataUri, DEFAULT_ACCENT } from "@/lib/branding";
import { ADMINISTRATORS, administratorFor, providerStatus, providerSummary } from "@/lib/provider";
import { railForState } from "@/lib/rules";
import { today } from "@/lib/dates";
import { updateRetention, uploadLogo, removeLogo, updateAccent, updateProviderIdentity } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings — Cohort" };

const PROVIDER_MSG: Record<string, { tone: "good" | "bad"; text: string }> = {
  saved: { tone: "good", text: "Provider ID saved. It now appears on every reimbursement packet you print." },
  cleared: { tone: "good", text: "Provider ID removed. Packets no longer carry one." },
  bad: { tone: "bad", text: "That doesn't look like a provider ID — check you copied the number, not a link." },
  rail: { tone: "bad", text: "Choose which administrator issued the ID." },
};

const LOGO_MSG: Record<string, { tone: "good" | "bad"; text: string }> = {
  ok: { tone: "good", text: "Logo updated. It now heads every packet you print." },
  removed: { tone: "good", text: "Logo removed. Packets show your school name only." },
  empty: { tone: "bad", text: "Choose an image first." },
  type: { tone: "bad", text: "Logos must be PNG, JPG, or WebP." },
  big: { tone: "bad", text: "That image is over 1 MB. A logo embeds into every packet, so keep it small." },
  colour: { tone: "bad", text: "That isn't a hex colour. Use something like #1F3A6E." },
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; logo?: string; provider?: string }>;
}) {
  const { school } = await requireTeacher();
  const sp = await searchParams;

  const logoRec = school!.logoFileId
    ? await prisma.fileRec.findFirst({
        where: { id: school!.logoFileId, schoolId: school!.id },
        select: { mime: true, data: true, bytes: true },
      })
    : null;
  const logoSrc = logoRec ? logoDataUri(logoRec) : null;
  const accent = accentOf(school);
  const legible = accentIsLegible(accent);
  const logoMsg = sp.logo ? LOGO_MSG[sp.logo] : null;
  const providerMsg = sp.provider ? PROVIDER_MSG[sp.provider] : null;

  // Who last stood behind the provider ID. Looked up rather than denormalised
  // onto School — a name that changes should change everywhere at once.
  const attestedBy = school!.providerAttestedById
    ? await prisma.user.findFirst({
        where: { id: school!.providerAttestedById, schoolId: school!.id },
        select: { name: true },
      })
    : null;
  const identity = {
    providerId: school!.providerId,
    providerRail: school!.providerRail,
    providerAttestedAt: school!.providerAttestedAt,
  };
  const pStatus = providerStatus(identity, today());
  // Default the administrator to whatever this school's state implies, so the
  // common case is one field and a tick rather than a dropdown decision.
  const impliedRail = railForState(school!.state)?.id ?? "";
  const chosenRail = school!.providerRail || impliedRail;
  const admin = administratorFor(chosenRail);

  return (
    <>
      {sp.saved && <Notice tone="good">Settings saved.</Notice>}
      {logoMsg && <Notice tone={logoMsg.tone}>{logoMsg.text}</Notice>}
      {providerMsg && <Notice tone={providerMsg.tone}>{providerMsg.text}</Notice>}
      <div className="topbar">
        <div>
          <div className="eyebrow">School</div>
          <h1>Settings</h1>
        </div>
      </div>

      <div className="card">
        <div className="eyebrow">School identity on printed documents</div>
        <p className="small muted" style={{ margin: "6px 0 14px", maxWidth: "64ch" }}>
          A reimbursement packet is read by a state reviewer who has never heard of us. It should
          arrive on <em>your</em> letterhead — the school is the one attesting to the record, not the
          software. Your name and logo lead every packet, invoice, worksheet, and student record;
          Cohort appears in the footer as the system the school kept them in.
        </p>

        {/* Live letterhead preview: the point of this whole card is a document
            the teacher never sees until they print it, so show it here. */}
        <div
          style={{
            border: "1px solid var(--rule)",
            borderRadius: 8,
            padding: "16px 18px",
            background: "#fff",
            borderTop: `4px solid ${accent}`,
          }}
        >
          <div className="row" style={{ gap: 14, alignItems: "center" }}>
            {logoSrc && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoSrc}
                alt=""
                style={{ height: 44, width: "auto", maxWidth: 160, objectFit: "contain" }}
              />
            )}
            <div>
              <div style={{ fontFamily: "ui-serif, Georgia, serif", fontSize: 19, color: "#141C26" }}>
                {school!.name}
              </div>
              <div className="small muted">{school!.address || "No address set"}</div>
            </div>
          </div>
        </div>

        <div className="grid g2" style={{ marginTop: 16, gap: 18 }}>
          <div>
            <div className="eyebrow">Logo</div>
            <form action={uploadLogo} style={{ marginTop: 8 }}>
              <input type="file" name="file" accept="image/png,image/jpeg,image/webp" required />
              <button className="btn sm" style={{ marginTop: 8 }}>
                {logoSrc ? "Replace logo" : "Upload logo"}
              </button>
            </form>
            {logoSrc && (
              <form action={removeLogo} style={{ marginTop: 8 }}>
                <ConfirmSubmit
                  className="btn ghost sm"
                  message="Remove the school logo? Packets will show your school name only."
                >
                  Remove logo
                </ConfirmSubmit>
              </form>
            )}
            <p className="small muted" style={{ margin: "8px 0 0" }}>
              PNG, JPG, or WebP, under 1 MB. It is embedded into each document, so a saved PDF still
              shows it.
            </p>
          </div>

          <div>
            <div className="eyebrow">Accent colour</div>
            <form action={updateAccent} className="row" style={{ alignItems: "flex-end", gap: 10, marginTop: 8 }}>
              <div style={{ width: 150 }}>
                <label htmlFor="accentColor">Hex</label>
                <input
                  id="accentColor"
                  name="accentColor"
                  defaultValue={school!.accentColor || ""}
                  placeholder={DEFAULT_ACCENT}
                  spellCheck={false}
                />
              </div>
              <button className="btn sm">Save</button>
            </form>
            <p className="small muted" style={{ margin: "8px 0 0" }}>
              Leave blank for the default. Text on this colour is chosen automatically so it stays
              readable.
            </p>
            {!legible && (
              <div className="notice warn" style={{ margin: "10px 0 0" }}>
                Neither black nor white text reaches the 4.5:1 contrast minimum on {accent}. It
                still rules your letterhead and borders, where no text sits on it — but anything
                filled behind text falls back to the default blue rather than shipping a document
                nobody can read.
              </div>
            )}
            <div className="row" style={{ gap: 8, marginTop: 10, alignItems: "center" }}>
              <span
                style={{
                  background: accent,
                  color: readableOn(accent),
                  padding: "4px 12px",
                  borderRadius: 6,
                  fontSize: 13,
                }}
              >
                Sample
              </span>
              <span className="small muted mono">{accent}</span>
            </div>
          </div>
        </div>
      </div>

      {/* PROVIDER IDENTITY.
          The number a reviewer matches an invoice against. Cohort records it
          and prints it; Cohort cannot check it, because every administrator's
          directory sits behind this school's own login. The copy says so in
          those words — a "verified provider" badge here would be a claim about
          public money that nobody at Cohort is in a position to make. */}
      <div className="card" style={{ marginTop: 12 }}>
        <div className="eyebrow">Your provider ID</div>
        <p className="small muted" style={{ margin: "6px 0 14px", maxWidth: "68ch" }}>
          The number {admin ? admin.label : "your ESA administrator"} issued you when they approved
          your school. A reviewer uses it to match your invoice to their approved-provider list, so
          it goes at the top of every packet Cohort prints. If you leave it blank, packets go out
          without it.
        </p>

        <div className={`notice ${pStatus === "attested" ? "good" : pStatus === "stale" ? "warn" : ""}`}>
          {providerSummary(identity, today(), attestedBy?.name)}
        </div>

        <form action={updateProviderIdentity} style={{ marginTop: 14 }}>
          <div className="grid g2" style={{ gap: 14 }}>
            <div>
              <label htmlFor="providerRail">Who administers your program</label>
              <select id="providerRail" name="providerRail" defaultValue={chosenRail}>
                <option value="">Choose…</option>
                {ADMINISTRATORS.map((a) => (
                  <option key={a.rail} value={a.rail}>
                    {a.label}
                  </option>
                ))}
              </select>
              {impliedRail && !school!.providerRail && (
                <p className="small muted" style={{ margin: "6px 0 0" }}>
                  Pre-selected from your state. Change it if your program moved to someone else —
                  a packet sent to the wrong administrator is rejected on sight.
                </p>
              )}
            </div>
            <div>
              <label htmlFor="providerId">{admin ? admin.idLabel : "Provider ID"}</label>
              <input
                id="providerId"
                name="providerId"
                defaultValue={school!.providerId}
                spellCheck={false}
                placeholder="e.g. 90210"
              />
              <p className="small muted" style={{ margin: "6px 0 0" }}>
                {admin ? admin.hint : "The number on your approval letter."}
              </p>
            </div>
          </div>

          <label
            style={{ display: "flex", gap: 10, alignItems: "flex-start", margin: "14px 0 0", fontWeight: 400 }}
          >
            <input type="checkbox" name="attest" style={{ width: "auto", margin: "3px 0 0" }} />
            <span className="small">
              I&apos;ve checked this ID is active with {admin ? admin.label : "my administrator"}{" "}
              today. Cohort can&apos;t check this for you — their directory needs your login — so we
              record that you did, with today&apos;s date and your name, and ask again in six months.
            </span>
          </label>

          <div className="row" style={{ gap: 10, marginTop: 14, alignItems: "center" }}>
            <button className="btn">Save</button>
            {admin?.confirmAt && (
              <a
                className="btn ghost sm"
                href={admin.confirmAt}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open {admin.label} ↗
              </a>
            )}
          </div>
        </form>
      </div>

      <div className="setgrid" style={{ marginTop: 12 }}>
      <div className="card2">
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

      <div className="card2">
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
      </div>
    </>
  );
}
