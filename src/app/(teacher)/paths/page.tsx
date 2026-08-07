import Link from "next/link";
import { requireTeacher } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Notice } from "@/components/ui";
import { describeBand } from "@/lib/paths";
import { typeMeta } from "@/lib/lms";
import { addPathRule, deletePathRule } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mastery paths — Cohort" };

export default async function PathsPage({
  searchParams,
}: {
  searchParams: Promise<{ added?: string; deleted?: string; err?: string }>;
}) {
  const { school } = await requireTeacher();
  const sp = await searchParams;

  const [rules, assignments, autoAssigned] = await Promise.all([
    prisma.pathRule.findMany({ where: { schoolId: school!.id }, orderBy: { createdAt: "desc" } }),
    prisma.assignment.findMany({ where: { schoolId: school!.id }, orderBy: { dueDate: "desc" } }),
    prisma.submission.findMany({
      where: { schoolId: school!.id, NOT: { assignedReason: "" } },
      orderBy: { createdAt: "desc" },
      take: 12,
    }),
  ]);
  const students = await prisma.student.findMany({ where: { schoolId: school!.id } });

  const titleOf = (id: string) => assignments.find((a) => a.id === id)?.title ?? "(deleted)";
  const nameOf = (id: string) => students.find((s) => s.id === id)?.name ?? "—";

  return (
    <>
      {sp.added && <Notice tone="good">Rule added. It applies the next time that work is graded.</Notice>}
      {sp.deleted && <Notice tone="good">Rule removed.</Notice>}
      {sp.err === "self" && (
        <Notice tone="bad">A rule can&apos;t assign the same work that triggered it.</Notice>
      )}
      {sp.err === "missing" && <Notice tone="bad">Choose both assignments.</Notice>}

      <div className="topbar">
        <div>
          <div className="eyebrow">Teaching that responds</div>
          <h1>Mastery paths</h1>
        </div>
        <Link className="btn sec" href="/assignments">
          Assignments →
        </Link>
      </div>

      <p className="muted" style={{ margin: "0 0 14px", maxWidth: "66ch" }}>
        A rule says: <em>when a student scores in this range on this work, give them that next.</em>{" "}
        Re-teaching for the student who struggled, an extension for the one who raced ahead — handed
        out the moment you grade, and recorded as individualised instruction you can show a reviewer.
      </p>

      {assignments.length < 2 ? (
        <div className="card">
          <p className="muted small" style={{ margin: 0 }}>
            You need at least two assignments before you can link them.{" "}
            <Link href="/assignments">Create one</Link>.
          </p>
        </div>
      ) : (
        <details className="card" open={rules.length === 0}>
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>New rule</summary>
          <form action={addPathRule} style={{ marginTop: 10 }}>
            <label htmlFor="assignmentId">When a student is graded on…</label>
            <select id="assignmentId" name="assignmentId" required>
              {assignments.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title} ({typeMeta(a.type).label}, {a.points} pts)
                </option>
              ))}
            </select>

            <div className="row" style={{ gap: 12, alignItems: "flex-end" }}>
              <div style={{ flex: 1, minWidth: 190 }}>
                <label htmlFor="preset">…and they score</label>
                <select id="preset" name="preset" defaultValue="below">
                  <option value="below">Below</option>
                  <option value="atOrAbove">At or above</option>
                  <option value="between">Between</option>
                </select>
              </div>
              <div style={{ width: 110 }}>
                <label htmlFor="a">%</label>
                <input id="a" name="a" type="number" min={0} max={100} defaultValue={70} />
              </div>
              <div style={{ width: 110 }}>
                <label htmlFor="b">and % (range only)</label>
                <input id="b" name="b" type="number" min={0} max={100} defaultValue={100} />
              </div>
            </div>

            <label htmlFor="thenAssignmentId">…then also assign</label>
            <select id="thenAssignmentId" name="thenAssignmentId" required>
              {assignments.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title}
                </option>
              ))}
            </select>

            <label htmlFor="note">What the student is told (optional)</label>
            <input
              id="note"
              name="note"
              placeholder="Let's practise carrying before we move on."
            />

            <button className="btn mark" style={{ marginTop: 12 }}>
              Add rule
            </button>
          </form>
        </details>
      )}

      <div className="sep" />
      <div className="eyebrow">Rules</div>
      {rules.length === 0 ? (
        <div className="card" style={{ marginTop: 10 }}>
          <p className="muted small" style={{ margin: 0 }}>
            No rules yet. Nothing is assigned automatically until you add one.
          </p>
        </div>
      ) : (
        <div className="card" style={{ marginTop: 10, padding: "6px 18px" }}>
          {rules.map((r) => (
            <div
              key={r.id}
              className="spread"
              style={{ padding: "12px 0", borderTop: "1px solid var(--rule)", gap: 12 }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div>
                  <strong>{titleOf(r.assignmentId)}</strong>
                  <span className="muted"> · {describeBand(r.minPct, r.maxPct)} → </span>
                  <strong>{titleOf(r.thenAssignmentId)}</strong>
                </div>
                {r.note && (
                  <div className="small muted" style={{ marginTop: 2 }}>
                    “{r.note}”
                  </div>
                )}
              </div>
              <form action={deletePathRule}>
                <input type="hidden" name="id" value={r.id} />
                <button className="btn ghost sm">Remove</button>
              </form>
            </div>
          ))}
        </div>
      )}

      {/* what the rules have actually done */}
      <div className="sep" />
      <div className="eyebrow">Assigned automatically</div>
      {autoAssigned.length === 0 ? (
        <div className="card" style={{ marginTop: 10 }}>
          <p className="muted small" style={{ margin: 0 }}>
            Nothing yet. When a rule fires, the work it handed out appears here — a running record of
            individualised instruction.
          </p>
        </div>
      ) : (
        <div className="card" style={{ marginTop: 10, padding: "6px 18px" }}>
          {autoAssigned.map((s) => (
            <div key={s.id} style={{ padding: "11px 0", borderTop: "1px solid var(--rule)" }}>
              <div>
                <strong>{nameOf(s.studentId)}</strong>
                <span className="muted"> · {titleOf(s.assignmentId)}</span>
              </div>
              <div className="small muted" style={{ marginTop: 2 }}>
                {s.assignedReason}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
