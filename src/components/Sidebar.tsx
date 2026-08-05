"use client";

// Teacher console sidebar. Client component so it can highlight the active link
// via usePathname (the MVP passed a `nav` key server-side; here we derive it).

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV: { group: string; items: { href: string; label: string }[] }[] = [
  {
    group: "Today",
    items: [
      { href: "/dashboard", label: "Dashboard" },
      { href: "/attendance", label: "Attendance" },
      { href: "/observations", label: "Observations" },
    ],
  },
  {
    group: "Learning",
    items: [
      { href: "/courses", label: "Courses" },
      { href: "/assignments", label: "Assignments" },
      { href: "/grading", label: "Grading queue" },
    ],
  },
  {
    group: "People",
    items: [
      { href: "/students", label: "Students" },
      { href: "/invites", label: "Invite families" },
    ],
  },
  {
    group: "Money",
    items: [
      { href: "/evidence", label: "Evidence board" },
      { href: "/invoices", label: "ESA invoices" },
      { href: "/billing", label: "Tuition" },
      { href: "/cashflow", label: "Cash flow" },
    ],
  },
  {
    group: "Admin",
    items: [
      { href: "/settings", label: "Settings" },
      { href: "/audit", label: "Audit log" },
    ],
  },
];

export function Sidebar({
  schoolName,
  schoolState,
  railLabel,
  userName,
}: {
  schoolName: string;
  schoolState: string;
  railLabel: string;
  userName: string;
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
              {item.label}
            </Link>
          ))}
        </div>
      ))}
      <div className="foot">
        {userName}
        <br />
        <Link href="/logout" style={{ padding: "6px 0", display: "inline-block" }}>
          Sign out
        </Link>
      </div>
    </nav>
  );
}
