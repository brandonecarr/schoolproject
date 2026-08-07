// Shell for the whole teacher console. Gates to owner/teacher and renders the
// sidebar + main column. Route groups don't change the URL, so pages inside
// still live at /dashboard, /attendance, etc.

import { requireTeacher } from "@/lib/auth";
import { Sidebar } from "@/components/Sidebar";
import { unreadForStaff } from "@/lib/messages";
import { unreadCountFor } from "@/lib/notify";
import { parsePins } from "@/lib/nav";

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const { user, school } = await requireTeacher();
  const [messagesUnread, notificationsUnread] = await Promise.all([
    school ? unreadForStaff(school.id) : Promise.resolve(0),
    unreadCountFor(user.id),
  ]);
  return (
    <div className="shell">
      <Sidebar
        schoolName={school?.name ?? ""}
        schoolState={school?.state ?? ""}
        railLabel={school?.railLabel ?? ""}
        userName={user.name}
        pins={parsePins(user.pinnedNav)}
        messagesUnread={messagesUnread}
        notificationsUnread={notificationsUnread}
      />
      <main className="main">{children}</main>
    </div>
  );
}
