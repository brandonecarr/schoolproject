"use client";

// Parent / student top navigation. Client component for active-link highlight.

import Link from "next/link";
import { usePathname } from "next/navigation";

export function TopNav({ role, userName }: { role: string; userName: string }) {
  const pathname = usePathname();
  const on = (href: string) => (pathname === href ? "on" : "");

  return (
    <div className="tnav">
      <strong style={{ fontFamily: "var(--serif)", fontSize: 17 }}>Cohort</strong>
      {role === "parent" && (
        <>
          <Link href="/parent" className={on("/parent")}>
            My children
          </Link>
          <Link href="/parent/reports" className={on("/parent/reports")}>
            Weekly reports
          </Link>
        </>
      )}
      {role === "student" && (
        <Link href="/student" className={on("/student")}>
          My work
        </Link>
      )}
      <span className="sp" />
      <span style={{ fontSize: 13, color: "#d5deee" }}>{userName}</span>
      <Link href="/logout" style={{ color: "#d5deee" }}>
        Sign out
      </Link>
    </div>
  );
}
