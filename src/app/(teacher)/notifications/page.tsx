import { requireTeacher } from "@/lib/auth";
import { NotificationCentre } from "@/components/NotificationCentre";

export const dynamic = "force-dynamic";
export const metadata = { title: "Notifications — Cohort" };

export default async function TeacherNotificationsPage() {
  await requireTeacher();
  return <NotificationCentre back="/notifications" />;
}
