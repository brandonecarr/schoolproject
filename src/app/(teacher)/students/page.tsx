import Link from "next/link";
import { requireTeacher } from "@/lib/auth";
import { copyFor } from "@/lib/kind";
import { prisma } from "@/lib/db";
import { evidenceForStudents } from "@/lib/evidence";
import { readiness, PROGRAMS, RAILS, programOptions } from "@/lib/rules";
import { FundingSelect } from "@/components/FundingSelect";
import { VerificationChip } from "@/components/VerificationNote";
import { verificationCounts, programVerification } from "@/lib/observe";
import { Pill, Notice, Avatar, Bar, PageHead } from "@/components/ui";
import { addStudent } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Students — Cohort" };

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ imported?: string; skipped?: string; deleted?: string; added?: string }>;
}) {
  const { school } = await requireTeacher();
  const copy = copyFor(school);
  const sp = await searchParams;
  const students = await prisma.student.findMany({
    where: { schoolId: school!.id },
    orderBy: { createdAt: "asc" },
  });
  const evMap = await evidenceForStudents(students.map((s) => s.id));
  const rows = students.map((s) => ({ s, e: evMap.get(s.id)! }));

  const onEsa = students.filter((x) => x.esaProgram).length;
  // Name the actual programme when the roster is on one, rather than a generic
  // "ESA" — a teacher in Arizona thinks "AZ ESA", not "an ESA".
  const programs = [...new Set(students.map((x) => x.esaProgram).filter(Boolean))] as string[];
  const esaLabel =
    programs.length === 1 ? (PROGRAMS[programs[0]]?.label ?? programs[0]) : "an ESA";
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
      {/* The eyebrow is derived, not decorative: how many are enrolled and how
          many of those the school actually bills for are two different numbers,
          and the gap between them is the school's private-pay exposure. */}
      <PageHead
        eyebrow={
          <>
            {students.length} enrolled
            {onEsa > 0 ? ` · ${onEsa} on ${esaLabel}` : " · none on an ESA"}
          </>
        }
        title={copy.students}
        actions={
          <>
            <Link className="btn sec" href="/students/import">
              Import CSV
            </Link>
            <Link className="btn" href="/invites">
              Invite a family
            </Link>
          </>
        }
      />

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
      {/* The handoff's columns: student · grade · funding · evidence · present ·
          avg grade. Evidence is a bar plus the number, never the bar alone —
          status is not encoded in colour by itself anywhere in this app. */}
      <div className="card2 nopad">
        <table>
          <thead>
            <tr>
              <th>Student</th>
              <th>Grade</th>
              <th>Funding</th>
              <th>Evidence</th>
              <th>Present</th>
              <th style={{ textAlign: "right" }}>Avg grade</th>
              <th>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ s, e }) => {
              const r = readiness(e.score);
              const graded = e.submissions.filter((x) => x.status === "graded" && x.score != null);
              const earned = graded.reduce((t, x) => t + (x.score ?? 0), 0);
              const possible = graded.reduce((t, x) => t + x.points, 0);
              const avg = possible > 0 ? Math.round((earned / possible) * 100) : null;
              return (
                <tr key={s.id}>
                  <td>
                    <span className="row" style={{ gap: 10 }}>
                      <Avatar name={s.name} size={32} />
                      <span>
                        <span className="rowname" style={{ display: "block" }}>
                          {s.name}
                        </span>
                        <span className="rowmeta">{s.familyName} family</span>
                      </span>
                    </span>
                  </td>
                  <td className="num">{s.grade}</td>
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
                    <span className="row" style={{ gap: 9, minWidth: 130 }}>
                      <Bar pct={e.score} tone={r.tone} />
                      <span className="num" style={{ fontWeight: 700 }}>
                        {e.score}
                      </span>
                    </span>
                  </td>
                  <td className="num">
                    {e.presentDays}/{e.attendance.length}
                  </td>
                  <td className="num" style={{ textAlign: "right", fontWeight: 700 }}>
                    {avg != null ? `${avg}%` : "—"}
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

      {/* The handoff puts a bad-tone strip under the table naming the student
          whose packet would be questioned. Derived, not hardcoded: it names
          whoever is actually at risk, and says nothing when nobody is. */}
      {(() => {
        const atRisk = rows.filter(({ e }) => readiness(e.score).tone === "bad");
        if (atRisk.length === 0) return null;
        const names = atRisk.map(({ s }) => s.name);
        return (
          <div className="notice bad" style={{ marginTop: 12 }}>
            <strong>{names.join(", ")}</strong>{" "}
            {names.length === 1 ? "has" : "have"} thin evidence for this period —{" "}
            {names.length === 1 ? "that packet" : "those packets"} would likely be questioned.
          </div>
        );
      })()}
    </>
  );
}
