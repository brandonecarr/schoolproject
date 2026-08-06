import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTeacher } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { evidenceFor } from "@/lib/evidence";
import { readiness, PROGRAMS } from "@/lib/rules";
import { fmt, today } from "@/lib/dates";
import { EvidenceBar } from "@/components/EvidenceBar";
import { Pill, Notice } from "@/components/ui";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { StandardsSummary } from "@/components/StandardsSummary";
import { masteryForStudent } from "@/lib/mastery";
import { uploadSample, deleteSample, deleteStudent, generateProgressReport } from "../../actions";

export const dynamic = "force-dynamic";

const UPLOAD_MSG: Record<string, { tone: "good" | "bad"; text: string }> = {
  ok: { tone: "good", text: "Work sample attached." },
  empty: { tone: "bad", text: "Choose a file first." },
  type: { tone: "bad", text: "Only JPG, PNG, WebP, or PDF files can be attached." },
  big: { tone: "bad", text: "That file is over 8 MB. Try a smaller photo." },
};

export default async function StudentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ upload?: string }>;
}) {
  const { school } = await requireTeacher();
  const { id } = await params;
  const { upload } = await searchParams;

  const s = await prisma.student.findFirst({ where: { id, schoolId: school!.id } });
  if (!s) notFound();

  const e = await evidenceFor(s.id);
  const mastery = await masteryForStudent(s.id, school!.id);
  const gradeChanges = await prisma.gradeChange.findMany({
    where: { schoolId: school!.id, studentId: s.id },
    orderBy: { at: "desc" },
    take: 8,
  });
  const reports = await prisma.progressReport.findMany({
    where: { schoolId: school!.id, studentId: s.id },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
  const r = readiness(e.score);
  const missing = e.parts.filter((p) => !p.ok);
  const msg = upload ? UPLOAD_MSG[upload] : null;

  return (
    <>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <div className="topbar">
        <div>
          <div className="eyebrow">
            Grade {s.grade} · {s.esaProgram ? PROGRAMS[s.esaProgram].label : "Private pay"}
          </div>
          <h1>{s.name}</h1>
        </div>
        <Link className="btn" href="/invoices">
          Build invoice
        </Link>
      </div>

      <div className="card">
        <div className="spread">
          <div>
            <div className="eyebrow">Evidence this period</div>
            <div className="score">
              {e.score}
              <span style={{ fontSize: 16, color: "var(--ink-soft)" }}>/100</span>
            </div>
          </div>
          <Pill tone={r.tone}>{r.label}</Pill>
        </div>
        <div style={{ marginTop: 14 }}>
          <EvidenceBar parts={e.parts} />
        </div>
        {missing.length ? (
          <div className="notice warn" style={{ margin: "16px 0 0" }}>
            To strengthen this: {missing.map((p) => p.need).join("; ")}.
          </div>
        ) : (
          <div className="notice good" style={{ margin: "16px 0 0" }}>
            Every required element is present. This one will hold up.
          </div>
        )}
      </div>

      {mastery.outcomes.length > 0 && (
        <div className="card">
          <StandardsSummary
            outcomes={mastery.outcomes}
            rollups={mastery.rollups}
            summary={mastery.summary}
            limit={8}
          />
          <Link className="small" href="/mastery" style={{ display: "inline-block", marginTop: 10 }}>
            Full mastery board →
          </Link>
        </div>
      )}

      <div className="sep" />
      <div className="grid g2">
        <div className="card">
          <div className="eyebrow">Coursework</div>
          <div className="rollbook" style={{ marginTop: 10 }}>
            {e.submissions.map((x) => (
              <div key={x.id} className="line">
                <span style={{ flex: 1 }}>{x.assignmentTitle}</span>
                <span className="mono">
                  {x.status === "graded" ? `${x.score}/${x.points}` : x.status}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="eyebrow">Observations</div>
          {e.observations.length ? (
            e.observations.map((o) => (
              <p key={o.id} className="small" style={{ margin: "10px 0 0" }}>
                {fmt(o.date)} — {o.text}
              </p>
            ))
          ) : (
            <p className="small muted" style={{ marginTop: 10 }}>
              None recorded this period.
            </p>
          )}
          <div className="sep" style={{ margin: "16px 0" }} />
          <div className="eyebrow">Attendance</div>
          <p className="small" style={{ marginTop: 8 }}>
            {e.presentDays} present of {e.attendance.length} logged days
          </p>

          {gradeChanges.length > 0 && (
            <>
              <div className="sep" style={{ margin: "16px 0" }} />
              <div className="eyebrow">Grade history</div>
              <div style={{ marginTop: 8 }}>
                {gradeChanges.map((c) => (
                  <div key={c.id} className="small" style={{ padding: "6px 0" }}>
                    <span className="mono">
                      {c.oldScore ?? "—"} → <strong>{c.newScore ?? "—"}</strong>
                    </span>{" "}
                    on{" "}
                    {e.submissions.find((x) => x.assignmentId === c.assignmentId)?.assignmentTitle ??
                      "an assignment"}
                    <div className="muted">
                      {c.changedByName} · {fmt(c.at.slice(0, 10))}
                      {c.reason ? ` · ${c.reason}` : ""}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="spread">
          <div className="eyebrow">Progress reports</div>
          <form action={generateProgressReport}>
            <input type="hidden" name="studentId" value={s.id} />
            <button className="btn sec sm">Draft a progress report</button>
          </form>
        </div>
        <p className="small muted" style={{ margin: "8px 0 0", maxWidth: "62ch" }}>
          Cohort assembles a narrative from this period&apos;s attendance, graded work, standards, and
          observations. You review and edit it, and it only reaches the family once you approve.
        </p>
        {reports.length > 0 && (
          <div style={{ marginTop: 12 }}>
            {reports.map((rp) => (
              <div
                key={rp.id}
                className="spread"
                style={{ padding: "10px 0", borderTop: "1px solid var(--rule)", gap: 10 }}
              >
                <div>
                  <Link href={`/reports/progress/${rp.id}`} style={{ fontWeight: 600 }}>
                    {fmt(rp.periodStart)} – {fmt(rp.periodEnd)}
                  </Link>
                  <div className="small muted">
                    {rp.createdByName} · {rp.narrative.slice(0, 60)}…
                  </div>
                </div>
                <Pill tone={rp.status === "approved" ? "good" : "warn"}>
                  {rp.status === "approved" ? "Approved" : "Draft"}
                </Pill>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="eyebrow">Work samples</div>
        <p className="small muted" style={{ margin: "6px 0 12px" }}>
          Photograph or scan the actual work. Florida requires samples outright, and everywhere else
          they&apos;re the hardest evidence to argue with. JPG, PNG, WebP, or PDF up to 8&nbsp;MB.
        </p>
        <form action={uploadSample}>
          <input type="hidden" name="studentId" value={s.id} />
          <div className="row" style={{ alignItems: "flex-end", gap: 12 }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label htmlFor="lbl">What is it</label>
              <input id="lbl" name="label" placeholder={`Fractions worksheet, week of ${fmt(today())}`} />
            </div>
            <div>
              <label htmlFor="fileIn">File</label>
              <input
                id="fileIn"
                name="file"
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                style={{ padding: 8 }}
              />
            </div>
            <button className="btn mark" type="submit">
              Attach
            </button>
          </div>
        </form>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 16 }}>
          {e.samples.length ? (
            e.samples.map((f) => (
              <figure key={f.id} style={{ margin: 0, width: 150 }}>
                <a href={`/files/${f.id}`} target="_blank" rel="noopener noreferrer">
                  {f.mime === "application/pdf" ? (
                    <div
                      className="small muted"
                      style={{
                        border: "1px solid var(--rule)",
                        borderRadius: 8,
                        padding: "26px 8px",
                        textAlign: "center",
                        background: "#fff",
                      }}
                    >
                      PDF
                    </div>
                  ) : (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={`/files/${f.id}`}
                      alt={f.label}
                      style={{ width: "100%", border: "1px solid var(--rule)", borderRadius: 8, display: "block" }}
                    />
                  )}
                </a>
                <figcaption className="small muted" style={{ marginTop: 5 }}>
                  {f.label}
                </figcaption>
                <form action={deleteSample}>
                  <input type="hidden" name="id" value={f.id} />
                  <input type="hidden" name="studentId" value={s.id} />
                  <button className="btn ghost sm" style={{ marginTop: 5, padding: "3px 9px" }}>
                    Remove
                  </button>
                </form>
              </figure>
            ))
          ) : (
            <p className="small muted" style={{ margin: 0 }}>
              Nothing attached yet.
            </p>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 12, borderColor: "var(--bad-soft)" }}>
        <div className="eyebrow" style={{ color: "var(--bad)" }}>
          Delete this student&apos;s data
        </div>
        <p className="small muted" style={{ margin: "6px 0 12px", maxWidth: "64ch" }}>
          Permanently removes {s.name} and every record tied to them — attendance, observations,
          submissions, work samples, invoices, payments, and any login. This is the family&apos;s
          right-to-deletion under COPPA and cannot be undone.
        </p>
        <form action={deleteStudent}>
          <input type="hidden" name="studentId" value={s.id} />
          <ConfirmSubmit
            className="btn ghost"
            message={`Permanently delete ${s.name} and ALL of their data? This cannot be undone.`}
          >
            Delete student &amp; all data
          </ConfirmSubmit>
        </form>
      </div>
    </>
  );
}
