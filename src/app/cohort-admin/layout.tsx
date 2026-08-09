// The console's frame: dark navigation rail, 64px header, cream canvas.
//
// The layout renders the full shell only for a signed-in operator. Anyone
// else under /cohort-admin can only ever reach the login page (every other
// page redirects them there via requirePlatformAdmin), so the fallback is
// the login's centered cream wrapper. The gate itself stays on the pages —
// this file only decides chrome.

import { getSession } from "@/lib/auth";
import { prismaSystem } from "@/lib/db";
import { deploymentEnv } from "@/lib/environment";
import { rootDomain } from "@/lib/tenant-config";
import { AdminRail } from "./nav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const operator = session?.user.platformAdmin && !session.actor ? session.user : null;

  if (!operator) {
    return <div className="adm adm-authwrap">{children}</div>;
  }

  // prismaSystem: the rail's Leads badge — a platform-wide count, operator-only.
  const openLeads = await prismaSystem.lead.count({
    where: { status: { in: ["new", "contacted", "scheduled"] } },
  });

  const env = deploymentEnv();
  const host = rootDomain() || "untenanted";
  const name = operator.name || operator.email.split("@")[0];
  const initials = name
    .split(/[\s.@_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  const chipCls = env === "production" ? "adm-envchip" : "adm-envchip adm-envchip-warn";

  return (
    <div className="adm adm-shell">
      <AdminRail openLeads={openLeads} />
      <div className="adm-main">
        <header className="adm-header">
          <div className="adm-headerleft">
            <span className={chipCls}>
              <span className="adm-envdot" aria-hidden />
              {env === "production" ? "Production" : env === "preview" ? "Preview" : "Development"}
            </span>
            <span className="adm-headerhost mono">{host}</span>
          </div>
          <div className="adm-account">
            <span className="adm-avatar" aria-hidden>
              {initials || "OP"}
            </span>
            <span>
              <span className="adm-accountname">{name}</span>
              <span className="adm-accountrole">Platform admin</span>
            </span>
          </div>
        </header>
        <main className="adm-content">{children}</main>
      </div>
    </div>
  );
}
