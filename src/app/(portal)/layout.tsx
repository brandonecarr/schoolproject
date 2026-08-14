// Shell for the parent + student portals. Gates to signed-in users; each page
// enforces its specific role.
//
// This used to be a horizontal TopNav with a "More" dropdown, because nine
// links wrap badly across a laptop. The redesign gives families a sidebar of
// their own, so the split disappears and every item is visible at once — the
// dropdown was working around a constraint the sidebar doesn't have.
//
// data-role and data-style are set here from the session. Parent is Soft
// (teal); student is Ledger (rust, monospace figures, flat geometry) — the
// student portal is a reading surface, and it should not look like a console.

import { requireUser } from "@/lib/auth";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { ViewAsBanner } from "@/components/ViewAsBanner";
import { prisma } from "@/lib/db";
import { threadStudentIds, unreadForFamily } from "@/lib/messages";
import { unreadCountFor } from "@/lib/notify";
import { navForRole } from "@/lib/nav";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  // The session already carries the school row — re-fetching it here cost a
  // query on every navigation, and pulling the logo BYTES cost another.
  const { user, school, actor } = await requireUser();
  const isStudent = user.role === "student";

  const kidIds = await threadStudentIds(user);
  const [messagesUnread, notificationsUnread, children_] = await Promise.all([
    unreadForFamily(kidIds),
    unreadCountFor(user.id),
    // "Parent of Ivy, Grade 2" reads better than "Parent" and is the one place
    // a parent of several children can see which one the portal is showing.
    prisma.student.findMany({
      where: { id: { in: kidIds } },
      select: { name: true, grade: true },
    }),
  ]);
  const first = children_[0];
  const roleLabel = isStudent
    ? first
      ? `Grade ${first.grade} · ${school?.name ?? ""}`
      : "Student"
    : first
      ? `Parent of ${first.name.split(" ")[0]}${children_.length > 1 ? ` +${children_.length - 1}` : ""}, Grade ${first.grade}`
      : "Parent";

  const base = isStudent ? "/student" : "/parent";

  return (
    <div className="shell" data-role={isStudent ? "student" : "parent"} data-style={isStudent ? "ledger" : "soft"}>
      <a className="skip" href="#content">
        Skip to content
      </a>
      <Sidebar
        nav={navForRole(user.role, first?.name, children_.length)}
        schoolName={school?.name ?? ""}
        subline={school?.name ?? ""}
        logoSrc={school?.logoFileId ? `/files/${school.logoFileId}` : null}
        userName={user.name}
        messagesUnread={messagesUnread}
        notificationsUnread={notificationsUnread}
        messagesHref={`${base}/messages`}
        notificationsHref={`${base}/notifications`}
      />
      <main className="panel" id="content" tabIndex={-1}>
        {actor && <ViewAsBanner name={user.name} role={user.role} />}
        <TopBar
          userName={user.name}
          roleLabel={roleLabel}
          notificationsHref={`${base}/notifications`}
          messagesHref={`${base}/messages`}
          notificationsUnread={notificationsUnread}
          messagesUnread={messagesUnread}
        />
        <div className="page">{children}</div>
      </main>
    </div>
  );
}
