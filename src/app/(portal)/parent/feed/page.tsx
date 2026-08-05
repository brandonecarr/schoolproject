import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { buildActivityFeed, type FeedItem } from "@/lib/activity";
import { fmt, today } from "@/lib/dates";
import { Notice } from "@/components/ui";
import { reportAbsence } from "../../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Feed — Cohort" };

const ICON: Record<FeedItem["type"], string> = {
  work: "✅",
  observation: "📝",
  sample: "📷",
  attendance: "🗓️",
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
  const feed = await buildActivityFeed(kids.map((k) => ({ id: k.id, name: k.name })));
  const multi = kids.length > 1;

  return (
    <>
      {sp.absence && <Notice tone="good">Absence reported — the teacher has been notified.</Notice>}
      <div className="topbar">
        <div>
          <div className="eyebrow">Your family</div>
          <h1>Activity</h1>
        </div>
      </div>

      <details className="card" style={{ marginBottom: 16 }}>
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>Report an absence</summary>
        <form action={reportAbsence} style={{ marginTop: 12 }}>
          <div className="row" style={{ gap: 12, alignItems: "flex-end" }}>
            <div style={{ minWidth: 160 }}>
              <label htmlFor="studentId">Child</label>
              <select id="studentId" name="studentId">
                {kids.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.name}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ width: 170 }}>
              <label htmlFor="date">Date</label>
              <input id="date" type="date" name="date" defaultValue={today()} required />
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label htmlFor="note">Reason (optional)</label>
              <input id="note" name="note" placeholder="Doctor's appointment" />
            </div>
            <button className="btn sec">Send</button>
          </div>
        </form>
      </details>

      {feed.length ? (
        <div className="feed">
          {feed.map((it) => (
            <div key={it.id} className="feed-item">
              <div className={`feed-icon ${it.type}`} aria-hidden>
                {ICON[it.type]}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="spread" style={{ gap: 8 }}>
                  <strong>{it.title}</strong>
                  <span className="small muted">{fmt(it.date)}</span>
                </div>
                <div className="small muted" style={{ marginBottom: 2 }}>
                  {multi ? `${it.studentName} · ` : ""}
                  {it.type === "work"
                    ? "Graded work"
                    : it.type === "observation"
                      ? "Teacher note"
                      : it.type === "sample"
                        ? "Work sample"
                        : "Attendance"}
                </div>
                {it.detail && <div style={{ marginTop: 2 }}>{it.detail}</div>}
                {it.fileId && it.mime !== "application/pdf" && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={`/files/${it.fileId}`}
                    alt={it.title}
                    style={{
                      marginTop: 8,
                      maxWidth: 220,
                      width: "100%",
                      border: "1px solid var(--rule)",
                      borderRadius: 8,
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
            Nothing here yet. As your {kids.length > 1 ? "children turn" : "child turns"} in work and
            the teacher adds notes, it&apos;ll show up here.
          </p>
        </div>
      )}
    </>
  );
}
