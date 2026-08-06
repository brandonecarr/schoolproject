import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fmt } from "@/lib/dates";
import { Pill } from "@/components/ui";
import {
  typeMeta,
  parseItems,
  parseQuizAnswers,
  rubricConfig,
  parseCheckoffAnswer,
  itemIsAuto,
  normalize,
  type Item,
} from "@/lib/lms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Turned in — Cohort" };

// Read-only view of a submission the student already turned in. It stays locked:
// this page renders what they submitted with no inputs and no way to change it.
export default async function SubmittedWorkView({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { user } = await requireRole("student");
  const { id } = await params;

  const sub = await prisma.submission.findUnique({ where: { id } });
  if (!sub || sub.studentId !== user.studentId) redirect("/student/work");
  // Only locked (turned-in) work is viewed here. Still-open work is edited on the
  // work page, so send those back there.
  if (!["submitted", "graded"].includes(sub.status)) redirect("/student/work");

  const asg = await prisma.assignment.findUnique({ where: { id: sub.assignmentId } });
  if (!asg) redirect("/student/work");
  const course = await prisma.course.findUnique({ where: { id: asg.courseId } });
  const m = typeMeta(asg.type);
  const graded = sub.status === "graded";

  return (
    <>
      <div className="spread" style={{ alignItems: "flex-end" }}>
        <div>
          <div className="eyebrow">
            {course?.name ?? "—"} · {m.label}
          </div>
          <h1 style={{ margin: "2px 0 0" }}>{asg.title}</h1>
        </div>
        <Link className="small" href="/student/work">
          ← Back to my work
        </Link>
      </div>

      <div className="notice info" style={{ marginTop: 14 }}>
        🔒 This is locked — you already turned it in
        {sub.submittedAt ? ` on ${fmt(sub.submittedAt.slice(0, 10))}` : ""}. You can read it, but it
        can’t be changed. Your teacher can reopen it if it needs edits.
      </div>

      {graded && (
        <div className="card" style={{ marginTop: 14 }}>
          <div className="spread">
            <div className="eyebrow" style={{ margin: 0 }}>
              Your grade
            </div>
            <Pill tone="mark">
              {sub.score}/{asg.points}
            </Pill>
          </div>
          {sub.feedback && sub.feedback !== "Auto-graded." && sub.feedback !== "Completed." && (
            <p className="small" style={{ margin: "10px 0 0" }}>
              <strong>Teacher’s note:</strong> {sub.feedback}
            </p>
          )}
        </div>
      )}

      <div className="card" style={{ marginTop: 14 }}>
        <div className="eyebrow">What you turned in</div>
        <div style={{ marginTop: 10 }}>
          {asg.type === "quiz" && <QuizReadOnly asg={asg} answersJson={sub.answersJson} graded={graded} />}
          {asg.type === "written" && <TextReadOnly text={sub.responseText} />}
          {asg.type === "rubric" && (
            <RubricReadOnly text={sub.responseText} fileId={sub.fileId} />
          )}
          {asg.type === "upload" && <UploadReadOnly fileId={sub.fileId} note={sub.responseText} />}
          {asg.type === "checkoff" && <CheckoffReadOnly answersJson={sub.answersJson} />}
        </div>
      </div>
    </>
  );
}

function TextReadOnly({ text }: { text: string }) {
  return <p className="response" style={{ margin: 0 }}>{text || "—"}</p>;
}

function RubricReadOnly({ text, fileId }: { text: string; fileId: string | null }) {
  return (
    <>
      {text ? <p className="response" style={{ margin: 0 }}>{text}</p> : <p className="muted small">No written response.</p>}
      {fileId && (
        <a className="reslink small" href={`/files/${fileId}`} target="_blank" rel="noreferrer">
          ▤ Open the file you attached
        </a>
      )}
    </>
  );
}

function UploadReadOnly({ fileId, note }: { fileId: string | null; note: string }) {
  return (
    <>
      {note && <p className="response" style={{ marginTop: 0 }}>{note}</p>}
      {fileId ? (
        <a href={`/files/${fileId}`} target="_blank" rel="noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/files/${fileId}`}
            alt="Your turned-in work"
            style={{
              maxWidth: 340,
              width: "100%",
              border: "1px solid var(--rule)",
              borderRadius: 10,
              display: "block",
            }}
          />
        </a>
      ) : (
        <p className="muted small">No file was attached.</p>
      )}
    </>
  );
}

function CheckoffReadOnly({ answersJson }: { answersJson: string }) {
  const a = parseCheckoffAnswer(answersJson);
  return (
    <>
      <p style={{ margin: 0 }}>✓ You marked this complete.</p>
      {a.reflection && (
        <p className="small muted" style={{ margin: "8px 0 0" }}>
          <strong>Your reflection:</strong> {a.reflection}
        </p>
      )}
    </>
  );
}

function QuizReadOnly({
  asg,
  answersJson,
  graded,
}: {
  asg: { configJson: string };
  answersJson: string;
  graded: boolean;
}) {
  const items = parseItems(asg.configJson);
  const answers = parseQuizAnswers(answersJson);
  const valueOf = (id: string) => answers.find((x) => x.itemId === id)?.value;

  const shown = (it: Item): string => {
    const v = valueOf(it.id);
    if (v == null || v === "") return "—";
    if (it.kind === "mc") return it.choices?.[Number(v)] ?? String(v);
    if (it.kind === "tf") return Number(v) === 0 ? "True" : "False";
    return String(v);
  };
  // Only reveal correctness once the teacher has graded it.
  const correctness = (it: Item): boolean | null => {
    if (!graded || !itemIsAuto(it)) return null;
    const v = valueOf(it.id);
    if (v == null) return null;
    if (it.kind === "fill") return normalize(String(v)) === normalize(it.answer || "");
    return Number(v) === it.answerIndex;
  };

  return (
    <ol className="qgrade">
      {items.map((it) => {
        const ok = correctness(it);
        return (
          <li key={it.id}>
            <div className="qg-prompt">
              {it.prompt || "—"} <span className="small muted">({it.points} pts)</span>
            </div>
            <div className="qg-answer">
              <span className="muted">Your answer:</span> {shown(it)}{" "}
              {ok === true && <span className="ok">✓</span>}
              {ok === false && <span className="no">✗</span>}
            </div>
          </li>
        );
      })}
      {items.length === 0 && <li className="muted small">No questions.</li>}
    </ol>
  );
}
