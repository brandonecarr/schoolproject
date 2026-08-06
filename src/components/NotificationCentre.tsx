// The notification list, shared by all three roles. Server component: each row
// is a form that marks the notification read and follows its link, so the whole
// thing works without client JS.

import { requireUser } from "@/lib/auth";
import { notificationsFor } from "@/lib/notify";
import { fmt } from "@/lib/dates";
import {
  openNotification,
  markAllNotificationsRead,
  clearReadNotifications,
} from "@/lib/notify-actions";

const ICON: Record<string, string> = {
  graded: "✓",
  returned: "↩",
  submitted: "✎",
  absence: "◷",
  message: "✉",
  report: "◆",
  invoice: "$",
};

export async function NotificationCentre({ back }: { back: string }) {
  const { user } = await requireUser();
  const items = await notificationsFor(user.id);
  const unread = items.filter((n) => !n.readAt).length;

  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">What needs your attention</div>
          <h1>Notifications</h1>
        </div>
        {items.length > 0 && (
          <div className="row" style={{ gap: 8 }}>
            {unread > 0 && (
              <form action={markAllNotificationsRead}>
                <input type="hidden" name="back" value={back} />
                <button className="btn sec sm">Mark all read</button>
              </form>
            )}
            {items.some((n) => n.readAt) && (
              <form action={clearReadNotifications}>
                <input type="hidden" name="back" value={back} />
                <button className="btn ghost sm">Clear read</button>
              </form>
            )}
          </div>
        )}
      </div>

      {items.length === 0 ? (
        <div className="card">
          <h3 style={{ margin: 0 }}>Nothing yet</h3>
          <p className="muted small" style={{ margin: "8px 0 0" }}>
            You&apos;ll be told here when work is graded or turned in, when something is sent back for
            changes, when a message arrives, and when a report is ready.
          </p>
        </div>
      ) : (
        <div className="notif-list">
          {items.map((n) => (
            <form key={n.id} action={openNotification} className={`notif ${n.readAt ? "" : "unread"}`}>
              <input type="hidden" name="id" value={n.id} />
              <input type="hidden" name="fallback" value={back} />
              <button type="submit" className="notif-btn">
                <span className="notif-ic" aria-hidden>
                  {ICON[n.type] ?? "•"}
                </span>
                <span className="notif-main">
                  <span className="notif-title">{n.title}</span>
                  {n.body && <span className="notif-body">{n.body}</span>}
                  <span className="notif-when">
                    {fmt(n.createdAt.toISOString().slice(0, 10))}
                    {!n.readAt && " · new"}
                  </span>
                </span>
              </button>
            </form>
          ))}
        </div>
      )}
    </>
  );
}
