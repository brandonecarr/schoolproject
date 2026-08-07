import Link from "next/link";
import { requireTeacher } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Notice } from "@/components/ui";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { accentOf, readableOn, accentIsLegible, logoDataUri, DEFAULT_ACCENT } from "@/lib/branding";
import { updateRetention, uploadLogo, removeLogo, updateAccent } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings — Cohort" };

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
  searchParams: Promise<{ saved?: string; logo?: string }>;
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

  return (
    <>
      {sp.saved && <Notice tone="good">Settings saved.</Notice>}
      {logoMsg && <Notice tone={logoMsg.tone}>{logoMsg.text}</Notice>}
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
