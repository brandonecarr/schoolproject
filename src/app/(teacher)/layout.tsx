// Shell for the whole teacher console. Gates to owner/teacher and renders the
// sidebar + main column. Route groups don't change the URL, so pages inside
// still live at /dashboard, /attendance, etc.

import { requireTeacher } from "@/lib/auth";
import { Sidebar } from "@/components/Sidebar";

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const { user, school } = await requireTeacher();
  return (
    <div className="shell">
      <Sidebar
        schoolName={school?.name ?? ""}
        schoolState={school?.state ?? ""}
        railLabel={school?.railLabel ?? ""}
        userName={user.name}
      />
      <main className="main">{children}</main>
    </div>
  );
}
