"use client";

// Parent / student top navigation. Client component for active-link highlight.

import Link from "next/link";
import { usePathname } from "next/navigation";

const PARENT_LINKS = [
  { href: "/parent", label: "Home" },
  { href: "/parent/notifications", label: "Alerts" },
  { href: "/parent/feed", label: "Feed" },
  { href: "/parent/children", label: "Children" },
  { href: "/parent/reports", label: "Reports" },
  { href: "/parent/tuition", label: "Tuition" },
  { href: "/parent/messages", label: "Messages" },
];

const STUDENT_LINKS = [
  { href: "/student", label: "Home" },
  { href: "/student/notifications", label: "Alerts" },
  { href: "/student/work", label: "My work" },
  { href: "/student/portfolio", label: "Portfolio" },
  { href: "/student/messages", label: "Messages" },
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
  const on = (href: string) =>
    pathname === href || (href !== "/parent" && href !== "/student" && pathname.startsWith(href + "/"))
      ? "on"
      : "";

  const links = role === "parent" ? PARENT_LINKS : role === "student" ? STUDENT_LINKS : [];

  return (
    <div className="tnav">
      <strong style={{ fontFamily: "var(--serif)", fontSize: 17 }}>Cohort</strong>
      {links.map((l) => (
        <Link key={l.href} href={l.href} className={on(l.href)}>
          {l.label}
          {l.href.endsWith("/messages") && messagesUnread > 0 && (
            <span className="nav-badge">{messagesUnread}</span>
          )}
          {l.href.endsWith("/notifications") && notificationsUnread > 0 && (
            <span className="nav-badge">{notificationsUnread}</span>
          )}
        </Link>
      ))}
      <span className="sp" />
      <span style={{ fontSize: 13, color: "#d5deee" }}>{userName}</span>
      <Link href="/logout" style={{ color: "#d5deee" }}>
        Sign out
      </Link>
    </div>
  );
}
