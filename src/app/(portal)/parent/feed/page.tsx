import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { buildActivityFeed, type FeedItem } from "@/lib/activity";
import { fmt, today, periodStart } from "@/lib/dates";
import { Notice } from "@/components/ui";
import { reportAbsence } from "../../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Journal — Cohort" };

const ICON: Record<FeedItem["type"], string> = {
  work: "✓",
  observation: "✎",
  sample: "◆",
  attendance: "◷",
};
const KIND: Record<FeedItem["type"], string> = {
  work: "Graded work",
  observation: "A note from the teacher",
  sample: "Work sample",
  attendance: "Attendance",
};

export default async function ParentFeedPage({
  searchParams,
}: {
  searchParams: Promise<{ absence?: string }>;
}) {
  const { user } = await requireRole("parent");
  const sp = await searchParams;

  const ids: string[] = user.studentIdsJson ? JSON.parse(user.studentIdsJson) : [];
  const kids = (await prisma.student.findMany({ where: { id: { in: ids } } })).sort(
    (a, b) => ids.indexOf(a.id) - ids.indexOf(b.id)
  );
  const [feed, presentDays] = await Promise.all([
    buildActivityFeed(kids.map((k) => ({ id: k.id, name: k.name }))),
    prisma.attendance.count({
      where: { studentId: { in: ids }, status: "present", date: { gte: periodStart(), lte: today() } },
    }),
  ]);

  const multi = kids.length > 1;
  const newGrades = feed.filter((f) => f.type === "work").length;
  const samples = feed.filter((f) => f.type === "sample").length;
  const heading = multi ? "Your family journal" : `${kids[0]?.name.split(" ")[0] ?? "Your"}'s journal`;

  return (
    <>
      {sp.absence && <Notice tone="good">Absence reported — the teacher has been notified.</Notice>}

      <section className="journal-hero">
        <div className="kicker">The last 30 days</div>
        <h1 style={{ margin: "6px 0 0" }}>{heading}</h1>
        <p className="muted" style={{ margin: "8px 0 0", maxWidth: "52ch" }}>
          A running story of {multi ? "your children's" : "your child's"} days — the work, the wins, and
          the notes from the room.
        </p>
        <div className="glance">
          <div className="g">
            <strong>{presentDays}</strong> days present
          </div>
          <div className="g">
            <strong>{newGrades}</strong> graded {newGrades === 1 ? "piece" : "pieces"}
          </div>
          <div className="g">
            <strong>{samples}</strong> work {samples === 1 ? "sample" : "samples"}
          </div>
        </div>
      </section>

      <details className="card" style={{ margin: "16px 0" }}>
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>Report an absence</summary>
        <form action={reportAbsence} style={{ marginTop: 12 }}>
          <div className="row" style={{ gap: 12, alignItems: "flex-end" }}>
            <div style={{ flex: 1, minWidth: 150 }}>
              <label htmlFor="studentId">Child</label>
              <select id="studentId" name="studentId">
                {kids.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.name}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1, minWidth: 150 }}>
              <label htmlFor="date">Date</label>
              <input id="date" type="date" name="date" defaultValue={today()} required />
            </div>
            <div style={{ flex: 1, minWidth: 150 }}>
              <label htmlFor="note">Reason (optional)</label>
              <input id="note" name="note" placeholder="Doctor's appointment" />
            </div>
            <button className="btn sec">Send</button>
          </div>
        </form>
      </details>

      {feed.length ? (
        <div className="timeline">
          {feed.map((it) => (
            <div key={it.id} className="tl-item">
              <div className={`tl-dot ${it.type}`} aria-hidden>
                {ICON[it.type]}
              </div>
              <div className="tl-card">
                <div className="spread" style={{ gap: 8 }}>
                  <h2>{it.title}</h2>
                  <span className="when">{fmt(it.date)}</span>
                </div>
                <div className="small muted" style={{ margin: "1px 0 0" }}>
                  {multi ? `${it.studentName} · ` : ""}
                  {KIND[it.type]}
                </div>
                {it.detail && <div style={{ marginTop: 6 }}>{it.detail}</div>}
                {it.fileId && it.mime !== "application/pdf" && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={`/files/${it.fileId}`}
                    alt={it.title}
                    style={{
                      marginTop: 10,
                      maxWidth: 260,
                      width: "100%",
                      border: "1px solid var(--rule)",
                      borderRadius: 10,
                      display: "block",
                    }}
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            The story starts soon. As {multi ? "your children turn" : "your child turns"} in work and
            the teacher adds notes, it&apos;ll appear here.
          </p>
        </div>
      )}
    </>
  );
}
