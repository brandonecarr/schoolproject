import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTeacher } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { today } from "@/lib/dates";
import { parseItems, quizMax, ITEM_KIND_LABEL } from "@/lib/lms";
import { Markdown } from "@/components/Markdown";
import { assignWorksheet, deleteWorksheet } from "../../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Worksheet — Cohort" };

export default async function WorksheetDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { school } = await requireTeacher();
  const { id } = await params;
  const ws = await prisma.worksheet.findFirst({ where: { id, schoolId: school!.id } });
  if (!ws) notFound();

  const [courses, students] = await Promise.all([
    prisma.course.findMany({ where: { schoolId: school!.id }, orderBy: { createdAt: "asc" } }),
    prisma.student.findMany({ where: { schoolId: school!.id }, orderBy: { name: "asc" } }),
  ]);
  const items = parseItems(ws.itemsJson);

  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">{ws.subject || "Worksheet"}</div>
          <h1>{ws.title}</h1>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <a className="btn" href={`/worksheets/${ws.id}/print`} target="_blank" rel="noreferrer">
            Print / Save as PDF
          </a>
          <Link className="btn ghost sm" href="/worksheets">
            ← Library
          </Link>
        </div>
      </div>

      <div className="cmd-grid">
        <div>
          {/* preview */}
          <div className="card">
            <div className="eyebrow">Preview</div>
            {ws.instructions && (
              <div style={{ margin: "6px 0 14px" }}>
                <Markdown text={ws.instructions} format={ws.instructionsFormat} />
              </div>
            )}
            <ol className="ws-preview">
              {items.map((it) => (
                <li key={it.id}>
                  <div className="wp-prompt">
                    {it.prompt || "—"}{" "}
                    <span className="small muted">
                      · {ITEM_KIND_LABEL[it.kind]} · {it.points} pts
                    </span>
                  </div>
                  {it.kind === "mc" && (
                    <ul className="wp-choices">
                      {(it.choices ?? []).map((c, i) => (
                        <li key={i} className={it.answerIndex === i ? "correct" : ""}>
                          {String.fromCharCode(65 + i)}. {c || "—"}
                        </li>
                      ))}
                    </ul>
                  )}
                  {it.kind === "tf" && (
                    <div className="small muted">
                      Answer: {it.answerIndex === 0 ? "True" : "False"}
                    </div>
                  )}
                  {it.kind === "fill" && it.answer && (
                    <div className="small muted">Answer: {it.answer}</div>
                  )}
                </li>
              ))}
              {items.length === 0 && <li className="muted">No questions.</li>}
            </ol>
            <div className="small muted" style={{ marginTop: 10 }}>
              {items.length} question{items.length === 1 ? "" : "s"} · {quizMax(items)} pts total
            </div>
          </div>
        </div>

        <div>
          {/* assign digitally */}
          <div className="card">
            <div className="eyebrow">Assign digitally</div>
            <p className="small muted" style={{ margin: "4px 0 12px" }}>
              Turns this worksheet into an auto-graded quiz for the students you choose.
            </p>
            {courses.length === 0 ? (
              <p className="small">
                Add a <Link href="/courses">course</Link> first.
              </p>
            ) : (
              <form action={assignWorksheet}>
                <input type="hidden" name="worksheetId" value={ws.id} />
                <label htmlFor="courseId">Course</label>
                <select id="courseId" name="courseId">
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <div className="row" style={{ gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <label htmlFor="assignedAt">Available from</label>
                    <input id="assignedAt" type="date" name="assignedAt" defaultValue={today()} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label htmlFor="dueDate">Due</label>
                    <input id="dueDate" type="date" name="dueDate" defaultValue={today()} />
                  </div>
                </div>

                <div className="eyebrow" style={{ marginTop: 12 }}>
                  Assign to
                </div>
                <p className="small muted" style={{ margin: "2px 0 8px" }}>
                  Leave all unchecked to assign to the whole class.
                </p>
                <div className="stu-check">
                  {students.map((s) => (
                    <label key={s.id} className="check">
                      <input type="checkbox" name="stu" value={s.id} /> {s.name}
                    </label>
                  ))}
                </div>

                <button className="btn mark" style={{ marginTop: 12, width: "100%", justifyContent: "center" }}>
                  Assign this worksheet
                </button>
              </form>
            )}
          </div>

          <form action={deleteWorksheet} className="card">
            <input type="hidden" name="id" value={ws.id} />
            <div className="eyebrow">Danger zone</div>
            <p className="small muted" style={{ margin: "4px 0 10px" }}>
              Deleting the worksheet won’t affect quizzes you’ve already assigned from it.
            </p>
            <button className="btn sec sm">Delete worksheet</button>
          </form>
        </div>
      </div>
    </>
  );
}
