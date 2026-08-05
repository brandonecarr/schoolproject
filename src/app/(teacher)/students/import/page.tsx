import Link from "next/link";
import { requireTeacher } from "@/lib/auth";
import { importStudents } from "../../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Import roster — Cohort" };

const SAMPLE = `name,grade,familyName,esaProgram,esaAmount,tuitionAnnual
Ava Martinez,3,Martinez,AZ,7400,7400
Noah Kim,5,Kim,AZ,7400,7400
Liam Osei,2,Osei,,0,7400`;

export default async function ImportRosterPage() {
  await requireTeacher();
  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">Roster</div>
          <h1>Import students</h1>
        </div>
        <Link className="btn ghost" href="/students">
          Back to roster
        </Link>
      </div>
      <p className="muted" style={{ marginTop: -12, maxWidth: "64ch" }}>
        Paste one student per line as CSV. Only the name is required. Onboarding a whole school should
        take a minute, not an afternoon.
      </p>

      <form action={importStudents} className="card" style={{ marginTop: 16 }}>
        <label htmlFor="csv">
          CSV — <span className="mono">name, grade, familyName, esaProgram, esaAmount, tuitionAnnual</span>
        </label>
        <textarea
          id="csv"
          name="csv"
          required
          defaultValue={SAMPLE}
          spellCheck={false}
          style={{ minHeight: 200, fontFamily: "var(--mono)", fontSize: 13 }}
        />
        <p className="small muted" style={{ margin: "10px 0 0" }}>
          <strong>esaProgram</strong> is a two-letter state code (AZ, FL, IA, UT, AR) or blank for
          private pay. A header row is optional — it&apos;s skipped automatically. Amounts default to $0
          / the school ESA amount when omitted.
        </p>
        <button className="btn" style={{ marginTop: 12 }}>
          Import students
        </button>
      </form>
    </>
  );
}
