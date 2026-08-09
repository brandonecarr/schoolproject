// Tabs for the admin console. The grayed entry is the roadmap, visible on
// purpose: the tabs say where this surface is going without pretending the
// feature exists yet.

import Link from "next/link";

const ON = "btn sec sm";
const OFF = "btn ghost sm";

export type AdminTab = "overview" | "leads" | "walkthroughs" | "email";

const TABS: { key: AdminTab; label: string; href: string }[] = [
  { key: "overview", label: "Overview", href: "/cohort-admin" },
  { key: "leads", label: "Leads", href: "/cohort-admin/leads" },
  { key: "walkthroughs", label: "Walkthroughs", href: "/cohort-admin/walkthroughs" },
  { key: "email", label: "Email", href: "/cohort-admin/email" },
];

export function AdminNav({ active }: { active: AdminTab }) {
  return (
    <nav
      className="row"
      style={{ gap: 14, marginBottom: 18, alignItems: "center", flexWrap: "wrap" }}
      aria-label="Admin"
    >
      {TABS.map((t) => {
        const cls = t.key === active ? ON : OFF;
        return (
          <Link key={t.key} className={cls} href={t.href}>
            {t.label}
          </Link>
        );
      })}
      <span className="small muted">Marketing — coming next</span>
    </nav>
  );
}
