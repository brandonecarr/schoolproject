// Shell for the parent + student portals: a top nav over a narrow reading
// column. Gates to signed-in users; each page enforces its specific role.

import { requireUser } from "@/lib/auth";
import { TopNav } from "@/components/TopNav";
import { threadStudentIds, unreadForFamily } from "@/lib/messages";
import { unreadCountFor } from "@/lib/notify";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireUser();
  const [messagesUnread, notificationsUnread] = await Promise.all([
    unreadForFamily(await threadStudentIds(user)),
    unreadCountFor(user.id),
  ]);
  return (
    <>
      <a className="skip" href="#content">
        Skip to content
      </a>
      <TopNav
        role={user.role}
        userName={user.name}
        messagesUnread={messagesUnread}
        notificationsUnread={notificationsUnread}
      />
      <main className="wrap" id="content" tabIndex={-1}>
        {children}
      </main>
    </>
  );
}
