import { requireRole } from "@/lib/auth";
import { NotificationCentre } from "@/components/NotificationCentre";

export const dynamic = "force-dynamic";
export const metadata = { title: "Notifications — Cohort" };

export default async function ParentNotificationsPage() {
  await requireRole("parent");
  return <NotificationCentre back="/parent/notifications" />;
}
