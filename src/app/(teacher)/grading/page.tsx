import { requireTeacher } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fmt } from "@/lib/dates";
import { Pill } from "@/components/ui";
import {
  typeMeta,
  parseItems,
  parseQuizAnswers,
  autoScoreQuiz,
  itemIsAuto,
  rubricConfig,
  normalize,
  type Item,
} from "@/lib/lms";
import { saveGrade, returnSubmission } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Grading — Cohort" };

export default async function GradingPage({
  searchParams,
}: {
  searchParams: Promise<{ graded?: string; returned?: string }>;
}) {
  const { school } = await requireTeacher();
  const schoolId = school!.id;
  const sp = await searchParams;

  const queueRaw = await prisma.submission.findMany({
    where: { schoolId, status: "submitted" },
    orderBy: { createdAt: "asc" },
  });
  const aIds = [...new Set(queueRaw.map((s) => s.assignmentId))];
  const sIds = [...new Set(queueRaw.map((s) => s.studentId))];
  const assignments = await prisma.assignment.findMany({ where: { id: { in: aIds } } });
  const students = await prisma.student.findMany({ where: { id: { in: sIds } } });
  const queue = queueRaw.map((s) => ({
    s,
    a: assignments.find((x) => x.id === s.assignmentId),
    st: students.find((x) => x.id === s.studentId),
  }));

  return (
    <>
      {sp.graded && (
        <div className="notice good">
          Graded. That feedback just strengthened this student&apos;s ESA evidence.
        </div>
      )}
      {sp.returned && (
        <div className="notice info">Sent back for revision. The student can turn it in again.</div>
      )}
      <div className="topbar">
        <div>
          <div className="eyebrow">Waiting on you</div>
          <h1>Grading queue</h1>
        </div>
      </div>

      {queue.length === 0 ? (
        <div className="card">
          <h3>Nothing waiting.</h3>
          <p className="muted" style={{ margin: "8px 0 0" }}>
            When students turn work in, it lands here. Quizzes and check-offs that grade themselves
            skip the queue.
          </p>
        </div>
      ) : (
        queue.map(({ s, a, st }) => {
          const m = typeMeta(a ? a.type : "written");
          return (
            <div key={s.id} className="card gradecard">
              <div className="spread">
                <div>
                  <div className="eyebrow">{st ? st.name : "—"}</div>
                  <h3 style={{ marginTop: 4 }}>
                    <span aria-hidden style={{ marginRight: 6 }}>
                      {m.icon}
                    </span>
                    {a ? a.title : "—"}
                  </h3>
                </div>
                <Pill tone="info">Due {fmt(a ? a.dueDate : null)}</Pill>
              </div>

              {/* type-specific view + inputs live inside the grade form */}
              <form action={saveGrade}>
                <input type="hidden" name="id" value={s.id} />

                {a && a.type === "quiz" && <QuizGrade a={a} answersJson={s.answersJson} />}
                {a && a.type === "rubric" && (
                  <RubricGrade a={a} responseText={s.responseText} fileId={s.fileId} />
                )}
                {a && a.type === "upload" && (
                  <UploadView fileId={s.fileId} note={s.responseText} />
                )}
                {a && (a.type === "written" || !["quiz", "rubric", "upload"].includes(a.type)) && (
                  <p className="response" style={{ margin: "10px 0 0" }}>
                    {s.responseText || "—"}
                  </p>
                )}

                <div className="row" style={{ gap: 12, alignItems: "flex-end", marginTop: 14 }}>
                  {a && (a.type === "written" || a.type === "upload") && (
                    <div style={{ width: 150 }}>
                      <label htmlFor={`sc_${s.id}`}>Score / {a ? a.points : 0}</label>
                      <input
                        id={`sc_${s.id}`}
                        name="score"
                        type="number"
                        min={0}
                        max={a ? a.points : 100}
                        required
                      />
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 240 }}>
                    <label htmlFor={`fb_${s.id}`}>Feedback the parent will see</label>
                    <input
                      id={`fb_${s.id}`}
                      name="feedback"
                      placeholder="Steps are clear now. Watch the remainder on #14."
                    />
                  </div>
                  <button className="btn mark">Save grade</button>
                </div>
              </form>

              {/* return for revision — a sibling form (forms can't nest) */}
              <details className="returnbox">
                <summary>Return for revision instead</summary>
                <form action={returnSubmission} className="row" style={{ gap: 10, marginTop: 10 }}>
                  <input type="hidden" name="id" value={s.id} />
                  <input
                    name="note"
                    style={{ flex: 1 }}
                    placeholder="Please redo #4 and show your steps."
                  />
                  <button className="btn sec sm">Send back</button>
                </form>
              </details>
            </div>
          );
        })
      )}
    </>
  );
}

