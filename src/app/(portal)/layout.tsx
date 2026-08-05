// Shell for the parent + student portals: a top nav over a narrow reading
// column. Gates to signed-in users; each page enforces its specific role.

import { requireUser } from "@/lib/auth";
import { TopNav } from "@/components/TopNav";
import { threadStudentIds, unreadForFamily } from "@/lib/messages";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireUser();
  const messagesUnread = await unreadForFamily(await threadStudentIds(user));
  return (
    <>
      <TopNav role={user.role} userName={user.name} messagesUnread={messagesUnread} />
      <div className="wrap">{children}</div>
    </>
  );
}
