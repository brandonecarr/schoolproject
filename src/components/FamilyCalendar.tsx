// The family-facing calendar: what's on, what's closed, what's due.
//
// Shared by the parent and student portals because the content is identical —
// only the set of students whose due dates are included differs, and that is
// resolved before this renders. Staff-only entries never reach it.

import Link from "next/link";
import { fmt } from "@/lib/dates";
import { Pill } from "@/components/ui";
import type { Tone } from "@/components/ui";

export type FamilyCalItem = {
  key: string;
  kind: "term" | "closure" | "event" | "due";
  title: string;
  startDate: string;
  endDate: string;
  note?: string;
  href?: string;
};

const KIND: Record<FamilyCalItem["kind"], { label: string; tone: Tone }> = {
  term: { label: "Term", tone: "good" },
  closure: { label: "Closed", tone: "bad" },
  event: { label: "Event", tone: "info" },
  due: { label: "Due", tone: "warn" },
};

export function FamilyCalendar({
  items,
  feedUrl,
  emptyNote,
}: {
  items: FamilyCalItem[];
  feedUrl: string | null;
  emptyNote: string;
}) {
  return (
    <>
      {items.length === 0 ? (
        <p className="small muted">{emptyNote}</p>
      ) : (
        <div className="rollbook" style={{ marginTop: 10 }}>
          {items.map((i) => {
            const k = KIND[i.kind];
            return (
              <div key={i.key} className="line">
                <span style={{ minWidth: 74 }}>
                  <Pill tone={k.tone}>{k.label}</Pill>
                </span>
                <span style={{ flex: 1 }}>
                  {i.href ? <Link href={i.href}>{i.title}</Link> : i.title}
                  {i.note ? <span className="small muted"> · {i.note}</span> : null}
                </span>
                <span className="small muted">
                  {fmt(i.startDate)}
                  {i.endDate !== i.startDate ? ` – ${fmt(i.endDate)}` : ""}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {feedUrl && (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="eyebrow">Add to your own calendar</div>
          <p className="small muted" style={{ margin: "6px 0 8px" }}>
            Subscribe to this URL in Apple Calendar, Google Calendar or Outlook and it keeps itself
            up to date. It is read-only.
          </p>
          <code className="small" style={{ wordBreak: "break-all" }}>
            {feedUrl}
          </code>
          <p className="small muted" style={{ margin: "8px 0 0" }}>
            Keep it private — anyone with this link can see your family&apos;s calendar. It shows
            term dates, closures and due dates only, never grades.
          </p>
        </div>
      )}
    </>
  );
}