// --- Quiz grading: show auto-graded results + inputs for short answers ---
function QuizGrade({
  a,
  answersJson,
}: {
  a: { configJson: string };
  answersJson: string;
}) {
  const items = parseItems(a.configJson);
  const answers = parseQuizAnswers(answersJson);
  const { auto, autoMax, needsManual } = autoScoreQuiz(items, answers);
  const answerOf = (id: string) => answers.find((x) => x.itemId === id)?.value;

  const isCorrect = (it: Item): boolean | null => {
    const v = answerOf(it.id);
    if (v == null) return null;
    if (it.kind === "mc" || it.kind === "tf") return Number(v) === it.answerIndex;
    if (it.kind === "fill" && it.answer) return normalize(String(v)) === normalize(it.answer);
    return null;
  };
  const shownAnswer = (it: Item): string => {
    const v = answerOf(it.id);
    if (v == null) return "—";
    if (it.kind === "mc") return it.choices?.[Number(v)] ?? String(v);
    if (it.kind === "tf") return Number(v) === 0 ? "True" : "False";
    return String(v);
  };

  return (
    <div style={{ marginTop: 10 }}>
      <div className="autoscore">
        Auto-graded: <strong>{auto}</strong> / {autoMax} on self-checking questions
        {needsManual && " · short answers need you below"}
      </div>
      <ol className="qgrade">
        {items.map((it) => {
          const correct = isCorrect(it);
          const isAuto = itemIsAuto(it);
          return (
            <li key={it.id}>
              <div className="qg-prompt">
                {it.prompt || "—"} <span className="small muted">({it.points} pts)</span>
              </div>
              <div className="qg-answer">
                <span className="muted">Answer:</span> {shownAnswer(it)}{" "}
                {correct === true && <span className="ok">✓</span>}
                {correct === false && <span className="no">✗</span>}
              </div>
              {!isAuto && (
                <div className="row" style={{ gap: 8, alignItems: "center", marginTop: 6 }}>
                  <label htmlFor={`sq_${it.id}`} className="small">
                    Points
                  </label>
                  <input
                    id={`sq_${it.id}`}
                    name={`sq_${it.id}`}
                    type="number"
                    min={0}
                    max={it.points}
                    defaultValue={0}
                    style={{ width: 90 }}
                  />
                  <span className="small muted">/ {it.points}</span>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// --- Rubric grading: a score box per criterion ---
function RubricGrade({
  a,
  responseText,
  fileId,
}: {
  a: { configJson: string };
  responseText: string;
  fileId: string | null;
}) {
  const { criteria } = rubricConfig(a.configJson);
  return (
    <div style={{ marginTop: 10 }}>
      {responseText && <p className="response">{responseText}</p>}
      {fileId && (
        <a className="reslink small" href={`/files/${fileId}`} target="_blank" rel="noreferrer">
          ▤ Open the attached file
        </a>
      )}
      <table className="rubric-grade" style={{ marginTop: 10 }}>
        <tbody>
          {criteria.map((c) => (
            <tr key={c.id}>
              <td>{c.label}</td>
              <td style={{ width: 150, textAlign: "right" }}>
                <input
                  name={`rc_${c.id}`}
                  type="number"
                  min={0}
                  max={c.max}
                  defaultValue={0}
                  style={{ width: 80 }}
                />
                <span className="small muted"> / {c.max}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// --- Upload view: preview the turned-in file ---
function UploadView({ fileId, note }: { fileId: string | null; note: string }) {
  return (
    <div style={{ marginTop: 10 }}>
      {note && <p className="response">{note}</p>}
      {fileId ? (
        <a href={`/files/${fileId}`} target="_blank" rel="noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/files/${fileId}`}
            alt="Turned-in work"
            style={{
              maxWidth: 320,
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
    </div>
  );
}
