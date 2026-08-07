// The first row inside the content panel.
//
// Not a fixed header — it inherits the panel surface and scrolls with it, which
// is why there is no background or sticky positioning here.
//
// ON THE MISSING SEARCH FIELD. The handoff puts a search input at the left of
// this bar on every screen. It isn't here yet, deliberately: there is no search
// backend, and an input that swallows what you type is worse than an absent
// one — it looks finished and isn't. The layout leaves the slot open (the
// spacer collapses), so adding it later is a one-component change once there
// is something behind it.

import Link from "next/link";
import { Icon } from "@/components/icons";

const ROLE_LABEL: Record<string, string> = {
  owner: "Lead teacher · Owner",
  teacher: "Teacher",
  parent: "Parent",
  student: "Student",
};

/** First letter of each of the first two words — "Sarah Whitfield" → "SW". */
function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export function TopBar({
  userName,
  roleLabel,
  notificationsHref,
  messagesHref,
  settingsHref,
  notificationsUnread = 0,
  messagesUnread = 0,
}: {
  userName: string;
  /** "Parent of Ivy, Grade 2" — falls back to the plain role name. */
  roleLabel: string;
  notificationsHref: string;
  messagesHref: string;
  /** Families have no settings page; the control is omitted rather than
   *  linking somewhere they'll be bounced out of. */
  settingsHref?: string;
  notificationsUnread?: number;
  messagesUnread?: number;
}) {
  return (
    <div className="topbar2">
      <div className="spacer" />

      <Link
        href={notificationsHref}
        className="iconbtn"
        aria-label={
          notificationsUnread > 0 ? `Notifications, ${notificationsUnread} unread` : "Notifications"
        }
      >
        <Icon name="bell" />
        {notificationsUnread > 0 && <span className="dot" />}
      </Link>

      <Link
        href={messagesHref}
        className="iconbtn"
        aria-label={messagesUnread > 0 ? `Messages, ${messagesUnread} unread` : "Messages"}
      >
        <Icon name="messages" />
        {messagesUnread > 0 && <span className="dot" />}
      </Link>

      {settingsHref && (
        <Link href={settingsHref} className="iconbtn" aria-label="Settings">
          <Icon name="settings" />
        </Link>
      )}

      <span className="vr" aria-hidden />

      <div className="whoami">
        <div className="av" aria-hidden>
          {initialsOf(userName)}
        </div>
        <div>
          <div className="nm">{userName}</div>
          <div className="rl">{roleLabel || ROLE_LABEL[""] || ""}</div>
        </div>
      </div>
    </div>
  );
}

export { ROLE_LABEL };
