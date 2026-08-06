import Link from "next/link";
import { requireTeacher } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { periodStart, today, daysAgo, fmt } from "@/lib/dates";
import { PROGRAMS } from "@/lib/rules";

export const dynamic = "force-dynamic";
export const metadata = { title: "Records & exports — Cohort" };

const PRESETS = [
  { key: "30", label: "Last 30 days", start: () => periodStart() },
  { key: "90", label: "Last 90 days", start: () => daysAgo(90) },
  { key: "180", label: "Last 180 days", start: () => daysAgo(180) },
  { key: "365", label: "Full year", start: () => daysAgo(365) },
];

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ start?: string; end?: string; p?: string }>;
}) {
  const { school } = await requireTeacher();
  const sp = await searchParams;

  const preset = PRESETS.find((x) => x.key === sp.p) ?? PRESETS[0];
  const start = sp.start || preset.start();
  const end = sp.end || today();
  const q = `start=${start}&end=${end}`;

  const students = await prisma.student.findMany({
    where: { schoolId: school!.id },
    orderBy: { name: "asc" },
  });

  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">Hand it to a state, or to a parent</div>
          <h1>Records &amp; exports</h1>
        </div>
      </div>

      <p className="muted" style={{ margin: "0 0 14px", maxWidth: "64ch" }}>
        Everything Cohort has recorded — attendance, coursework, grades, standards mastery,
        observations, and work samples — packaged as a printable record or a spreadsheet. Nothing is
        transmitted anywhere; you save the file and submit it yourself.
      </p>

      {/* period */}
      <div className="card">
        <div className="eyebrow">Reporting period</div>
        <div className="chip-wrap" style={{ marginTop: 10 }}>
          {PRESETS.map((p) => (
            <Link
              key={p.key}
              className={`chip ${preset.key === p.key && !sp.start ? "on" : ""}`}
              href={`/reports?p=${p.key}`}
            >
              {p.label}
            </Link>
          ))}
        </div>
        <form style={{ marginTop: 12 }}>
          <div className="row" style={{ gap: 12, alignItems: "flex-end" }}>
            <div style={{ flex: 1, minWidth: 150 }}>
              <label htmlFor="start">From</label>
              <input id="start" type="date" name="start" defaultValue={start} />
            </div>
            <div style={{ flex: 1, minWidth: 150 }}>
              <label htmlFor="end">To</label>
              <input id="end" type="date" name="end" defaultValue={end} />
            </div>
            <button className="btn sec">Apply dates</button>
          </div>
        </form>
        <p className="small muted" style={{ margin: "10px 0 0" }}>
          Currently reporting <strong>{fmt(start)} – {fmt(end)}</strong>.
        </p>
      </div>

      {/* spreadsheets */}
      <div className="sep" />
      <div className="eyebrow">Spreadsheets (CSV)</div>
      <div className="ws-grid" style={{ marginTop: 10 }}>
        {[
          { kind: "grades", title: "Grades", blurb: "Every assignment, score, and per-student total." },
          { kind: "attendance", title: "Attendance", blurb: "Every logged day with status and notes." },
          { kind: "mastery", title: "Standards mastery", blurb: "Level and status per standard assessed." },
          { kind: "roster", title: "Roster", blurb: "Students, grade, family, funding, tuition." },
        ].map((x) => (
          <a key={x.kind} className="ws-card" href={`/reports/export/${x.kind}?${q}`}>
            <div className="ws-subj">CSV</div>
            <div className="ws-title" style={{ fontSize: 17 }}>
              {x.title}
            </div>
            <div className="small muted">{x.blurb}</div>
          </a>
        ))}
      </div>

      {/* student records */}
      <div className="sep" />
      <div className="eyebrow">Student records (print / PDF)</div>
      {students.length === 0 ? (
        <div className="card" style={{ marginTop: 10 }}>
          <p className="muted small" style={{ margin: 0 }}>
            No students enrolled yet. <Link href="/students">Enroll a student</Link>.
          </p>
        </div>
      ) : (
        <div className="card" style={{ marginTop: 10, padding: "6px 18px" }}>
          {students.map((s) => (
            <div
              key={s.id}
              className="spread"
              style={{ padding: "12px 0", borderTop: "1px solid var(--rule)", gap: 12 }}
            >
              <div>
                <strong>{s.name}</strong>
                <div className="small muted">
                  Grade {s.grade} ·{" "}
                  {s.esaProgram ? PROGRAMS[s.esaProgram]?.label ?? s.esaProgram : "Private pay"}
                </div>
              </div>
              <div className="row" style={{ gap: 8 }}>
                <Link className="btn ghost sm" href={`/students/${s.id}`}>
                  Open
                </Link>
                <a
                  className="btn sec sm"
                  href={`/records/${s.id}/print?${q}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Print record
                </a>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="small muted" style={{ margin: "14px 2px 0" }}>
        Every export is written to the <Link href="/audit">audit log</Link> with who downloaded it and
        when.
      </p>
    </>
  );
}
