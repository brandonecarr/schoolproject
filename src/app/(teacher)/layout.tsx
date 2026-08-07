// Shell for the whole teacher console. Gates to owner/teacher and renders the
// sidebar + content panel. Route groups don't change the URL, so pages inside
// still live at /dashboard, /attendance, etc.
//
// data-role and data-style are set here, server-side from the session — there
// is no client-side role switcher. Teacher is Soft: violet accent, dark rail.

import { requireTeacher } from "@/lib/auth";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { ViewAsBanner } from "@/components/ViewAsBanner";
import { unreadForStaff } from "@/lib/messages";
import { unreadCountFor } from "@/lib/notify";
import { parsePins, TEACHER_NAV } from "@/lib/nav";
import { brandForSchool } from "@/lib/packet-read";

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const { user, school, actor } = await requireTeacher();
  const [messagesUnread, notificationsUnread, brand] = await Promise.all([
    school ? unreadForStaff(school.id) : Promise.resolve(0),
    unreadCountFor(user.id),
    school ? brandForSchool(school.id) : Promise.resolve(null),
  ]);
  const subline = [school?.name, school?.railLabel].filter(Boolean).join(" · ");

  return (
    <div className="shell" data-role="teacher" data-style="soft">
      <a className="skip" href="#content">
        Skip to content
      </a>
      <Sidebar
        nav={TEACHER_NAV}
        schoolName={school?.name ?? ""}
        subline={subline}
        logoSrc={brand?.logo ?? null}
        userName={user.name}
        pins={parsePins(user.pinnedNav)}
        pinnable
        messagesUnread={messagesUnread}
        notificationsUnread={notificationsUnread}
      />
      <main className="panel" id="content" tabIndex={-1}>
        {actor && <ViewAsBanner name={user.name} role={user.role} />}
        <TopBar
          userName={user.name}
          roleLabel={user.role === "owner" ? "Lead teacher · Owner" : "Teacher"}
          notificationsHref="/notifications"
          messagesHref="/messages"
          settingsHref="/settings"
          notificationsUnread={notificationsUnread}
          messagesUnread={messagesUnread}
        />
        <div className="page">{children}</div>
      </main>
    </div>
  );
}
