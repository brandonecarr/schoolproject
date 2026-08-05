import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fmt } from "@/lib/dates";
import { Pill } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "My portfolio — Cohort" };

export default async function StudentPortfolioPage() {
  const { user } = await requireRole("student");
  const sid = user.studentId ?? "";

  const [subsRaw, files] = await Promise.all([
    prisma.submission.findMany({ where: { studentId: sid, status: "graded" } }),
    prisma.fileRec.findMany({ where: { studentId: sid }, orderBy: { capturedAt: "desc" } }),
  ]);
  const aIds = [...new Set(subsRaw.map((s) => s.assignmentId))];
  const assignments = await prisma.assignment.findMany({ where: { id: { in: aIds } } });
  const graded = subsRaw
    .map((x) => ({ x, a: assignments.find((y) => y.id === x.assignmentId) }))
    .sort((p, q) => ((p.x.gradedAt || "") < (q.x.gradedAt || "") ? 1 : -1));

  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">Everything you&apos;ve made</div>
          <h1>My portfolio</h1>
        </div>
      </div>

      <div className="eyebrow">Work samples</div>
      {files.length ? (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 10 }}>
          {files.map((f) => (
            <figure key={f.id} style={{ margin: 0, width: 150 }}>
              <a href={`/files/${f.id}`} target="_blank" rel="noopener noreferrer">
                {f.mime === "application/pdf" ? (
                  <div
                    className="small muted"
                    style={{
                      border: "1px solid var(--rule)",
                      borderRadius: 8,
                      padding: "26px 8px",
                      textAlign: "center",
                      background: "#fff",
                    }}
                  >
                    PDF
                  </div>
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={`/files/${f.id}`}
                    alt={f.label}
                    style={{ width: "100%", border: "1px solid var(--rule)", borderRadius: 8, display: "block" }}
                  />
                )}
              </a>
              <figcaption className="small muted" style={{ marginTop: 5 }}>
                {f.label}
              </figcaption>
            </figure>
          ))}
        </div>
      ) : (
        <p className="muted small" style={{ marginTop: 8 }}>
          No work samples yet — your teacher adds photos of your best work here.
        </p>
      )}

      <div className="sep" />
      <div className="eyebrow">Graded assignments</div>
      {graded.length ? (
        <div className="card" style={{ marginTop: 10, padding: "6px 18px" }}>
          {graded.map(({ x, a }) => (
            <div key={x.id} style={{ padding: "14px 0", borderTop: "1px solid var(--rule)" }}>
              <div className="spread">
                <div>
                  <strong>{a ? a.title : "—"}</strong>
                  <div className="small muted">{x.gradedAt ? fmt(x.gradedAt) : ""}</div>
                </div>
                <Pill tone="mark">
                  {x.score}/{a ? a.points : 0}
                </Pill>
              </div>
              {x.feedback && (
                <p className="small muted" style={{ margin: "6px 0 0" }}>
                  {x.feedback}
                </p>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="muted small" style={{ marginTop: 8 }}>
          Nothing graded yet. Turn work in and it&apos;ll land here.
        </p>
      )}
    </>
  );
}
