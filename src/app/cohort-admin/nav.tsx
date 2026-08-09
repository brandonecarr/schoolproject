// Tabs for the admin console.

import Link from "next/link";

const ON = "btn sec sm";
const OFF = "btn ghost sm";

export type AdminTab = "overview" | "leads" | "walkthroughs" | "email" | "marketing";

const TABS: { key: AdminTab; label: string; href: string }[] = [
  { key: "overview", label: "Overview", href: "/cohort-admin" },
  { key: "leads", label: "Leads", href: "/cohort-admin/leads" },
  { key: "walkthroughs", label: "Walkthroughs", href: "/cohort-admin/walkthroughs" },
  { key: "email", label: "Email", href: "/cohort-admin/email" },
  { key: "marketing", label: "Marketing", href: "/cohort-admin/marketing" },
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
    </nav>
  );
}
