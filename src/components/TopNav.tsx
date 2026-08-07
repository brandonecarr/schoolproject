"use client";

// Parent / student top navigation.
//
// A horizontal bar can't accordion the way the teacher sidebar does, so the
// same problem — too many links — gets the horizontal answer: the handful a
// family actually opens stay in the bar, the rest go behind "More". Nine links
// fit on a laptop and wrap into a mess on a phone, which is where a parent
// mostly reads this.
//
// The split is by how often a family touches something, not by category. Home,
// alerts, the feed, news and messages are the week; children, reports, tuition
// and the calendar are occasional.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type NavLink = { href: string; label: string };

const PARENT_PRIMARY: NavLink[] = [
  { href: "/parent", label: "Home" },
  { href: "/parent/notifications", label: "Alerts" },
  { href: "/parent/feed", label: "Feed" },
  { href: "/parent/announcements", label: "News" },
  { href: "/parent/messages", label: "Messages" },
];
const PARENT_MORE: NavLink[] = [
  { href: "/parent/calendar", label: "Calendar" },
  { href: "/parent/children", label: "Children" },
  { href: "/parent/reports", label: "Reports" },
  { href: "/parent/tuition", label: "Tuition" },
];

const STUDENT_PRIMARY: NavLink[] = [
  { href: "/student", label: "Home" },
  { href: "/student/notifications", label: "Alerts" },
  { href: "/student/work", label: "My work" },
  { href: "/student/announcements", label: "News" },
  { href: "/student/messages", label: "Messages" },
];
const STUDENT_MORE: NavLink[] = [
  { href: "/student/path", label: "My path" },
  { href: "/student/calendar", label: "Calendar" },
  { href: "/student/portfolio", label: "Portfolio" },
];

export function TopNav({
  role,
  userName,
  messagesUnread = 0,
  notificationsUnread = 0,
}: {
  role: string;
  userName: string;
  messagesUnread?: number;
  notificationsUnread?: number;
}) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  const isParent = role === "parent";
  const primary = isParent ? PARENT_PRIMARY : role === "student" ? STUDENT_PRIMARY : [];
  const more = isParent ? PARENT_MORE : role === "student" ? STUDENT_MORE : [];
  const home = isParent ? "/parent" : "/student";

  // Home is exact-only; everything else may own its children.
  const on = (href: string) =>
    pathname === href || (href !== home && pathname.startsWith(href + "/")) ? "on" : "";

  // A menu that stays open after you click away is worse than no menu.
  useEffect(() => {
    if (!moreOpen) return;
    const close = (e: MouseEvent) => {
      if (!moreRef.current?.contains(e.target as Node)) setMoreOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMoreOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [moreOpen]);

  // Close on navigation, or it hangs over the page you just opened.
  useEffect(() => setMoreOpen(false), [pathname]);

  const badge = (href: string) =>
    href.endsWith("/messages") ? messagesUnread : href.endsWith("/notifications") ? notificationsUnread : 0;

  const item = (l: NavLink) => {
    const n = badge(l.href);
    return (
      <Link key={l.href} href={l.href} className={on(l.href)}>
        {l.label}
        {n > 0 && <span className="nav-badge">{n}</span>}
      </Link>
    );
  };

  // If the current page lives under More, say so on the button rather than
  // leaving the bar with nothing highlighted.
  const moreHoldsActive = more.some((l) => on(l.href) === "on");

  return (
    <div className="tnav">
      <strong style={{ fontFamily: "var(--serif)", fontSize: 17 }}>Cohort</strong>
      {primary.map(item)}

      {more.length > 0 && (
        <div className="tnav-more" ref={moreRef}>
          <button
            type="button"
            className={`tnav-morebtn ${moreHoldsActive ? "on" : ""}`}
            onClick={() => setMoreOpen((v) => !v)}
            aria-expanded={moreOpen}
            aria-haspopup="true"
          >
            More <span aria-hidden>▾</span>
          </button>
          {moreOpen && <div className="tnav-menu">{more.map(item)}</div>}
        </div>
      )}

      <span className="sp" />
      <span style={{ fontSize: 13, color: "#d5deee" }}>{userName}</span>
      {/* A form, not a link — see the note in src/app/logout/route.ts. */}
      <form method="post" action="/logout">
        <button type="submit" className="signout">
          Sign out
        </button>
      </form>
    </div>
  );
}
