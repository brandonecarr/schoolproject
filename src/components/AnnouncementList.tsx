// Family-facing announcement list. Shared by the parent and student portals —
// the content and rules are identical, only the audience filter upstream differs.

import { Markdown } from "@/components/Markdown";
import { Pill } from "@/components/ui";
import { acknowledgeAnnouncement } from "@/app/(portal)/actions";

export type FamilyAnnouncement = {
  id: string;
  title: string;
  body: string;
  bodyFormat: string;
  authorName: string;
  pinned: boolean;
  requireAck: boolean;
  publishedAt: string | null;
};

function when(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric" });
}

export function AnnouncementList({
  items,
  ackedIds,
}: {
  items: FamilyAnnouncement[];
  ackedIds: Set<string>;
}) {
  if (items.length === 0) {
    return <p className="small muted">No announcements yet.</p>;
  }

  return (
    <>
      {items.map((a) => {
        const acked = ackedIds.has(a.id);
        const needs = a.requireAck && !acked;
        return (
          <div key={a.id} className="card" style={{ marginTop: 12 }}>
            <div className="spread">
              <div>
                <div className="eyebrow">
                  {when(a.publishedAt)} · {a.authorName}
                </div>
                <h3 style={{ margin: "4px 0 0" }}>{a.title}</h3>
              </div>
              <div className="row" style={{ gap: 8 }}>
                {a.pinned && <Pill tone="mark">Pinned</Pill>}
                {needs && <Pill tone="warn">Needs your confirmation</Pill>}
                {a.requireAck && acked && <Pill tone="good">Confirmed</Pill>}
              </div>
            </div>

            {a.body && (
              <div style={{ marginTop: 10 }}>
                <Markdown text={a.body} format={a.bodyFormat} />
              </div>
            )}

            {needs && (
              <form action={acknowledgeAnnouncement} style={{ marginTop: 12 }}>
                <input type="hidden" name="id" value={a.id} />
                <button className="btn sm">I&apos;ve read this</button>
                <span className="small muted" style={{ marginLeft: 10 }}>
                  The school is asked to keep a record that this reached you.
                </span>
              </form>
            )}
          </div>
        );
      })}
    </>
  );
}
