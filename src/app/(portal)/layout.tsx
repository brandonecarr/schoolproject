// Shell for the parent + student portals: a top nav over a narrow reading
// column. Gates to signed-in users; each page enforces its specific role.

import { requireUser } from "@/lib/auth";
import { TopNav } from "@/components/TopNav";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireUser();
  return (
    <>
      <TopNav role={user.role} userName={user.name} />
      <div className="wrap">{children}</div>
    </>
  );
}
