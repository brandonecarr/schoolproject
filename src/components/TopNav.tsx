"use client";

// Parent / student top navigation. Client component for active-link highlight.

import Link from "next/link";
import { usePathname } from "next/navigation";

const PARENT_LINKS = [
  { href: "/parent/feed", label: "Feed" },
  { href: "/parent", label: "Children" },
  { href: "/parent/reports", label: "Reports" },
  { href: "/parent/tuition", label: "Tuition" },
  { href: "/parent/messages", label: "Messages" },
];

const STUDENT_LINKS = [
  { href: "/student", label: "My work" },
  { href: "/student/portfolio", label: "Portfolio" },
  { href: "/student/messages", label: "Messages" },
];

export function TopNav({
  role,
  userName,
  messagesUnread = 0,
}: {
  role: string;
  userName: string;
  messagesUnread?: number;
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
