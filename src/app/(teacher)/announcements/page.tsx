// Announcements — the school talking to everyone at once.
//
// The thing this replaces is sending the same message to twelve families one
// thread at a time, which is both tedious and impossible to audit. So the page
// is built around the two questions a teacher actually has afterwards: did it
// go out, and did anyone read it.

import { requireSchoolTeacher } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AUDIENCES } from "@/lib/announcements";
import { Markdown } from "@/components/Markdown";
import { MarkdownField } from "@/components/MarkdownField";
import { Pill, Notice } from "@/components/ui";
import { saveAnnouncement, deleteAnnouncement, togglePinAnnouncement } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Announcements — Cohort" };

function when(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default async function AnnouncementsPage({
  searchParams,
}: {
  searchParams: Promise<{ published?: string; saved?: string; deleted?: string; error?: string }>;
}) {
  const { school } = await requireSchoolTeacher();
  const sp = await searchParams;

  const items = await prisma.announcement.findMany({
    where: { schoolId: school!.id },
    orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
    take: 50,
  });

  // Acknowledgement counts, and how many people were asked. One grouped query.
  const ackRows = await prisma.announcementAck.groupBy({
    by: ["announcementId"],
    _count: { _all: true },
  });
  const ackCount = new Map(ackRows.map((r) => [r.announcementId, r._count._all]));

  const familyCounts = await prisma.user.groupBy({
    by: ["role"],
    where: { schoolId: school!.id, role: { in: ["parent", "student"] } },
    _count: { _all: true },
  });
  const nParents = familyCounts.find((r) => r.role === "parent")?._count._all ?? 0;
  const nStudents = familyCounts.find((r) => r.role === "student")?._count._all ?? 0;
  const reach = (audience: string) =>
    audience === "parents" ? nParents : audience === "students" ? nStudents : nParents + nStudents;

  const drafts = items.filter((a) => !a.publishedAt);

  return (
    <>
      <div className="eyebrow">Family</div>
      <h1>Announcements</h1>
      <p className="small muted" style={{ maxWidth: "72ch" }}>
        One notice to everyone, rather than the same message typed into twelve
        conversations. Publishing sends an in-app notification; editing afterwards does not send
        another.
      </p>

      {sp.published && <Notice tone="good">Published and notified.</Notice>}
      {sp.saved && <Notice tone="good">Saved as a draft. Nobody has been notified.</Notice>}
      {sp.deleted && <Notice tone="good">Deleted.</Notice>}
      {sp.error === "title" && <Notice tone="bad">A title is required.</Notice>}
      {drafts.length > 0 && (
        <Notice tone="warn">
          {drafts.length} draft{drafts.length === 1 ? "" : "s"} not yet published — families
          can&apos;t see {drafts.length === 1 ? "it" : "them"}.
        </Notice>
      )}

      <details className="card" open={items.length === 0}>
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>Write an announcement</summary>
        <form action={saveAnnouncement} style={{ marginTop: 10 }}>
          <div className="row" style={{ gap: 12 }}>
            <div style={{ flex: 2, minWidth: 220 }}>
              <label htmlFor="title">Title</label>
              <input id="title" name="title" required placeholder="Closed Friday for in-service" />
            </div>
            <div style={{ flex: 1, minWidth: 170 }}>
              <label htmlFor="audience">Who sees it</label>
              <select id="audience" name="audience" defaultValue="all">
                {AUDIENCES.map((x) => (
                  <option key={x.value} value={x.value}>
                    {x.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ marginTop: 10 }}>
            <MarkdownField
              name="body"
              label="Message"
              rows={7}
              placeholder="School is closed this Friday for teacher in-service. Normal hours resume Monday."
              hint="Families see this formatted."
            />
          </div>

          <div className="row" style={{ gap: 18, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
            <label className="row small" style={{ gap: 6, alignItems: "center", margin: 0 }}>
              <input type="checkbox" name="pinned" /> Pin to the top
            </label>
            <label className="row small" style={{ gap: 6, alignItems: "center", margin: 0 }}>
              <input type="checkbox" name="requireAck" /> Ask families to confirm they&apos;ve read it
            </label>
            <span className="sp" />
            <button name="intent" value="draft" className="btn ghost">
              Save draft
            </button>
            <button name="intent" value="publish" className="btn mark">
              Publish now
            </button>
          </div>
          <p className="small muted" style={{ margin: "10px 0 0" }}>
            “Confirm they&apos;ve read it” turns a broadcast into a record — worth it for a closure
            or a policy change, noise for a reminder.
          </p>
        </form>
      </details>

      {items.length === 0 ? (
        <p className="small muted" style={{ marginTop: 14 }}>
          Nothing posted yet.
        </p>
      ) : (
        items.map((a) => {
          const acked = ackCount.get(a.id) ?? 0;
          const total = reach(a.audience);
          const audienceLabel = AUDIENCES.find((x) => x.value === a.audience)?.label ?? a.audience;
          return (
            <div key={a.id} className="card" style={{ marginTop: 12 }}>
              <div className="spread">
                <div>
                  <div className="eyebrow">
                    {audienceLabel}
                    {a.publishedAt ? ` · published ${when(a.publishedAt)}` : ""} · {a.authorName}
                  </div>
                  <h2 style={{ margin: "4px 0 0" }}>{a.title}</h2>
                </div>
                <div className="row" style={{ gap: 8 }}>
                  {a.pinned && <Pill tone="mark">Pinned</Pill>}
                  {a.publishedAt ? <Pill tone="good">Published</Pill> : <Pill tone="warn">Draft</Pill>}
                </div>
              </div>

              {a.body && (
                <div style={{ marginTop: 10 }}>
                  <Markdown text={a.body} format={a.bodyFormat} />
                </div>
              )}

              {a.requireAck && a.publishedAt && (
                <p className="small" style={{ margin: "10px 0 0" }}>
                  <strong>
                    {acked} of {total}
                  </strong>{" "}
                  {total === 1 ? "person has" : "people have"} confirmed reading this.
                  {acked < total && (
                    <span className="muted">
                      {" "}
                      The rest have been notified but haven&apos;t opened it.
                    </span>
                  )}
                </p>
              )}

              <div className="row" style={{ gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                {!a.publishedAt && (
                  <form action={saveAnnouncement}>
                    <input type="hidden" name="id" value={a.id} />
                    <input type="hidden" name="title" value={a.title} />
                    <input type="hidden" name="body" value={a.body} />
                    <input type="hidden" name="audience" value={a.audience} />
                    {a.pinned && <input type="hidden" name="pinned" value="on" />}
                    {a.requireAck && <input type="hidden" name="requireAck" value="on" />}
                    <button name="intent" value="publish" className="btn sm mark">
                      Publish
                    </button>
                  </form>
                )}
                <form action={togglePinAnnouncement}>
                  <input type="hidden" name="id" value={a.id} />
                  <button className="btn ghost sm">{a.pinned ? "Unpin" : "Pin"}</button>
                </form>
                <form action={deleteAnnouncement}>
                  <input type="hidden" name="id" value={a.id} />
                  <button className="btn ghost sm">Delete</button>
                </form>
              </div>
            </div>
          );
        })
      )}
    </>
  );
}
