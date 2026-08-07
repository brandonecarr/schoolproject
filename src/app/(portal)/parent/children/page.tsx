import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { evidenceFor } from "@/lib/evidence";
import { fmt } from "@/lib/dates";
import { Pill, Notice } from "@/components/ui";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { StandardsSummary } from "@/components/StandardsSummary";
import { masteryForStudent } from "@/lib/mastery";
import { createStudentAccount, deleteChildData } from "../../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "My children — Cohort" };

export default async function ParentChildrenPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string; deleted?: string }>;
}) {
  const { user } = await requireRole("parent");
  const sp = await searchParams;

  const ids: string[] = user.studentIdsJson ? JSON.parse(user.studentIdsJson) : [];
  const kids = (
    await prisma.student.findMany({ where: { id: { in: ids } } })
  ).sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));

  const blocks = await Promise.all(
    kids.map(async (k) => {
      const e = await evidenceFor(k.id);
      const kidUser = await prisma.user.findFirst({ where: { role: "student", studentId: k.id } });
      const graded = e.submissions.filter((s) => s.status === "graded");
      const open = e.submissions.filter((s) => s.status === "assigned");
      const mastery = await masteryForStudent(k.id, user.schoolId);
      return { k, e, kidUser, graded, open, mastery };
    })
  );

  return (
    <>
      <div className="spread" style={{ alignItems: "flex-end", marginBottom: 6 }}>
        <div>
          <div className="eyebrow">Your family</div>
          <h1 style={{ margin: "2px 0 0" }}>Children</h1>
        </div>
        <Link className="small" href="/parent">
          ← Home
        </Link>
      </div>

      {sp.created && (
        <Notice tone="good">
          Your child&apos;s login is ready. They can sign in with the password you set.
        </Notice>
      )}
      {sp.deleted && (
        <Notice tone="good">Your child&apos;s data has been permanently deleted.</Notice>
      )}
      {blocks.map(({ k, e, kidUser, graded, open, mastery }) => (
        <div key={k.id} className="card2" style={{ marginTop: 12 }}>
          <div className="spread">
            <div>
              <div className="eyebrow">Grade {k.grade}</div>
              <h2>{k.name}</h2>
            </div>
            <div className="row" style={{ gap: 10, alignItems: "center" }}>
              <Pill tone="info">
                {e.presentDays} of {e.attendance.length} days present
              </Pill>
              <Link className="btn ghost sm" href={`/parent/portfolio/${k.id}`}>
                Portfolio
              </Link>
              <a
                className="btn ghost sm"
                href={`/records/${k.id}/print`}
                target="_blank"
                rel="noreferrer"
                title="A printable record of everything the school has logged"
              >
                Download record
              </a>
            </div>
          </div>

          <div className="sep" style={{ margin: "16px 0" }} />
          <div className="eyebrow">Graded work</div>
          <div style={{ marginTop: 8 }}>
            {graded.length ? (
              graded.map((s) => (
                <div key={s.id} className="gradedrow">
                  <span style={{ flex: 1 }}>{s.assignmentTitle}</span>
                  <span className="scorepill">
                    {s.score}/{s.points}
                  </span>
                </div>
              ))
            ) : (
              <div className="gradedrow muted">Nothing graded yet</div>
            )}
          </div>
          {graded
            .filter((s) => s.feedback)
            .slice(0, 2)
            .map((s) => (
              <p key={s.id} className="small" style={{ margin: "10px 0 0" }}>
                <strong>{s.assignmentTitle}:</strong> {s.feedback}
              </p>
            ))}

          {mastery.summary.assessed > 0 && (
            <>
              <div className="sep" style={{ margin: "16px 0" }} />
              <StandardsSummary
                outcomes={mastery.outcomes}
                rollups={mastery.rollups}
                summary={mastery.summary}
                heading="Standards progress"
                audience="family"
                limit={6}
                showEmpty={false}
              />
            </>
          )}

          <div className="sep" style={{ margin: "16px 0" }} />
          <div className="eyebrow">Still to do</div>
          <div className="rollbook" style={{ marginTop: 8 }}>
            {open.length ? (
              open.map((s) => (
                <div key={s.id} className="gradedrow">
                  <span style={{ flex: 1 }}>{s.assignmentTitle}</span>
                  <span className="scorepill">due {fmt(s.dueDate)}</span>
                </div>
              ))
            ) : (
              <div className="line muted">All caught up</div>
            )}
          </div>

          <div className="sep" style={{ margin: "16px 0" }} />
          {kidUser ? (
            <p className="small muted" style={{ margin: 0 }}>
              {k.name.split(" ")[0]} has a login (<span className="scorepill">{kidUser.email}</span>) and can
              submit work from home.
            </p>
          ) : (
            <>
              <div className="eyebrow">Give {k.name.split(" ")[0]} a login</div>
              <p className="small muted" style={{ margin: "6px 0 10px" }}>
                You create your child&apos;s account yourself. Nobody else can — that&apos;s how we make
                sure a parent has actually consented.
              </p>
              <form action={createStudentAccount}>
                <input type="hidden" name="studentId" value={k.id} />
                <div className="row" style={{ gap: 12, alignItems: "flex-end" }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <label htmlFor={`e_${k.id}`}>Login email for your child</label>
                    <input id={`e_${k.id}`} name="email" type="email" required />
                  </div>
                  <div style={{ width: 180 }}>
                    <label htmlFor={`p_${k.id}`}>Password</label>
                    <input id={`p_${k.id}`} name="password" type="password" minLength={8} required />
                  </div>
                  <button className="btn mark">Create login</button>
                </div>
              </form>
            </>
          )}

          <div className="sep" style={{ margin: "16px 0" }} />
          <details>
            <summary className="small muted" style={{ cursor: "pointer" }}>
              Delete {k.name.split(" ")[0]}&apos;s data
            </summary>
            <p className="small muted" style={{ margin: "8px 0 10px", maxWidth: "60ch" }}>
              Permanently removes everything we hold about {k.name.split(" ")[0]} — coursework,
              attendance, notes, work samples, and any login. This cannot be undone.
            </p>
            <form action={deleteChildData}>
              <input type="hidden" name="studentId" value={k.id} />
              <ConfirmSubmit
                className="btn ghost sm"
                message={`Permanently delete all of ${k.name}'s data? This cannot be undone.`}
              >
                Delete my child&apos;s data
              </ConfirmSubmit>
            </form>
          </details>
        </div>
      ))}
    </>
  );
}
