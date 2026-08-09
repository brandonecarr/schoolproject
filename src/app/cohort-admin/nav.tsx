"use client";

// The console's navigation rail: dark column, brand lockup, two groups of
// routes, Log out pinned to the bottom. Active state comes from the pathname
// so pages don't have to say where they are.

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  IconGrid,
  IconSchool,
  IconUsers,
  IconCalendar,
  IconMail,
  IconChart,
  IconShield,
  IconGear,
  IconLogout,
} from "./icons";

const GROUP_ONE = [
  { href: "/cohort-admin", label: "Overview", icon: IconGrid },
  { href: "/cohort-admin/schools", label: "Schools", icon: IconSchool },
  { href: "/cohort-admin/leads", label: "Leads", icon: IconUsers },
  { href: "/cohort-admin/walkthroughs", label: "Walkthroughs", icon: IconCalendar },
  { href: "/cohort-admin/email", label: "Email", icon: IconMail },
  { href: "/cohort-admin/marketing", label: "Marketing", icon: IconChart },
];

const GROUP_TWO = [
  { href: "/cohort-admin/operators", label: "Operators", icon: IconShield },
  { href: "/cohort-admin/settings", label: "Settings", icon: IconGear },
];

function RailItem({
  href,
  label,
  icon: Icon,
  active,
  badge,
}: {
  href: string;
  label: string;
  icon: (p: { size?: number; strokeWidth?: number }) => React.ReactNode;
  active: boolean;
  badge?: number;
}) {
  const cls = active ? "adm-navitem adm-navitem-on" : "adm-navitem";
  return (
    <Link className={cls} href={href}>
      <Icon />
      <span>{label}</span>
      {badge !== undefined && badge > 0 && <span className="adm-navbadge">{badge}</span>}
    </Link>
  );
}

export function AdminRail({ openLeads }: { openLeads: number }) {
  const pathname = usePathname();
  const active = (href: string) =>
    href === "/cohort-admin" ? pathname === "/cohort-admin" : pathname.startsWith(href);

  return (
    <nav className="adm-rail" aria-label="Console">
      <div className="adm-lockup">
        <span className="adm-lockupmark">
          <Image src="/logo-mark.png" alt="" width={22} height={28} />
        </span>
        <span>
          <span className="adm-lockupname">Cohort</span>
          <span className="adm-lockuprole">Operator console</span>
        </span>
      </div>

      <div className="adm-navgroup">
        {GROUP_ONE.map((i) => (
          <RailItem
            key={i.href}
            {...i}
            active={active(i.href)}
            badge={i.label === "Leads" ? openLeads : undefined}
          />
        ))}
      </div>

      <div className="adm-raildiv" />

      <div className="adm-navgroup">
        {GROUP_TWO.map((i) => (
          <RailItem key={i.href} {...i} active={active(i.href)} />
        ))}
      </div>

      <div className="adm-railspace" />

      <form action="/logout" method="post">
        <button className="adm-navitem adm-navlogout" type="submit">
          <IconLogout />
          <span>Log out</span>
        </button>
      </form>
    </nav>
  );
}
