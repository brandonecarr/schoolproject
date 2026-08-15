import Link from "next/link";
import { requireSchoolTeacher } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { today, fmt } from "@/lib/dates";
import { Notice } from "@/components/ui";
import { typeMeta } from "@/lib/lms";
import {
  buildRow,
  assignmentAverage,
  fmtPct,
  STATUS_TONE,
  STATUS_LABEL,
  type AssignmentInput,
  type CellInput,
} from "@/lib/gradebook";
import { saveGradebook } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Gradebook — Cohort" };

export default async function GradebookPage({
  searchParams,
}: {
  searchParams: Promise<{ course?: string; saved?: string }>;
}) {
  const { school } = await requireSchoolTeacher();
  const schoolId = school!.id;
  const sp = await searchParams;
  const td = today();

  const [students, courses, allAssignments, submissions, changes] = await Promise.all([
    prisma.student.findMany({ where: { schoolId }, orderBy: { name: "asc" } }),
    prisma.course.findMany({ where: { schoolId }, orderBy: { createdAt: "asc" } }),
    prisma.assignment.findMany({ where: { schoolId }, orderBy: { dueDate: "asc" } }),
    prisma.submission.findMany({ where: { schoolId } }),
    prisma.gradeChange.findMany({ where: { schoolId }, orderBy: { at: "desc" }, take: 12 }),
  ]);

  const assignments: AssignmentInput[] = allAssignments
    .filter((a) => (sp.course ? a.courseId === sp.course : true))
    .map((a) => ({
      id: a.id,
      title: a.title,
      points: a.points,
      dueDate: a.dueDate,
      courseId: a.courseId,
      type: a.type,
    }));

  const cells: CellInput[] = submissions.map((s) => ({
    submissionId: s.id,
    studentId: s.studentId,
    assignmentId: s.assignmentId,
    status: s.status,
    score: s.score,
    submittedAt: s.submittedAt,
  }));

  const rows = students.map((s) => ({ s, row: buildRow(s.id, assignments, cells, td) }));
  const nameOf = (id: string) => students.find((x) => x.id === id)?.name ?? "—";
  const titleOf = (id: string) => allAssignments.find((a) => a.id === id)?.title ?? "—";

  if (assignments.length === 0) {
    return (
      <>
        <div className="topbar">
          <div>
            <div className="eyebrow">Every grade, one grid</div>
            <h1>Gradebook</h1>
          </div>
        </div>
        <div className="card">
          <h3 style={{ margin: 0 }}>Nothing to grade yet</h3>
          <p className="muted small" style={{ margin: "8px 0 12px" }}>
            Once you assign work it shows up here as a grid you can mark straight down the column.
          </p>
          <Link className="btn" href="/assignments">
            Create an assignment
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      {sp.saved && (
        <Notice tone="good">
          {sp.saved === "0"
            ? "No changes to save."
            : `Saved ${sp.saved} grade change${sp.saved === "1" ? "" : "s"} — each one is recorded in the history below.`}
        </Notice>
      )}

      <div className="topbar">
        <div>
          <div className="eyebrow">Every grade, one grid</div>
          <h1>Gradebook</h1>
        </div>
        <Link className="btn sec" href="/grading">
          Grading queue
        </Link>
      </div>

      {courses.length > 1 && (
        <div className="chip-wrap" style={{ marginBottom: 14 }}>
          <Link className={`chip ${!sp.course ? "on" : ""}`} href="/gradebook">
            All courses
          </Link>
          {courses.map((c) => (
            <Link
              key={c.id}
              className={`chip ${sp.course === c.id ? "on" : ""}`}
              href={`/gradebook?course=${c.id}`}
            >
              {c.name}
            </Link>
          ))}
        </div>
      )}

      <form action={saveGradebook}>
        <div className="card" style={{ padding: 0, overflowX: "auto" }}>
          <table className="gb-grid">
            <thead>
              <tr>
                <th className="stick">Student</th>
                <th className="gb-total">Grade</th>
                {assignments.map((a) => {
                  const m = typeMeta(a.type);
                  const avg = assignmentAverage(a.id, rows.map((r) => r.row));
                  return (
                    <th key={a.id} title={`${a.title} · ${a.points} pts · due ${fmt(a.dueDate)}`}>
                      <span className="gb-head">
                        <span className="gb-ic" aria-hidden>
                          {m.icon}
                        </span>
                        {a.title}
                      </span>
                      <span className="gb-sub">
                        {a.points} pts · avg {fmtPct(avg)}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ s, row }) => (
                <tr key={s.id}>
                  <td className="stick">
                    <Link
                      href={`/students/${s.id}`}
                      style={{ fontWeight: 600, textDecoration: "none" }}
                    >
                      {s.name}
                    </Link>
                    <div className="small muted">
                      Grade {s.grade}
                      {row.missingCount > 0 && (
                        <span className="gb-missing-tag"> · {row.missingCount} missing</span>
                      )}
                    </div>
                  </td>
                  <td className="gb-total">
                    <span className="gb-letter">{row.letter}</span>
                    <div className="small muted">
                      {fmtPct(row.pct)}
                      {row.possible > 0 ? ` · ${row.earned}/${row.possible}` : ""}
                    </div>
                  </td>
                  {row.cells.map((c) => (
                    <td key={c.assignmentId} className={STATUS_TONE[c.status]}>
                      {c.submissionId ? (
                        <span className="gb-cell" title={`${STATUS_LABEL[c.status]}${c.late ? " · late" : ""}`}>
                          <input
                            type="number"
                            name={`score_${c.submissionId}`}
                            min={0}
                            max={c.points}
                            defaultValue={c.score ?? ""}
                            placeholder={c.status === "missing" ? "—" : "·"}
                            aria-label={`${s.name} — ${titleOf(c.assignmentId)}`}
                          />
                          {c.late && <span className="gb-late" title="Turned in late">L</span>}
                        </span>
                      ) : (
                        <span className="muted small" title="Not assigned to this student">
                          ·
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card" style={{ marginTop: 12 }}>
          <div className="row" style={{ gap: 12, alignItems: "flex-end" }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <label htmlFor="reason">Reason for these changes (optional, kept in the record)</label>
              <input id="reason" name="reason" placeholder="Regraded after reviewing rubric" />
            </div>
            <button className="btn mark">Save grades</button>
          </div>
          <p className="small muted" style={{ margin: "10px 0 0" }}>
            Type a score straight into any cell. A blank cell is left unchanged — grades are never
            erased by saving. Percentages count graded work only, so unmarked work never drags a
            grade down; missing work is flagged separately.
          </p>
        </div>
      </form>

      <div className="row" style={{ gap: 14, marginTop: 12, flexWrap: "wrap" }}>
        {(["graded", "submitted", "returned", "missing", "assigned"] as const).map((k) => (
          <span
            key={k}
            className="small muted"
            style={{ display: "inline-flex", gap: 6, alignItems: "center" }}
          >
            <span className={`gb-key ${STATUS_TONE[k]}`} />
            {STATUS_LABEL[k]}
          </span>
        ))}
      </div>

      {/* Audit trail */}
      <div className="sep" />
      <div className="eyebrow">Grade change history</div>
      {changes.length === 0 ? (
        <div className="card" style={{ marginTop: 10 }}>
          <p className="muted small" style={{ margin: 0 }}>
            No grade changes recorded yet. Every edit made here is logged with who made it and what
            it was before.
          </p>
        </div>
      ) : (
        <div className="card" style={{ marginTop: 10, padding: "6px 18px" }}>
          {changes.map((c) => (
            <div key={c.id} style={{ padding: "11px 0", borderTop: "1px solid var(--rule)" }}>
              <div className="spread" style={{ gap: 10 }}>
                <div>
                  <strong>{nameOf(c.studentId)}</strong>
                  <span className="muted"> · {titleOf(c.assignmentId)}</span>
                </div>
                <span className="mono small">
                  {c.oldScore ?? "—"} → <strong>{c.newScore ?? "—"}</strong>
                </span>
              </div>
              <div className="small muted" style={{ marginTop: 2 }}>
                {c.changedByName} · {fmt(c.at.slice(0, 10))}
                {c.reason ? ` · ${c.reason}` : ""}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
