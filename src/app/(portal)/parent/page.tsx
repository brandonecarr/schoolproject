import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { evidenceFor } from "@/lib/evidence";
import { fmt } from "@/lib/dates";
import { Pill, Notice } from "@/components/ui";
import { createStudentAccount } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "My children — Cohort" };

export default async function ParentPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string }>;
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
      return { k, e, kidUser, graded, open };
    })
  );

  return (
    <>
      {sp.created && (
        <Notice tone="good">
          Your child&apos;s login is ready. They can sign in with the password you set.
        </Notice>
      )}
      {blocks.map(({ k, e, kidUser, graded, open }) => (
        <div key={k.id} className="card">
          <div className="spread">
            <div>
              <div className="eyebrow">Grade {k.grade}</div>
              <h2>{k.name}</h2>
            </div>
            <Pill tone="info">
              {e.presentDays} of {e.attendance.length} days present
            </Pill>
          </div>

          <div className="sep" style={{ margin: "16px 0" }} />
          <div className="eyebrow">Graded work</div>
          <div className="rollbook" style={{ marginTop: 8 }}>
            {graded.length ? (
              graded.map((s) => (
                <div key={s.id} className="line">
                  <span style={{ flex: 1 }}>{s.assignmentTitle}</span>
                  <span className="mono">
                    {s.score}/{s.points}
                  </span>
                </div>
              ))
            ) : (
              <div className="line muted">Nothing graded yet</div>
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

          <div className="sep" style={{ margin: "16px 0" }} />
          <div className="eyebrow">Still to do</div>
          <div className="rollbook" style={{ marginTop: 8 }}>
            {open.length ? (
              open.map((s) => (
                <div key={s.id} className="line">
                  <span style={{ flex: 1 }}>{s.assignmentTitle}</span>
                  <span className="mono">due {fmt(s.dueDate)}</span>
                </div>
              ))
            ) : (
              <div className="line muted">All caught up</div>
            )}
          </div>

          <div className="sep" style={{ margin: "16px 0" }} />
          {kidUser ? (
            <p className="small muted" style={{ margin: 0 }}>
              {k.name.split(" ")[0]} has a login (<span className="mono">{kidUser.email}</span>) and can
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
        </div>
      ))}
    </>
  );
}
