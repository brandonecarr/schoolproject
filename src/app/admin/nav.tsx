// Tabs for the admin console. The grayed entries are the roadmap, visible on
// purpose: this surface will grow into marketing and email tooling, and the
// tabs say so without pretending the features exist yet.

import Link from "next/link";

const ON = "btn sec sm";
const OFF = "btn ghost sm";

export function AdminNav({ active }: { active: "overview" | "leads" }) {
  const overviewCls = active === "overview" ? ON : OFF;
  const leadsCls = active === "leads" ? ON : OFF;
  return (
    <nav className="row" style={{ gap: 14, marginBottom: 18, alignItems: "center" }} aria-label="Admin">
      <Link className={overviewCls} href="/admin">
        Overview
      </Link>
      <Link className={leadsCls} href="/admin/leads">
        Leads
      </Link>
      <span className="small muted">Marketing · Email — coming next</span>
    </nav>
  );
}
