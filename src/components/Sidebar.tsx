"use client";

// Teacher console sidebar. Client component so it can highlight the active link
// via usePathname (the MVP passed a `nav` key server-side; here we derive it).

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/icons";

const NAV: { group: string; items: { href: string; label: string; icon: string }[] }[] = [
  {
    group: "Today",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
      { href: "/notifications", label: "Notifications", icon: "messages" },
      { href: "/attendance", label: "Attendance", icon: "attendance" },
      { href: "/observations", label: "Observations", icon: "observations" },
    ],
  },
  {
    group: "Learning",
    items: [
      { href: "/courses", label: "Courses", icon: "courses" },
      { href: "/pages", label: "Pages", icon: "courses" },
      { href: "/modules", label: "Modules", icon: "courses" },
      { href: "/syllabus", label: "Syllabus", icon: "courses" },
      { href: "/assignments", label: "Assignments", icon: "assignments" },
      { href: "/worksheets", label: "Worksheets", icon: "assignments" },
      { href: "/banks", label: "Question banks", icon: "assignments" },
      { href: "/grading", label: "Grading queue", icon: "grading" },
      { href: "/gradebook", label: "Gradebook", icon: "grading" },
      { href: "/paths", label: "Mastery paths", icon: "evidence" },
      { href: "/outcomes", label: "Standards", icon: "evidence" },
      { href: "/mastery", label: "Mastery board", icon: "evidence" },
    ],
  },
  {
    group: "People",
    items: [
      { href: "/students", label: "Students", icon: "students" },
      { href: "/reports", label: "Records & exports", icon: "evidence" },
      { href: "/invites", label: "Invite families", icon: "invites" },
    ],
  },
  {
    group: "Money",
    items: [
      { href: "/evidence", label: "Evidence board", icon: "evidence" },
      { href: "/invoices", label: "ESA invoices", icon: "invoices" },
      { href: "/billing", label: "Tuition", icon: "billing" },
      { href: "/cashflow", label: "Cash flow", icon: "cashflow" },
    ],
  },
  {
    group: "Family",
    items: [{ href: "/messages", label: "Messages", icon: "messages" }],
  },
  {
    group: "Admin",
    items: [
      { href: "/settings", label: "Settings", icon: "settings" },
      { href: "/audit", label: "Audit log", icon: "audit" },
    ],
  },
];

export function Sidebar({
  schoolName,
  schoolState,
  railLabel,
  userName,
  messagesUnread = 0,
  notificationsUnread = 0,
}: {
  schoolName: string;
  schoolState: string;
  railLabel: string;
  userName: string;
  messagesUnread?: number;
  notificationsUnread?: number;
}) {
  const pathname = usePathname();
  const isOn = (href: string) =>
    pathname === href || (href !== "/dashboard" && pathname.startsWith(href + "/"));

  return (
    <nav className="side">
      <div className="brand">
        <div className="brand-mark">C</div>
        <div className="brand-name">Cohort</div>
      </div>
      <div className="schoolname">
        {schoolName}
        <br />
        {schoolState} &middot; {railLabel}
      </div>
      {NAV.map((section) => (
        <div key={section.group}>
          <div className="navgroup">{section.group}</div>
          {section.items.map((item) => (
            <Link key={item.href} href={item.href} className={isOn(item.href) ? "on" : ""}>
              <Icon name={item.icon} />
              <span style={{ flex: 1 }}>{item.label}</span>
              {item.href === "/messages" && messagesUnread > 0 && (
                <span className="nav-badge">{messagesUnread}</span>
              )}
              {item.href === "/notifications" && notificationsUnread > 0 && (
                <span className="nav-badge">{notificationsUnread}</span>
              )}
            </Link>
          ))}
        </div>
      ))}
      <div className="foot">
        {userName}
        <br />
        {/* A form, not a link: signing out is destructive, so it must not be
            reachable by a prefetch, a preload, or a stray GET. */}
        <form method="post" action="/logout">
          <button type="submit" className="signout">
            Sign out
          </button>
        </form>
      </div>
    </nav>
  );
}
