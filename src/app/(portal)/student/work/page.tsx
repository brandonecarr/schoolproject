import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fmt, today } from "@/lib/dates";
import { Pill, Notice } from "@/components/ui";
import { WorkCard, type SubData, type AsgData } from "@/components/WorkCard";
import { submitWork, saveDraft } from "../../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "My work — Cohort" };

// Returned (needs a fix) first, then not-started, then drafts.
const STATUS_ORDER: Record<string, number> = { returned: 0, assigned: 1, draft: 2 };

export default async function StudentWorkPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; draft?: string; err?: string; locked?: string }>;
}) {
  const { user } = await requireRole("student");
  const sp = await searchParams;
  const sid = user.studentId ?? "";

  const subsRaw = await prisma.submission.findMany({ where: { studentId: sid } });
  const aIds = [...new Set(subsRaw.map((s) => s.assignmentId))];
  const assignments = await prisma.assignment.findMany({ where: { id: { in: aIds } } });
  const courseIds = [...new Set(assignments.map((a) => a.courseId))];
  const courses = await prisma.course.findMany({ where: { id: { in: courseIds } } });
  const assignmentOf = (id: string) => assignments.find((x) => x.id === id);
  const courseName = (assignmentId: string) => {
    const a = assignmentOf(assignmentId);
    return courses.find((c) => c.id === a?.courseId)?.name || "—";
  };
  const td = today();

  const subs = subsRaw.map((x) => ({ x, a: assignmentOf(x.assignmentId) }));
  const actionable = subs
    .filter((s) => ["assigned", "draft", "returned"].includes(s.x.status))
    .sort(
      (p, q) =>
        (STATUS_ORDER[p.x.status] ?? 3) - (STATUS_ORDER[q.x.status] ?? 3) ||
        (p.a && q.a ? (p.a.dueDate < q.a.dueDate ? -1 : 1) : 0)
    );
  const waiting = subs.filter((s) => s.x.status === "submitted");

  const toAsg = (a: NonNullable<ReturnType<typeof assignmentOf>>): AsgData => ({
    id: a.id,
    title: a.title,
    type: a.type,
    instructions: a.instructions,
    instructionsFormat: a.instructionsFormat,
    points: a.points,
    dueDate: a.dueDate,
    configJson: a.configJson,
    allowResubmit: a.allowResubmit,
    resourceFileId: a.resourceFileId,
    courseName: courseName(a.id),
    fmtDue: fmt(a.dueDate),
    overdue: a.dueDate < td,
  });
  const toSub = (s: (typeof subsRaw)[number]): SubData => ({
    id: s.id,
    status: s.status,
    responseText: s.responseText,
    answersJson: s.answersJson,
    revisionNote: s.revisionNote,
    score: s.score,
    feedback: s.feedback,
    fileId: s.fileId,
  });

  return (
    <>
      {sp.sent && <Notice tone="good">Turned in! Your teacher will see it next. 🎉</Notice>}
      {sp.draft && <Notice tone="info">Draft saved — come back and finish anytime.</Notice>}
      {sp.err === "file" && (
        <Notice tone="bad">That file didn’t upload — use a JPG, PNG, or PDF under 8 MB.</Notice>
      )}
      {sp.locked && (
        <Notice tone="warn">
          That work is already turned in, so it’s locked. Your teacher can reopen it if it needs
          changes.
        </Notice>
      )}

      <div className="spread" style={{ alignItems: "flex-end" }}>
        <div>
          <div className="eyebrow">Your quests</div>
          <h1 style={{ margin: "2px 0 0" }}>My work</h1>
        </div>
        <Link className="small" href="/student">
          ← Home
        </Link>
      </div>

      {actionable.length === 0 ? (
        <div className="card" style={{ marginTop: 14 }}>
          <p className="muted" style={{ margin: 0 }}>
            Nothing to do right now. Go enjoy your day! 🎈
          </p>
        </div>
      ) : (
        <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
          {actionable.map(({ x, a }) =>
            a ? (
              <WorkCard key={x.id} sub={toSub(x)} asg={toAsg(a)} submit={submitWork} saveDraft={saveDraft} />
            ) : null
          )}
        </div>
      )}

      {waiting.length > 0 && (
        <>
          <div style={{ marginTop: 22 }} className="eyebrow">
            Turned in · waiting for your teacher
          </div>
          <div className="card" style={{ marginTop: 10, padding: "6px 18px" }}>
            {waiting.map(({ x, a }) => (
              <Link
                key={x.id}
                href={`/student/work/${x.id}`}
                className="spread turned-in-row"
                style={{ padding: "13px 0", borderTop: "1px solid var(--rule)" }}
              >
                <div>
                  <strong>{a ? a.title : "—"}</strong>
                  <div className="small muted">
                    {a ? courseName(a.id) : ""} · tap to view what you turned in
                  </div>
                </div>
                <Pill tone="info">🔒 View</Pill>
              </Link>
            ))}
          </div>
        </>
      )}
    </>
  );
}
