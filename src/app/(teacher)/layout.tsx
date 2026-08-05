// Shell for the whole teacher console. Gates to owner/teacher and renders the
// sidebar + main column. Route groups don't change the URL, so pages inside
// still live at /dashboard, /attendance, etc.

import { requireTeacher } from "@/lib/auth";
import { Sidebar } from "@/components/Sidebar";
import { unreadForStaff } from "@/lib/messages";

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const { user, school } = await requireTeacher();
  const messagesUnread = school ? await unreadForStaff(school.id) : 0;
  return (
    <div className="shell">
      <Sidebar
        schoolName={school?.name ?? ""}
        schoolState={school?.state ?? ""}
        railLabel={school?.railLabel ?? ""}
        userName={user.name}
        messagesUnread={messagesUnread}
      />
      <main className="main">{children}</main>
    </div>
  );
}
