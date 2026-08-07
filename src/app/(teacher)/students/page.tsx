import Link from "next/link";
import { requireTeacher } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { evidenceFor } from "@/lib/evidence";
import { readiness, PROGRAMS, RAILS, programOptions } from "@/lib/rules";
import { FundingSelect } from "@/components/FundingSelect";
import { VerificationChip } from "@/components/VerificationNote";
import { verificationCounts, programVerification } from "@/lib/observe";
import { Pill, Notice } from "@/components/ui";
import { addStudent } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Students — Cohort" };

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ imported?: string; skipped?: string; deleted?: string; added?: string }>;
}) {
  const { school } = await requireTeacher();
  const sp = await searchParams;
  const students = await prisma.student.findMany({
    where: { schoolId: school!.id },
    orderBy: { createdAt: "asc" },
  });
  const rows = await Promise.all(students.map(async (s) => ({ s, e: await evidenceFor(s.id) })));
  // One grouped query for the whole table, not one per student.
  const vidx = await verificationCounts(school!.id);
  // Grouped by how the money actually arrives — that, not the state, is what
  // changes the paperwork. Within a group, alphabetical by state.
  const opts = programOptions().map((p) => ({ ...p, railLabel: RAILS[p.rail]?.label ?? p.rail }));
  const programGroups = [
    { label: "Education savings accounts", items: opts.filter((p) => p.kind === "esa") },
    { label: "Tax-credit scholarships", items: opts.filter((p) => p.kind === "taxcredit") },
    { label: "Other state funding", items: opts.filter((p) => p.kind !== "esa" && p.kind !== "taxcredit") },
  ].filter((g) => g.items.length > 0);

  return (
    <>
      {sp.added === "1" && (
        <Notice tone="good">
          Student enrolled. They now appear in the “Child” list on{" "}
          <Link href="/invites">Invite families</Link> so you can invite their parent.
        </Notice>
      )}
      {sp.added === "0" && <Notice tone="bad">A name is required to enroll a student.</Notice>}
      {sp.imported && (
        <Notice tone="good">
          Imported {sp.imported} student(s)
          {sp.skipped && Number(sp.skipped) > 0 ? `, skipped ${sp.skipped} blank row(s)` : ""}.
        </Notice>
      )}
      {sp.deleted && <Notice tone="good">Student and all associated data permanently deleted.</Notice>}
      <div className="topbar">
        <div>
          <div className="eyebrow">Roster</div>
          <h1>Students</h1>
        </div>
        <Link className="btn sec" href="/students/import">
          Import roster (CSV)
        </Link>
      </div>

      <details className="card" open={students.length === 0}>
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>Enroll a student</summary>
        <p className="small muted" style={{ margin: "8px 0 4px", maxWidth: "64ch" }}>
          This creates the child’s <strong>roster record</strong> — their educational file, not a
          login. Once enrolled, they show up in the “Child” list on Invite families. The child’s{" "}
          <strong>login</strong> is created later by their parent, from the parent’s own account —
          that order is what makes consent verifiable.
        </p>
        <form action={addStudent} style={{ marginTop: 10 }}>
          <div className="row" style={{ gap: 12 }}>
            <div style={{ flex: 2, minWidth: 200 }}>
              <label htmlFor="name">Student name</label>
              <input id="name" name="name" required placeholder="Ada Lovelace" />
            </div>
            <div style={{ flex: 1, minWidth: 90 }}>
              <label htmlFor="grade">Grade</label>
              <input id="grade" name="grade" placeholder="4" />
            </div>
            <div style={{ flex: 1, minWidth: 140 }}>
              <label htmlFor="familyName">Family name</label>
              <input id="familyName" name="familyName" placeholder="Lovelace" />
            </div>
          </div>
          <div className="row" style={{ gap: 12 }}>
            <FundingSelect groups={programGroups} />
            <div style={{ flex: 1, minWidth: 140 }}>
              <label htmlFor="tuitionAnnual">Tuition / yr</label>
              <input
                id="tuitionAnnual"
                name="tuitionAnnual"
                type="number"
                min={0}
                placeholder={String(school!.esaAmount || 0)}
              />
            </div>
          </div>
          <button className="btn mark" style={{ marginTop: 12 }}>
            Enroll student
          </button>
        </form>
      </details>
      <div className="card" style={{ padding: "16px 10px" }}>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Grade</th>
              <th>Funding</th>
              <th>Evidence</th>
              <th><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ s, e }) => {
              const r = readiness(e.score);
              return (
                <tr key={s.id}>
                  <td>
                    <strong>{s.name}</strong>
                    <div className="small muted">{s.familyName} family</div>
                  </td>
                  <td>{s.grade}</td>
                  <td className="small">
                    {s.esaProgram ? (PROGRAMS[s.esaProgram]?.label ?? s.esaProgram) : "Private pay"}
                    {/* Per-program, not per-rail: two states can share an
                        administrator while only one of them has been proven. */}
                    {s.esaProgram && (
                      <div style={{ marginTop: 3 }}>
                        <VerificationChip v={programVerification(vidx, s.esaProgram)} />
                      </div>
                    )}
                  </td>
                  <td>
                    <Pill tone={r.tone}>{e.score}</Pill>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <Link className="btn sec sm" href={`/students/${s.id}`}>
                      Open
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
