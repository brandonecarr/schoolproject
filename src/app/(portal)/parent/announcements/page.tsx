import { requireUser } from "@/lib/auth";
import { AnnouncementList } from "@/components/AnnouncementList";
import { announcementsForUser } from "@/lib/announce-read";

export const dynamic = "force-dynamic";
export const metadata = { title: "Announcements — Cohort" };

export default async function ParentAnnouncementsPage() {
  const { user } = await requireUser();
  const { items, ackedIds } = await announcementsForUser(user);

  return (
    <>
      <div className="eyebrow">From the school</div>
      <h1>Announcements</h1>
      <AnnouncementList items={items} ackedIds={ackedIds} />
    </>
  );
}
